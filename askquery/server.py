import os
import sys
import uuid
import json
import warnings
import pandas as pd
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from flask_cors import CORS
from flask import Flask, request, jsonify

warnings.simplefilter(action='ignore', category=pd.errors.SettingWithCopyWarning)

CURR_DIR = Path(__file__).resolve().parent
PARENT_DIR = CURR_DIR.parent
sys.path.insert(0, str(PARENT_DIR))

from Ask2Query.core.ambiguity_resolver import AmbiguityResolver
from Ask2Query.utils.parse import format_message, parse_schema_text, add_semicolon_if_missing
from Ask2Query.utils.nl2sql_agent import XiYanAgent
from Ask2Query.utils.sql_diff_detector import detect_sql_differences

# Database path configuration
db_path = str((CURR_DIR / "../MINIDEV/dev_databases").resolve())

# Flask application instance
app = Flask(__name__)

# Configure CORS to allow cross-origin requests
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

# Default port number, can be configured via PORT environment variable
DEFAULT_PORT = int(os.environ.get("PORT", 8765))

# Load environment variables
load_dotenv()
print("\n[Environment Variables]")
print(f"  MODELSCOPE_API_KEY: {os.environ.get('MODELSCOPE_API_KEY')}")
print(f"  MODELSCOPE_API_BASE: {os.environ.get('MODELSCOPE_API_BASE')}")
print()

# In-memory session data storage, key is session_id, value is ChatSession object
sessions = {}
    
class ChatSession:
    """
    Chat session class for managing user session state and message history
    
    Attributes:
        session_id: Unique session identifier
        db_name: Database name
        question: User question
        created_at: Session creation time
        last_accessed: Last access time
        messages: Message history list
        ambiguity_resolver_instance: Ambiguity resolver instance for ambiguity detection and correction
        text2sql_agent: Text-to-SQL agent instance for generating SQL queries, default XiYan-SQL
    """
    def __init__(self, session_id):
        """
        Initialize chat session
        
        Args:
            session_id: Unique session identifier
        """
        self.session_id = session_id
        self.db_name = None
        self.question = None
        self.created_at = datetime.now().isoformat()
        self.last_accessed = datetime.now().isoformat()
        self.messages = []
        self.ambiguity_resolver_instance = None  # AmbiguityResolver Instance, used for ambiguity detection and correction
        self.text2sql_agent = None  # Text2SQL Agent Instance, used for generating SQL queries

    def add_message(self, role, content):
        """
        Add message to session history
        
        Args:
            role: Message role (e.g., 'user', 'assistant')
            content: Message content
            
        Returns:
            Added message dictionary object
        """
        timestamp = datetime.now().isoformat()
        message = {
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "timestamp": timestamp,
        }
        self.messages.append(message)
        self.last_accessed = timestamp
        return message

    def get_history(self):
        """
        Get session history message list
        
        Returns:
            Message history list
        """
        return self.messages

    def clear(self):
        """
        Clear session history messages
        """
        self.messages = []
        self.last_accessed = datetime.now().isoformat()

    def to_dict(self):
        """
        Convert session object to dictionary format
        
        Returns:
            Dictionary containing session information
        """
        return {
            "session_id": self.session_id,
            "created_at": self.created_at,
            "last_accessed": self.last_accessed,
            "message_count": len(self.messages),
        }


# Ambiguity Identification
@app.route("/api/sql/analyze", methods=["POST"])
def analyze_sql_query():
    """
    API endpoint for analyzing SQL queries to identify ambiguities
    
    Receives POST request containing:
        - session_id: Client session ID (optional)
        - question: User question
        - dialect: SQL dialect (default: SQLite)
        - db: Database name
        
    Returns:
        - session_id: Session ID
        - suggested_schema: Parsed database schema
        - analysis: Analysis result description
        - dialect_info: SQL dialect information
        - ambiguities: Set of identified ambiguity questions
    """
    try:
        print("\n[SQL Query Analysis] Processing request...")
        
        data = request.json
        client_session_id = data.get("session_id") 

        session_id = None
        current_session = None

        if client_session_id and client_session_id in sessions:
            session_id = client_session_id
            current_session = sessions[session_id]
            current_session.last_accessed = datetime.now().isoformat() 
            print(f"  Using existing session: {session_id}")
        else:
            session_id = str(uuid.uuid4())
            current_session = ChatSession(session_id)
            sessions[session_id] = current_session
            print(f"  Created new session: {session_id}")

        question = data.get("question", "")
        dialect = data.get("dialect", "SQLite")
        db_name = data.get("db", "")
        current_session.db_name = db_name
        current_session.question = question
        model = "claude"
        
        print(f"  Question: {question}")
        print(f"  Database: {db_name} | Dialect: {dialect} | Model: {model}")

        # Get or create session
        if session_id not in sessions:
            sessions[session_id] = ChatSession(session_id)
        current_session = sessions[session_id]
        
        # Create Ambiguity Resolver instance and store it to session
        qr_instance = AmbiguityResolver(db_name, db_path, question, model)
        print(f"  Created Ambiguity Resolver instance")
        current_session.question_rewriter_instance = qr_instance

        # parse schema
        schema_text = qr_instance.schema_generator.formatted_full_schema
        parsed_schema = parse_schema_text(schema_text)
        print(f"  Schema parsed: {len(parsed_schema)} tables")

        print("  Starting ambiguity detection...")
        response_json = qr_instance.ambi_detection()
        response = json.loads(response_json)
        print(f"  Detection result: {response}")
        question_set = response["question_set"]
        print(f"  ✓ Identified {len(question_set)} ambiguity question(s)")

        response_data = {
            "session_id": session_id,
            "suggested_schema": parsed_schema,
            "analysis": "Schema analysis completed",
            "dialect_info": dialect,
            "ambiguities": question_set,
        }
        return jsonify(response_data), 200

    except Exception as e:
        print("\n[Error] Exception occurred during SQL query analysis")
        print(f"  Error message: {str(e)}")
        return (
            jsonify({"error": str(e), "message": "Error processing schema analysis"}),
            500,
        )

@app.route("/api/sql/resolve", methods=["POST"])
def resolve_ambiguities():
    """
    API endpoint for resolving ambiguities, processing user-provided clarification information and generating SQL queries
    
    Receives POST request containing:
        - session_id: Session ID (required)
        - clarificationList: List of clarification question-answer pairs
        - additional_info: Additional information
        
    Returns:
        If ambiguities still exist:
            - is_clarified: "False"
            - session_id: Session ID
            - ambiguities: Remaining ambiguity question set
        If clarified:
            - is_clarified: "True"
            - session_id: Session ID
            - sql_statement_raw: Raw SQL statement
            - sql_statement_clarified: Clarified SQL statement
    """
    print("\n[Ambiguity Resolution] Starting ambiguity resolution request processing")
    
    try:
        # session management
        data = request.json
        print(f"  [Request Data] Received JSON data: {json.dumps(data, indent=2, ensure_ascii=False)}")
        
        session_id = data.get('session_id')
        print(f"  [Session Management] Session ID: {session_id}") 

        if not session_id:
            print("  [Session Management] No session_id provided, returning 400 error")
            return jsonify({"error": "session_id is required"}), 400

        current_session = sessions.get(session_id)
        print(f"  [Session Management] Current session object: {current_session}") 
        if not current_session:
            print("  [Session Management] Session not found or expired, returning 404 error")
            return jsonify({"error": "Session not found or expired"}), 404

        # residual ambiguity identification and question rewrite
        qr_instance = current_session.question_rewriter_instance
        text2sql_agent = current_session.text2sql_agent
        print(f"  [Ambiguity Resolver] QuestionRewriter instance from session: {qr_instance}") 
        if not qr_instance:
            print("  [Ambiguity Resolver] QuestionRewriter instance not found in session, returning 400 error")
            return jsonify({"error": "QuestionRewriter instance not found in session. Please call /analyze first."}), 400

        clarification_list = data.get('clarificationList', [])
        print(f"  [Clarification Information] Clarification list contains {len(clarification_list)} items: {clarification_list}") 
        
        qa_set = []
        for idx, item in enumerate(clarification_list, 1):
            q_data = item.get('question', {})
            ans = item.get('answer', '')
            qa_set.append({
                "level_1_label": item.get('level_1_label', None),
                "level_2_label": item.get('level_2_label', None),
                "question": item.get('question', None),
                "answer": ans
            })
        print(f"  [Clarification Information] Prepared QA set: {qa_set}") 
            
        additional_info = data.get('additional_info', '')
        print(f"  [Additional Information] Additional info: {additional_info}")

        formatted_message = format_message(qa_set, additional_info)
        print(f"  [Message Formatting] Formatted message: {formatted_message}")

        print("  [Ambiguity Correction] Calling qr_instance.ambi_correction for clarification processing...")
        response_json = qr_instance.ambi_correction(message = formatted_message)
        print(f"  [Ambiguity Correction] ambi_correction returned: {response_json}")
         
        parsed_response = json.loads(response_json) 
        print(f"  [Response Parsing] Parsed response: {json.dumps(parsed_response, indent=2, ensure_ascii=False)}") 
        
        response_data = None
        
        if "has_ambiguity" in parsed_response or parsed_response['is_clarified'] == False:
            print("  [Result] Ambiguities still exist, returning ambiguity question set")
            response_data = {
                "is_clarified": "False",
                "session_id": session_id,
                "ambiguities": parsed_response['question_set'],
            }
        else:
            print("  [Result] Ambiguities clarified, starting SQL query generation")
            
            sql_raw, sql_clarified = XiYanAgent().generate_sql(parsed_response['question'], parsed_response['evidence'], qr_instance.schema_generator.formatted_full_schema)
            sql_raw = add_semicolon_if_missing(sql_raw)
            sql_clarified = add_semicolon_if_missing(sql_clarified)
            print(f"  [SQL Generation] Raw SQL statement: {sql_raw}")
            print(f"  [SQL Generation] Clarified SQL statement: {sql_clarified}")
            
            # Detect differences between the two SQL queries
            print("  [SQL Diff Detection] Detecting differences between SQL queries...")
            model = "claude"
            sql_differences = detect_sql_differences(sql_raw, sql_clarified, model)
            print(f"  [SQL Diff Detection] Found {len(sql_differences.get('differences', []))} difference(s)")
            
            response_data = {
                "session_id": session_id,
                "is_clarified": "True",
                "sql_statement_raw": sql_raw,
                # "result_raw": raw_result,
                "sql_statement_clarified": sql_clarified,
                # "result_clarified": clarified_reuslt
                "sql_differences": sql_differences.get('differences', [])
            }
        
        print("  [Result] Processing completed, returning response data")
        return jsonify(response_data), 200 
    
    except Exception as e:
        print("\n[Error] Exception occurred during ambiguity resolution")
        print(f"  Error message: {str(e)}")
        import traceback
        traceback.print_exc() # print complete traceback
        return jsonify({
            "error": str(e),
            "message": "Error processing ambiguity resolution"
        }), 500


if __name__ == "__main__":
    """
    Main program entry point, starts Flask application server
    
    Server configuration:
        - host: 0.0.0.0 (listen on all network interfaces)
        - port: DEFAULT_PORT (default 8765, can be configured via PORT environment variable)
        - debug: True (enable debug mode)
    """
    print("\n[Server Startup] Starting Flask application server")
    print(f"  Listening address: 0.0.0.0:{DEFAULT_PORT}")
    print(f"  Debug mode: True")
    print()
    app.run(host="0.0.0.0", port=DEFAULT_PORT, debug=True)

import json
from typing import List

from Ask2Query.core.cq_generator import CQGenerator
from Ask2Query.prompts.ambiguity_detection_prompt import (
    QuestionRefine_prompt,
    AmbiguityDetection_prompt,
    AmbiguityDetection_examples,
)
from Ask2Query.core.schema_generator import SchemaGenerator
from Ask2Query.core.preference_index import PreferenceTree
from Ask2Query.utils import LLMCaller
from Ask2Query.utils.parse import (
    format_response, 
    parse_json_response
)

class AmbiguityResolver:
    """
    Resolves ambiguities in natural language questions for SQL query generation.
    
    This class detects ambiguities in user questions, generates clarification questions,
    and refines questions based on user responses to produce unambiguous SQL queries.
    """
    def __init__(self, db_name, path, question, model):
        """
        Initialize the ambiguity resolver.
        
        Args:
            db_name: Name of the database to query
            path: Path to the database directory
            question: The user's natural language question
            model: The LLM model to use for ambiguity detection and resolution
        """
        self.db_name = db_name
        self.path = path
        self.question = question
        self.llm_caller = LLMCaller(model)
        self.schema_generator = SchemaGenerator(db_name, path, question)
        self.intention_model = PreferenceTree(self.llm_caller)
        self.cq_generator = CQGenerator()
        
    def ambi_detection(self):
        """
        Detect ambiguities in the initial question.
        
        Returns:
            JSON string containing either:
            - Clarification questions if ambiguities are found (is_clarified=False)
            - Refined question and evidence if no ambiguities (is_clarified=True)
        """
        flag, question_set = self.check_ambiguity()
        if flag:          
            question_set = self.rewrite_clarification_question(question_set)
            return format_response(is_clarified=False, q_set=question_set)
        else:
            return self.format_response(self.question, self.intention_model)
        

    def ambi_correction(self, message):
        """
        Process user clarifications and check for remaining ambiguities.
        
        Args:
            message: JSON string containing clarification answers and additional info
            
        Returns:
            JSON string containing either:
            - Remaining clarification questions if ambiguities persist (is_clarified=False)
            - Refined question and evidence if all ambiguities resolved (is_clarified=True)
        """
        flag = None
        message_parsed = json.loads(message)
        self.intention_model.update_tree(message_parsed["qa_set"])
        if message_parsed['additional_info'].strip() == '':
            flag = False
        else:
            flag, question_set = self.check_ambiguity(initial_detection=False, message=message)
        
        if flag:
            question_set = self.rewrite_clarification_question(question_set)
            return format_response(is_clarified=False, q_set=question_set)
        else:
            return self.format_response(self.question, self.intention_model)
        
    def check_ambiguity(self, initial_detection: bool = True, message: str = ''):
        """
        Check if the question contains ambiguities using LLM-based detection.
        
        Args:
            message: JSON string containing additional info and clarification answers.
                    Empty string for initial detection.
        
        Returns:
            Tuple of (has_ambiguity: bool, question_set: list or None):
            - If ambiguities found: (True, list of ambiguity questions)
            - If no ambiguities: (False, None)
        """
        ambiguity_detection_prompt = ""

        if initial_detection:
            
            # print(f"Formatted full schema JSON: {self.schema_generator.formatted_full_schema_json}")
            ambiguity_detection_prompt = AmbiguityDetection_prompt.format(
                question=self.question,
                schema=self.schema_generator.formatted_full_schema_json,
                evidence=None,
                examples=AmbiguityDetection_examples,
            )
        else:
            message_dict = json.loads(message)
            
            self.question = self.question_refine(message_dict["additional_info"])
            print(f"Evidence: {self.intention_model.traverse()}")
            
            ambiguity_detection_prompt = AmbiguityDetection_prompt.format(
                question=message_dict["additional_info"],
                schema=self.schema_generator.formatted_full_schema_json,
                evidence=self.intention_model.traverse(),
                examples=AmbiguityDetection_examples,
            )
        query = [
            {"role": "system", "content": "You are a helpful assistant to find out inherent ambiguity in a natural language statement. Return only the result with no explanation."},
            {"role": "user", "content": ambiguity_detection_prompt},
        ]
        response = self.llm_caller.call(query)
        res = parse_json_response(response)

        if res["has_ambiguity"]:
            return res["has_ambiguity"], res["question_set"]
        else:
            return res["has_ambiguity"], None

    def question_refine(self, additional_info):
        """
        Refine the original question by incorporating additional information.
        
        Args:
            additional_info: Additional context or clarification provided by the user
            
        Returns:
            Refined question string that merges the original question with new information
        """
        question_refine_prompt = QuestionRefine_prompt.format(
            question=self.question, additional_info=additional_info
        )
        query = [
            {"role": "system", "content": "You are an expert specializing in query refinement. Your purpose is to merge and consolidate user questions with new information. Respond ONLY with the refined question. Do not add any explanation, formatting, or extra text."},
            {"role": "user", "content": question_refine_prompt},
        ]
        response = self.llm_caller.call(query)
        return response

    def rewrite_clarification_question(self, question_set: List[dict]):
        """
        Rewrite clarification questions and generate choice options for each ambiguity.
        
        For each ambiguity question, this method generates multiple choice options
        to help users clarify their intent.
        
        Args:
            question_set: List of ambiguity question dictionaries
            
        Returns:
            Modified question_set with 'choices' field added to each question
        """
        return self.cq_generator.generate_clarification_question(question_set, self.llm_caller)
    
    def format_response(self, question, intention_model):
        """
        Format the final response when all ambiguities are resolved.
        
        Args:
            question: The refined question after ambiguity resolution
            intention_model: PreferenceTree instance containing user preferences/evidence
            
        Returns:
            JSON string containing the clarified question and evidence for SQL generation
        """
        response = {
            "is_clarified" : True,
            "question": question,
            "question_set" : None,
            "evidence": intention_model.traverse()
        }
        return json.dumps(response, ensure_ascii=False) 
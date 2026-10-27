import React, { useState, useEffect } from "react";
import "./Ask2Queryryry.css";

// Helper function to highlight differences in SQL
const highlightSQLDifferences = (sql, differences, isRaw = true) => {
  if (!sql || !differences || differences.length === 0) {
    return sql;
  }

  // Collect all search values and their corresponding diff info
  const searchItems = differences
    .map((diff) => ({
      value: isRaw ? diff.raw_value : diff.clarified_value,
      type: diff.type,
      description: diff.description,
    }))
    .filter((item) => item.value && item.value.trim());

  if (searchItems.length === 0) {
    return sql;
  }

  // Sort by length (longer first) to match longer phrases first
  searchItems.sort((a, b) => b.value.length - a.value.length);

  // Build array of text segments with highlight info
  const segments = [];
  let remainingSQL = sql;
  let currentIndex = 0;

  // For each search item, find and mark matches
  const matches = [];
  searchItems.forEach((item, itemIdx) => {
    const searchValue = item.value.trim();
    // Escape special regex characters but allow flexible whitespace matching
    const escaped = searchValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped.replace(/\s+/g, "\\s+"), "gi");

    let match;
    while ((match = regex.exec(sql)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: item.type,
        description: item.description,
        text: match[0],
      });
    }
  });

  // Sort matches by start position
  matches.sort((a, b) => a.start - b.start);

  // Remove overlapping matches (keep the first/longer one)
  const nonOverlappingMatches = [];
  for (const match of matches) {
    const overlaps = nonOverlappingMatches.some(
      (existing) => match.start < existing.end && match.end > existing.start,
    );
    if (!overlaps) {
      nonOverlappingMatches.push(match);
    }
  }

  // Build segments
  let lastEnd = 0;
  nonOverlappingMatches.forEach((match) => {
    // Add text before match
    if (match.start > lastEnd) {
      segments.push({
        text: sql.substring(lastEnd, match.start),
        highlight: false,
      });
    }

    // Add highlighted match
    segments.push({
      text: sql.substring(match.start, match.end),
      highlight: true,
      type: match.type,
      description: match.description,
    });

    lastEnd = match.end;
  });

  // Add remaining text
  if (lastEnd < sql.length) {
    segments.push({
      text: sql.substring(lastEnd),
      highlight: false,
    });
  }

  // If no highlights found, return original SQL
  if (segments.length === 0 || segments.every((s) => !s.highlight)) {
    return sql;
  }

  // Build JSX with highlights
  return (
    <span>
      {segments.map((segment, idx) => {
        if (segment.highlight) {
          return (
            <span
              key={idx}
              className="sql-diff-highlight"
              title={segment.description}
              data-diff-type={segment.type}
            >
              {segment.text}
            </span>
          );
        }
        return <span key={idx}>{segment.text}</span>;
      })}
    </span>
  );
};

// --- Documentation Component (Enhanced for Taxonomy Design) ---
const DocsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="taxonomy-card" onClick={(e) => e.stopPropagation()}>
        {/* Main Content Area (Left) */}
        <section className="taxonomy-main">
          <header className="taxonomy-header">
            <h1>Ask2Queryry Taxonomy</h1>
            <p className="subtitle">
              A Comprehensive Guide for <span>Users & Developers</span>
            </p>
          </header>

          <div className="taxonomy-body">
            <p className="intro-text">
              We present a comprehensive taxonomy that classifies ambiguities
              from two dimensions (<b>Database & LLM</b>).
            </p>

            {/* Section 1 */}
            <div className="taxonomy-section" id="db-ambiguity">
              <div className="section-header">
                <span className="index-num">(1)</span>
                <h3>Database-sourced ambiguity:</h3>
                <div className="item-icon">🔍</div>
              </div>
              <p className="doc-desc">
                Ambiguity arising from unclear references to database schema or
                content.
              </p>
              <div className="taxonomy-item-grid">
                <div className="item-detail">
                  <code className="code-pill">AmbiSchema</code>
                  <p>
                    Lacks context to determine which table or column to use.
                  </p>
                </div>
                <div className="item-detail">
                  <code className="code-pill">AmbiValue</code>
                  <p>
                    Questions referring to values that don't match database
                    storage.
                  </p>
                </div>
                <div className="item-detail">
                  <code className="code-pill">AmbiView</code>
                  <p>
                    Missing key terms for operations like sorting vs. filtering.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 2 */}
            <div className="taxonomy-section" id="llm-ambiguity">
              <div className="section-header">
                <span className="index-num">(2)</span>
                <h3>LLM-sourced ambiguity:</h3>
                <div className="item-icon">🧠</div>
              </div>
              <p className="doc-desc">
                Ambiguity resulting in the misuse of LLM reasoning or external
                knowledge.
              </p>
              <div className="taxonomy-item-grid">
                <div className="item-detail">
                  <code className="code-pill">AmbiSource</code>
                  <p>Unclear if data should be retrieved or inferred.</p>
                </div>
                <div className="item-detail">
                  <code className="code-pill">AmbiContext</code>
                  <p>Insufficient context for LLM reasoning or world facts.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Sidebar Navigation (Right) */}
        <aside className="taxonomy-sidebar">
          <h3>Jump to Section</h3>
          <nav>
            <ul>
              <li className="active">Database Ambiguity</li>
              <li>LLM Ambiguity</li>
              <li>Granularities</li>
            </ul>
          </nav>
          <button className="close-btn-bottom" onClick={onClose}>
            Close
          </button>
        </aside>
      </div>
    </div>
  );
};

const SQLAmbiguityResolver = () => {
  // --- INTERACTION LOGIC (States) ---
  const [question, setQuestion] = useState(
    "How many drivers born after the end of Vietnam War have been ranked 2?",
  );
  const [dbDialect, setDbDialect] = useState("SQLite");
  const [dbUsed, setDBUsed] = useState("formula_1");
  const [ambiguities, setAmbiguities] = useState([]);
  const [clarificationList, setClarificationList] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [showComparison, setShowComparison] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSQLReady, setIsSQLReady] = useState(false);
  const [rawSQL, setRawSQL] = useState(null);
  const [clarifiedSQL, setClarifiedSQL] = useState(null);
  const [sqlDifferences, setSqlDifferences] = useState([]);
  const [isDetectingAmbiguity, setIsDetectingAmbiguity] = useState(false);
  const [isTranslatingSQL, setIsTranslatingSQL] = useState(false);

  // History states for submitted clarifications and constraints
  const [submittedClarifications, setSubmittedClarifications] = useState([]);
  const [submittedConstraints, setSubmittedConstraints] = useState([]);

  // State for storing "Others" input values for each question
  const [othersInputs, setOthersInputs] = useState({});

  // NEW: State for the Docs Modal
  const [showDocs, setShowDocs] = useState(false);

  const examples = [
    {
      id: 1,
      question:
        "How many drivers born after the end of Vietnam War have been ranked 2?",
      db_name: "formula_1",
      dialect: "SQLite",
    },
    {
      id: 2,
      question:
        "Name all drivers in the 2010 Singapore Grand Prix order by their position stands.",
      db_name: "formula_1",
      dialect: "SQLite",
    },
    {
      id: 3,
      question:
        "Give the name of the league had the most matches end as draw in the 2016 season?",
      db_name: "european_football_2",
      dialect: "SQLite",
    },
    {
      id: 4,
      question: "List top 5 popular tags's viewcount.",
      db_name: "codebase_community",
      dialect: "SQLite",
    },
    {
      id: 5,
      question:
        "How many transactions taken place in the gas station in the Czech Republic are with a price of over 45 US dollars?",
      db_name: "debit_card_specializing",
      dialect: "SQLite",
    },
  ];
  // Sync clarification list when ambiguities change
  useEffect(() => {
    if (ambiguities.length > 0) {
      // Only initialize new questions, preserve existing answers
      setClarificationList((prev) => {
        const newList = ambiguities.map((q) => {
          const existing = prev.find((item) => item.question === q.question);
          return (
            existing || {
              question: q.question,
              answer: "",
              level_1_label: q.level_1_label,
              level_2_label: q.level_2_label,
            }
          );
        });
        return newList;
      });
    }
  }, [ambiguities]);

  const handleExampleSelect = (ex) => {
    setQuestion(ex.question);
    setDBUsed(ex.db_name);
    setDbDialect(ex.dialect);
    // Reset all related states
    setAmbiguities([]);
    setClarificationList([]);
    setAdditionalInfo("");
    setIsSQLReady(false);
    setRawSQL(null);
    setClarifiedSQL(null);
    setSqlDifferences([]);
    setSessionId(null);
    setIsDetectingAmbiguity(false);
    setIsTranslatingSQL(false);
    setSubmittedClarifications([]);
    setSubmittedConstraints([]);
    setOthersInputs({});
    setShowComparison(false);
  };

  const handleSubmit = async () => {
    setIsDetectingAmbiguity(true);
    setIsLoading(true);
    // Reset previous states
    setRawSQL(null);
    setClarifiedSQL(null);
    setSqlDifferences([]);
    setIsSQLReady(false);
    setAmbiguities([]);
    setClarificationList([]);
    setAdditionalInfo("");
    setSubmittedClarifications([]);
    setSubmittedConstraints([]);
    setOthersInputs({});
    setShowComparison(false);

    try {
      const response = await fetch("http://localhost:8765/api/sql/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: question,
          dialect: dbDialect,
          db: dbUsed,
          session_id: sessionId,
        }),
      });
      console.log("Analyze response:", response);

      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Analyze response data:", data);

      if (data.session_id) {
        setSessionId(data.session_id);
        console.log("Session ID received:", data.session_id);
      } else {
        console.warn("No session_id received from /analyze endpoint.");
      }

      setAmbiguities(data.ambiguities || []); // Ensure it's an array

      setTimeout(() => {
        setIsLoading(false);
        setIsDetectingAmbiguity(false);
      }, 500);
    } catch (error) {
      console.error("Error during handleSubmit:", error);
      alert(
        `Failed to process the query: ${error.message}. Please check console for details.`,
      );
      setIsDetectingAmbiguity(false);
      setIsLoading(false);
    }
  };

  const handleClarification = async () => {
    setIsTranslatingSQL(true);

    if (!sessionId) {
      alert(
        "Please submit the initial question first to start a session before clarifying.",
      );
      setIsTranslatingSQL(false);
      return;
    }
    console.log("Submitting clarification with:", {
      clarificationList,
      additionalInfo,
      sessionId,
    });

    // Save current clarifications to history
    // If answer is "Others", use the input from othersInputs
    const currentClarifications = clarificationList
      .filter((item) => item.answer && item.answer.trim())
      .map((item) => {
        const finalAnswer =
          item.answer === "Others" && othersInputs[item.question]
            ? othersInputs[item.question].trim()
            : item.answer;
        return {
          question: item.question,
          answer: finalAnswer,
          level_1_label: item.level_1_label,
          level_2_label: item.level_2_label,
          choices:
            ambiguities.find((q) => q.question === item.question)?.choices ||
            [],
        };
      });

    // Save current constraints if provided
    const currentConstraints = additionalInfo.trim();

    // Prepare clarificationList with "Others" input values
    const preparedClarificationList = clarificationList.map((item) => {
      if (item.answer === "Others" && othersInputs[item.question]) {
        return {
          ...item,
          answer: othersInputs[item.question].trim(),
        };
      }
      return item;
    });

    try {
      const response = await fetch("http://localhost:8765/api/sql/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          clarificationList: preparedClarificationList,
          additional_info: additionalInfo,
        }),
      });

      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Solve response data:", data);

      if (data.is_clarified === "True") {
        // Save submitted clarifications and constraints to history
        setSubmittedClarifications((prev) => [
          ...prev,
          ...currentClarifications,
        ]);
        if (currentConstraints) {
          setSubmittedConstraints((prev) => [...prev, currentConstraints]);
        }

        setIsSQLReady(true);
        setRawSQL(data.sql_statement_raw);
        setClarifiedSQL(data.sql_statement_clarified);
        setSqlDifferences(data.sql_differences || []);
        setShowComparison(false); // Reset comparison view when new SQL is generated

        // Clear current inputs
        setClarificationList([]);
        setAdditionalInfo("");
        setOthersInputs({});
        setAmbiguities([]);
      } else {
        // Save submitted clarifications and constraints to history first
        const updatedSubmittedClarifications = [
          ...submittedClarifications,
          ...currentClarifications,
        ];
        setSubmittedClarifications(updatedSubmittedClarifications);

        if (currentConstraints) {
          setSubmittedConstraints((prev) => [...prev, currentConstraints]);
        }

        setIsTranslatingSQL(false);

        // Filter out already submitted questions from new ambiguities
        const submittedQuestionTexts = new Set(
          updatedSubmittedClarifications.map((sc) => sc.question),
        );
        const newAmbiguities = (data.ambiguities || []).filter(
          (amb) => !submittedQuestionTexts.has(amb.question),
        );
        setAmbiguities(newAmbiguities);

        // Clear current inputs but keep history
        setClarificationList([]);
        setAdditionalInfo("");
        setOthersInputs({});
      }
    } catch (error) {
      console.error("Error during handleClarification:", error);
      alert(
        `Failed to clarify: ${error.message}. Please check console for details.`,
      );
      setIsLoading(false);
    } finally {
      setIsTranslatingSQL(false);
    }
  };

  // --- HTML (JSX Structure) ---
  return (
    <div className="app-shell">
      <DocsModal isOpen={showDocs} onClose={() => setShowDocs(false)} />
      {/* 1. Strictly centered Top Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="system-icon">
            {/* Replace 'your-icon-url.png' with your actual image path */}
            <img
              src="Ask2Query_icon.png"
              alt="Ask2Query Logo"
              className="icon-img"
              onError={(e) => (e.target.style.display = "none")} // Hides broken icon if path is empty
            />
            <div className="icon-fallback"></div>{" "}
            {/* Shows if image fails or is missing */}
          </div>
          <h1>
            <span>Ask2Query:</span> An interactive system for disambiguation in
            Text-to-SQL
          </h1>
        </div>
      </header>

      <main className="main-layout">
        {/* Column 1: Query & Settings */}
        <div className="column-panel">
          <div className="panel-header">
            <h2> Query Settings</h2>
          </div>
          <div className="panel-body">
            <div className="field-group">
              <label>Enter your natural language query here...</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Type your query..."
              />
            </div>
            <div className="db-grid">
              <div className="field-group">
                <label>Database Dialect</label>
                <select
                  value={dbDialect}
                  onChange={(e) => setDbDialect(e.target.value)}
                >
                  <option value="SQLite">SQLite</option>
                  <option value="MySQL">MySQL</option>
                  <option value="PostgreSQL">PostgreSQL</option>
                  <option value="SQL Server">SQL Server</option>
                  <option value="Oracle">Oracle</option>
                </select>
              </div>
              <div className="field-group">
                <label>Database Used</label>
                <select
                  value={dbUsed}
                  onChange={(e) => setDBUsed(e.target.value)}
                >
                  <option value="formula_1">formula_1</option>
                  <option value="california_schools">california_schools</option>
                  <option value="european_football_2">
                    european_football_2
                  </option>
                  <option value="codebase_community">codebase_community</option>
                  <option value="superhero">superhero</option>
                  <option value="debit_card_specializing">
                    debit_card_specializing
                  </option>
                </select>
              </div>
            </div>
            <div className="button-row">
              <button
                className="btn-clear"
                onClick={() => {
                  setQuestion(
                    "How many drivers born after the end of Vietnam War have been ranked 2?",
                  );
                  setDbDialect("SQLite");
                  setDBUsed("formula_1");
                }}
              >
                Clear
              </button>
              <button className="btn-primary flex-1" onClick={handleSubmit}>
                Submit Query
              </button>
            </div>
            <div className="examples-container">
              <h3>Examples</h3>
              {examples.map((ex) => (
                <div
                  key={ex.id}
                  className="example-pill"
                  onClick={() => handleExampleSelect(ex)}
                >
                  {ex.question}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column 2: Ambiguity Resolution (Highlight Panel) */}
        <div className="column-panel highlight-bg">
          <div className="panel-header">
            <h2>Ambiguity Resolution</h2>
            <span
              className="help-icon"
              onClick={() => setShowDocs(true)}
              style={{ cursor: "pointer" }}
            >
              ?
            </span>
          </div>
          <div className="panel-body">
            {isDetectingAmbiguity ? (
              <div className="spinner-box">Analyzing...</div>
            ) : (
              <>
                {/* Display submitted clarifications history */}
                {submittedClarifications.length > 0 && (
                  <>
                    <label className="section-label">
                      Submitted Clarifications
                    </label>
                    {submittedClarifications.map((submitted, idx) => (
                      <div
                        key={`submitted-${idx}`}
                        className="question-card submitted-card"
                      >
                        <p>{submitted.question}</p>
                        <div className="submitted-answer">
                          <span className="answer-label">Your choice:</span>
                          <span className="answer-value">
                            {submitted.answer}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Display submitted constraints history */}
                {submittedConstraints.length > 0 && (
                  <>
                    {submittedClarifications.length > 0 && (
                      <div className="spacing-top" />
                    )}
                    <label className="section-label">
                      Additional Constraints
                    </label>
                    {submittedConstraints.map((constraint, idx) => (
                      <div
                        key={`constraint-${idx}`}
                        className="constraint-item"
                      >
                        <span className="constraint-label">
                          Additional constraints:
                        </span>
                        <span className="constraint-text">{constraint}</span>
                      </div>
                    ))}
                  </>
                )}

                {/* Display new/current clarification questions */}
                {ambiguities.length > 0 && (
                  <>
                    {(submittedClarifications.length > 0 ||
                      submittedConstraints.length > 0) && (
                      <div className="spacing-top" />
                    )}
                    <label className="section-label">
                      {submittedClarifications.length > 0
                        ? "New Clarification Questions"
                        : "Clarification Questions"}
                    </label>
                    {ambiguities.map((q, i) => (
                      <div key={`current-${i}`} className="question-card">
                        <p>{q.question}</p>
                        <select
                          value={clarificationList[i]?.answer || ""}
                          onChange={(e) => {
                            const newList = [...clarificationList];
                            newList[i] = {
                              ...newList[i],
                              question: q.question,
                              level_1_label: q.level_1_label,
                              level_2_label: q.level_2_label,
                              answer: e.target.value,
                            };
                            setClarificationList(newList);
                          }}
                        >
                          <option value="" disabled>
                            Please select an answer
                          </option>
                          {(q.choices || []).map((c, j) => (
                            <option key={j} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        {/* Show input box when "Others" is selected */}
                        {clarificationList[i]?.answer === "Others" && (
                          <div className="field-group spacing-top">
                            <label>Please specify your clarification</label>
                            <textarea
                              className="small-text"
                              value={othersInputs[q.question] || ""}
                              onChange={(e) => {
                                setOthersInputs((prev) => ({
                                  ...prev,
                                  [q.question]: e.target.value,
                                }));
                              }}
                              placeholder="Enter your clarification here..."
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}

                {/* Additional constraints input (only show if there are current ambiguities) */}
                {ambiguities.length > 0 && (
                  <div className="field-group spacing-top">
                    <label>Additional Constraints</label>
                    <textarea
                      className="small-text"
                      value={additionalInfo}
                      onChange={(e) => setAdditionalInfo(e.target.value)}
                      placeholder="I need the driver's nationality to be 'Germany'."
                    />
                  </div>
                )}

                {/* Submit button (only show if there are current ambiguities) */}
                {ambiguities.length > 0 && (
                  <button
                    className="btn-primary full-width spacing-top"
                    onClick={handleClarification}
                    disabled={!sessionId || ambiguities.length === 0}
                  >
                    Submit Clarifications
                  </button>
                )}

                {/* Show message if no current ambiguities and no history */}
                {ambiguities.length === 0 &&
                  submittedClarifications.length === 0 &&
                  submittedConstraints.length === 0 && (
                    <div className="empty-state">
                      <p>
                        No clarification questions yet. Submit a query to begin.
                      </p>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>

        {/* Column 3: SQL Generation & Comparison */}
        <div className="column-panel">
          <div className="panel-header">
            <h2>SQL Generation & Comparison</h2>
          </div>
          <div className="panel-body">
            {isTranslatingSQL ? (
              <div className="spinner-box">Generating SQL...</div>
            ) : (
              <>
                <div className="sql-output-group">
                  <label>
                    <system-title-span>XiYan-SQL</system-title-span> Output
                    (Without <system-title-span>Ask2Query</system-title-span>)
                  </label>
                  <div className="sql-box">
                    {rawSQL
                      ? showComparison
                        ? highlightSQLDifferences(rawSQL, sqlDifferences, true)
                        : rawSQL
                      : "Awaiting submission..."}
                  </div>
                  {isSQLReady && showComparison && (
                    <div className="eval-tag error">Evaluation: ❌</div>
                  )}
                </div>

                <div className="sql-output-group spacing-top">
                  <label>
                    <system-title-span>XiYan-SQL</system-title-span> Output
                    (With <system-title-span>Ask2Query</system-title-span>)
                  </label>
                  <div className="sql-box highlight-sql">
                    {clarifiedSQL
                      ? showComparison
                        ? highlightSQLDifferences(
                            clarifiedSQL,
                            sqlDifferences,
                            false,
                          )
                        : clarifiedSQL
                      : "Awaiting submission..."}
                  </div>
                  {isSQLReady && showComparison && (
                    <div className="eval-tag success">Evaluation: ✅</div>
                  )}
                </div>

                {isSQLReady && showComparison && sqlDifferences.length > 0 && (
                  <div className="sql-differences-panel spacing-top">
                    <label className="section-label">
                      Detected Differences ({sqlDifferences.length})
                    </label>
                    <div className="differences-list">
                      {sqlDifferences.map((diff, idx) => (
                        <div key={idx} className="difference-item">
                          <div className="diff-header">
                            <span className="diff-type">{diff.type}</span>
                            <span className="diff-location">
                              {diff.location}
                            </span>
                          </div>
                          <div className="diff-content">
                            <div className="diff-value">
                              <span className="diff-label">Raw:</span>
                              <code>{diff.raw_value}</code>
                            </div>
                            <div className="diff-arrow">→</div>
                            <div className="diff-value">
                              <span className="diff-label">Clarified:</span>
                              <code>{diff.clarified_value}</code>
                            </div>
                          </div>
                          <div className="diff-description">
                            {diff.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  className="btn-primary full-width spacing-top-lg"
                  disabled={!isSQLReady}
                  onClick={() => setShowComparison(!showComparison)}
                >
                  {showComparison ? "Hide Comparison" : "Compare Results"}
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

const App = () => <SQLAmbiguityResolver />;

export default App;

import React, { useRef, useState } from "react";
import axios from "axios";

function App() {
  const fileInputRef = useRef();
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [conversation, setConversation] = useState([]); // [{question, answer}]
  const [followupLoading, setFollowupLoading] = useState(false);
  const [citations, setCitations] = useState([]);
  const [citationsLoading, setCitationsLoading] = useState(false);
  const [citationsError, setCitationsError] = useState("");

  const uploadFile = async (e) => {
    e.preventDefault();
    const file = fileInputRef.current.files[0];
    if (!file) return;

    setLoading(true);
    setConversation([]);
    setReply("");
    setSessionId(null);
    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const res = await axios.post(
        "http://localhost:4000/api/upload",
        formData
      );
      setReply(res.data.reply);
      setSessionId(res.data.sessionId);
      setConversation([
        { question: "Summarize this document.", answer: res.data.reply },
      ]);
    } catch (err) {
      console.error(err);
      setReply("Error processing the file.");
    } finally {
      setLoading(false);
    }
  };

  const sendFollowup = async (e) => {
    e.preventDefault();
    if (!question.trim() || !sessionId) return;
    setFollowupLoading(true);
    try {
      setConversation((prev) => [...prev, { question, answer: null }]);
      const res = await axios.post("http://localhost:4000/api/followup", {
        sessionId,
        message: question,
      });
      setConversation((prev) =>
        prev.map((item, idx) =>
          idx === prev.length - 1 ? { ...item, answer: res.data.reply } : item
        )
      );
      setReply(res.data.reply);
      setQuestion("");
    } catch (err) {
      console.error(err);
      setReply("Error with follow-up.");
    } finally {
      setFollowupLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file ? file : null);
  };

  // Smart Citation Generator
  const generateCitations = async () => {
    if (!sessionId) return;
    setCitationsLoading(true);
    setCitationsError("");
    setCitations([]);
    try {
      const res = await axios.post("http://localhost:4000/api/generate-citations", { sessionId });
      setCitations(res.data);
    } catch (err) {
      setCitationsError("Error generating citations. Please try again.");
      setCitations([]);
    } finally {
      setCitationsLoading(false);
    }
  };

  // Copy to clipboard helper
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  // Techy dark theme styles
  const colors = {
    bg: "linear-gradient(135deg, #18181b 0%, #232336 100%)",
    glass: "rgba(36,37,46,0.85)",
    accent: "#7f9cf5",
    accentGlow: "0 0 16px 2px #7f9cf5cc",
    text: "#f3f4f6",
    subtext: "#a1a1aa",
    chatUser: "rgba(99,102,241,0.12)",
    chatAI: "rgba(39,39,42,0.85)",
    border: "rgba(127,156,245,0.18)",
    error: "#ef4444",
    cardShadow: "0 8px 32px 0 rgba(31,41,55,0.18)",
    inputBg: "rgba(36,37,46,0.95)",
  };

  return (
    <div
      style={{
        width: "100vw",
        minHeight: "100vh",
        background: colors.bg,
        color: colors.text,
        fontFamily: "JetBrains Mono, Fira Mono, Menlo, monospace",
        margin: 0,
        padding: 0,
        overflowX: "hidden",
        letterSpacing: 0.1,
        transition: "background 0.3s",
      }}
    >
      {/* Header */}
      <header
        style={{
          width: "100%",
          background: "rgba(24,24,27,0.92)",
          borderBottom: `1px solid ${colors.border}`,
          padding: 0,
          position: "sticky",
          top: 0,
          zIndex: 10,
          boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "22px 36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span
              style={{
                fontSize: 32,
                color: colors.accent,
                marginRight: 12,
                filter: "drop-shadow(0 0 8px #7f9cf5cc)",
              }}
            >
              📄
            </span>
            <span
              style={{
                fontWeight: 700,
                fontSize: 24,
                color: colors.text,
                letterSpacing: 1.5,
                textShadow: "0 2px 8px #232336",
              }}
            >
              Paper Pilot
            </span>
          </div>
          <span
            style={{
              color: colors.subtext,
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: 0.5,
            }}
          >
            Powered by GPT-4o | APA Citations
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{
          maxWidth: 1100,
          margin: "48px auto 0 auto",
          display: "flex",
          gap: 48,
          alignItems: "flex-start",
          justifyContent: "center",
          minHeight: 600,
        }}
      >
        {/* Chat Area */}
        <section
          style={{
            flex: 1,
            background: colors.glass,
            borderRadius: 20,
            boxShadow: colors.cardShadow,
            padding: 36,
            minHeight: 520,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            border: `1.5px solid ${colors.border}`,
            backdropFilter: "blur(10px)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              fontSize: 21,
              fontWeight: 700,
              color: colors.accent,
              marginBottom: 22,
              letterSpacing: 0.7,
              textShadow: colors.accentGlow,
            }}
          >
            Conversation
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              maxHeight: 420,
              marginBottom: 18,
              scrollbarWidth: "thin",
              scrollbarColor: `${colors.accent} ${colors.glass}`,
            }}
          >
            {conversation.length === 0 && !loading && (
              <div
                style={{
                  color: colors.subtext,
                  textAlign: "center",
                  marginTop: 100,
                  fontSize: 18,
                  fontWeight: 500,
                  opacity: 0.7,
                }}
              >
                Upload a PDF to start the conversation.
              </div>
            )}
            {loading && (
              <div
                style={{
                  color: colors.accent,
                  textAlign: "center",
                  marginTop: 100,
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: 0.2,
                }}
              >
                Analyzing your PDF...
              </div>
            )} 
            {conversation.map((item, idx) => (
              <div
                key={idx} // 
                style={{
                  background: idx % 2 === 0 ? colors.chatAI : colors.chatUser,
                  borderRadius: 12,
                  padding: "20px 24px",
                  marginBottom: 18,
                  color: colors.text,
                  boxShadow:
                    idx === 0 ? "0 2px 12px #7f9cf522" : "0 2px 8px #23233644",
                  border:
                    idx === 0
                      ? `1.5px solid ${colors.accent}`
                      : `1.5px solid ${colors.border}`,
                  transition: "background 0.2s",
                  textAlign: "left",
                  position: "relative",
                  fontSize: 16.5,
                  fontWeight: 500,
                  backdropFilter: "blur(2px)",
                  outline: idx === 0 ? `2px solid #7f9cf5cc` : undefined,
                  outlineOffset: idx === 0 ? "2px" : undefined,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 7,
                    color: colors.accent,
                    fontSize: 15.5,
                    letterSpacing: 0.3,
                    textShadow: colors.accentGlow,
                  }}
                >
                  {idx === 0 ? "Summary" : "Follow-up"}
                </div>
                <div style={{ marginBottom: 7 }}>
                  <span style={{ color: colors.subtext, fontWeight: 600 }}>
                    Q:
                  </span>{" "}
                  {item.question}
                </div>
                <div>
                  <span style={{ color: colors.accent, fontWeight: 600 }}>
                    A:
                  </span>{" "}
                  {item.answer ? (
                    item.answer
                  ) : (
                    <span
                      style={{ color: colors.subtext, fontStyle: "italic" }}
                    >
                      Thinking...
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Follow-up input */}
          {sessionId && (
            <form
              onSubmit={sendFollowup}
              style={{
                marginTop: 10,
                display: "flex",
                gap: 12,
                alignItems: "center",
                background: colors.inputBg,
                borderRadius: 10,
                padding: 14,
                border: `1.5px solid ${colors.border}`,
                boxShadow: "0 2px 8px #23233644",
                backdropFilter: "blur(6px)",
              }}
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a follow-up question..."
                style={{
                  flex: 1,
                  padding: "13px 16px",
                  borderRadius: 7,
                  border: "none",
                  fontSize: 17,
                  background: "rgba(36,37,46,0.98)",
                  color: colors.text,
                  outline: "none",
                  minWidth: 0,
                  fontWeight: 600,
                  letterSpacing: 0.2,
                  boxShadow: "0 1px 4px #23233633",
                  transition: "box-shadow 0.2s",
                }}
                disabled={followupLoading}
                autoFocus
              />
              <button
                type="submit"
                style={{
                  background: followupLoading ? colors.accent : colors.accent,
                  color: "white",
                  border: "none",
                  borderRadius: 7,
                  padding: "13px 26px",
                  fontSize: 17,
                  fontWeight: 800,
                  cursor: followupLoading ? "not-allowed" : "pointer",
                  transition: "background 0.2s, box-shadow 0.2s",
                  boxShadow: followupLoading
                    ? "0 0 0 2px #7f9cf5cc"
                    : "0 2px 8px #7f9cf522",
                  letterSpacing: 0.3,
                  textShadow: "0 1px 4px #23233633",
                  filter: followupLoading ? "brightness(0.95)" : "none",
                }}
                disabled={followupLoading || !question.trim()}
              >
                {followupLoading ? "Sending..." : "Ask"}
              </button>
            </form>
          )}
          {/* Smart Citation Generator UI */}
          {sessionId && (
            <div style={{ marginTop: 32 }}>
              <button
                onClick={generateCitations}
                style={{
                  background: citationsLoading ? colors.accent : colors.accent,
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  padding: "12px 24px",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: citationsLoading ? "not-allowed" : "pointer",
                  transition: "background 0.2s, box-shadow 0.2s",
                  boxShadow: citationsLoading
                    ? "0 0 0 2px #7f9cf5cc"
                    : "0 2px 8px #7f9cf522",
                  letterSpacing: 0.3,
                  textShadow: "0 1px 4px #23233633",
                  filter: citationsLoading ? "brightness(0.95)" : "none",
                  marginBottom: 18,
                }}
                disabled={citationsLoading}
              >
                {citationsLoading ? "Generating Smart Citations..." : "Generate Smart Citations"}
              </button>
              {citationsError && (
                <div style={{ color: colors.error, marginBottom: 12 }}>{citationsError}</div>
              )}
              {citations.length > 0 && (
                <div
                  style={{
                    background: "rgba(36,37,46,0.98)",
                    borderRadius: 8,
                    padding: 18,
                    color: colors.text,
                    fontSize: 15,
                    whiteSpace: "pre-line",
                    boxShadow: "0 2px 8px #23233633",
                    border: `1.5px solid ${colors.border}`,
                    marginTop: 10,
                    fontWeight: 600,
                    maxHeight: 340,
                    overflowY: "auto",
                    maxWidth: 520,
                  }}
                >
                  <strong>AI Suggested Citations:</strong>
                  <ul style={{ marginTop: 10, paddingLeft: 20 }}>
                    {citations.map((cite, idx) => (
                      <li key={idx} style={{ marginBottom: 18, textAlign: "left" }}>
                        <div style={{ fontWeight: 700, color: colors.accent, marginBottom: 4 }}>
                          {cite.statement}
                        </div>
                        {cite.source && (
                          <div style={{ marginBottom: 4 }}>
                            <a href={cite.source} target="_blank" rel="noopener noreferrer" style={{ color: colors.accent, textDecoration: "underline" }}>
                              Source Link
                            </a>
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontSize: 14,
                              wordBreak: "break-word",
                              overflowWrap: "break-word",
                              whiteSpace: "pre-wrap",
                              maxWidth: 340,
                              display: "block",
                            }}
                          >
                            {cite.citation}
                          </span>
                          <button
                            onClick={() => copyToClipboard(cite.citation)}
                            style={{
                              marginLeft: 4,
                              background: colors.accent,
                              color: "white",
                              border: "none",
                              borderRadius: 5,
                              padding: "4px 10px",
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: "0 1px 4px #23233633",
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {/* End Smart Citation Generator UI */}
        </section>

        {/* Upload Area */}
        <section
          style={{
            width: 340,
            background: colors.glass,
            borderRadius: 20,
            boxShadow: colors.cardShadow,
            padding: 36,
            border: `1.5px solid ${colors.border}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 22,
            position: "relative",
            top: 0,
            minHeight: 520,
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: colors.accent,
              marginBottom: 10,
              letterSpacing: 0.5,
              textShadow: colors.accentGlow,
            }}
          >
            Upload PDF
          </div>
          <form
            onSubmit={uploadFile}
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <label
              htmlFor="pdf-upload"
              style={{
                border: "2px dashed #7f9cf5",
                borderRadius: 12,
                padding: 28,
                textAlign: "center",
                background: "rgba(36,37,46,0.92)",
                cursor: "pointer",
                transition: "border-color 0.2s, box-shadow 0.2s",
                marginBottom: 10,
                color: colors.accent,
                fontWeight: 700,
                fontSize: 16,
                boxShadow: "0 2px 8px #23233633",
                outline: "none",
              }}
            >
              <input
                id="pdf-upload"
                type="file"
                accept="application/pdf"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              <span>Click to select a PDF file</span>
            </label>
            {selectedFile && (
              <div
                style={{
                  background: "rgba(36,37,46,0.98)",
                  borderRadius: 8,
                  padding: "12px 0",
                  color: colors.text,
                  fontSize: 15,
                  marginBottom: 10,
                  textAlign: "center",
                  fontWeight: 600,
                  border: `1.5px solid ${colors.border}`,
                  boxShadow: "0 1px 4px #23233633",
                }}
              >
                <span>
                  Document selected: <strong>{selectedFile.name}</strong>
                </span>
              </div>
            )}
            <button
              type="submit"
              style={{
                background: loading ? colors.accent : colors.accent,
                color: "white",
                border: "none",
                borderRadius: 8,
                padding: "13px 0",
                fontSize: 18,
                fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "background 0.2s, box-shadow 0.2s",
                marginBottom: 10,
                boxShadow: loading
                  ? "0 0 0 2px #7f9cf5cc"
                  : "0 2px 8px #7f9cf522",
                letterSpacing: 0.3,
                textShadow: "0 1px 4px #23233633",
                filter: loading ? "brightness(0.95)" : "none",
              }}
              disabled={loading}
            >
              {loading ? "Processing..." : "Upload & Summarize"}
            </button>
          </form>
          <div
            style={{
              marginTop: 18,
              minHeight: 40,
              textAlign: "center",
              width: "100%",
            }}
          >
            {loading ? (
              <div
                style={{ color: colors.accent, fontWeight: 600, fontSize: 16 }}
              >
                Analyzing your PDF...
              </div>
            ) : null}
            {/* {reply && !loading && (
              <div
                style={{
                  background: "rgba(36,37,46,0.98)",
                  borderRadius: 8,
                  padding: 16,
                  color: colors.text,
                  fontSize: 15,
                  whiteSpace: "pre-line",
                  boxShadow: "0 2px 8px #23233633",
                  border: `1.5px solid ${colors.border}`,
                  marginTop: 10,
                  fontWeight: 600,
                }}
              >
                <strong>Summary:</strong>
                <div style={{ marginTop: 8 }}>{reply}</div>
              </div>
            )} */}
            
          </div>
        </section>
      </main>
      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          color: colors.subtext,
          fontSize: 15,
          marginTop: 48,
          padding: 28,
          borderTop: `1.5px solid ${colors.border}`,
          letterSpacing: 0.2,
          fontWeight: 500,
          background: "rgba(24,24,27,0.92)",
          boxShadow: "0 -2px 12px #23233633",
          backdropFilter: "blur(8px)",
        }}
      >
        &copy; {new Date().getFullYear()} AI PDF Summarizer. All rights
        reserved.
      </footer>
    </div>
  );
}

export default App;

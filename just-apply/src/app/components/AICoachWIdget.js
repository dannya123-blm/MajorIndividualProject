"use client";

import { useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:5000";

export default function AICoachWidget({
  skills = [],
  qualifications = [],
  cvPreview = "",
  selectedJob = null,
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("chat");
  const [message, setMessage] = useState("");
  const [bulletText, setBulletText] = useState("");
  const [coachReply, setCoachReply] = useState("");
  const [loading, setLoading] = useState(false);

  const sendRequest = async (endpoint, body) => {
    try {
      setLoading(true);
      setCoachReply("");

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setCoachReply(data.error || "Just Appy could not respond.");
        return;
      }

      setCoachReply(
        data.reply ||
          data.review ||
          data.cover_letter ||
          data.cv ||
          "No response returned."
      );
    } catch (err) {
      console.error(err);
      setCoachReply("Could not connect to Just Appy.");
    } finally {
      setLoading(false);
    }
  };

  const baseBody = {
    skills,
    qualifications,
    cv_text: cvPreview,
    selected_job: selectedJob,
  };

  const handleChat = () => {
    if (!message.trim()) return;
    sendRequest("/api/ai-coach/chat", {
      ...baseBody,
      message,
    });
  };

  const handleCvReview = () => {
    sendRequest("/api/ai-coach/cv-review", baseBody);
  };

  const handleCoverLetter = () => {
    sendRequest("/api/ai-coach/cover-letter", {
      job_title: selectedJob?.title || "Data Analyst",
      company: selectedJob?.company || "",
      skills,
      cv_text: cvPreview,
      job_description: selectedJob?.description || "",
    });
  };

  const handleCvGenerator = () => {
    sendRequest("/api/ai-coach/generate-cv", {
      details: `
Skills: ${skills.join(", ")}
Qualifications: ${qualifications.join(", ")}
CV Preview: ${cvPreview}
Target Job: ${selectedJob?.title || "Not selected"}
      `,
    });
  };

  const handleBulletImprove = () => {
    if (!bulletText.trim()) return;
    sendRequest("/api/ai-coach/chat", {
      ...baseBody,
      message: `Improve this CV bullet point and make it stronger for job applications: ${bulletText}`,
    });
  };

  const renderResponse = () => {
    if (loading) return <p className="ai-coach-loading">Just Appy is thinking...</p>;

    if (!coachReply) {
      return <p className="ai-coach-empty">Your AI career guidance will appear here.</p>;
    }

    const sections = coachReply
      .split("###")
      .map((s) => s.trim())
      .filter(Boolean);

    if (sections.length <= 1) {
      return (
        <div className="ai-coach-response">
          {coachReply.split("\n").map((line, idx) =>
            line.trim() ? <p key={idx}>{line.replace(/^[-*]\s*/, "")}</p> : null
          )}
        </div>
      );
    }

    return (
      <div className="ai-coach-response">
        {sections.map((section, idx) => {
          const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
          const title = lines[0];
          const content = lines.slice(1);

          return (
            <div className="ai-section" key={idx}>
              <h4>{title}</h4>
              <ul>
                {content.map((line, lineIdx) => (
                  <li key={lineIdx}>{line.replace(/^[-*]\s*/, "")}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {!open && (
        <button className="ai-coach-float" onClick={() => setOpen(true)}>
          🤖 Just Appy
        </button>
      )}

      {open && (
        <div className="ai-coach-panel">
          <div className="ai-coach-header">
            <div>
              <p className="ai-coach-kicker">AI Career Coach</p>
              <h3>Just Appy</h3>
            </div>

            <button className="ai-coach-close" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          <p className="ai-coach-subtitle">
            Get CV feedback, cover letters, job advice, and career guidance.
          </p>

          <div className="ai-coach-actions">
            <button className={mode === "chat" ? "active" : ""} onClick={() => { setMode("chat"); setCoachReply(""); }}>
              Chat
            </button>
            <button className={mode === "review" ? "active" : ""} onClick={() => { setMode("review"); setCoachReply(""); }}>
              CV Review
            </button>
            <button className={mode === "cover" ? "active" : ""} onClick={() => { setMode("cover"); setCoachReply(""); }}>
              Cover Letter
            </button>
            <button className={mode === "cv" ? "active" : ""} onClick={() => { setMode("cv"); setCoachReply(""); }}>
              CV Generator
            </button>
            <button className={mode === "bullet" ? "active" : ""} onClick={() => { setMode("bullet"); setCoachReply(""); }}>
              Improve Bullet
            </button>
          </div>

          {mode === "chat" && (
            <div className="ai-coach-input-area">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask Just Appy how to improve your CV or job search..."
              />
              <button onClick={handleChat} disabled={loading || !message.trim()}>
                {loading ? "Thinking..." : "Ask Coach"}
              </button>
            </div>
          )}

          {mode === "review" && (
            <div className="ai-coach-input-area">
              <p className="ai-coach-help">Reviews your uploaded CV and gives clear improvement steps.</p>
              <button onClick={handleCvReview} disabled={loading || (!cvPreview && skills.length === 0)}>
                {loading ? "Reviewing..." : "Review My CV"}
              </button>
            </div>
          )}

          {mode === "cover" && (
            <div className="ai-coach-input-area">
              <p className="ai-coach-help">Creates a tailored cover letter from your CV and selected job.</p>
              <button onClick={handleCoverLetter} disabled={loading}>
                {loading ? "Generating..." : "Generate Cover Letter"}
              </button>
            </div>
          )}

          {mode === "cv" && (
            <div className="ai-coach-input-area">
              <p className="ai-coach-help">Creates a clean CV draft from your extracted profile.</p>
              <button onClick={handleCvGenerator} disabled={loading || skills.length === 0}>
                {loading ? "Generating..." : "Generate CV Draft"}
              </button>
            </div>
          )}

          {mode === "bullet" && (
            <div className="ai-coach-input-area">
              <textarea
                value={bulletText}
                onChange={(e) => setBulletText(e.target.value)}
                placeholder="Paste a weak CV bullet point..."
              />
              <button onClick={handleBulletImprove} disabled={loading || !bulletText.trim()}>
                {loading ? "Improving..." : "Improve Bullet"}
              </button>
            </div>
          )}

          <div className="ai-coach-output">{renderResponse()}</div>
        </div>
      )}
    </>
  );
}
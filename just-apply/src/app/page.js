"use client";

import { useState } from "react";

export default function Uploader() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");
  const [skills, setSkills] = useState([]);
  const [qualifications, setQualifications] = useState([]);
  const [preview, setPreview] = useState("");
  const [azureBlobUrl, setAzureBlobUrl] = useState("");
  const [jobs, setJobs] = useState([]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setFileName(selected.name);
      setStatus("");
      setSkills([]);
      setQualifications([]);
      setPreview("");
      setAzureBlobUrl("");
      setJobs([]); // reset jobs when new file chosen
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus("Please select a CV first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setStatus("Uploading & parsing CV...");

    try {
      //  First: upload CV + extract skills/qualifications
      const res = await fetch("http://127.0.0.1:5000/api/upload-cv", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("Upload failed: " + (data.error || "Unknown error"));
        return;
      }

      setStatus("CV parsed. Finding matching jobs...");
      setSkills(data.skills || []);
      setQualifications(data.qualifications || []);
      setPreview(data.text_preview || "");
      setAzureBlobUrl(data.azure_blob_url || "");

      //  Then: send skills/quals to /api/match-jobs
      const matchRes = await fetch("http://127.0.0.1:5000/api/match-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: data.skills || [],
          qualifications: data.qualifications || [],
        }),
      });

      const matchData = await matchRes.json();

      if (!matchRes.ok) {
        console.error("Job matching error:", matchData);
        setStatus("CV parsed, but job matching failed.");
        return;
      }

      setJobs(matchData.jobs || []);
      setStatus(
        `CV parsed successfully. Found ${matchData.jobs?.length || 0} matching jobs.`
      );
    } catch (err) {
      console.error(err);
      setStatus("Error: could not connect to backend.");
    }
  };

  return (
    <div className="dashboard-root" style={{ minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="icon-btn" title="Toggle notifications">🔔</button>
        </div>
        <nav className="sidebar-nav">
          <button className="nav-link active">Dashboard</button>
          <button className="nav-link">Saved Jobs</button>
          <button className="nav-link">Profile</button>
          <button className="nav-link">Sign Out</button>
        </nav>
      </aside>

      {/* Main content */}
      <main className="main">
        {/* Top navigation / brand */}
        <header className="topbar">
          <div className="brand">
            <div className="logo">🧳</div>
            <div className="brand-name">Just Apply</div>
          </div>

          <nav className="topnav">
            <button className="topnav-item active">Dashboard</button>
            <button className="topnav-item">Saved Jobs</button>
            <button className="topnav-item">Profile</button>
            <button className="topnav-item">Sign Out</button>
          </nav>

          <div className="user">
            <div className="welcome">Welcome, John Doe</div>
            <div className="avatar" />
          </div>
        </header>

        {/* Stat cards */}
        <section className="stats-row">
          <div className="stat-card">
            <div className="stat-icon">💼</div>
            <div className="stat-label">Jobs Applied</div>
            <div className="stat-value">0</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">❤️</div>
            <div className="stat-label">Saved Jobs</div>
            <div className="stat-value">0</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-label">Interviews</div>
            <div className="stat-value">0</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📈</div>
            <div className="stat-label">Match Rate</div>
            <div className="stat-value">0</div>
          </div>
        </section>

        {/* Upload + preview area */}
        <section className="upload-section">
          <div className="upload-card">
            <div className="upload-title">
              <span className="upload-icon">📁</span>
              <h3>Upload Your CV</h3>
            </div>

            <label className="dropzone">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleFileChange}
              />
              <div className="drop-inner">
                <div className="cloud">☁️</div>
                <div className="drop-text">
                  Drag and drop your CV here or click to browse
                </div>
                <div className="drop-sub">Supported formats: PDF, DOCX, TXT (Max 5MB)</div>
              </div>
            </label>

            <div className="upload-actions">
              <div className="selected-file">
                {fileName ? `Selected: ${fileName}` : "No file selected"}
              </div>
              <button className="btn-primary" onClick={handleUpload}>
                Upload & Find Matching Jobs
              </button>
            </div>

            {status && <div className="status">{status}</div>}
            {azureBlobUrl && (
              <div className="azure">
                <strong>Stored in Azure:</strong>{" "}
                <a href={azureBlobUrl} target="_blank" rel="noreferrer">
                  {azureBlobUrl}
                </a>
              </div>
            )}
          </div>

          <div className="preview-column">
            <div className="preview-card">
              <h4>CV Preview</h4>
              <div className="preview-text">
                {preview || "Upload a CV to see a text preview here."}
              </div>
            </div>

            <div className="skills-card">
              <h4>Extracted Skills & Qualifications</h4>
              <div className="chips">
                {skills.length === 0 && qualifications.length === 0 && (
                  <div className="chip-empty">No skills detected yet</div>
                )}
                {skills.map((s, i) => (
                  <span key={`s-${i}`} className="chip chip-orange">
                    {s}
                  </span>
                ))}
                {qualifications.map((q, i) => (
                  <span key={`q-${i}`} className="chip chip-blue">
                    {q}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Recommended jobs */}
        {jobs.length > 0 && (
          <section className="jobs-section">
            <div className="jobs-card">
              <h4>Recommended Jobs ({jobs.length})</h4>
              <div className="jobs-list">
                {jobs.map((job, idx) => (
                  <div className="job-item" key={idx}>
                    <div className="job-title">
                      {job.title || job.job_title || "Untitled role"}
                    </div>
                    <div className="job-meta">
                      {job.company && <span>{job.company}</span>}
                      {job.location && <span> • {job.location}</span>}
                    </div>
                    {typeof job.total_score !== "undefined" && (
                      <div className="job-score">
                        Match score: {job.total_score} (skills {job.skill_score} / quals {job.qual_score})
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* minimal inline helper styles */}
      <style jsx>{`
        .dashboard-root {
          display: flex;
          background: var(--page-bg, #fff8f0);
        }
        .sidebar {
          width: 80px;
          padding: 18px 8px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: center;
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 18px;
        }
        .brand { display:flex; align-items:center; gap:12px; }
        .logo { font-size:20px; }
        .topnav { display:flex; gap:12px; align-items:center; }
        .topnav-item { background:transparent; border:none; padding:8px 10px; border-radius:8px; cursor:pointer; }
        .topnav-item.active { background: #ff6200; color: #fff; }
        .user { display:flex; align-items:center; gap:12px; }
        .avatar { width:36px; height:36px; border-radius:50%; background:#e6e6e6; }

        .main { flex:1; padding: 20px 28px; max-width: 1200px; margin: 0 auto; }

        .stats-row { display:flex; gap:16px; margin-bottom:18px; flex-wrap:wrap; }
        .stat-card { background:#fff; padding:14px 18px; border-radius:8px; min-width:180px; box-shadow: 0 6px 18px rgba(0,0,0,0.04); }
        .stat-label { color:#666; font-size:13px; }
        .stat-value { font-weight:700; font-size:18px; margin-top:6px; }

        .upload-section { display:grid; grid-template-columns: 1fr 360px; gap:18px; align-items:start; }
        .upload-card { background:#fff; padding:18px; border-radius:10px; box-shadow: 0 10px 30px rgba(0,0,0,0.04); }
        .upload-title { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
        .dropzone { border:1px dashed #e3e3e3; border-radius:8px; padding:26px; display:flex; align-items:center; justify-content:center; cursor:pointer; background:#fafafa; }
        .dropzone input { display:none; }
        .drop-inner { text-align:center; color:#777; }
        .drop-text { font-weight:600; margin-top:8px; }
        .drop-sub { margin-top:6px; font-size:12px; color:#999; }

        .upload-actions { display:flex; gap:12px; margin-top:14px; align-items:center; }
        .selected-file { flex:1; color:#666; font-size:14px; }
        .btn-primary { background: #ff6200; color:#fff; border:none; padding:10px 12px; border-radius:8px; cursor:pointer; }

        .preview-column { display:flex; flex-direction:column; gap:12px; }
        .preview-card, .skills-card { background:#fff; padding:14px; border-radius:8px; box-shadow: 0 8px 20px rgba(0,0,0,0.04); }
        .preview-text { min-height:120px; max-height:180px; overflow:auto; background:#fbfbfb; padding:10px; border-radius:6px; color:#333; font-size:13px; }

        .chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
        .chip { padding:6px 10px; border-radius:20px; font-size:13px; display:inline-block; }
        .chip-orange { background:#fff0e6; color:#ff6b2b; }
        .chip-blue { background:#eaf6ff; color:#0066cc; }
        .chip-empty { color:#999; font-size:13px; }

        .jobs-section { margin-top:18px; }
        .jobs-card { background:#fff; padding:16px; border-radius:10px; box-shadow: 0 8px 20px rgba(0,0,0,0.04); }
        .job-item { padding:10px; border-radius:8px; background:#fff; margin-bottom:10px; }
        .job-meta { color:#666; font-size:13px; margin-top:6px; }
        .job-score { font-size:12px; color:#444; margin-top:6px; }

        @media (max-width: 980px) {
          .upload-section { grid-template-columns: 1fr; }
          .sidebar { display:none; }
          .topnav { display:none; }
        }
      `}</style>
    </div>
  );
}

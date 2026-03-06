"use client";

import { useState } from "react";
import Image from "next/image";
import justwork from "../images/justwork.png";

export default function Uploader() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");
  const [skills, setSkills] = useState([]);
  const [qualifications, setQualifications] = useState([]);
  const [preview, setPreview] = useState("");
  const [azureBlobUrl, setAzureBlobUrl] = useState("");
  const [jobs, setJobs] = useState([]);
  const [jobStats, setJobStats] = useState(null);

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
      setJobs([]);
      setJobStats(null);
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
      // 1) Upload CV + extract skills/qualifications
      const res = await fetch("http://127.0.0.1:5000/api/upload-cv", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("Upload failed: " + (data.error || "Unknown error"));
        return;
      }

      setSkills(data.skills || []);
      setQualifications(data.qualifications || []);
      setPreview(data.text_preview || "");
      setAzureBlobUrl(data.azure_blob_url || "");
      setStatus("CV parsed. Finding matching jobs...");

      // 2) Send skills/quals to /api/match-jobs with top_n = 10 (for the 10/50 test)
      const matchRes = await fetch("http://127.0.0.1:5000/api/match-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: data.skills || [],
          qualifications: data.qualifications || [],
          top_n: 10,
        }),
      });

      const matchData = await matchRes.json();

      if (!matchRes.ok) {
        console.error("Job matching error:", matchData);
        setStatus("CV parsed, but job matching failed.");
        return;
      }

      const returnedJobs = (matchData.jobs || []).map((job) => {
        const matchedCount = Array.isArray(job.matched_skills)
          ? job.matched_skills.length
          : 0;
        const missingCount = Array.isArray(job.missing_skills)
          ? job.missing_skills.length
          : 0;
        const totalRelevantSkills = matchedCount + missingCount;
        const matchPercentage =
          totalRelevantSkills > 0
            ? Math.round((matchedCount / totalRelevantSkills) * 100)
            : 0;

        return {
          ...job,
          match_percentage: matchPercentage,
        };
      });

      setJobs(returnedJobs);
      setJobStats(matchData.metadata || null);

      if (matchData.metadata) {
        const { total_jobs_loaded, jobs_with_matches, top_n } =
          matchData.metadata;

        setStatus(
          `CV parsed successfully. From ${total_jobs_loaded} jobs, ` +
            `${jobs_with_matches} had at least one match. Showing top ${top_n}.`
        );
      } else {
        setStatus(
          `CV parsed successfully. Found ${returnedJobs.length} matching jobs.`
        );
      }
    } catch (err) {
      console.error(err);
      setStatus("Error: could not connect to backend.");
    }
  };

  return (
    <div className="dashboard-root">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="icon-btn" title="Notifications">
            🔔
          </button>
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
            <Image
              src={justwork}
              alt="Just Apply logo"
              width={22}
              height={22}
              className="brand-logo"
            />
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
            <div className="stat-value">
              {jobs.length > 0
                ? `${Math.round(
                    jobs.reduce(
                      (sum, job) => sum + (job.match_percentage || 0),
                      0
                    ) / jobs.length
                  )}%`
                : "0%"}
            </div>
          </div>
        </section>

        {/* Upload + preview area */}
        <section className="upload-section">
          {/* Left: upload card */}
          <div className="upload-card">
            <div className="upload-title">
              <span className="upload-icon">📁</span>
              <h3>Upload CV</h3>
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
                  Drag and drop CV here or click to browse
                </div>
                <div className="drop-sub">
                  Supported formats: PDF, DOCX, TXT (Max 5MB)
                </div>
              </div>
            </label>

            <div className="upload-actions">
              <div className="selected-file">
                {fileName ? `Selected: ${fileName}` : "No file selected"}
              </div>
              <button className="btn-primary" onClick={handleUpload}>
                Upload &amp; Find Matching Jobs
              </button>
            </div>

            {status && <div className="status">{status}</div>}

            {azureBlobUrl && (
              <div className="azure">
                <strong>Stored in Azure:</strong>{" "}
                <a
                  href={azureBlobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {azureBlobUrl}
                </a>
              </div>
            )}
          </div>

          {/* Right: preview + skills */}
          <div className="preview-column">
            <div className="preview-card">
              <h4>CV Preview</h4>
              <div className="preview-text">
                {preview || "Upload a CV to see a text preview here."}
              </div>
            </div>

            <div className="skills-card">
              <h4>Extracted Skills &amp; Qualifications</h4>
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

              {jobStats && (
                <p className="jobs-meta">
                  Testing summary: loaded{" "}
                  <strong>{jobStats.total_jobs_loaded}</strong> jobs;{" "}
                  <strong>{jobStats.jobs_with_matches}</strong> had at least one
                  match. Showing top <strong>{jobStats.top_n}</strong>.
                </p>
              )}

              <div className="jobs-list">
                {jobs.map((job, idx) => (
                  <div className="job-item" key={idx}>
                    <div className="job-title">
                      {job.title || job.job_title || "Untitled role"}
                    </div>

                    <div className="job-meta">
                      {job.company && <span>{job.company}</span>}
                      {job.location && <span> • {job.location}</span>}
                      {job.industry && <span> • {job.industry}</span>}
                    </div>

                    {typeof job.total_score !== "undefined" && (
                      <div className="job-score">
                        Match score: {job.total_score} (skills {job.skill_score}{" "}
                        / quals {job.qual_score})
                      </div>
                    )}

                    {typeof job.match_percentage !== "undefined" && (
                      <div className="job-score">
                        Match percentage: {job.match_percentage}%
                      </div>
                    )}

                    {Array.isArray(job.matched_skills) &&
                      job.matched_skills.length > 0 && (
                        <div className="job-tags-block">
                          <div className="job-tags-title">Matched skills</div>
                          <div className="chips">
                            {job.matched_skills.map((skill, skillIdx) => (
                              <span
                                key={`matched-${idx}-${skillIdx}`}
                                className="chip chip-orange"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {Array.isArray(job.missing_skills) &&
                      job.missing_skills.length > 0 && (
                        <div className="job-tags-block">
                          <div className="job-tags-title">Missing skills</div>
                          <div className="chips">
                            {job.missing_skills.map((skill, skillIdx) => (
                              <span
                                key={`missing-skill-${idx}-${skillIdx}`}
                                className="chip chip-blue"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {Array.isArray(job.missing_qualifications) &&
                      job.missing_qualifications.length > 0 && (
                        <div className="job-tags-block">
                          <div className="job-tags-title">
                            Missing qualifications
                          </div>
                          <div className="chips">
                            {job.missing_qualifications.map((qual, qualIdx) => (
                              <span
                                key={`missing-qual-${idx}-${qualIdx}`}
                                className="chip chip-blue"
                              >
                                {qual}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
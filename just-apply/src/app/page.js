"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [savedJobs, setSavedJobs] = useState([]);
  const [sortBy, setSortBy] = useState("match_percentage");
  const [industryFilter, setIndustryFilter] = useState("All");
  const [locationFilter, setLocationFilter] = useState("All");

  const fetchSavedJobs = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/api/saved-jobs");
      const data = await res.json();
      setSavedJobs(data.saved_jobs || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSavedJobs();
  }, []);

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
      setSortBy("match_percentage");
      setIndustryFilter("All");
      setLocationFilter("All");
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

      const returnedJobs = (matchData.jobs || []).map((job, index) => {
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
          job_id:
            job.job_id ||
            job.id ||
            job.title ||
            job.job_title ||
            `job-${index + 1}`,
          match_percentage: matchPercentage,
        };
      });

      setJobs(returnedJobs);
      setJobStats(matchData.metadata || null);

      if (matchData.metadata) {
        const { total_jobs_loaded, jobs_with_matches, top_n } =
          matchData.metadata;

        setStatus(
          `CV parsed successfully. From ${total_jobs_loaded} jobs, ${jobs_with_matches} had at least one match. Showing top ${top_n}.`
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

  const saveJob = async (job) => {
    try {
      const res = await fetch("http://127.0.0.1:5000/api/save-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      });

      const data = await res.json();
      setSavedJobs(data.saved_jobs || []);
    } catch (err) {
      console.error(err);
    }
  };

  const removeSavedJob = async (jobId) => {
    try {
      const res = await fetch("http://127.0.0.1:5000/api/remove-saved-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });

      const data = await res.json();
      setSavedJobs(data.saved_jobs || []);
    } catch (err) {
      console.error(err);
    }
  };

  const isJobSaved = (jobId) => {
    return savedJobs.some((job) => job.job_id === jobId);
  };

  const industries = useMemo(() => {
    const values = Array.from(
      new Set(
        jobs
          .map((job) => job.industry)
          .filter((value) => typeof value === "string" && value.trim() !== "")
      )
    ).sort((a, b) => a.localeCompare(b));

    return ["All", ...values];
  }, [jobs]);

  const locations = useMemo(() => {
    const values = Array.from(
      new Set(
        jobs
          .map((job) => job.location)
          .filter((value) => typeof value === "string" && value.trim() !== "")
      )
    ).sort((a, b) => a.localeCompare(b));

    return ["All", ...values];
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    let result = [...jobs];

    if (industryFilter !== "All") {
      result = result.filter((job) => job.industry === industryFilter);
    }

    if (locationFilter !== "All") {
      result = result.filter((job) => job.location === locationFilter);
    }

    result.sort((a, b) => {
      if (sortBy === "match_percentage") {
        return (b.match_percentage || 0) - (a.match_percentage || 0);
      }

      if (sortBy === "total_score") {
        return (b.total_score || 0) - (a.total_score || 0);
      }

      if (sortBy === "job_title") {
        const aTitle = (a.title || a.job_title || "").toLowerCase();
        const bTitle = (b.title || b.job_title || "").toLowerCase();
        return aTitle.localeCompare(bTitle);
      }

      return 0;
    });

    return result;
  }, [jobs, sortBy, industryFilter, locationFilter]);

  const averageMatchRate =
    filteredJobs.length > 0
      ? Math.round(
          filteredJobs.reduce(
            (sum, job) => sum + (job.match_percentage || 0),
            0
          ) / filteredJobs.length
        )
      : 0;

  const topMissingSkills = useMemo(() => {
    const counts = {};

    filteredJobs.forEach((job) => {
      if (Array.isArray(job.missing_skills)) {
        job.missing_skills.forEach((skill) => {
          const key = skill.toLowerCase();
          counts[key] = (counts[key] || 0) + 1;
        });
      }
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([skill]) => skill);
  }, [filteredJobs]);

  return (
    <div className="dashboard-root">
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

      <main className="main">
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

        <section className="hero-row">
          <div>
            <p className="eyebrow">AI-powered job matching</p>
            <h1 className="page-title">Find clearer, smarter job matches</h1>
            <p className="page-subtitle">
              Upload a CV, extract skills, and compare against job listings with
              visible match scores, saved jobs, and skill-gap analysis.
            </p>
          </div>
        </section>

        <section className="stats-row">
          <div className="stat-card">
            <div className="stat-icon">💼</div>
            <div className="stat-label">Jobs Applied</div>
            <div className="stat-value">0</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">❤️</div>
            <div className="stat-label">Saved Jobs</div>
            <div className="stat-value">{savedJobs.length}</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-label">Interviews</div>
            <div className="stat-value">0</div>
          </div>

          <div className="stat-card highlight">
            <div className="stat-icon">📈</div>
            <div className="stat-label">Match Rate</div>
            <div className="stat-value">{averageMatchRate}%</div>
          </div>
        </section>

        <section className="upload-section">
          <div className="upload-card">
            <div className="section-head">
              <div>
                <p className="section-kicker">Start here</p>
                <h3>Upload CV</h3>
              </div>
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
                  Supported formats: PDF, DOCX, TXT
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
                <span className="azure-label">Stored in Azure</span>
                <a
                  href={azureBlobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View uploaded file
                </a>
              </div>
            )}
          </div>

          <div className="preview-column">
            <div className="preview-card">
              <div className="section-head compact">
                <div>
                  <p className="section-kicker">Preview</p>
                  <h4>CV Content</h4>
                </div>
              </div>

              <div className="preview-text">
                {preview || "Upload a CV to see a text preview here."}
              </div>
            </div>

            <div className="skills-card">
              <div className="section-head compact">
                <div>
                  <p className="section-kicker">Extracted data</p>
                  <h4>Skills & Qualifications</h4>
                </div>
              </div>

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

        {savedJobs.length > 0 && (
          <section className="jobs-section">
            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">Bookmarks</p>
                  <h4>Saved Jobs ({savedJobs.length})</h4>
                </div>
              </div>

              <div className="jobs-list">
                {savedJobs.map((job, idx) => (
                  <div className="job-item" key={idx}>
                    <div className="job-top">
                      <div>
                        <div className="job-title">
                          {job.title || job.job_title || "Untitled role"}
                        </div>

                        <div className="job-meta">
                          {job.company && <span>{job.company}</span>}
                          {job.location && <span> • {job.location}</span>}
                          {job.industry && <span> • {job.industry}</span>}
                        </div>
                      </div>

                      <div className="match-badge">Saved</div>
                    </div>

                    <div className="job-score-row">
                      <button
                        className="btn-primary"
                        onClick={() => removeSavedJob(job.job_id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {topMissingSkills.length > 0 && (
          <section className="insights-section">
            <div className="insights-card">
              <div className="section-head compact">
                <div>
                  <p className="section-kicker">Insights</p>
                  <h4>Skill Gap Insights</h4>
                </div>
              </div>

              <p className="insight-text">
                Most common missing skills across recommended jobs:
              </p>

              <div className="chips">
                {topMissingSkills.map((skill, i) => (
                  <span key={i} className="chip chip-blue">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {jobs.length > 0 && (
          <section className="jobs-section">
            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">Recommendations</p>
                  <h4>Recommended Jobs ({filteredJobs.length})</h4>
                </div>

                {jobStats && (
                  <div className="summary-pill">
                    {jobStats.total_jobs_loaded} loaded •{" "}
                    {jobStats.jobs_with_matches} matched • top {jobStats.top_n}
                  </div>
                )}
              </div>

              <div className="filter-controls">
                <div className="filter-group">
                  <label>Sort by</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="match_percentage">Match Percentage</option>
                    <option value="total_score">Total Score</option>
                    <option value="job_title">Job Title</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label>Industry</label>
                  <select
                    value={industryFilter}
                    onChange={(e) => setIndustryFilter(e.target.value)}
                  >
                    {industries.map((industry) => (
                      <option key={industry} value={industry}>
                        {industry}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filter-group filter-wide">
                  <label>Location</label>
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                  >
                    {locations.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="jobs-list">
                {filteredJobs.map((job, idx) => (
                  <div className="job-item" key={idx}>
                    <div className="job-top">
                      <div>
                        <div className="job-title">
                          {job.title || job.job_title || "Untitled role"}
                        </div>

                        <div className="job-meta">
                          {job.company && <span>{job.company}</span>}
                          {job.location && <span> • {job.location}</span>}
                          {job.industry && <span> • {job.industry}</span>}
                        </div>
                      </div>

                      <div className="match-badge">
                        {job.match_percentage || 0}% Match
                      </div>
                    </div>

                    <div className="job-score-row">
                      {typeof job.total_score !== "undefined" && (
                        <div className="job-score">
                          Score {job.total_score}
                        </div>
                      )}

                      {typeof job.skill_score !== "undefined" && (
                        <div className="job-score muted">
                          Skills {job.skill_score}
                        </div>
                      )}

                      {typeof job.qual_score !== "undefined" && (
                        <div className="job-score muted">
                          Qualifications {job.qual_score}
                        </div>
                      )}

                      <button
                        className="btn-primary"
                        onClick={() => saveJob(job)}
                        disabled={isJobSaved(job.job_id)}
                      >
                        {isJobSaved(job.job_id) ? "Saved" : "Save Job"}
                      </button>
                    </div>

                    <div className="progress-track">
                      <div
                        className="progress-bar"
                        style={{ width: `${job.match_percentage || 0}%` }}
                      />
                    </div>

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
                                className="chip chip-neutral"
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
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import justwork from "../images/justwork.png";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:5000";

const getAuthHeaders = () => {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function HomePage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState(null);
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
  const [applications, setApplications] = useState([]);
  const [sortBy, setSortBy] = useState("match_percentage");
  const [industryFilter, setIndustryFilter] = useState("All");
  const [locationFilter, setLocationFilter] = useState("All");
  const [loadingPage, setLoadingPage] = useState(true);

  const [showGuideBubble, setShowGuideBubble] = useState(true);
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/me`, {
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (!res.ok) {
        localStorage.removeItem("access_token");
        router.push("/login");
        return;
      }

      const data = await res.json();
      setCurrentUser(data.user);
    } catch (err) {
      console.error(err);
      setStatus("Could not connect to backend.");
    }
  };

  const fetchSavedJobs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/saved-jobs`, {
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (!res.ok) return;

      const data = await res.json();
      setSavedJobs(data.saved_jobs || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchApplications = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/applications`, {
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (!res.ok) return;

      const data = await res.json();
      setApplications(data.applications || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) {
        router.push("/login");
        return;
      }

      await Promise.all([
        fetchCurrentUser(),
        fetchSavedJobs(),
        fetchApplications(),
      ]);

      setLoadingPage(false);
    };

    init();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/logout`, {
        method: "POST",
      });
    } catch (err) {
      console.error(err);
    } finally {
      localStorage.removeItem("access_token");
      router.push("/login");
    }
  };

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
      const res = await fetch(`${API_BASE_URL}/api/upload-cv`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
        },
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
      setStatus("CV parsed. Searching live jobs...");

      const liveRes = await fetch(`${API_BASE_URL}/api/live-jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          skills: data.skills || [],
          qualifications: data.qualifications || [],
          where: "Dublin",
          page: 1,
          results_per_page: 20,
        }),
      });

      const liveData = await liveRes.json();

      if (!liveRes.ok) {
        console.error("Live jobs error:", liveData);
        setStatus(liveData.error || "CV parsed, but live jobs could not be loaded.");
        return;
      }

      const returnedJobs = (liveData.jobs || []).map((job, index) => ({
        ...job,
        job_id:
          job.job_id ||
          job.external_job_id ||
          job.id ||
          job.title ||
          `job-${index + 1}`,
      }));

      setJobs(returnedJobs);
      setJobStats(liveData.metadata || null);
      setShowProfilePrompt(true);

      if (liveData.metadata) {
        setStatus(
          `CV parsed successfully. Loaded ${returnedJobs.length} live jobs from ${liveData.metadata.source || "Adzuna"}.`
        );
      } else {
        setStatus(`CV parsed successfully. Loaded ${returnedJobs.length} live jobs.`);
      }
    } catch (err) {
      console.error(err);
      setStatus("Error: could not connect to backend.");
    }
  };

  const saveJob = async (job) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/save-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ job }),
      });

      const data = await res.json();
      setSavedJobs(data.saved_jobs || []);
    } catch (err) {
      console.error(err);
    }
  };

  const applyToJob = async (job) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/apply-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ job }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Could not apply to this job.");
        return;
      }

      setApplications(data.applications || []);
      window.open(data.apply_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      alert("Could not connect to backend.");
    }
  };

  const isJobSaved = (jobId) => {
    return savedJobs.some((job) => job.job_id === jobId);
  };

  const hasAppliedToJob = (externalJobId, title) => {
    return applications.some(
      (app) =>
        app.external_job_id === String(externalJobId) ||
        (app.title && title && app.title.toLowerCase() === title.toLowerCase())
    );
  };

  const getMatchLabel = (score) => {
    if (score >= 80) return "Strong Match";
    if (score >= 50) return "Good Match";
    return "Needs Improvement";
  };

  const getReadinessLabel = (score) => {
    if (score >= 80) return "Ready to apply";
    if (score >= 50) return "Almost ready";
    return "Needs improvement";
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
      .slice(0, 3)
      .map(([skill, count]) => ({ skill, count }));
  }, [filteredJobs]);

  const generateExplanation = (job) => {
    if (job.explanation) return job.explanation;

    const matched = Array.isArray(job.matched_skills) ? job.matched_skills : [];
    const missing = Array.isArray(job.missing_skills) ? job.missing_skills : [];

    if (matched.length === 0 && missing.length === 0) {
      return "This role has limited matching detail available.";
    }

    if (matched.length > 0 && missing.length === 0) {
      return `You already match the main visible skills for this role, including ${matched
        .slice(0, 3)
        .join(", ")}.`;
    }

    if (matched.length > 0) {
      return `You match ${matched.length} key skill${
        matched.length > 1 ? "s" : ""
      }, including ${matched.slice(0, 3).join(", ")}, but you still need ${missing.length} more.`;
    }

    return `This role highlights skills you may still need to build, such as ${missing
      .slice(0, 3)
      .join(", ")}.`;
  };

  if (loadingPage) {
    return <div style={{ padding: "40px" }}>Loading dashboard...</div>;
  }

  if (!currentUser) {
    return null;
  }

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
          <button className="nav-link" onClick={() => router.push("/profile")}>
            Profile
          </button>
          <button className="nav-link" onClick={handleLogout}>
            Sign Out
          </button>
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
            <button
              className="topnav-item"
              onClick={() => router.push("/profile")}
            >
              Applications
            </button>

            <div
              className="profile-nav-wrapper"
              onMouseEnter={() => setShowProfileMenu(true)}
              onMouseLeave={() => setShowProfileMenu(false)}
            >
              <button className="topnav-item">Profile</button>

              {showProfileMenu && (
                <div className="profile-dropdown">
                  <button onClick={() => router.push("/profile")}>
                    Go to Profile
                  </button>
                  <button onClick={handleLogout}>Sign Out</button>
                </div>
              )}
            </div>
          </nav>

          <div className="user">
            <div className="welcome">Welcome, {currentUser.name}</div>
            <div className="avatar" />
          </div>
        </header>

        <section className="hero-row">
          <div>
            <p className="eyebrow">AI-powered live job discovery</p>
            <h1 className="page-title">Stop searching for jobs. Let jobs find you.</h1>
            <p className="page-subtitle">
              Upload your CV, get personalised live job matches, understand why
              they fit, apply to real jobs, and track your application journey.
            </p>
          </div>
        </section>

        {showGuideBubble && (
          <div className="guide-bubble">
            <button
              className="guide-close"
              onClick={() => setShowGuideBubble(false)}
            >
              ×
            </button>
            <p className="guide-kicker">Quick guide</p>
            <h4>How to use Just Apply</h4>
            <ul className="guide-list">
              <li>Upload your CV</li>
              <li>Review live job matches</li>
              <li>Save or apply to jobs</li>
              <li>Track applications in your profile</li>
            </ul>
            <button
              className="btn-primary"
              onClick={() => router.push("/profile")}
            >
              Take me there
            </button>
          </div>
        )}

        {showProfilePrompt && (
          <div className="profile-prompt">
            <button
              className="guide-close"
              onClick={() => setShowProfilePrompt(false)}
            >
              ×
            </button>
            <p className="guide-kicker">New insight available</p>
            <h4>Your full profile is ready</h4>
            <p className="insight-text">
              View your saved jobs, uploaded CV history, applications, and
              personal analytics on your profile page.
            </p>
            <div className="prompt-actions">
              <button
                className="btn-primary"
                onClick={() => router.push("/profile")}
              >
                Take me there
              </button>
              <button
                className="btn-secondary-inline"
                onClick={() => setShowProfilePrompt(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}

        <section className="stats-row">
          <div className="stat-card">
            <div className="stat-icon">📨</div>
            <div className="stat-label">Jobs Applied</div>
            <div className="stat-value">{applications.length}</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">❤️</div>
            <div className="stat-label">Saved Jobs</div>
            <div className="stat-value">{savedJobs.length}</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📄</div>
            <div className="stat-label">CV Skills Found</div>
            <div className="stat-value">{skills.length}</div>
          </div>

          <div className="stat-card highlight">
            <div className="stat-icon">📈</div>
            <div className="stat-label">Average Match Rate</div>
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
                Upload &amp; Find Live Jobs
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

        {topMissingSkills.length > 0 && (
          <section className="insights-section">
            <div className="insights-card">
              <div className="section-head compact">
                <div>
                  <p className="section-kicker">Quick insight</p>
                  <h4>Improve your chances</h4>
                </div>
              </div>

              <p className="insight-text">
                Focus on these missing skills to increase your match quality:
              </p>

              <div className="chips">
                {topMissingSkills.map((item, i) => (
                  <span key={i} className="chip chip-blue">
                    {item.skill} ({item.count})
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
                  <p className="section-kicker">Live recommendations</p>
                  <h4>Recommended Jobs ({filteredJobs.length})</h4>
                </div>

                {jobStats && (
                  <div className="summary-pill">
                    {jobStats.source || "Adzuna"} •{" "}
                    {jobStats.jobs_with_matches || filteredJobs.length} matched
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
                {filteredJobs.map((job, idx) => {
                  const alreadyApplied = hasAppliedToJob(
                    job.external_job_id,
                    job.title || job.job_title
                  );

                  return (
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
                          {getMatchLabel(job.match_percentage || 0)} •{" "}
                          {job.match_percentage || 0}%
                        </div>
                      </div>

                      <div className="job-score-row">
                        {typeof job.total_score !== "undefined" && (
                          <div className="job-score">Score {job.total_score}</div>
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

                        <div className="job-score muted">
                          {getReadinessLabel(job.match_percentage || 0)}
                        </div>

                        <button
                          className="btn-primary"
                          onClick={() => saveJob(job)}
                          disabled={isJobSaved(job.job_id)}
                        >
                          {isJobSaved(job.job_id) ? "Saved" : "Save Job"}
                        </button>

                        <button
                          className="btn-primary btn-apply"
                          onClick={() => applyToJob(job)}
                          disabled={alreadyApplied}
                        >
                          {alreadyApplied ? "Applied" : "Apply Now"}
                        </button>
                      </div>

                      <div className="progress-track">
                        <div
                          className="progress-bar"
                          style={{ width: `${job.match_percentage || 0}%` }}
                        />
                      </div>

                      <div className="job-tags-block">
                        <div className="job-tags-title">Why this job matches</div>
                        <p className="insight-text">{generateExplanation(job)}</p>
                      </div>

                      {job.description && (
                        <div className="job-tags-block">
                          <div className="job-tags-title">Live job summary</div>
                          <p className="insight-text">{job.description}</p>
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
                            <div className="job-tags-title">
                              Skills to improve
                            </div>
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
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
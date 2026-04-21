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
  const [dbMode, setDbMode] = useState("unknown");
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

  const [activeTab, setActiveTab] = useState("home");
  const [openJobId, setOpenJobId] = useState(null);
  const [compactMode, setCompactMode] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

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
      if (data.db_mode) setDbMode(data.db_mode);
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
      if (data.db_mode) setDbMode(data.db_mode);
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
      if (data.db_mode) setDbMode(data.db_mode);
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
      setOpenJobId(null);
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
      if (data.db_mode) setDbMode(data.db_mode);
      setStatus("CV parsed. Searching live jobs in the US...");

      const liveRes = await fetch(`${API_BASE_URL}/api/live-jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          skills: data.skills || [],
          qualifications: data.qualifications || [],
          where: "",
          page: 1,
          results_per_page: 20,
        }),
      });

      const liveData = await liveRes.json();

      if (!liveRes.ok) {
        console.error("Live jobs error:", liveData);
        const backendError =
          liveData?.error ||
          liveData?.message ||
          `Live jobs failed with status ${liveRes.status}`;
        setStatus(backendError);
        return;
      }

      if (liveData.db_mode) setDbMode(liveData.db_mode);

      const returnedJobs = (liveData.jobs || []).map((job, index) => ({
        ...job,
        job_id:
          job.job_id ||
          job.external_job_id ||
          job.id ||
          `${job.title}-${index}`,
      }));

      setJobs(returnedJobs);
      setJobStats(liveData.metadata || null);
      setShowProfilePrompt(true);
      setActiveTab("home");
      setOpenJobId(returnedJobs[0]?.job_id || null);

      setStatus(
        `CV parsed successfully. Loaded ${returnedJobs.length} live US jobs from ${liveData.metadata?.source || "Adzuna"}.`
      );
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
      if (data.db_mode) setDbMode(data.db_mode);
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
      if (data.db_mode) setDbMode(data.db_mode);
      window.open(data.apply_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      alert("Could not connect to backend.");
    }
  };

  const isJobSaved = (jobId) => {
    return savedJobs.some((job) => String(job.job_id) === String(jobId));
  };

  const hasAppliedToJob = (externalJobId) => {
    if (!externalJobId) return false;

    return applications.some(
      (app) => String(app.external_job_id) === String(externalJobId)
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

  const getInterviewChance = (score) => {
    if (score >= 80) return { label: "High interview chance", className: "chance-high" };
    if (score >= 50) return { label: "Medium interview chance", className: "chance-medium" };
    return { label: "Low interview chance", className: "chance-low" };
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

  const homeJobs = useMemo(() => filteredJobs.slice(0, 3), [filteredJobs]);

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
      .map(([skill, count]) => ({ skill, count }));
  }, [filteredJobs]);

  const careerPath = useMemo(() => {
    const loweredSkills = skills.map((s) => s.toLowerCase());

    if (
      loweredSkills.some((s) =>
        ["python", "sql", "data analysis", "data analytics", "power bi"].includes(s)
      )
    ) {
      return {
        role: "Data Analyst",
        nextSteps: [
          "Improve SQL joins and reporting",
          "Build one dashboard portfolio project",
          "Target junior and graduate analyst roles",
        ],
      };
    }

    if (
      loweredSkills.some((s) =>
        ["react", "javascript", "typescript", "html", "css"].includes(s)
      )
    ) {
      return {
        role: "Frontend Developer",
        nextSteps: [
          "Strengthen React projects",
          "Improve responsive UI accessibility",
          "Target junior frontend roles",
        ],
      };
    }

    if (
      loweredSkills.some((s) =>
        ["aws", "azure", "docker", "cloud", "kubernetes"].includes(s)
      )
    ) {
      return {
        role: "Cloud Engineer",
        nextSteps: [
          "Build one cloud deployment project",
          "Improve DevOps tooling knowledge",
          "Target cloud support and cloud engineer roles",
        ],
      };
    }

    return {
      role: "Software Engineer",
      nextSteps: [
        "Build one full-stack portfolio project",
        "Improve backend + database confidence",
        "Apply to software engineer graduate roles",
      ],
    };
  }, [skills]);

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

  const renderCompactJobCard = (job, idx, allowExpand = true) => {
    const alreadyApplied = hasAppliedToJob(job.external_job_id);
    const expanded = openJobId === job.job_id;
    const chance = getInterviewChance(job.match_percentage || 0);

    return (
      <div className={`job-item ${compactMode ? "compact-job-item" : ""}`} key={idx}>
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

          <div className="job-top-right">
            <div className="match-badge">
              {getMatchLabel(job.match_percentage || 0)} •{" "}
              {job.match_percentage || 0}%
            </div>

            {allowExpand && (
              <button
                className="btn-secondary-inline"
                onClick={() =>
                  setOpenJobId(expanded ? null : job.job_id)
                }
              >
                {expanded ? "Hide" : "View"}
              </button>
            )}
          </div>
        </div>

        <div className="job-score-row">
          <div className="job-score">Score {job.total_score || 0}</div>
          <div className="job-score muted">Skills {job.skill_score || 0}</div>
          <div className="job-score muted">Qualifications {job.qual_score || 0}</div>
          <div className={`job-score ${chance.className}`}>{chance.label}</div>
          <div className="job-score muted">{getReadinessLabel(job.match_percentage || 0)}</div>
        </div>

        <div className="progress-track">
          <div
            className="progress-bar"
            style={{ width: `${job.match_percentage || 0}%` }}
          />
        </div>

        {(!allowExpand || expanded) && (
          <>
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

            <div className="match-breakdown">
              <div className="job-tags-title">Match breakdown</div>
              <div className="match-breakdown-grid">
                <div className="breakdown-col">
                  <p className="breakdown-heading">Matched</p>
                  {Array.isArray(job.matched_skills) && job.matched_skills.length > 0 ? (
                    job.matched_skills.slice(0, 4).map((skill, skillIdx) => (
                      <div key={`matched-${idx}-${skillIdx}`} className="breakdown-row positive">
                        ✔ {skill}
                      </div>
                    ))
                  ) : (
                    <div className="breakdown-row neutral">No strong skill match found</div>
                  )}
                </div>

                <div className="breakdown-col">
                  <p className="breakdown-heading">Improve</p>
                  {Array.isArray(job.missing_skills) && job.missing_skills.length > 0 ? (
                    job.missing_skills.slice(0, 4).map((skill, skillIdx) => (
                      <div key={`missing-${idx}-${skillIdx}`} className="breakdown-row negative">
                        ❌ {skill}
                      </div>
                    ))
                  ) : (
                    <div className="breakdown-row neutral">No major skill gaps shown</div>
                  )}
                </div>
              </div>
            </div>

            {Array.isArray(job.missing_qualifications) &&
              job.missing_qualifications.length > 0 && (
                <div className="job-tags-block">
                  <div className="job-tags-title">Missing qualifications</div>
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
          </>
        )}

        <div className="job-actions-footer">
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
      </div>
    );
  };

  if (loadingPage) {
    return <div style={{ padding: "40px" }}>Loading dashboard...</div>;
  }

  if (!currentUser) {
    return null;
  }

  return (
    <div className={`dashboard-root ${highContrast ? "high-contrast-mode" : ""}`}>
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

        {dbMode === "sqlite" && (
          <div className="db-mode-banner">
            Running in local SQLite fallback mode. Azure SQL is currently unavailable.
          </div>
        )}

        <section className="hero-row">
          <div>
            <p className="eyebrow">AI-powered live US job discovery</p>
            <h1 className="page-title">Stop searching for jobs. Let jobs find you.</h1>
            <p className="page-subtitle">
              Just Apply turns a CV into personalised job matches, clear fit explanations,
              skill-gap guidance, and application tracking in one place.
            </p>
          </div>
        </section>

        <section className="dashboard-control-strip">
          <div className="dashboard-tabs">
            <button
              className={`tab-btn ${activeTab === "home" ? "active" : ""}`}
              onClick={() => setActiveTab("home")}
            >
              Home
            </button>
            <button
              className={`tab-btn ${activeTab === "jobs" ? "active" : ""}`}
              onClick={() => setActiveTab("jobs")}
            >
              Jobs
            </button>
            <button
              className={`tab-btn ${activeTab === "insights" ? "active" : ""}`}
              onClick={() => setActiveTab("insights")}
            >
              Insights
            </button>
          </div>

          <div className="accessibility-controls">
            <button
              className={`toggle-btn ${compactMode ? "active" : ""}`}
              onClick={() => setCompactMode((prev) => !prev)}
            >
              {compactMode ? "Compact On" : "Compact Off"}
            </button>
            <button
              className={`toggle-btn ${highContrast ? "active" : ""}`}
              onClick={() => setHighContrast((prev) => !prev)}
            >
              {highContrast ? "High Contrast On" : "High Contrast Off"}
            </button>
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
            <h4>What Just Apply helps with</h4>
            <ul className="guide-list">
              <li>Upload your CV</li>
              <li>See live matched jobs</li>
              <li>Understand why jobs fit</li>
              <li>Improve missing skills</li>
              <li>Track your applications</li>
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

        {activeTab === "home" && (
          <>
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

            <section className="home-insight-grid">
              <div className="insights-card">
                <div className="section-head compact">
                  <div>
                    <p className="section-kicker">Career path</p>
                    <h4>Best next direction</h4>
                  </div>
                </div>

                <p className="career-role">Recommended path: {careerPath.role}</p>
                <ul className="guide-list">
                  {careerPath.nextSteps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              </div>

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
                  {topMissingSkills.length === 0 && (
                    <div className="chip-empty">No major skill gaps found yet</div>
                  )}
                  {topMissingSkills.map((item, i) => (
                    <span key={i} className="chip chip-blue">
                      {item.skill} ({item.count})
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {homeJobs.length > 0 && (
              <section className="jobs-section">
                <div className="jobs-card">
                  <div className="jobs-header">
                    <div>
                      <p className="section-kicker">Top matches</p>
                      <h4>Best Jobs Right Now ({homeJobs.length})</h4>
                    </div>

                    <button
                      className="btn-secondary-inline"
                      onClick={() => setActiveTab("jobs")}
                    >
                      View all jobs
                    </button>
                  </div>

                  <div className="jobs-list">
                    {homeJobs.map((job, idx) => renderCompactJobCard(job, idx, true))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === "jobs" && (
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
                    {jobStats.total_results_returned || filteredJobs.length} results
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
                {filteredJobs.map((job, idx) => renderCompactJobCard(job, idx, true))}
              </div>
            </div>
          </section>
        )}

        {activeTab === "insights" && (
          <section className="insights-panel-section">
            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">Why Just Apply helps</p>
                  <h4>Personalised Insights</h4>
                </div>
              </div>

              <div className="insights-layout">
                <div className="insights-card large">
                  <div className="section-head compact">
                    <div>
                      <p className="section-kicker">Career path</p>
                      <h4>Where you fit best</h4>
                    </div>
                  </div>
                  <p className="career-role">Recommended role: {careerPath.role}</p>
                  <ul className="guide-list">
                    {careerPath.nextSteps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </div>

                <div className="insights-card large">
                  <div className="section-head compact">
                    <div>
                      <p className="section-kicker">Skill gap analysis</p>
                      <h4>What to improve next</h4>
                    </div>
                  </div>

                  <div className="mini-bars">
                    {topMissingSkills.length === 0 && (
                      <p className="insight-text">No major skill gaps found yet.</p>
                    )}

                    {topMissingSkills.map((item, idx) => (
                      <div key={idx} className="mini-bar-row">
                        <div className="mini-bar-label">{item.skill}</div>
                        <div className="mini-bar-track">
                          <div
                            className="mini-bar-fill"
                            style={{ width: `${Math.min(item.count * 18, 100)}%` }}
                          />
                        </div>
                        <div className="mini-bar-value">{item.count}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="insights-card large">
                  <div className="section-head compact">
                    <div>
                      <p className="section-kicker">Extracted profile</p>
                      <h4>Your skills & qualifications</h4>
                    </div>
                  </div>

                  <p className="profile-tag-title">Skills</p>
                  <div className="chips">
                    {skills.length === 0 && <div className="chip-empty">No skills extracted</div>}
                    {skills.map((s, i) => (
                      <span key={i} className="chip chip-orange">{s}</span>
                    ))}
                  </div>

                  <p className="profile-tag-title">Qualifications</p>
                  <div className="chips">
                    {qualifications.length === 0 && <div className="chip-empty">No qualifications extracted</div>}
                    {qualifications.map((q, i) => (
                      <span key={i} className="chip chip-blue">{q}</span>
                    ))}
                  </div>
                </div>

                <div className="insights-card large">
                  <div className="section-head compact">
                    <div>
                      <p className="section-kicker">What makes this unique</p>
                      <h4>More than a job board</h4>
                    </div>
                  </div>
                  <ul className="guide-list">
                    <li>Explains why a role matches your CV</li>
                    <li>Shows missing skills to improve employability</li>
                    <li>Suggests the best career direction from your profile</li>
                    <li>Tracks your real job applications in one place</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
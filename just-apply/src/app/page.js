"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import justwork from "../images/justwork.png";
import AICoachWidget from "./components/AICoachWidget";

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

  const [careerTarget, setCareerTarget] = useState("");
  const [jobReadiness, setJobReadiness] = useState(null);
  const [cvTips, setCvTips] = useState([]);
  const [emailPreferences, setEmailPreferences] = useState({
    alerts_enabled: true,
    frequency: "daily",
    preferred_location: "",
    jobs_per_email: 5,
  });

  const [compareJobs, setCompareJobs] = useState([]);

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

  const [savingPreferences, setSavingPreferences] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/me`, {
        headers: { ...getAuthHeaders() },
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
        headers: { ...getAuthHeaders() },
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
        headers: { ...getAuthHeaders() },
      });

      if (!res.ok) return;

      const data = await res.json();
      setApplications(data.applications || []);
      if (data.db_mode) setDbMode(data.db_mode);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProfileData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile-data`, {
        headers: { ...getAuthHeaders() },
      });

      if (!res.ok) return;

      const data = await res.json();
      setCareerTarget(data.career_target || "");
      setJobReadiness(data.job_readiness || null);
      setCvTips(data.cv_tips || []);
      setEmailPreferences(
        data.email_preferences || {
          alerts_enabled: true,
          frequency: "daily",
          preferred_location: "",
          jobs_per_email: 5,
        }
      );
      if (data.db_mode) setDbMode(data.db_mode);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEmailPreferences = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/email-preferences`, {
        headers: { ...getAuthHeaders() },
      });

      if (!res.ok) return;

      const data = await res.json();
      setEmailPreferences(
        data.preferences || {
          alerts_enabled: true,
          frequency: "daily",
          preferred_location: "",
          jobs_per_email: 5,
        }
      );
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
        fetchProfileData(),
        fetchEmailPreferences(),
      ]);

      setLoadingPage(false);
    };

    init();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/logout`, { method: "POST" });
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
      setCompareJobs([]);
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
        headers: { ...getAuthHeaders() },
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
          where: emailPreferences.preferred_location || "",
          page: 1,
          results_per_page: 20,
          career_target: careerTarget || "",
        }),
      });

      const liveData = await liveRes.json();

      if (!liveRes.ok) {
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

      await fetchProfileData();

      setStatus(
        `CV parsed successfully. Loaded ${returnedJobs.length} live jobs from ${liveData.metadata?.source || "Adzuna"}.`
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
      await fetchProfileData();
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
      await fetchProfileData();
      window.open(data.apply_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      alert("Could not connect to backend.");
    }
  };

  const updateCareerTarget = async (targetRole) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/career-target`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ target_role: targetRole }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Could not update career target.");
        return;
      }

      setCareerTarget(data.career_target || "");
      if (data.db_mode) setDbMode(data.db_mode);
      await fetchProfileData();
    } catch (err) {
      console.error(err);
    }
  };

  const saveEmailPreferences = async () => {
    try {
      setSavingPreferences(true);

      const res = await fetch(`${API_BASE_URL}/api/email-preferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          alerts_enabled: emailPreferences.alerts_enabled,
          frequency: emailPreferences.frequency,
          preferred_location: emailPreferences.preferred_location,
          jobs_per_email: Number(emailPreferences.jobs_per_email),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Could not save email preferences.");
        return;
      }

      setEmailPreferences(data.preferences || emailPreferences);
      if (data.db_mode) setDbMode(data.db_mode);
      alert("Email preferences updated.");
    } catch (err) {
      console.error(err);
      alert("Could not connect to backend.");
    } finally {
      setSavingPreferences(false);
    }
  };

  const sendTestJobAlert = async () => {
    try {
      setSendingTestEmail(true);

      const res = await fetch(`${API_BASE_URL}/api/test-send-job-alert`, {
        method: "POST",
        headers: { ...getAuthHeaders() },
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Could not send job alert email.");
        return;
      }

      if (data.db_mode) setDbMode(data.db_mode);
      const result = data.result || {};
      if (result.sent) {
        alert(`Test email sent successfully with ${result.jobs_sent || 0} job(s).`);
      } else {
        alert(`Email not sent: ${result.reason || "No new jobs found."}`);
      }
    } catch (err) {
      console.error(err);
      alert("Could not connect to backend.");
    } finally {
      setSendingTestEmail(false);
    }
  };

  const toggleCompareJob = (job) => {
    setCompareJobs((prev) => {
      const exists = prev.some((j) => String(j.job_id) === String(job.job_id));
      if (exists) {
        return prev.filter((j) => String(j.job_id) !== String(job.job_id));
      }
      if (prev.length >= 2) {
        return [prev[1], job];
      }
      return [...prev, job];
    });
  };

  const isJobSaved = (jobId) =>
    savedJobs.some((job) => String(job.job_id) === String(jobId));

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
        return (a.title || "").localeCompare(b.title || "");
      }

      return 0;
    });

    return result;
  }, [jobs, sortBy, industryFilter, locationFilter]);

  const homeJobs = useMemo(() => filteredJobs.slice(0, 3), [filteredJobs]);

  const averageMatchRate =
    filteredJobs.length > 0
      ? Math.round(
          filteredJobs.reduce((sum, job) => sum + (job.match_percentage || 0), 0) /
            filteredJobs.length
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

  const generatedCareerPath = useMemo(() => {
    if (careerTarget) return careerTarget;

    const loweredSkills = skills.map((s) => s.toLowerCase());

    if (
      loweredSkills.some((s) =>
        ["python", "sql", "data analysis", "data analytics", "power bi"].includes(s)
      )
    ) {
      return "Data Analyst";
    }

    if (
      loweredSkills.some((s) =>
        ["react", "javascript", "typescript", "html", "css"].includes(s)
      )
    ) {
      return "Frontend Developer";
    }

    if (
      loweredSkills.some((s) =>
        ["aws", "azure", "docker", "cloud", "kubernetes"].includes(s)
      )
    ) {
      return "Cloud Engineer";
    }

    return "Software Engineer";
  }, [skills, careerTarget]);

  const generateExplanation = (job) => {
    if (job.explanation) return job.explanation;

    const matched = Array.isArray(job.matched_skills) ? job.matched_skills : [];
    const missing = Array.isArray(job.missing_skills) ? job.missing_skills : [];

    if (matched.length > 0 && missing.length === 0) {
      return `You already match the main visible skills for this role, including ${matched
        .slice(0, 3)
        .join(", ")}.`;
    }

    if (matched.length > 0) {
      return `You match ${matched.length} key skills, including ${matched
        .slice(0, 3)
        .join(", ")}, but still need improvement in a few areas.`;
    }

    return "This job was surfaced because it is related to your broader career direction.";
  };

  const renderJobCard = (job, idx, allowExpand = true) => {
    const alreadyApplied = hasAppliedToJob(job.external_job_id);
    const expanded = openJobId === job.job_id;
    const chance = getInterviewChance(job.match_percentage || 0);
    const isCompared = compareJobs.some((j) => String(j.job_id) === String(job.job_id));

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
              {getMatchLabel(job.match_percentage || 0)} • {job.match_percentage || 0}%
            </div>

            <button
              className={`btn-secondary-inline ${isCompared ? "selected-compare" : ""}`}
              onClick={() => toggleCompareJob(job)}
            >
              {isCompared ? "Selected" : "Compare"}
            </button>

            {allowExpand && (
              <button
                className="btn-secondary-inline"
                onClick={() => setOpenJobId(expanded ? null : job.job_id)}
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

  if (loadingPage) return <div style={{ padding: "40px" }}>Loading dashboard...</div>;
  if (!currentUser) return null;

  return (
    <div className={`dashboard-root ${highContrast ? "high-contrast-mode" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="icon-btn" title="Notifications">🔔</button>
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
            <Image src={justwork} alt="Just Apply logo" width={22} height={22} className="brand-logo" />
            <div className="brand-name">Just Apply</div>
          </div>

          <nav className="topnav">
            <button className="topnav-item active">Dashboard</button>
            <button className="topnav-item" onClick={() => router.push("/profile")}>
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
                  <button onClick={() => router.push("/profile")}>Go to Profile</button>
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
            <p className="eyebrow">AI-powered live job discovery</p>
            <h1 className="page-title">Stop searching for jobs. Let jobs find you.</h1>
            <p className="page-subtitle">
              Just Apply turns a CV into personalised job matches, clear fit explanations,
              skill-gap guidance, application tracking, and automated email alerts.
            </p>
          </div>
        </section>

        <section className="dashboard-control-strip">
          <div className="dashboard-tabs">
            <button className={`tab-btn ${activeTab === "home" ? "active" : ""}`} onClick={() => setActiveTab("home")}>Home</button>
            <button className={`tab-btn ${activeTab === "jobs" ? "active" : ""}`} onClick={() => setActiveTab("jobs")}>Jobs</button>
            <button className={`tab-btn ${activeTab === "insights" ? "active" : ""}`} onClick={() => setActiveTab("insights")}>Insights</button>
          </div>

          <div className="accessibility-controls">
            <button className={`toggle-btn ${compactMode ? "active" : ""}`} onClick={() => setCompactMode((prev) => !prev)}>
              {compactMode ? "Compact On" : "Compact Off"}
            </button>
            <button className={`toggle-btn ${highContrast ? "active" : ""}`} onClick={() => setHighContrast((prev) => !prev)}>
              {highContrast ? "High Contrast On" : "High Contrast Off"}
            </button>
          </div>
        </section>

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
                  <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFileChange} />
                  <div className="drop-inner">
                    <div className="cloud">☁️</div>
                    <div className="drop-text">Drag and drop CV here or click to browse</div>
                    <div className="drop-sub">Supported formats: PDF, DOCX, TXT</div>
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
                    <a href={azureBlobUrl} target="_blank" rel="noopener noreferrer">
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
                      <span key={`s-${i}`} className="chip chip-orange">{s}</span>
                    ))}

                    {qualifications.map((q, i) => (
                      <span key={`q-${i}`} className="chip chip-blue">{q}</span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="home-insight-grid">
              <div className="insights-card">
                <div className="section-head compact">
                  <div>
                    <p className="section-kicker">Job readiness</p>
                    <h4>Your readiness score</h4>
                  </div>
                </div>

                {jobReadiness ? (
                  <>
                    <div className="readiness-score-circle">{jobReadiness.score}</div>
                    <p className="career-role">{jobReadiness.label} readiness</p>
                    <p className="insight-text">{jobReadiness.summary}</p>
                    <ul className="guide-list">
                      {(jobReadiness.reasons || []).map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="insight-text">Upload a CV to generate readiness insights.</p>
                )}
              </div>

              <div className="insights-card">
                <div className="section-head compact">
                  <div>
                    <p className="section-kicker">Career target</p>
                    <h4>Select your target role</h4>
                  </div>
                </div>

                <select
                  className="career-target-select"
                  value={careerTarget || generatedCareerPath}
                  onChange={(e) => updateCareerTarget(e.target.value)}
                >
                  <option>Data Analyst</option>
                  <option>Frontend Developer</option>
                  <option>Cloud Engineer</option>
                  <option>Software Engineer</option>
                  <option>Full Stack Developer</option>
                  <option>UI/UX Designer</option>
                </select>

                <p className="insight-text">
                  This helps shape the roles and skill direction you should focus on.
                </p>
              </div>

              <div className="insights-card">
                <div className="section-head compact">
                  <div>
                    <p className="section-kicker">CV improvement</p>
                    <h4>Tips to strengthen your CV</h4>
                  </div>
                </div>

                <ul className="guide-list">
                  {cvTips.length === 0 ? (
                    <li>Upload a CV to receive improvement suggestions.</li>
                  ) : (
                    cvTips.map((tip, idx) => <li key={idx}>{tip}</li>)
                  )}
                </ul>
              </div>

              <div className="insights-card">
                <div className="section-head compact">
                  <div>
                    <p className="section-kicker">Skill gap</p>
                    <h4>What to improve next</h4>
                  </div>
                </div>

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

            <section className="jobs-section">
              <div className="jobs-card">
                <div className="jobs-header">
                  <div>
                    <p className="section-kicker">Automatic alerts</p>
                    <h4>Email Job Alert Settings</h4>
                  </div>
                </div>

                <div className="filter-controls">
                  <div className="filter-group">
                    <label>Alerts Enabled</label>
                    <select
                      value={emailPreferences.alerts_enabled ? "yes" : "no"}
                      onChange={(e) =>
                        setEmailPreferences((prev) => ({
                          ...prev,
                          alerts_enabled: e.target.value === "yes",
                        }))
                      }
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>Frequency</label>
                    <select
                      value={emailPreferences.frequency || "daily"}
                      onChange={(e) =>
                        setEmailPreferences((prev) => ({
                          ...prev,
                          frequency: e.target.value,
                        }))
                      }
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>Jobs Per Email</label>
                    <select
                      value={emailPreferences.jobs_per_email || 5}
                      onChange={(e) =>
                        setEmailPreferences((prev) => ({
                          ...prev,
                          jobs_per_email: Number(e.target.value),
                        }))
                      }
                    >
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                      <option value={7}>7</option>
                      <option value={10}>10</option>
                    </select>
                  </div>

                  <div className="filter-group filter-wide">
                    <label>Preferred Location</label>
                    <input
                      className="career-target-select"
                      type="text"
                      value={emailPreferences.preferred_location || ""}
                      onChange={(e) =>
                        setEmailPreferences((prev) => ({
                          ...prev,
                          preferred_location: e.target.value,
                        }))
                      }
                      placeholder="e.g. New York, Remote, California"
                    />
                  </div>
                </div>

                <div className="job-actions-footer">
                  <button className="btn-primary" onClick={saveEmailPreferences} disabled={savingPreferences}>
                    {savingPreferences ? "Saving..." : "Save Email Preferences"}
                  </button>

                  <button className="btn-primary btn-apply" onClick={sendTestJobAlert} disabled={sendingTestEmail}>
                    {sendingTestEmail ? "Sending..." : "Send Test Job Alert"}
                  </button>
                </div>

                <p className="insight-text" style={{ marginTop: "12px" }}>
                  Your system can now email live job opportunities automatically based on your CV, career target, and activity.
                </p>
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

                    <button className="btn-secondary-inline" onClick={() => setActiveTab("jobs")}>
                      View all jobs
                    </button>
                  </div>

                  <div className="jobs-list">
                    {homeJobs.map((job, idx) => renderJobCard(job, idx, true))}
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
                    {jobStats.source || "Adzuna"} • {jobStats.total_results_returned || filteredJobs.length} results
                  </div>
                )}
              </div>

              <div className="filter-controls">
                <div className="filter-group">
                  <label>Sort by</label>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="match_percentage">Match Percentage</option>
                    <option value="total_score">Total Score</option>
                    <option value="job_title">Job Title</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label>Industry</label>
                  <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}>
                    {industries.map((industry) => (
                      <option key={industry} value={industry}>{industry}</option>
                    ))}
                  </select>
                </div>

                <div className="filter-group filter-wide">
                  <label>Location</label>
                  <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
                    {locations.map((location) => (
                      <option key={location} value={location}>{location}</option>
                    ))}
                  </select>
                </div>
              </div>

              {compareJobs.length === 2 && (
                <div className="compare-panel">
                  <div className="jobs-header">
                    <div>
                      <p className="section-kicker">Job comparison</p>
                      <h4>Compare 2 jobs side by side</h4>
                    </div>
                  </div>

                  <div className="compare-grid">
                    {compareJobs.map((job, idx) => (
                      <div className="compare-card" key={idx}>
                        <h4>{job.title}</h4>
                        <p className="insight-text">{job.company} • {job.location}</p>
                        <div className="compare-stat">Match: {job.match_percentage || 0}%</div>
                        <div className="compare-stat">Score: {job.total_score || 0}</div>
                        <div className="compare-stat">Skills matched: {job.skill_score || 0}</div>
                        <div className="compare-stat">Qualifications: {job.qual_score || 0}</div>

                        <div className="job-tags-block">
                          <div className="job-tags-title">Matched skills</div>
                          <div className="chips">
                            {(job.matched_skills || []).slice(0, 5).map((skill, skillIdx) => (
                              <span key={skillIdx} className="chip chip-orange">{skill}</span>
                            ))}
                          </div>
                        </div>

                        <div className="job-tags-block">
                          <div className="job-tags-title">Missing skills</div>
                          <div className="chips">
                            {(job.missing_skills || []).slice(0, 5).map((skill, skillIdx) => (
                              <span key={skillIdx} className="chip chip-blue">{skill}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="jobs-list">
                {filteredJobs.map((job, idx) => renderJobCard(job, idx, true))}
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
                  <p className="career-role">Recommended role: {careerTarget || generatedCareerPath}</p>
                  <p className="insight-text">
                    Your selected or inferred direction helps make recommendations more meaningful.
                  </p>
                </div>

                <div className="insights-card large">
                  <div className="section-head compact">
                    <div>
                      <p className="section-kicker">CV improvement</p>
                      <h4>Practical next steps</h4>
                    </div>
                  </div>
                  <ul className="guide-list">
                    {cvTips.length === 0 ? (
                      <li>No CV tips yet. Upload a CV to generate them.</li>
                    ) : (
                      cvTips.map((tip, idx) => <li key={idx}>{tip}</li>)
                    )}
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
                      <p className="section-kicker">Job readiness</p>
                      <h4>How employable your profile looks</h4>
                    </div>
                  </div>

                  {jobReadiness ? (
                    <>
                      <div className="readiness-score-circle small">{jobReadiness.score}</div>
                      <p className="career-role">{jobReadiness.label} readiness</p>
                      <p className="insight-text">{jobReadiness.summary}</p>
                    </>
                  ) : (
                    <p className="insight-text">Upload a CV to generate readiness analysis.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
          
        )}
        <AICoachWidget
          skills={skills}
          qualifications={qualifications}
          cvPreview={preview}
          selectedJob={
            openJobId
              ? jobs.find((job) => String(job.job_id) === String(openJobId))
              : null
          }
        />
      </main>
    </div>
  );
}
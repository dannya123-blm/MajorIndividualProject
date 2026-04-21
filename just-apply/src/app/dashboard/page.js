"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import justwork from "../images/justwork.png";

const API_BASE_URL = "http://192.168.1.139:5000";

const getAuthHeaders = () => {
  const token = localStorage.getItem("access_token");
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
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
  const [sortBy, setSortBy] = useState("match_percentage");
  const [industryFilter, setIndustryFilter] = useState("All");
  const [locationFilter, setLocationFilter] = useState("All");

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/me`, {
        headers: {
          ...getAuthHeaders(),
        },
      });

      if (!res.ok) {
        router.push("/login");
        return;
      }

      const data = await res.json();
      setCurrentUser(data.user);
    } catch (err) {
      console.error(err);
      router.push("/login");
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

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }

    fetchCurrentUser();
    fetchSavedJobs();
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

      const matchRes = await fetch(`${API_BASE_URL}/api/match-jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

  const removeSavedJob = async (jobId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/remove-saved-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
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
      .slice(0, 5)
      .map(([skill, count]) => ({ skill, count }));
  }, [filteredJobs]);

  const bestRole = filteredJobs[0]?.title || filteredJobs[0]?.job_title || "N/A";
  const bestIndustry =
    filteredJobs[0]?.industry ||
    (filteredJobs.find((job) => job.industry)?.industry ?? "Not enough data");

  const profileStrength =
    skills.length >= 6
      ? "Your CV shows a strong technical profile."
      : skills.length >= 3
      ? "Your CV shows a developing technical profile."
      : "Your CV currently shows a limited technical profile.";

  const profileNextStep =
    topMissingSkills.length > 0
      ? `Focus next on ${topMissingSkills
          .slice(0, 3)
          .map((item) => item.skill)
          .join(", ")}.`
      : "Upload a CV to receive improvement suggestions.";

  const generateExplanation = (job) => {
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
          <button className="nav-link">Saved Jobs</button>
          <button className="nav-link">Profile</button>
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
            <button className="topnav-item">Saved Jobs</button>
            <button className="topnav-item">Profile</button>
            <button className="topnav-item" onClick={handleLogout}>
              Sign Out
            </button>
          </nav>

          <div className="user">
            <div className="welcome">Welcome, {currentUser.name}</div>
            <div className="avatar" />
          </div>
        </header>

        <section className="hero-row">
          <div>
            <p className="eyebrow">AI-powered job discovery</p>
            <h1 className="page-title">Stop searching for jobs. Let jobs find you.</h1>
            <p className="page-subtitle">
              Just Apply helps people who struggle to find the right jobs by
              turning a CV into personalised job matches, clear explanations,
              and skill-improvement guidance.
            </p>

            <div className="chips" style={{ marginTop: "16px" }}>
              <span className="chip chip-orange">Upload CV</span>
              <span className="chip chip-orange">Get Matched Jobs</span>
              <span className="chip chip-blue">See Skill Gaps</span>
              <span className="chip chip-blue">Improve Employability</span>
            </div>
          </div>
        </section>

        <section className="stats-row">
          <div className="stat-card">
            <div className="stat-icon">📄</div>
            <div className="stat-label">Step 1</div>
            <div className="stat-value">Upload CV</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🧠</div>
            <div className="stat-label">Step 2</div>
            <div className="stat-value">Extract Skills</div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🎯</div>
            <div className="stat-label">Step 3</div>
            <div className="stat-value">Match Jobs</div>
          </div>

          <div className="stat-card highlight">
            <div className="stat-icon">🚀</div>
            <div className="stat-label">Step 4</div>
            <div className="stat-value">Improve & Apply</div>
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

        {(skills.length > 0 || qualifications.length > 0) && (
          <section className="insights-section">
            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">Your profile</p>
                  <h4>Profile Summary</h4>
                </div>
              </div>

              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-label">Skills detected</div>
                  <div className="stat-value">{skills.length}</div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">Qualifications detected</div>
                  <div className="stat-value">{qualifications.length}</div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">Best-fit role</div>
                  <div className="stat-value" style={{ fontSize: "20px" }}>
                    {bestRole}
                  </div>
                </div>

                <div className="stat-card highlight">
                  <div className="stat-label">Best-fit industry</div>
                  <div className="stat-value" style={{ fontSize: "20px" }}>
                    {bestIndustry}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "16px" }}>
                <p className="insight-text">{profileStrength}</p>
                <p className="insight-text">
                  <strong>Recommended next step:</strong> {profileNextStep}
                </p>
              </div>
            </div>
          </section>
        )}

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
                  <h4>What You Should Learn Next</h4>
                </div>
              </div>

              <p className="insight-text">
                To improve your chances of getting hired, focus on these skills:
              </p>

              <div className="chips">
                {topMissingSkills.map((item, i) => (
                  <span key={i} className="chip chip-blue">
                    {item.skill} ({item.count})
                  </span>
                ))}
              </div>

              <p className="insight-text" style={{ marginTop: "12px" }}>
                Learning these could improve your job match rate significantly.
              </p>
            </div>
          </section>
        )}

        {jobs.length === 0 && (skills.length > 0 || qualifications.length > 0) && (
          <section className="insights-section">
            <div className="insights-card">
              <div className="section-head compact">
                <div>
                  <p className="section-kicker">Guidance</p>
                  <h4>No strong matches found yet</h4>
                </div>
              </div>

              <p className="insight-text">
                Your CV may be missing some key industry skills. Build stronger
                skills in areas like Python, SQL, cloud tools, and data analysis
                to improve your employability.
              </p>
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
                        {getMatchLabel(job.match_percentage || 0)} •{" "}
                        {job.match_percentage || 0}%
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
                    </div>

                    <div className="progress-track">
                      <div
                        className="progress-bar"
                        style={{ width: `${job.match_percentage || 0}%` }}
                      />
                    </div>

                    <div className="job-tags-block">
                      <div className="job-tags-title">Why this job matches</div>
                      <p className="insight-text" style={{ marginBottom: 0 }}>
                        {generateExplanation(job)}
                      </p>
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
                          <div className="job-tags-title">
                            Skills to improve before applying
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
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
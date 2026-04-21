"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import justwork from "../../images/justwork.png";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:5000";

const getAuthHeaders = () => {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function ProfilePage() {
  const router = useRouter();

  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [updatingAppId, setUpdatingAppId] = useState(null);
  const [savingNotesId, setSavingNotesId] = useState(null);
  const [notesMap, setNotesMap] = useState({});

  const fetchProfileData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile-data`, {
        headers: { ...getAuthHeaders() },
      });

      if (!res.ok) {
        localStorage.removeItem("access_token");
        router.push("/login");
        return;
      }

      const data = await res.json();
      setProfileData(data);

      const initialNotes = {};
      (data.applications || []).forEach((app) => {
        initialNotes[app.id] = app.notes || "";
      });
      setNotesMap(initialNotes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetchProfileData();
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

  const updateApplicationStatus = async (applicationId, status) => {
    try {
      setUpdatingAppId(applicationId);

      const res = await fetch(`${API_BASE_URL}/api/update-application-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          application_id: applicationId,
          status,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Could not update application status.");
        return;
      }

      fetchProfileData();
    } catch (err) {
      console.error(err);
      alert("Could not connect to backend.");
    } finally {
      setUpdatingAppId(null);
    }
  };

  const saveApplicationNotes = async (applicationId) => {
    try {
      setSavingNotesId(applicationId);

      const res = await fetch(`${API_BASE_URL}/api/update-application-notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          application_id: applicationId,
          notes: notesMap[applicationId] || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Could not update notes.");
        return;
      }

      fetchProfileData();
    } catch (err) {
      console.error(err);
      alert("Could not connect to backend.");
    } finally {
      setSavingNotesId(null);
    }
  };

  if (loading) return <div style={{ padding: "40px" }}>Loading profile...</div>;
  if (!profileData) return null;

  const savedJobs = profileData?.saved_jobs || [];
  const uploadedCvs = profileData?.uploaded_cvs || [];
  const extractedSkills = profileData?.all_extracted_skills || [];
  const extractedQualifications = profileData?.all_extracted_qualifications || [];
  const applications = profileData?.applications || [];
  const analytics = profileData?.analytics || {};
  const dbMode = profileData?.db_mode || "unknown";
  const cvTips = profileData?.cv_tips || [];
  const jobReadiness = profileData?.job_readiness || null;
  const careerTarget = profileData?.career_target || "";

  const strongMatches = analytics.strong_matches || 0;
  const goodMatches = analytics.good_matches || 0;
  const weakMatches = analytics.weak_matches || 0;
  const totalMatchSegments = Math.max(strongMatches + goodMatches + weakMatches, 1);

  const donutStyle = {
    background: `conic-gradient(
      #ff6200 0deg ${Math.round((strongMatches / totalMatchSegments) * 360)}deg,
      #ffb27f ${Math.round((strongMatches / totalMatchSegments) * 360)}deg ${Math.round(((strongMatches + goodMatches) / totalMatchSegments) * 360)}deg,
      #e7ded6 ${Math.round(((strongMatches + goodMatches) / totalMatchSegments) * 360)}deg 360deg
    )`,
  };

  const bestRole = analytics.best_fit_role || "No role yet";
  const bestIndustry = analytics.best_fit_industry || "No industry yet";
  const topMissingSkills = analytics.top_missing_skills || [];
  const roleBreakdown = analytics.role_breakdown || [];
  const applicationStatusBreakdown = analytics.application_status_breakdown || [];

  return (
    <div className="dashboard-root">
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="icon-btn" title="Notifications">🔔</button>
        </div>

        <nav className="sidebar-nav">
          <button className="nav-link" onClick={() => router.push("/")}>Dashboard</button>
          <button className="nav-link active">Profile</button>
          <button className="nav-link" onClick={handleLogout}>Sign Out</button>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="brand">
            <Image src={justwork} alt="Just Apply logo" width={22} height={22} className="brand-logo" />
            <div className="brand-name">Just Apply</div>
          </div>

          <nav className="topnav">
            <button className="topnav-item" onClick={() => router.push("/")}>Dashboard</button>
            <button className="topnav-item active">Profile</button>

            <div
              className="profile-nav-wrapper"
              onMouseEnter={() => setShowProfileMenu(true)}
              onMouseLeave={() => setShowProfileMenu(false)}
            >
              <button className="topnav-item">Account</button>
              {showProfileMenu && (
                <div className="profile-dropdown">
                  <button onClick={() => router.push("/")}>Go to Dashboard</button>
                  <button onClick={handleLogout}>Sign Out</button>
                </div>
              )}
            </div>
          </nav>

          <div className="user">
            <div className="welcome">Hello, {profileData.user?.name}</div>
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
            <p className="eyebrow">Your personal hub</p>
            <h1 className="page-title">Profile & Career Insights</h1>
            <p className="page-subtitle">
              View your saved jobs, uploaded CV history, extracted skills,
              applications, and analytics that explain where you fit best in the live job market.
            </p>
          </div>
        </section>

        <section className="profile-grid">
          <div className="profile-user-card">
            <div className="profile-user-icon">💼</div>
            <h2>Hello, {profileData.user?.name}!</h2>

            <div className="profile-user-box">
              <p className="profile-user-label">Email</p>
              <div className="profile-user-value">{profileData.user?.email || "No email"}</div>
            </div>

            <div className="profile-user-box">
              <p className="profile-user-label">Best-fit role</p>
              <div className="profile-user-value">{bestRole}</div>
            </div>

            <div className="profile-user-box">
              <p className="profile-user-label">Career target</p>
              <div className="profile-user-value">{careerTarget || "Not selected"}</div>
            </div>

            <div className="profile-user-box">
              <p className="profile-user-label">Best-fit industry</p>
              <div className="profile-user-value">{bestIndustry}</div>
            </div>
          </div>

          <div className="profile-main-column">
            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">Your summary</p>
                  <h4>Profile Summary</h4>
                </div>
              </div>

              <div className="stats-row">
                <div className="stat-card">
                  <div className="stat-label">Saved jobs</div>
                  <div className="stat-value">{savedJobs.length}</div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">Uploaded CVs</div>
                  <div className="stat-value">{uploadedCvs.length}</div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">Skills found</div>
                  <div className="stat-value">{extractedSkills.length}</div>
                </div>

                <div className="stat-card highlight">
                  <div className="stat-label">Average match rate</div>
                  <div className="stat-value">{analytics.average_match_rate || 0}%</div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">Applications</div>
                  <div className="stat-value">{analytics.applications_count || 0}</div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">Interviewing</div>
                  <div className="stat-value">{analytics.interviewing_count || 0}</div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">Offers</div>
                  <div className="stat-value">{analytics.offer_count || 0}</div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">Rejected</div>
                  <div className="stat-value">{analytics.rejected_count || 0}</div>
                </div>
              </div>
            </div>

            <div className="profile-analytics-grid">
              <div className="jobs-card">
                <div className="jobs-header">
                  <div>
                    <p className="section-kicker">Analytics</p>
                    <h4>Match Readiness</h4>
                  </div>
                </div>

                <div className="donut-wrap">
                  <div className="donut-chart" style={donutStyle}>
                    <div className="donut-inner">
                      {analytics.average_match_rate || 0}%
                    </div>
                  </div>

                  <div className="donut-legend">
                    <div><span className="legend-dot strong"></span> Strong</div>
                    <div><span className="legend-dot good"></span> Good</div>
                    <div><span className="legend-dot weak"></span> Needs work</div>
                  </div>
                </div>
              </div>

              <div className="jobs-card">
                <div className="jobs-header">
                  <div>
                    <p className="section-kicker">Job readiness</p>
                    <h4>Readiness Score</h4>
                  </div>
                </div>

                {jobReadiness ? (
                  <>
                    <div className="readiness-score-circle small">{jobReadiness.score}</div>
                    <p className="career-role">{jobReadiness.label} readiness</p>
                    <p className="insight-text">{jobReadiness.summary}</p>
                  </>
                ) : (
                  <p className="insight-text">No readiness score yet.</p>
                )}
              </div>
            </div>

            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">CV improvement</p>
                  <h4>Tips to strengthen your profile</h4>
                </div>
              </div>

              <ul className="guide-list">
                {cvTips.length === 0 ? (
                  <li>No CV tips yet.</li>
                ) : (
                  cvTips.map((tip, idx) => <li key={idx}>{tip}</li>)
                )}
              </ul>
            </div>

            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">Career pipeline</p>
                  <h4>Application Journey</h4>
                </div>
              </div>

              <div className="mini-bars">
                {applicationStatusBreakdown.length === 0 && (
                  <p className="insight-text">No application status data yet.</p>
                )}

                {applicationStatusBreakdown.map((item, idx) => (
                  <div key={idx} className="mini-bar-row">
                    <div className="mini-bar-label">{item.name}</div>
                    <div className="mini-bar-track">
                      <div
                        className="mini-bar-fill alt"
                        style={{ width: `${Math.min(item.count * 20, 100)}%` }}
                      />
                    </div>
                    <div className="mini-bar-value">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">Uploaded history</p>
                  <h4>All CVs</h4>
                </div>
              </div>

              <div className="cv-history-list">
                {uploadedCvs.length === 0 && <p className="insight-text">No uploaded CVs yet.</p>}

                {uploadedCvs.map((cv, idx) => (
                  <div className="cv-history-item" key={idx}>
                    <div>
                      <div className="cv-file-name">{cv.original_name || "Untitled CV"}</div>
                      <div className="cv-file-date">{cv.uploaded_at || "Recently uploaded"}</div>
                    </div>

                    {cv.azure_blob_url ? (
                      <a className="btn-primary cv-btn" href={cv.azure_blob_url} target="_blank" rel="noopener noreferrer">
                        View CV
                      </a>
                    ) : (
                      <button className="btn-primary cv-btn" disabled>No File URL</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">Tracked applications</p>
                  <h4>Applied Jobs</h4>
                </div>
              </div>

              <div className="jobs-list">
                {applications.length === 0 && (
                  <p className="insight-text">No applications yet.</p>
                )}

                {applications.map((application, idx) => (
                  <div className="job-item" key={idx}>
                    <div className="job-top">
                      <div>
                        <div className="job-title">{application.title || "Untitled role"}</div>

                        <div className="job-meta">
                          {application.company && <span>{application.company}</span>}
                          {application.location && <span> • {application.location}</span>}
                          {application.source_name && <span> • {application.source_name}</span>}
                        </div>
                      </div>

                      <div className="match-badge application-badge">
                        {application.status}
                      </div>
                    </div>

                    <div className="job-score-row">
                      <div className="job-score muted">
                        Applied: {application.applied_at || "Recently"}
                      </div>

                      <select
                        className="application-status-select"
                        value={application.status}
                        disabled={updatingAppId === application.id}
                        onChange={(e) => updateApplicationStatus(application.id, e.target.value)}
                      >
                        <option value="Applied">Applied</option>
                        <option value="Interviewing">Interviewing</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Offer">Offer</option>
                      </select>

                      {application.apply_url && (
                        <a
                          href={application.apply_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary cv-btn"
                        >
                          Open Job
                        </a>
                      )}
                    </div>

                    <div className="application-notes-block">
                      <label className="notes-label">Application notes</label>
                      <textarea
                        className="application-notes-textarea"
                        value={notesMap[application.id] || ""}
                        onChange={(e) =>
                          setNotesMap((prev) => ({
                            ...prev,
                            [application.id]: e.target.value,
                          }))
                        }
                        placeholder="Add follow-up notes, interview details, recruiter feedback..."
                      />
                      <button
                        className="btn-secondary-inline"
                        onClick={() => saveApplicationNotes(application.id)}
                        disabled={savingNotesId === application.id}
                      >
                        {savingNotesId === application.id ? "Saving..." : "Save Notes"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">Bookmarks</p>
                  <h4>Saved Jobs</h4>
                </div>
              </div>

              <div className="jobs-list">
                {savedJobs.length === 0 && (
                  <p className="insight-text">No saved jobs yet.</p>
                )}

                {savedJobs.map((job, idx) => (
                  <div className="job-item" key={idx}>
                    <div className="job-top">
                      <div>
                        <div className="job-title">{job.title || job.job_title || "Untitled role"}</div>
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
                  </div>
                ))}
              </div>
            </div>

            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">Role trends</p>
                  <h4>Recommended Role Breakdown</h4>
                </div>
              </div>

              <div className="mini-bars">
                {roleBreakdown.length === 0 && (
                  <p className="insight-text">No role breakdown yet.</p>
                )}

                {roleBreakdown.map((item, idx) => (
                  <div key={idx} className="mini-bar-row">
                    <div className="mini-bar-label">{item.name}</div>
                    <div className="mini-bar-track">
                      <div
                        className="mini-bar-fill alt"
                        style={{ width: `${Math.min(item.count * 20, 100)}%` }}
                      />
                    </div>
                    <div className="mini-bar-value">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
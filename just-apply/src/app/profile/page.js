"use client";

import { useEffect, useMemo, useState } from "react";
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

  const fetchProfileData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile-data`, {
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
      setProfileData(data);
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

  const savedJobs = profileData?.saved_jobs || [];
  const uploadedCvs = profileData?.uploaded_cvs || [];
  const extractedSkills = profileData?.all_extracted_skills || [];
  const extractedQualifications = profileData?.all_extracted_qualifications || [];
  const analytics = profileData?.analytics || {};

  const strongMatches = analytics.strong_matches || 0;
  const goodMatches = analytics.good_matches || 0;
  const weakMatches = analytics.weak_matches || 0;
  const totalMatchSegments =
    Math.max(strongMatches + goodMatches + weakMatches, 1);

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

  if (loading) {
    return <div style={{ padding: "40px" }}>Loading profile...</div>;
  }

  if (!profileData) {
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
          <button className="nav-link" onClick={() => router.push("/")}>
            Dashboard
          </button>
          <button className="nav-link active">Profile</button>
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
            <button className="topnav-item" onClick={() => router.push("/")}>
              Dashboard
            </button>
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

        <section className="hero-row">
          <div>
            <p className="eyebrow">Your personal hub</p>
            <h1 className="page-title">Profile & Career Insights</h1>
            <p className="page-subtitle">
              View your saved jobs, uploaded CV history, extracted skills, and
              analytics that help explain where you fit best in the job market.
            </p>
          </div>
        </section>

        <section className="profile-grid">
          <div className="profile-user-card">
            <div className="profile-user-icon">💼</div>
            <h2>Hello, {profileData.user?.name}!</h2>
            <div className="profile-user-box">
              <p className="profile-user-label">Email</p>
              <div className="profile-user-value">
                {profileData.user?.email || "No email"}
              </div>
            </div>

            <div className="profile-user-box">
              <p className="profile-user-label">Best-fit role</p>
              <div className="profile-user-value">{bestRole}</div>
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
                  <div className="stat-value">
                    {analytics.average_match_rate || 0}%
                  </div>
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
                    <p className="section-kicker">Analytics</p>
                    <h4>Top Missing Skills</h4>
                  </div>
                </div>

                <div className="mini-bars">
                  {topMissingSkills.length === 0 && (
                    <p className="insight-text">No missing-skill data yet.</p>
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
            </div>

            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">Uploaded history</p>
                  <h4>All CVs</h4>
                </div>
              </div>

              <div className="cv-history-list">
                {uploadedCvs.length === 0 && (
                  <p className="insight-text">No uploaded CVs yet.</p>
                )}

                {uploadedCvs.map((cv, idx) => (
                  <div className="cv-history-item" key={idx}>
                    <div>
                      <div className="cv-file-name">
                        {cv.original_name || "Untitled CV"}
                      </div>
                      <div className="cv-file-date">
                        {cv.uploaded_at || "Recently uploaded"}
                      </div>
                    </div>

                    {cv.azure_blob_url ? (
                      <a
                        className="btn-primary cv-btn"
                        href={cv.azure_blob_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View CV
                      </a>
                    ) : (
                      <button className="btn-primary cv-btn" disabled>
                        No File URL
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="jobs-card">
              <div className="jobs-header">
                <div>
                  <p className="section-kicker">Extracted profile</p>
                  <h4>All Skills & Qualifications</h4>
                </div>
              </div>

              <div className="profile-tags-section">
                <p className="profile-tag-title">Skills</p>
                <div className="chips">
                  {extractedSkills.length === 0 && (
                    <div className="chip-empty">No extracted skills yet</div>
                  )}
                  {extractedSkills.map((skill, idx) => (
                    <span key={idx} className="chip chip-orange">
                      {skill}
                    </span>
                  ))}
                </div>

                <p className="profile-tag-title">Qualifications</p>
                <div className="chips">
                  {extractedQualifications.length === 0 && (
                    <div className="chip-empty">No extracted qualifications yet</div>
                  )}
                  {extractedQualifications.map((qual, idx) => (
                    <span key={idx} className="chip chip-blue">
                      {qual}
                    </span>
                  ))}
                </div>
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
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const API_BASE_URL = "http://192.168.1.139:5000";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setStatus("");

    if (!name.trim() || !email.trim() || !password.trim()) {
      setStatus("Please complete all fields.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE_URL}/api/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Registration failed");
        return;
      }

      localStorage.setItem("access_token", data.access_token);
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error(err);
      setStatus("Could not connect to backend");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <div className="auth-hero-card">
          <div className="auth-brand-row">
            <span className="auth-brand-name">Just Apply</span>
          </div>

          <div className="auth-hero-copy">
            <p className="auth-kicker">AI-powered job matching</p>
            <h1>Create your account</h1>
            <p className="auth-hero-text">
              Join the platform to upload CVs, extract skills, track saved jobs,
              and receive clearer job-match insights in one place.
            </p>
          </div>

          <div className="auth-feature-list">
            <div className="auth-feature-pill">Personalised dashboard</div>
            <div className="auth-feature-pill">Cloud-backed accounts</div>
            <div className="auth-feature-pill">User-specific saved jobs</div>
          </div>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-card-modern">
          <div className="auth-card-head">
            <p className="auth-section-kicker">New user setup</p>
            <h2>Register</h2>
            <p className="auth-subtext">
              Create an account to start using Just Apply.
            </p>
          </div>

          <div className="auth-form-modern">
            <div className="auth-field">
              <label>Full name</label>
              <input
                className="auth-input-modern"
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label>Email address</label>
              <input
                className="auth-input-modern"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label>Password</label>
              <input
                className="auth-input-modern"
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              className="auth-primary-btn"
              onClick={handleRegister}
              disabled={loading}
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>

            <button
              className="auth-secondary-btn"
              onClick={() => router.push("/login")}
            >
              Already have an account? Login
            </button>

            {status && <div className="auth-status-box">{status}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
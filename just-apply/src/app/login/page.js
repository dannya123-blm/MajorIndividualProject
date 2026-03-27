"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import justwork from "../images/justwork.png";

const API_BASE_URL = "http://192.168.1.139:5000";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setStatus("");

    if (!email.trim() || !password.trim()) {
      setStatus("Please enter email and password.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Login failed");
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
            <Image
              src={justwork}
              alt="Just Apply logo"
              width={28}
              height={28}
              className="auth-brand-logo"
            />
            <span className="auth-brand-name">Just Apply</span>
          </div>

          <div className="auth-hero-copy">
            <p className="auth-kicker">AI-powered job matching</p>
            <h1>Welcome back</h1>
            <p className="auth-hero-text">
              Sign in to continue uploading CVs, reviewing job matches, and
              managing saved roles through a personalised dashboard.
            </p>
          </div>

          <div className="auth-feature-list">
            <div className="auth-feature-pill">Smart CV parsing</div>
            <div className="auth-feature-pill">Saved jobs by user</div>
            <div className="auth-feature-pill">Azure cloud storage</div>
          </div>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-card-modern">
          <div className="auth-card-head">
            <p className="auth-section-kicker">Account access</p>
            <h2>Login</h2>
            <p className="auth-subtext">
              Access your personalised job matching dashboard.
            </p>
          </div>

          <div className="auth-form-modern">
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
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              className="auth-primary-btn"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? "Signing in..." : "Login to Dashboard"}
            </button>

            <button
              className="auth-secondary-btn"
              onClick={() => router.push("/register")}
            >
              Create a new account
            </button>

            {status && <div className="auth-status-box">{status}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
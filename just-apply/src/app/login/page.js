"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const API_BASE_URL = "http://192.168.1.139:5000";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  const handleLogin = async () => {
    setStatus("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-name">Just Apply</div>
        </div>

        <p className="eyebrow">Welcome back</p>
        <h1 className="auth-title">Login</h1>
        <p className="auth-subtitle">
          Sign in to access the dashboard and saved jobs.
        </p>

        <div className="auth-form">
          <input
            className="auth-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="auth-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="btn-primary auth-submit" onClick={handleLogin}>
            Login
          </button>

          <button
            className="auth-link-btn"
            onClick={() => router.push("/register")}
          >
            Need an account? Register
          </button>

          {status && <div className="status">{status}</div>}
        </div>
      </div>
    </div>
  );
}
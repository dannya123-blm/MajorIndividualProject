"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  const handleLogin = async () => {
    setStatus("");

    if (!email.trim() || !password.trim()) {
      setStatus("Please enter email and password.");
      return;
    }

    router.push("/");
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
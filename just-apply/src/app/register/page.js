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

  const handleRegister = async () => {
    setStatus("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Registration failed");
        return;
      }

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

        <p className="eyebrow">Create account</p>
        <h1 className="auth-title">Register</h1>
        <p className="auth-subtitle">
          Create an account to upload CVs, view recommendations, and save jobs.
        </p>

        <div className="auth-form">
          <input
            className="auth-input"
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

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

          <button className="btn-primary auth-submit" onClick={handleRegister}>
            Register
          </button>

          <button
            className="auth-link-btn"
            onClick={() => router.push("/login")}
          >
            Already have an account? Login
          </button>

          {status && <div className="status">{status}</div>}
        </div>
      </div>
    </div>
  );
}
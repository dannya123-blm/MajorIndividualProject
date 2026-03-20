"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import justwork from "../images/justwork.png";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  const handleRegister = async () => {
    setStatus("");

    try {
      const res = await fetch("http://127.0.0.1:5000/api/register", {
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

      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      setStatus("Could not connect to backend");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand auth-brand">
          <Image src={justwork} alt="Just Apply logo" width={28} height={28} />
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
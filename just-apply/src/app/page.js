"use client";

import { useState } from "react";

export default function Uploader() {
  const [fileName, setFileName] = useState("");

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
    }
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#fff8f0",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          backgroundColor: "#ff6200", // orange box
          padding: "40px",
          borderRadius: "12px",
          boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
          textAlign: "center",
          color: "#ffffff",
          width: "300px",
        }}
      >
        <h2 style={{ marginBottom: "20px" }}>Upload Your CV</h2>
        <input
          type="file"
          onChange={handleUpload}
          style={{
            padding: "10px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
          }}
        />
        {fileName && (
          <p style={{ marginTop: "20px", wordBreak: "break-word" }}>
            Uploaded CV: {fileName}
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

export default function Uploader() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");
  const [savedPath, setSavedPath] = useState("");

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setStatus("");
      setSavedPath("");
    }
  };

  const handleUploadToServer = async () => {
    if (!file) {
      setStatus("Please select a CV first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setStatus("Uploading...");

    try {
      const res = await fetch("http://127.0.0.1:5000/api/upload-cv", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("Upload failed: " + (data.error || "Unknown error"));
        return;
      }

      // Comes from server.py -> "message"
      setStatus(data.message || "Uploaded successfully!");
      setSavedPath(data.local_path || "");
    } catch (err) {
      console.error(err);
      setStatus("Error: could not connect to backend.");
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
          backgroundColor: "#ff6200",
          padding: "40px",
          borderRadius: "12px",
          boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
          textAlign: "center",
          color: "#ffffff",
          width: "360px",
        }}
      >
        <h2 style={{ marginBottom: "20px" }}>Upload Your CV</h2>

        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileChange}
          style={{
            padding: "10px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            width: "100%",
            marginBottom: "16px",
          }}
        />

        {fileName && (
          <p style={{ marginBottom: "16px", wordBreak: "break-word" }}>
            Selected: {fileName}
          </p>
        )}

        <button
          onClick={handleUploadToServer}
          style={{
            padding: "10px 20px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            backgroundColor: "#ffffff",
            color: "#ff6200",
            fontWeight: "bold",
          }}
        >
          Upload to Server
        </button>

        {status && (
          <p style={{ marginTop: "16px", fontSize: "14px" }}>{status}</p>
        )}

        {savedPath && (
          <p style={{ marginTop: "8px", fontSize: "12px" }}>
            Saved locally at:<br /> {savedPath}
          </p>
        )}
      </div>
    </div>
  );
}

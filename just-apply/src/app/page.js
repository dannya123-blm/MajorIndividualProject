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
          onChange={handleFileChange}
          style={{
            padding: "10px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            backgroundColor: "#fff",
            color: "#000",
            width: "100%",
          }}
        />

        {fileName && (
          <p style={{ marginTop: "20px", wordBreak: "break-word" }}>
            Selected CV: {fileName}
          </p>
        )}

        <button
          onClick={handleUploadToServer}
          style={{
            marginTop: "20px",
            padding: "10px 20px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            backgroundColor: "#ffffff",
            color: "#ff6200",
            fontWeight: "bold",
            width: "100%",
          }}
        >
          Upload to Server
        </button>

        {status && (
          <p style={{ marginTop: "20px", fontSize: "14px" }}>{status}</p>
        )}

        {savedPath && (
          <p
            style={{
              marginTop: "10px",
              fontSize: "12px",
              wordBreak: "break-word",
            }}
          >
            Saved locally at: {savedPath}
          </p>
        )}
      </div>
    </div>
  );
}

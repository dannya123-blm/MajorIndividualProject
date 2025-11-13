"use client";

import { useState } from "react";

export default function Uploader() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");
  const [skills, setSkills] = useState([]);
  const [qualifications, setQualifications] = useState([]);
  const [preview, setPreview] = useState("");
  const [savedPath, setSavedPath] = useState("");

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setFileName(selected.name);
      setStatus("");
      setSkills([]);
      setQualifications([]);
      setPreview("");
      setSavedPath("");
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus("Please select a CV first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setStatus("Uploading & parsing CV...");

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
      setSkills(data.skills || []);
      setQualifications(data.qualifications || []);
      setPreview(data.text_preview || "");
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
          width: "420px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ marginBottom: "20px" }}>Upload Your CV</h2>

        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt"
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
          onClick={handleUpload}
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
          Upload & Extract Skills
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

        {(skills.length > 0 || qualifications.length > 0 || preview) && (
          <div
            style={{
              marginTop: "24px",
              padding: "16px",
              borderRadius: "8px",
              backgroundColor: "rgba(255,255,255,0.1)",
              textAlign: "left",
              fontSize: "13px",
            }}
          >
            <h3 style={{ marginBottom: "10px", fontSize: "16px" }}>
              Parsed CV Details
            </h3>

            {skills.length > 0 && (
              <p>
                <strong>Detected Skills:</strong>{" "}
                {skills.join(", ")}
              </p>
            )}

            {qualifications.length > 0 && (
              <p>
                <strong>Detected Qualifications:</strong>{" "}
                {qualifications.join(", ")}
              </p>
            )}

            {preview && (
              <div style={{ marginTop: "10px" }}>
                <strong>Text Preview:</strong>
                <p
                  style={{
                    marginTop: "6px",
                    whiteSpace: "pre-wrap",
                    maxHeight: "150px",
                    overflowY: "auto",
                    backgroundColor: "rgba(0,0,0,0.12)",
                    padding: "8px",
                    borderRadius: "6px",
                  }}
                >
                  {preview}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

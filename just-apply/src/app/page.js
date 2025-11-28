"use client";

import { useState } from "react";

export default function Uploader() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");
  const [skills, setSkills] = useState([]);
  const [qualifications, setQualifications] = useState([]);
  const [preview, setPreview] = useState("");
  const [azureBlobUrl, setAzureBlobUrl] = useState("");
  const [jobs, setJobs] = useState([]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setFileName(selected.name);
      setStatus("");
      setSkills([]);
      setQualifications([]);
      setPreview("");
      setAzureBlobUrl("");
      setJobs([]); // reset jobs when new file chosen
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
      //  First: upload CV + extract skills/qualifications
      const res = await fetch("http://127.0.0.1:5000/api/upload-cv", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("Upload failed: " + (data.error || "Unknown error"));
        return;
      }

      setStatus("CV parsed. Finding matching jobs...");
      setSkills(data.skills || []);
      setQualifications(data.qualifications || []);
      setPreview(data.text_preview || "");
      setAzureBlobUrl(data.azure_blob_url || "");

      //  Then: send skills/quals to /api/match-jobs
      const matchRes = await fetch("http://127.0.0.1:5000/api/match-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: data.skills || [],
          qualifications: data.qualifications || [],
        }),
      });

      const matchData = await matchRes.json();

      if (!matchRes.ok) {
        console.error("Job matching error:", matchData);
        setStatus("CV parsed, but job matching failed.");
        return;
      }

      setJobs(matchData.jobs || []);
      setStatus(
        `CV parsed successfully. Found ${matchData.jobs?.length || 0} matching jobs.`
      );
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
          width: "520px",
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
          Upload & Find Matching Jobs
        </button>

        {status && (
          <p style={{ marginTop: "20px", fontSize: "14px" }}>{status}</p>
        )}

        {azureBlobUrl && (
          <p
            style={{
              marginTop: "10px",
              fontSize: "12px",
              wordBreak: "break-word",
            }}
          >
            <strong>Stored in Azure:</strong>{" "}
            <a
              href={azureBlobUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#ffe2c4", textDecoration: "underline" }}
            >
              {azureBlobUrl}
            </a>
          </p>
        )}

        {/* Parsed CV details */}
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
                <strong>Detected Skills:</strong> {skills.join(", ")}
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

        {/* Recommended jobs */}
        {jobs.length > 0 && (
          <div
            style={{
              marginTop: "24px",
              padding: "16px",
              borderRadius: "8px",
              backgroundColor: "rgba(0,0,0,0.15)",
              textAlign: "left",
              fontSize: "13px",
            }}
          >
            <h3 style={{ marginBottom: "10px", fontSize: "16px" }}>
              Recommended Jobs ({jobs.length})
            </h3>

            {jobs.map((job, idx) => (
              <div
                key={idx}
                style={{
                  marginBottom: "12px",
                  paddingBottom: "8px",
                  borderBottom: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                <p style={{ fontWeight: "bold" }}>
                  {job.title || job.job_title || "Untitled role"}
                </p>

                {/* These may or may not exist depending on your CSV columns */}
                {job.company && <p>Company: {job.company}</p>}
                {job.location && <p>Location: {job.location}</p>}

                {/* Matching scores from backend */}
                {typeof job.total_score !== "undefined" && (
                  <p style={{ fontSize: "12px", marginTop: "4px" }}>
                    Match score: {job.total_score} (skills {job.skill_score} / quals{" "}
                    {job.qual_score})
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

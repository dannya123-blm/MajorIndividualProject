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
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h2>Upload Your CV</h2>
      <input type="file" onChange={handleUpload} />
      {fileName && <p>Uploaded CV: {fileName}</p>}
    </div>
  );
}

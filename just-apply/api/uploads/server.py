import os
from datetime import datetime

from flask import Flask, request, jsonify
from flask_cors import CORS

from PyPDF2 import PdfReader
from docx import Document

import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from flasgger import Swagger
from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv

import pandas as pd

load_dotenv()

AZURE_CONNECTION_STRING = os.getenv("AZURE_CONNECTION_STRING")
AZURE_CONTAINER = os.getenv("AZURE_CONTAINER_NAME", "cv-uploads")

blob_service_client = None
container_client = None

if AZURE_CONNECTION_STRING:
    blob_service_client = BlobServiceClient.from_connection_string(
        AZURE_CONNECTION_STRING
    )
    container_client = blob_service_client.get_container_client(AZURE_CONTAINER)
else:
    print(
        "WARNING: AZURE_CONNECTION_STRING not set. "
        "Files will NOT be uploaded to Azure."
    )

app = Flask(__name__)
CORS(app)

swagger = Swagger(app, template={
    "info": {
        "title": "Just Apply API",
        "description": "API for CV upload, NLP skill extraction, and job matching.",
        "version": "1.0.0"
    }
})

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

JOB_CSV_PATH = os.path.join(BASE_DIR, "jobPosts", "jobposts.csv")

print("Looking for jobposts.csv at:", JOB_CSV_PATH)
try:
    job_df = pd.read_csv(JOB_CSV_PATH)
    print(f"Loaded {len(job_df)} job postings from {JOB_CSV_PATH}")

    TEST_SAMPLE_SIZE = int(os.getenv("TEST_SAMPLE_SIZE", "50"))

    if len(job_df) > TEST_SAMPLE_SIZE:
        job_df = job_df.sample(TEST_SAMPLE_SIZE, random_state=42).reset_index(drop=True)
        print(
            f"[TEST MODE] Subsampled jobposts to {len(job_df)} rows "
            f"for accuracy testing (requested {TEST_SAMPLE_SIZE})."
        )
    else:
        print(
            f"[TEST MODE] Dataset has {len(job_df)} rows "
            f"(<= {TEST_SAMPLE_SIZE}), using all of them."
        )

except Exception as e:
    print("ERROR loading jobposts.csv:", e)
    job_df = None

try:
    stopwords.words("english")
except LookupError:
    nltk.download("stopwords")

try:
    nltk.data.find("tokenizers/punkt")
except LookupError:
    nltk.download("punkt")

try:
    nltk.data.find("tokenizers/punkt_tab")
except LookupError:
    nltk.download("punkt_tab")

EN_STOPWORDS = set(stopwords.words("english"))

SKILL_KEYWORDS = [
    "python", "java", "javascript", "typescript", "c#", "c++",
    "react", "next.js", "html", "css", "django", "flask", "node.js",
    "sql", "mysql", "postgresql", "azure", "aws", "docker",
    "git", "linux", "power bi",
    "nlp", "natural language processing", "machine learning",
    "data analysis",
]

QUALIFICATION_KEYWORDS = [
    "bsc", "b.sc", "bachelor", "bachelors", "ba", "b.a",
    "msc", "m.sc", "master", "masters", "ma", "m.a",
    "phd", "doctorate",
    "bachelor of science", "bachelor of engineering",
    "bachelor of arts", "master of science", "master of engineering",
    "master of arts",
    "honours", "hons", "higher diploma", "postgraduate diploma",
    "aws certified", "azure certification", "oracle certified",
    "microsoft certified", "ccna", "comptia",
]


def normalize_tokens(text: str) -> list[str]:
    tokens = word_tokenize(text)
    clean = []
    for tok in tokens:
        lower = tok.lower()
        if lower.isalpha() and lower not in EN_STOPWORDS:
            clean.append(lower)
    return clean


def keyword_match(text: str, keywords: list[str]) -> list[str]:
    tokens = normalize_tokens(text)
    token_text = " ".join(tokens)
    token_set = set(tokens)

    found = []

    for kw in keywords:
        kw_lower = kw.lower()
        if " " in kw_lower:
            if kw_lower in token_text:
                found.append(kw)
        else:
            if kw_lower in token_set:
                found.append(kw)

    seen = set()
    unique = []
    for item in found:
        key = item.lower()
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def extract_skills(text: str) -> list[str]:
    return keyword_match(text, SKILL_KEYWORDS)


def extract_qualifications(text: str) -> list[str]:
    return keyword_match(text, QUALIFICATION_KEYWORDS)


def upload_cv_to_azure(file_path: str, blob_name: str) -> str | None:
    if container_client is None:
        print("Azure container client not configured. Skipping upload.")
        return None

    with open(file_path, "rb") as data:
        container_client.upload_blob(
            name=blob_name,
            data=data,
            overwrite=True,
        )

    blob_client = container_client.get_blob_client(blob_name)
    return blob_client.url


def extract_text_from_pdf(path: str) -> str:
    try:
        reader = PdfReader(path)
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as e:
        print("PDF parse error:", e)
        return ""


def extract_text_from_docx(path: str) -> str:
    try:
        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs)
    except Exception as e:
        print("DOCX parse error:", e)
        return ""


def extract_text_generic(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception as e:
        print("Generic text parse error:", e)
        return ""


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/api/upload-cv", methods=["POST"])
def upload_and_parse_cv():
    """
    Upload a CV and extract skills
    ---
    tags:
      - CV Processing
    consumes:
      - multipart/form-data
    parameters:
      - name: file
        in: formData
        type: file
        required: true
        description: CV file (PDF or DOCX)
    responses:
      201:
        description: CV successfully processed
        schema:
          type: object
          properties:
            message:
              type: string
            original_name:
              type: string
            skills:
              type: array
              items:
                type: string
            qualifications:
              type: array
              items:
                type: string
            text_preview:
              type: string
            azure_blob_url:
              type: string
        examples:
          application/json:
            message: CV uploaded & parsed successfully (NLTK)
            original_name: cv.pdf
            skills: ["python", "sql"]
            qualifications: ["bachelor"]
            text_preview: Extracted CV text preview
            azure_blob_url: https://example.blob.core.windows.net/cv-uploads/cv.pdf
      400:
        description: Invalid file upload
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{timestamp}-{file.filename}"

    save_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(save_path)

    ext = os.path.splitext(file.filename)[1].lower()
    if ext == ".pdf":
        text = extract_text_from_pdf(save_path)
    elif ext == ".docx":
        text = extract_text_from_docx(save_path)
    else:
        text = extract_text_generic(save_path)

    skills = extract_skills(text)
    qualifications = extract_qualifications(text)
    preview = text[:600] if text else ""

    blob_url = upload_cv_to_azure(save_path, filename)

    try:
        if os.path.exists(save_path):
            os.remove(save_path)
    except Exception as e:
        print("Could not delete temp file:", e)

    return jsonify({
        "message": "CV uploaded & parsed successfully (NLTK)",
        "original_name": file.filename,
        "skills": skills,
        "qualifications": qualifications,
        "text_preview": preview,
        "azure_blob_url": blob_url,
    }), 201


@app.route("/api/match-jobs", methods=["POST"])
def match_jobs():
    """
    Match extracted skills and qualifications against job posts
    ---
    tags:
      - Job Matching
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            skills:
              type: array
              items:
                type: string
              example: ["python", "django"]
            qualifications:
              type: array
              items:
                type: string
              example: ["bachelor"]
            top_n:
              type: integer
              example: 10
    responses:
      200:
        description: Matching job results returned
        schema:
          type: object
          properties:
            jobs:
              type: array
              items:
                type: object
            metadata:
              type: object
              properties:
                total_jobs_loaded:
                  type: integer
                jobs_with_matches:
                  type: integer
                top_n:
                  type: integer
                match_coverage_ratio:
                  type: number
      500:
        description: Job dataset not loaded
    """
    global job_df
    if job_df is None:
        return jsonify({"error": "Job dataset not loaded on server"}), 500

    data = request.get_json(silent=True) or {}

    raw_skills = data.get("skills", [])
    raw_quals = data.get("qualifications", [])

    if not isinstance(raw_skills, list):
        return jsonify({"error": "skills must be a list"}), 400

    if not isinstance(raw_quals, list):
        return jsonify({"error": "qualifications must be a list"}), 400

    user_skills = [str(s).lower() for s in raw_skills]
    user_quals = [str(q).lower() for q in raw_quals]

    top_n = data.get("top_n", 10)
    try:
        top_n = int(top_n)
    except (ValueError, TypeError):
        top_n = 10

    if top_n <= 0:
        top_n = 10

    if not user_skills and not user_quals:
        return jsonify({
            "jobs": [],
            "metadata": {
                "message": "No skills or qualifications provided.",
                "total_jobs_loaded": int(len(job_df)),
                "jobs_with_matches": 0,
                "top_n": int(top_n),
            },
        }), 200

    df = job_df.copy()

    def full_text_from_row(row):
        parts = []
        for value in row.values:
            if isinstance(value, str):
                parts.append(value.lower())
        return " ".join(parts)

    def find_missing_skills(text: str, skills: list[str]) -> list[str]:
        missing = []
        for skill in SKILL_KEYWORDS:
            if skill.lower() in text and skill.lower() not in skills:
                missing.append(skill)
        return missing

    def find_matched_skills(text: str, skills: list[str]) -> list[str]:
        matched = []
        for skill in skills:
            if skill in text:
                matched.append(skill)
        return matched

    def find_missing_qualifications(text: str, quals: list[str]) -> list[str]:
        missing = []
        for qual in QUALIFICATION_KEYWORDS:
            if qual.lower() in text and qual.lower() not in quals:
                missing.append(qual)
        return missing

    df["__full_text"] = df.apply(full_text_from_row, axis=1)

    def compute_scores(text: str):
        skill_score = sum(1 for s in user_skills if s in text)
        qual_score = sum(1 for q in user_quals if q in text)
        total = skill_score * 2 + qual_score
        return skill_score, qual_score, total

    df["skill_score"], df["qual_score"], df["total_score"] = zip(
        *df["__full_text"].apply(compute_scores)
    )

    df["matched_skills"] = df["__full_text"].apply(
        lambda text: find_matched_skills(text, user_skills)
    )
    df["missing_skills"] = df["__full_text"].apply(
        lambda text: find_missing_skills(text, user_skills)
    )
    df["missing_qualifications"] = df["__full_text"].apply(
        lambda text: find_missing_qualifications(text, user_quals)
    )

    df = df[df["total_score"] > 0]
    jobs_with_matches = len(df)

    if jobs_with_matches == 0:
        return jsonify({
            "jobs": [],
            "metadata": {
                "message": "No jobs matched the provided skills/qualifications.",
                "total_jobs_loaded": int(len(job_df)),
                "jobs_with_matches": 0,
                "top_n": int(top_n),
            },
        }), 200

    df = df.sort_values(by="total_score", ascending=False).head(top_n)
    df = df.drop(columns=["__full_text"])
    df = df.fillna("")

    jobs = df.to_dict(orient="records")

    return jsonify({
        "jobs": jobs,
        "metadata": {
            "total_jobs_loaded": int(len(job_df)),
            "jobs_with_matches": int(jobs_with_matches),
            "top_n": int(top_n),
            "match_coverage_ratio": jobs_with_matches / float(len(job_df)),
        },
    }), 200


if __name__ == "__main__":
    app.run(debug=True)
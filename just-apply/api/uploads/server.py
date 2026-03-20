import os
import json
from datetime import datetime, timedelta

from flask import Flask, request, jsonify
from flask_cors import CORS

from PyPDF2 import PdfReader
from docx import Document

import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from flasgger import Swagger
from azure.storage.blob import BlobServiceClient
from azure.core.exceptions import ResourceNotFoundError
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    get_jwt_identity,
    jwt_required,
    set_access_cookies,
    unset_jwt_cookies,
)
import pyodbc
import pandas as pd

load_dotenv()

AZURE_CONNECTION_STRING = os.getenv("AZURE_CONNECTION_STRING")
AZURE_CONTAINER = os.getenv("AZURE_CONTAINER_NAME", "cv-uploads")
AZURE_SAVED_JOBS_CONTAINER = os.getenv(
    "AZURE_SAVED_JOBS_CONTAINER_NAME",
    "saved-jobs"
)
SAVED_JOBS_BLOB_NAME = os.getenv(
    "AZURE_SAVED_JOBS_BLOB_NAME",
    "saved-jobs.json"
)

AZURE_SQL_SERVER = os.getenv("AZURE_SQL_SERVER")
AZURE_SQL_DATABASE = os.getenv("AZURE_SQL_DATABASE")
AZURE_SQL_USERNAME = os.getenv("AZURE_SQL_USERNAME")
AZURE_SQL_PASSWORD = os.getenv("AZURE_SQL_PASSWORD")

blob_service_client = None
cv_container_client = None
saved_jobs_container_client = None

if AZURE_CONNECTION_STRING:
    blob_service_client = BlobServiceClient.from_connection_string(
        AZURE_CONNECTION_STRING
    )
    cv_container_client = blob_service_client.get_container_client(AZURE_CONTAINER)
    saved_jobs_container_client = blob_service_client.get_container_client(
        AZURE_SAVED_JOBS_CONTAINER
    )
else:
    print(
        "WARNING: AZURE_CONNECTION_STRING not set. "
        "Files will NOT be uploaded to Azure."
    )

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
app.config["JWT_TOKEN_LOCATION"] = ["cookies"]
app.config["JWT_COOKIE_SECURE"] = False
app.config["JWT_COOKIE_SAMESITE"] = "Lax"
app.config["JWT_COOKIE_CSRF_PROTECT"] = False
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=1)

CORS(
    app,
    supports_credentials=True,
    origins=["http://localhost:3000", "http://127.0.0.1:3000"]
)

jwt = JWTManager(app)

swagger = Swagger(app, template={
    "info": {
        "title": "Just Apply API",
        "description": "API for CV upload, NLP skill extraction, job matching, saved jobs, and authentication.",
        "version": "2.0.0"
    }
})

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

LOCAL_SAVED_JOBS_PATH = os.path.join(BASE_DIR, "saved_jobs.json")
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


def get_sql_driver():
    available = pyodbc.drivers()

    if "ODBC Driver 18 for SQL Server" in available:
        return "ODBC Driver 18 for SQL Server"

    if "ODBC Driver 17 for SQL Server" in available:
        return "ODBC Driver 17 for SQL Server"

    raise RuntimeError(
        "No SQL Server ODBC driver found. Install Microsoft ODBC Driver 18 "
        "or 17 for SQL Server, then run: python -c \"import pyodbc; print(pyodbc.drivers())\""
    )


def get_db_connection():
    driver = get_sql_driver()

    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER=tcp:{AZURE_SQL_SERVER},1433;"
        f"DATABASE={AZURE_SQL_DATABASE};"
        f"UID={AZURE_SQL_USERNAME};"
        f"PWD={AZURE_SQL_PASSWORD};"
        "Encrypt=yes;"
        "TrustServerCertificate=yes;"
        "Timeout=30;"
    )

    return pyodbc.connect(conn_str)


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    IF NOT EXISTS (
        SELECT * FROM sysobjects WHERE name='users' AND xtype='U'
    )
    CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        email NVARCHAR(255) UNIQUE NOT NULL,
        password_hash NVARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT GETDATE()
    )
    """)

    conn.commit()
    cursor.close()
    conn.close()


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
    if cv_container_client is None:
        print("Azure CV container client not configured. Skipping upload.")
        return None

    with open(file_path, "rb") as data:
        cv_container_client.upload_blob(
            name=blob_name,
            data=data,
            overwrite=True,
        )

    blob_client = cv_container_client.get_blob_client(blob_name)
    return blob_client.url


def load_saved_jobs() -> list[dict]:
    if saved_jobs_container_client is not None:
        try:
            blob_client = saved_jobs_container_client.get_blob_client(
                SAVED_JOBS_BLOB_NAME
            )
            blob_data = blob_client.download_blob().readall()
            return json.loads(blob_data.decode("utf-8"))
        except ResourceNotFoundError:
            return []
        except Exception as e:
            print("Azure saved jobs load error:", e)
            return []

    if os.path.exists(LOCAL_SAVED_JOBS_PATH):
        try:
            with open(LOCAL_SAVED_JOBS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    return []


def save_saved_jobs(jobs: list[dict]) -> None:
    if saved_jobs_container_client is not None:
        blob_client = saved_jobs_container_client.get_blob_client(
            SAVED_JOBS_BLOB_NAME
        )
        blob_client.upload_blob(
            json.dumps(jobs, ensure_ascii=False, indent=2),
            overwrite=True
        )
        return

    with open(LOCAL_SAVED_JOBS_PATH, "w", encoding="utf-8") as f:
        json.dump(jobs, f, ensure_ascii=False, indent=2)


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


@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", "")).strip()

    if not name or not email or not password:
        return jsonify({"error": "Name, email, and password are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    password_hash = generate_password_hash(password)

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email, password_hash)
        )

        conn.commit()

        cursor.execute(
            "SELECT id, name, email FROM users WHERE email = ?",
            (email,)
        )
        user = cursor.fetchone()

        cursor.close()
        conn.close()

        access_token = create_access_token(identity=email)
        response = jsonify({
            "message": "User registered successfully",
            "user": {
                "id": user[0],
                "name": user[1],
                "email": user[2]
            }
        })
        set_access_cookies(response, access_token)
        return response, 201

    except Exception:
        return jsonify({"error": "User already exists or registration failed"}), 400


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", "")).strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id, name, email, password_hash FROM users WHERE email = ?",
        (email,)
    )
    user = cursor.fetchone()

    cursor.close()
    conn.close()

    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    user_id, name, user_email, password_hash = user

    if not check_password_hash(password_hash, password):
        return jsonify({"error": "Invalid credentials"}), 401

    access_token = create_access_token(identity=user_email)
    response = jsonify({
        "message": "Login successful",
        "user": {
            "id": user_id,
            "name": name,
            "email": user_email
        }
    })
    set_access_cookies(response, access_token)
    return response, 200


@app.route("/api/me", methods=["GET"])
@jwt_required()
def me():
    email = get_jwt_identity()

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id, name, email FROM users WHERE email = ?",
        (email,)
    )
    user = cursor.fetchone()

    cursor.close()
    conn.close()

    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify({
        "user": {
            "id": user[0],
            "name": user[1],
            "email": user[2]
        }
    }), 200


@app.route("/api/logout", methods=["POST"])
def logout():
    response = jsonify({"message": "Logged out"})
    unset_jwt_cookies(response)
    return response, 200


@app.route("/api/upload-cv", methods=["POST"])
@jwt_required()
def upload_and_parse_cv():
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
@jwt_required()
def match_jobs():
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


@app.route("/api/save-job", methods=["POST"])
@jwt_required()
def save_job():
    data = request.get_json(silent=True) or {}
    job = data.get("job")
    user_email = get_jwt_identity()

    if not isinstance(job, dict):
        return jsonify({"error": "No job provided"}), 400

    saved_jobs = load_saved_jobs()

    job_id = (
        job.get("job_id")
        or job.get("id")
        or job.get("title")
        or job.get("job_title")
    )

    if not job_id:
        job_id = f"job-{len(saved_jobs) + 1}"

    for existing in saved_jobs:
        if existing.get("job_id") == job_id and existing.get("user_email") == user_email:
            return jsonify({
                "message": "Job already saved",
                "saved_jobs": [j for j in saved_jobs if j.get("user_email") == user_email]
            }), 200

    job["job_id"] = job_id
    job["user_email"] = user_email
    job["saved_at"] = datetime.now().isoformat()

    saved_jobs.append(job)
    save_saved_jobs(saved_jobs)

    user_saved_jobs = [j for j in saved_jobs if j.get("user_email") == user_email]

    return jsonify({
        "message": "Job saved successfully",
        "saved_jobs": user_saved_jobs
    }), 201


@app.route("/api/saved-jobs", methods=["GET"])
@jwt_required()
def get_saved_jobs():
    user_email = get_jwt_identity()
    saved_jobs = load_saved_jobs()
    saved_jobs = [job for job in saved_jobs if job.get("user_email") == user_email]
    return jsonify({"saved_jobs": saved_jobs}), 200


@app.route("/api/remove-saved-job", methods=["POST"])
@jwt_required()
def remove_saved_job():
    data = request.get_json(silent=True) or {}
    job_id = data.get("job_id")
    user_email = get_jwt_identity()

    if not job_id:
        return jsonify({"error": "job_id is required"}), 400

    saved_jobs = load_saved_jobs()
    saved_jobs = [
        job for job in saved_jobs
        if not (job.get("job_id") == job_id and job.get("user_email") == user_email)
    ]
    save_saved_jobs(saved_jobs)

    user_saved_jobs = [j for j in saved_jobs if j.get("user_email") == user_email]

    return jsonify({
        "message": "Job removed",
        "saved_jobs": user_saved_jobs
    }), 200


if __name__ == "__main__":
    print("Available ODBC drivers:", pyodbc.drivers())
    init_db()
    app.run(debug=True)
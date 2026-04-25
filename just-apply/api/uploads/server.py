import os
import json
import sqlite3
import smtplib
from nlp import extract_skills, extract_qualifications, clean_extracted_text
from datetime import datetime, timedelta
from typing import Optional, Any

import requests
import nltk
import pyodbc
import pandas as pd

from flask import Flask, request, jsonify
from flask_cors import CORS
from flasgger import Swagger

from PyPDF2 import PdfReader
from docx import Document

from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize

from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv
from ai_coach import ai_coach_bp
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    get_jwt_identity,
    jwt_required,
)

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from apscheduler.schedulers.background import BackgroundScheduler

# =========================================================
# ENV
# =========================================================
load_dotenv()

AZURE_CONNECTION_STRING = os.getenv("AZURE_CONNECTION_STRING")
AZURE_CONTAINER = os.getenv("AZURE_CONTAINER_NAME", "cv-uploads")

AZURE_SQL_SERVER = os.getenv("AZURE_SQL_SERVER")
AZURE_SQL_DATABASE = os.getenv("AZURE_SQL_DATABASE")
AZURE_SQL_USERNAME = os.getenv("AZURE_SQL_USERNAME")
AZURE_SQL_PASSWORD = os.getenv("AZURE_SQL_PASSWORD")

ADZUNA_APP_ID = os.getenv("ADZUNA_APP_ID")
ADZUNA_APP_KEY = os.getenv("ADZUNA_APP_KEY")
ADZUNA_COUNTRY = os.getenv("ADZUNA_COUNTRY", "us")

EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS")
EMAIL_APP_PASSWORD = os.getenv("EMAIL_APP_PASSWORD")
EMAIL_ALERTS_ENABLED = os.getenv("EMAIL_ALERTS_ENABLED", "true").lower() == "true"
EMAIL_ALERTS_HOUR = int(os.getenv("EMAIL_ALERTS_HOUR", "9"))
EMAIL_ALERTS_MINUTE = int(os.getenv("EMAIL_ALERTS_MINUTE", "0"))

# =========================================================
# PATHS
# =========================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

JOB_CSV_PATH = os.path.join(BASE_DIR, "jobPosts", "jobposts.csv")
SQLITE_PATH = os.path.join(BASE_DIR, "just_apply_local.db")

# =========================================================
# DB MODE
# =========================================================
DB_MODE = "sqlite"

# =========================================================
# AZURE BLOB
# =========================================================
blob_service_client = None
cv_container_client = None

if AZURE_CONNECTION_STRING:
    try:
        blob_service_client = BlobServiceClient.from_connection_string(
            AZURE_CONNECTION_STRING
        )
        cv_container_client = blob_service_client.get_container_client(AZURE_CONTAINER)
        print("Azure Blob client ready.")
    except Exception as e:
        print("WARNING: Azure Blob init failed:", e)
        blob_service_client = None
        cv_container_client = None
else:
    print("WARNING: AZURE_CONNECTION_STRING not set. Files will not upload to Azure.")

# =========================================================
# FLASK APP
# =========================================================
app = Flask(__name__)
app.register_blueprint(ai_coach_bp)
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
app.config["JWT_TOKEN_LOCATION"] = ["headers"]
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=1)

CORS(
    app,
    supports_credentials=True,
    origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.1.139:3000",
    ],
)

jwt = JWTManager(app)

swagger = Swagger(
    app,
    template={
        "info": {
            "title": "Just Apply API",
            "description": "API for CV upload, NLP extraction, live Adzuna jobs, saved jobs, applications, profile analytics, and automated email alerts.",
            "version": "7.0.0",
        }
    },
)

# =========================================================
# DATASET FALLBACK
# =========================================================
print("Looking for jobposts.csv at:", JOB_CSV_PATH)
try:
    job_df = pd.read_csv(JOB_CSV_PATH)
    print(f"Loaded {len(job_df)} job postings from {JOB_CSV_PATH}")

    TEST_SAMPLE_SIZE = int(os.getenv("TEST_SAMPLE_SIZE", "50"))

    if len(job_df) > TEST_SAMPLE_SIZE:
        job_df = job_df.sample(TEST_SAMPLE_SIZE, random_state=42).reset_index(drop=True)
        print(
            f"[TEST MODE] Subsampled jobposts to {len(job_df)} rows "
            f"for testing (requested {TEST_SAMPLE_SIZE})."
        )
    else:
        print(
            f"[TEST MODE] Dataset has {len(job_df)} rows "
            f"(<= {TEST_SAMPLE_SIZE}), using all of them."
        )
except Exception as e:
    print("ERROR loading jobposts.csv:", e)
    job_df = None

# =========================================================
# NLTK
# =========================================================
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
    "git", "linux", "power bi", "nlp", "natural language processing",
    "machine learning", "data analysis", "data analytics",
    "ui", "ux", "figma", "cloud", "kubernetes", "devops", "terraform"
]

QUALIFICATION_KEYWORDS = [
    "bsc", "b.sc", "bachelor", "bachelors", "ba", "b.a",
    "msc", "m.sc", "master", "masters", "ma", "m.a",
    "phd", "doctorate",
    "bachelor of science", "bachelor of engineering",
    "bachelor of arts", "master of science", "master of engineering",
    "master of arts", "honours", "hons", "higher diploma",
    "postgraduate diploma", "aws certified", "azure certification",
    "oracle certified", "microsoft certified", "ccna", "comptia"
]

ALLOWED_CAREER_TARGETS = {
    "Data Analyst",
    "Frontend Developer",
    "Cloud Engineer",
    "Software Engineer",
    "Full Stack Developer",
    "UI/UX Designer",
}

ALLOWED_APPLICATION_STATUSES = {"Applied", "Interviewing", "Rejected", "Offer"}
ALERT_FREQUENCIES = {"daily", "weekly"}

# =========================================================
# DATABASE HELPERS
# =========================================================
def get_sql_driver():
    available = pyodbc.drivers()

    if "ODBC Driver 18 for SQL Server" in available:
        return "ODBC Driver 18 for SQL Server"

    if "ODBC Driver 17 for SQL Server" in available:
        return "ODBC Driver 17 for SQL Server"

    raise RuntimeError(
        "No supported SQL Server ODBC driver found. "
        "Install Microsoft ODBC Driver 18 or 17 for SQL Server."
    )


def get_azure_connection():
    driver = get_sql_driver()
    server = f"tcp:{AZURE_SQL_SERVER},1433"

    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={server};"
        f"DATABASE={AZURE_SQL_DATABASE};"
        f"UID={AZURE_SQL_USERNAME};"
        f"PWD={AZURE_SQL_PASSWORD};"
        "Encrypt=yes;"
        "TrustServerCertificate=no;"
        "Connection Timeout=60;"
    )

    return pyodbc.connect(conn_str)


def get_sqlite_connection():
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def db_is_sqlite() -> bool:
    return DB_MODE == "sqlite"


def dict_from_row(row: Any) -> dict:
    if row is None:
        return {}
    if isinstance(row, sqlite3.Row):
        return dict(row)
    return {}


def probe_db_mode():
    global DB_MODE

    try:
        conn = get_azure_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        conn.close()
        DB_MODE = "azure"
        print("DB MODE: Azure SQL")
    except Exception as e:
        DB_MODE = "sqlite"
        print("DB MODE FALLBACK: SQLite")
        print("Azure SQL unavailable:", e)


def init_db():
    if db_is_sqlite():
        init_sqlite_db()
    else:
        init_azure_db()


def init_azure_db():
    conn = get_azure_connection()
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

    cursor.execute("""
    IF NOT EXISTS (
        SELECT * FROM sysobjects WHERE name='saved_jobs' AND xtype='U'
    )
    CREATE TABLE saved_jobs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_email NVARCHAR(255) NOT NULL,
        job_id NVARCHAR(255) NOT NULL,
        title NVARCHAR(255) NULL,
        company NVARCHAR(255) NULL,
        location NVARCHAR(255) NULL,
        industry NVARCHAR(255) NULL,
        total_score INT NULL,
        skill_score INT NULL,
        qual_score INT NULL,
        match_percentage INT NULL,
        matched_skills NVARCHAR(MAX) NULL,
        missing_skills NVARCHAR(MAX) NULL,
        missing_qualifications NVARCHAR(MAX) NULL,
        raw_job_json NVARCHAR(MAX) NOT NULL,
        saved_at DATETIME DEFAULT GETDATE()
    )
    """)

    cursor.execute("""
    IF NOT EXISTS (
        SELECT * FROM sysobjects WHERE name='user_cvs' AND xtype='U'
    )
    CREATE TABLE user_cvs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_email NVARCHAR(255) NOT NULL,
        original_name NVARCHAR(255) NOT NULL,
        stored_filename NVARCHAR(255) NULL,
        azure_blob_url NVARCHAR(MAX) NULL,
        extracted_skills NVARCHAR(MAX) NULL,
        extracted_qualifications NVARCHAR(MAX) NULL,
        text_preview NVARCHAR(MAX) NULL,
        uploaded_at DATETIME DEFAULT GETDATE()
    )
    """)

    cursor.execute("""
    IF NOT EXISTS (
        SELECT * FROM sysobjects WHERE name='job_applications' AND xtype='U'
    )
    CREATE TABLE job_applications (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_email NVARCHAR(255) NOT NULL,
        external_job_id NVARCHAR(255) NOT NULL,
        source_name NVARCHAR(100) NOT NULL,
        title NVARCHAR(255) NULL,
        company NVARCHAR(255) NULL,
        location NVARCHAR(255) NULL,
        apply_url NVARCHAR(MAX) NULL,
        status NVARCHAR(50) NOT NULL DEFAULT 'Applied',
        notes NVARCHAR(MAX) NULL,
        applied_at DATETIME DEFAULT GETDATE()
    )
    """)

    cursor.execute("""
    IF NOT EXISTS (
        SELECT * FROM sysobjects WHERE name='user_career_targets' AND xtype='U'
    )
    CREATE TABLE user_career_targets (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_email NVARCHAR(255) UNIQUE NOT NULL,
        target_role NVARCHAR(255) NOT NULL,
        updated_at DATETIME DEFAULT GETDATE()
    )
    """)

    cursor.execute("""
    IF NOT EXISTS (
        SELECT * FROM sysobjects WHERE name='email_alert_preferences' AND xtype='U'
    )
    CREATE TABLE email_alert_preferences (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_email NVARCHAR(255) UNIQUE NOT NULL,
        alerts_enabled BIT NOT NULL DEFAULT 1,
        frequency NVARCHAR(50) NOT NULL DEFAULT 'daily',
        preferred_location NVARCHAR(255) NULL,
        jobs_per_email INT NOT NULL DEFAULT 5,
        last_sent_at DATETIME NULL,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    )
    """)

    cursor.execute("""
    IF NOT EXISTS (
        SELECT * FROM sysobjects WHERE name='emailed_jobs_history' AND xtype='U'
    )
    CREATE TABLE emailed_jobs_history (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_email NVARCHAR(255) NOT NULL,
        external_job_id NVARCHAR(255) NOT NULL,
        title NVARCHAR(255) NULL,
        emailed_at DATETIME DEFAULT GETDATE()
    )
    """)

    conn.commit()
    cursor.close()
    conn.close()
    print("Azure SQL tables ready.")


def init_sqlite_db():
    conn = get_sqlite_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS saved_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        job_id TEXT NOT NULL,
        title TEXT,
        company TEXT,
        location TEXT,
        industry TEXT,
        total_score INTEGER,
        skill_score INTEGER,
        qual_score INTEGER,
        match_percentage INTEGER,
        matched_skills TEXT,
        missing_skills TEXT,
        missing_qualifications TEXT,
        raw_job_json TEXT NOT NULL,
        saved_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_cvs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_filename TEXT,
        azure_blob_url TEXT,
        extracted_skills TEXT,
        extracted_qualifications TEXT,
        text_preview TEXT,
        uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS job_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        external_job_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        title TEXT,
        company TEXT,
        location TEXT,
        apply_url TEXT,
        status TEXT NOT NULL DEFAULT 'Applied',
        notes TEXT,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_career_targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT UNIQUE NOT NULL,
        target_role TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS email_alert_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT UNIQUE NOT NULL,
        alerts_enabled INTEGER NOT NULL DEFAULT 1,
        frequency TEXT NOT NULL DEFAULT 'daily',
        preferred_location TEXT,
        jobs_per_email INTEGER NOT NULL DEFAULT 5,
        last_sent_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS emailed_jobs_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        external_job_id TEXT NOT NULL,
        title TEXT,
        emailed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    cursor.close()
    conn.close()
    print("SQLite tables ready.")

# =========================================================
# USER HELPERS
# =========================================================
def get_user_by_email(email: str) -> Optional[dict]:
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, email, password_hash FROM users WHERE email = ?",
            (email,),
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            return None

        row = dict_from_row(row)
        return {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "password_hash": row["password_hash"],
        }

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, email, password_hash FROM users WHERE email = ?",
        (email,),
    )
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if not row:
        return None

    return {
        "id": row[0],
        "name": row[1],
        "email": row[2],
        "password_hash": row[3],
    }


def create_user(name: str, email: str, password_hash: str) -> dict:
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email, password_hash),
        )
        conn.commit()
        cursor.execute(
            "SELECT id, name, email, password_hash FROM users WHERE email = ?",
            (email,),
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        row = dict_from_row(row)
        ensure_email_preferences_exist(email)
        return {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "password_hash": row["password_hash"],
        }

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
        (name, email, password_hash),
    )
    conn.commit()
    cursor.execute(
        "SELECT id, name, email, password_hash FROM users WHERE email = ?",
        (email,),
    )
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    ensure_email_preferences_exist(email)
    return {
        "id": row[0],
        "name": row[1],
        "email": row[2],
        "password_hash": row[3],
    }

# =========================================================
# SAVED JOBS HELPERS
# =========================================================
def get_saved_jobs_by_user(user_email: str) -> list:
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT raw_job_json
            FROM saved_jobs
            WHERE user_email = ?
            ORDER BY saved_at DESC
        """, (user_email,))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        jobs = []
        for row in rows:
            row = dict_from_row(row)
            try:
                jobs.append(json.loads(row["raw_job_json"]))
            except Exception:
                pass
        return jobs

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT raw_job_json
        FROM saved_jobs
        WHERE user_email = ?
        ORDER BY saved_at DESC
    """, (user_email,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    jobs = []
    for row in rows:
        try:
            jobs.append(json.loads(row[0]))
        except Exception:
            pass
    return jobs


def save_job_for_user(user_email: str, job: dict) -> bool:
    job_id = (
        job.get("job_id")
        or job.get("external_job_id")
        or job.get("id")
        or job.get("title")
        or job.get("job_title")
    )

    if not job_id:
        job_id = f"job-{datetime.now().timestamp()}"

    title = job.get("title") or job.get("job_title") or ""
    company = job.get("company") or ""
    location = job.get("location") or ""
    industry = job.get("industry") or ""
    total_score = int(job.get("total_score", 0) or 0)
    skill_score = int(job.get("skill_score", 0) or 0)
    qual_score = int(job.get("qual_score", 0) or 0)
    match_percentage = int(job.get("match_percentage", 0) or 0)
    matched_skills = json.dumps(job.get("matched_skills", []))
    missing_skills = json.dumps(job.get("missing_skills", []))
    missing_qualifications = json.dumps(job.get("missing_qualifications", []))
    raw_job_json = json.dumps(job)

    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id
            FROM saved_jobs
            WHERE user_email = ? AND job_id = ?
        """, (user_email, str(job_id)))
        existing = cursor.fetchone()

        if existing:
            cursor.close()
            conn.close()
            return False

        cursor.execute("""
            INSERT INTO saved_jobs (
                user_email, job_id, title, company, location, industry,
                total_score, skill_score, qual_score, match_percentage,
                matched_skills, missing_skills, missing_qualifications, raw_job_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_email, str(job_id), title, company, location, industry,
            total_score, skill_score, qual_score, match_percentage,
            matched_skills, missing_skills, missing_qualifications, raw_job_json
        ))
        conn.commit()
        cursor.close()
        conn.close()
        return True

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id
        FROM saved_jobs
        WHERE user_email = ? AND job_id = ?
    """, (user_email, str(job_id)))
    existing = cursor.fetchone()

    if existing:
        cursor.close()
        conn.close()
        return False

    cursor.execute("""
        INSERT INTO saved_jobs (
            user_email, job_id, title, company, location, industry,
            total_score, skill_score, qual_score, match_percentage,
            matched_skills, missing_skills, missing_qualifications, raw_job_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_email, str(job_id), title, company, location, industry,
        total_score, skill_score, qual_score, match_percentage,
        matched_skills, missing_skills, missing_qualifications, raw_job_json
    ))
    conn.commit()
    cursor.close()
    conn.close()
    return True


def remove_saved_job_for_user(user_email: str, job_id: str):
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            DELETE FROM saved_jobs
            WHERE user_email = ? AND job_id = ?
        """, (user_email, str(job_id)))
        conn.commit()
        cursor.close()
        conn.close()
        return

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        DELETE FROM saved_jobs
        WHERE user_email = ? AND job_id = ?
    """, (user_email, str(job_id)))
    conn.commit()
    cursor.close()
    conn.close()

# =========================================================
# CV HISTORY HELPERS
# =========================================================
def save_cv_for_user(
    user_email: str,
    original_name: str,
    stored_filename: str,
    azure_blob_url: Optional[str],
    skills: list[str],
    qualifications: list[str],
    text_preview: str,
):
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO user_cvs (
                user_email, original_name, stored_filename,
                azure_blob_url, extracted_skills, extracted_qualifications,
                text_preview
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            user_email,
            original_name,
            stored_filename,
            azure_blob_url or "",
            json.dumps(skills or []),
            json.dumps(qualifications or []),
            text_preview or "",
        ))
        conn.commit()
        cursor.close()
        conn.close()
        return

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO user_cvs (
            user_email, original_name, stored_filename,
            azure_blob_url, extracted_skills, extracted_qualifications,
            text_preview
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        user_email,
        original_name,
        stored_filename,
        azure_blob_url or "",
        json.dumps(skills or []),
        json.dumps(qualifications or []),
        text_preview or "",
    ))
    conn.commit()
    cursor.close()
    conn.close()


def get_uploaded_cvs_by_user(user_email: str) -> list:
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT original_name, stored_filename, azure_blob_url,
                   extracted_skills, extracted_qualifications,
                   text_preview, uploaded_at
            FROM user_cvs
            WHERE user_email = ?
            ORDER BY uploaded_at DESC
        """, (user_email,))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        cvs = []
        for row in rows:
            row = dict_from_row(row)
            cvs.append({
                "original_name": row["original_name"],
                "stored_filename": row["stored_filename"],
                "azure_blob_url": row["azure_blob_url"],
                "skills": json.loads(row["extracted_skills"]) if row["extracted_skills"] else [],
                "qualifications": json.loads(row["extracted_qualifications"]) if row["extracted_qualifications"] else [],
                "text_preview": row["text_preview"] or "",
                "uploaded_at": row["uploaded_at"] or "",
            })
        return cvs

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT original_name, stored_filename, azure_blob_url,
               extracted_skills, extracted_qualifications,
               text_preview, uploaded_at
        FROM user_cvs
        WHERE user_email = ?
        ORDER BY uploaded_at DESC
    """, (user_email,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    cvs = []
    for row in rows:
        cvs.append({
            "original_name": row[0],
            "stored_filename": row[1],
            "azure_blob_url": row[2],
            "skills": json.loads(row[3]) if row[3] else [],
            "qualifications": json.loads(row[4]) if row[4] else [],
            "text_preview": row[5] or "",
            "uploaded_at": str(row[6]) if row[6] else "",
        })
    return cvs

# =========================================================
# APPLICATION HELPERS
# =========================================================
def save_job_application_for_user(user_email: str, job: dict, status: str = "Applied"):
    external_job_id = str(
        job.get("external_job_id")
        or job.get("id")
        or job.get("job_id")
        or f"adzuna-{datetime.now().timestamp()}"
    )

    source_name = str(job.get("source_name") or "Adzuna")
    title = str(job.get("title") or job.get("job_title") or "")
    company = str(job.get("company") or "")
    location = str(job.get("location") or "")
    apply_url = str(job.get("apply_url") or job.get("redirect_url") or "")
    notes = str(job.get("notes") or "")

    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id
            FROM job_applications
            WHERE user_email = ? AND external_job_id = ?
        """, (user_email, external_job_id))
        existing = cursor.fetchone()

        if existing:
            cursor.execute("""
                UPDATE job_applications
                SET status = ?, notes = ?, apply_url = ?, title = ?, company = ?, location = ?
                WHERE user_email = ? AND external_job_id = ?
            """, (
                status, notes, apply_url, title, company, location,
                user_email, external_job_id
            ))
        else:
            cursor.execute("""
                INSERT INTO job_applications (
                    user_email, external_job_id, source_name, title, company,
                    location, apply_url, status, notes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_email, external_job_id, source_name, title, company,
                location, apply_url, status, notes
            ))
        conn.commit()
        cursor.close()
        conn.close()
        return

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id
        FROM job_applications
        WHERE user_email = ? AND external_job_id = ?
    """, (user_email, external_job_id))
    existing = cursor.fetchone()

    if existing:
        cursor.execute("""
            UPDATE job_applications
            SET status = ?, notes = ?, apply_url = ?, title = ?, company = ?, location = ?
            WHERE user_email = ? AND external_job_id = ?
        """, (
            status, notes, apply_url, title, company, location,
            user_email, external_job_id
        ))
    else:
        cursor.execute("""
            INSERT INTO job_applications (
                user_email, external_job_id, source_name, title, company,
                location, apply_url, status, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_email, external_job_id, source_name, title, company,
            location, apply_url, status, notes
        ))
    conn.commit()
    cursor.close()
    conn.close()


def get_job_applications_by_user(user_email: str) -> list:
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, external_job_id, source_name, title, company, location,
                   apply_url, status, notes, applied_at
            FROM job_applications
            WHERE user_email = ?
            ORDER BY applied_at DESC
        """, (user_email,))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        applications = []
        for row in rows:
            row = dict_from_row(row)
            applications.append({
                "id": row["id"],
                "external_job_id": row["external_job_id"],
                "source_name": row["source_name"],
                "title": row["title"],
                "company": row["company"],
                "location": row["location"],
                "apply_url": row["apply_url"],
                "status": row["status"],
                "notes": row["notes"] or "",
                "applied_at": row["applied_at"] or "",
            })
        return applications

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, external_job_id, source_name, title, company, location,
               apply_url, status, notes, applied_at
        FROM job_applications
        WHERE user_email = ?
        ORDER BY applied_at DESC
    """, (user_email,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    applications = []
    for row in rows:
        applications.append({
            "id": row[0],
            "external_job_id": row[1],
            "source_name": row[2],
            "title": row[3],
            "company": row[4],
            "location": row[5],
            "apply_url": row[6],
            "status": row[7],
            "notes": row[8] or "",
            "applied_at": str(row[9]) if row[9] else "",
        })
    return applications


def update_job_application_status_for_user(user_email: str, application_id: int, status: str):
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE job_applications
            SET status = ?
            WHERE id = ? AND user_email = ?
        """, (status, application_id, user_email))
        conn.commit()
        cursor.close()
        conn.close()
        return

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE job_applications
        SET status = ?
        WHERE id = ? AND user_email = ?
    """, (status, application_id, user_email))
    conn.commit()
    cursor.close()
    conn.close()


def update_job_application_notes_for_user(user_email: str, application_id: int, notes: str):
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE job_applications
            SET notes = ?
            WHERE id = ? AND user_email = ?
        """, (notes, application_id, user_email))
        conn.commit()
        cursor.close()
        conn.close()
        return

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE job_applications
        SET notes = ?
        WHERE id = ? AND user_email = ?
    """, (notes, application_id, user_email))
    conn.commit()
    cursor.close()
    conn.close()

# =========================================================
# CAREER TARGET HELPERS
# =========================================================
def get_user_career_target(user_email: str) -> str:
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT target_role
            FROM user_career_targets
            WHERE user_email = ?
        """, (user_email,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            return ""

        row = dict_from_row(row)
        return row["target_role"]

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT target_role
        FROM user_career_targets
        WHERE user_email = ?
    """, (user_email,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if not row:
        return ""

    return row[0]


def save_user_career_target(user_email: str, target_role: str):
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id
            FROM user_career_targets
            WHERE user_email = ?
        """, (user_email,))
        existing = cursor.fetchone()

        if existing:
            cursor.execute("""
                UPDATE user_career_targets
                SET target_role = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_email = ?
            """, (target_role, user_email))
        else:
            cursor.execute("""
                INSERT INTO user_career_targets (user_email, target_role)
                VALUES (?, ?)
            """, (user_email, target_role))

        conn.commit()
        cursor.close()
        conn.close()
        return

    conn = get_azure_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id
        FROM user_career_targets
        WHERE user_email = ?
    """, (user_email,))
    existing = cursor.fetchone()

    if existing:
        cursor.execute("""
            UPDATE user_career_targets
            SET target_role = ?, updated_at = GETDATE()
            WHERE user_email = ?
        """, (target_role, user_email))
    else:
        cursor.execute("""
            INSERT INTO user_career_targets (user_email, target_role)
            VALUES (?, ?)
        """, (user_email, target_role))

    conn.commit()
    cursor.close()
    conn.close()

# =========================================================
# EMAIL ALERT PREFERENCES / HISTORY
# =========================================================
def ensure_email_preferences_exist(user_email: str):
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id
            FROM email_alert_preferences
            WHERE user_email = ?
        """, (user_email,))
        existing = cursor.fetchone()

        if not existing:
            cursor.execute("""
                INSERT INTO email_alert_preferences (
                    user_email, alerts_enabled, frequency, preferred_location, jobs_per_email
                )
                VALUES (?, ?, ?, ?, ?)
            """, (user_email, 1, "daily", "", 5))
            conn.commit()

        cursor.close()
        conn.close()
        return

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id
        FROM email_alert_preferences
        WHERE user_email = ?
    """, (user_email,))
    existing = cursor.fetchone()

    if not existing:
        cursor.execute("""
            INSERT INTO email_alert_preferences (
                user_email, alerts_enabled, frequency, preferred_location, jobs_per_email
            )
            VALUES (?, ?, ?, ?, ?)
        """, (user_email, 1, "daily", "", 5))
        conn.commit()

    cursor.close()
    conn.close()


def get_email_preferences_by_user(user_email: str) -> dict:
    ensure_email_preferences_exist(user_email)

    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT user_email, alerts_enabled, frequency, preferred_location,
                   jobs_per_email, last_sent_at
            FROM email_alert_preferences
            WHERE user_email = ?
        """, (user_email,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            return {
                "user_email": user_email,
                "alerts_enabled": True,
                "frequency": "daily",
                "preferred_location": "",
                "jobs_per_email": 5,
                "last_sent_at": None,
            }

        row = dict_from_row(row)
        return {
            "user_email": row["user_email"],
            "alerts_enabled": bool(row["alerts_enabled"]),
            "frequency": row["frequency"] or "daily",
            "preferred_location": row["preferred_location"] or "",
            "jobs_per_email": int(row["jobs_per_email"] or 5),
            "last_sent_at": row["last_sent_at"],
        }

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT user_email, alerts_enabled, frequency, preferred_location,
               jobs_per_email, last_sent_at
        FROM email_alert_preferences
        WHERE user_email = ?
    """, (user_email,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if not row:
        return {
            "user_email": user_email,
            "alerts_enabled": True,
            "frequency": "daily",
            "preferred_location": "",
            "jobs_per_email": 5,
            "last_sent_at": None,
        }

    return {
        "user_email": row[0],
        "alerts_enabled": bool(row[1]),
        "frequency": row[2] or "daily",
        "preferred_location": row[3] or "",
        "jobs_per_email": int(row[4] or 5),
        "last_sent_at": str(row[5]) if row[5] else None,
    }


def update_email_preferences_for_user(
    user_email: str,
    alerts_enabled: bool,
    frequency: str,
    preferred_location: str,
    jobs_per_email: int,
):
    ensure_email_preferences_exist(user_email)

    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE email_alert_preferences
            SET alerts_enabled = ?,
                frequency = ?,
                preferred_location = ?,
                jobs_per_email = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_email = ?
        """, (
            1 if alerts_enabled else 0,
            frequency,
            preferred_location,
            jobs_per_email,
            user_email,
        ))
        conn.commit()
        cursor.close()
        conn.close()
        return

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE email_alert_preferences
        SET alerts_enabled = ?,
            frequency = ?,
            preferred_location = ?,
            jobs_per_email = ?,
            updated_at = GETDATE()
        WHERE user_email = ?
    """, (
        1 if alerts_enabled else 0,
        frequency,
        preferred_location,
        jobs_per_email,
        user_email,
    ))
    conn.commit()
    cursor.close()
    conn.close()


def update_email_last_sent_for_user(user_email: str):
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE email_alert_preferences
            SET last_sent_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_email = ?
        """, (user_email,))
        conn.commit()
        cursor.close()
        conn.close()
        return

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE email_alert_preferences
        SET last_sent_at = GETDATE(),
            updated_at = GETDATE()
        WHERE user_email = ?
    """, (user_email,))
    conn.commit()
    cursor.close()
    conn.close()


def get_all_alert_enabled_users() -> list[dict]:
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.email, u.name
            FROM users u
            INNER JOIN email_alert_preferences p
                ON u.email = p.user_email
            WHERE p.alerts_enabled = 1
        """)
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        users = []
        for row in rows:
            row = dict_from_row(row)
            users.append({
                "email": row["email"],
                "name": row["name"],
            })
        return users

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.email, u.name
        FROM users u
        INNER JOIN email_alert_preferences p
            ON u.email = p.user_email
        WHERE p.alerts_enabled = 1
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    return [{"email": row[0], "name": row[1]} for row in rows]


def has_job_been_emailed_to_user(user_email: str, external_job_id: str) -> bool:
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id
            FROM emailed_jobs_history
            WHERE user_email = ? AND external_job_id = ?
        """, (user_email, external_job_id))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return row is not None

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id
        FROM emailed_jobs_history
        WHERE user_email = ? AND external_job_id = ?
    """, (user_email, external_job_id))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return row is not None


def record_emailed_job(user_email: str, external_job_id: str, title: str):
    if db_is_sqlite():
        conn = get_sqlite_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO emailed_jobs_history (user_email, external_job_id, title)
            VALUES (?, ?, ?)
        """, (user_email, external_job_id, title))
        conn.commit()
        cursor.close()
        conn.close()
        return

    conn = get_azure_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO emailed_jobs_history (user_email, external_job_id, title)
        VALUES (?, ?, ?)
    """, (user_email, external_job_id, title))
    conn.commit()
    cursor.close()
    conn.close()

# =========================================================
# NLP HELPERS
# =========================================================
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

# =========================================================
# FILE HELPERS
# =========================================================
def upload_cv_to_azure(file_path: str, blob_name: str) -> Optional[str]:
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

# =========================================================
# MATCHING / EXPLANATION
# =========================================================
def generate_job_explanation(matched_skills, missing_skills):
    if matched_skills and not missing_skills:
        return f"You strongly match this role because you already have {', '.join(matched_skills[:4])}."
    if matched_skills and missing_skills:
        return (
            f"You match this role through {', '.join(matched_skills[:4])}, "
            f"but could improve with {', '.join(missing_skills[:4])}."
        )
    if missing_skills:
        return f"This role highlights useful growth areas like {', '.join(missing_skills[:4])}."
    return "This role was surfaced as a relevant live opportunity based on your profile."

# =========================================================
# CV TIPS / READINESS
# =========================================================
def generate_cv_improvement_tips(skills: list, qualifications: list, text_preview: str) -> list:
    tips = []

    lowered_skills = [str(skill).lower() for skill in skills]
    lowered_quals = [str(q).lower() for q in qualifications]
    preview = (text_preview or "").lower()

    if "github" not in preview and "portfolio" not in preview:
        tips.append("Add a GitHub or portfolio link to make your profile stronger.")

    if "project" not in preview:
        tips.append("Include more project work so employers can see practical experience.")

    if not any(skill in lowered_skills for skill in ["sql", "python", "java", "react", "aws", "azure"]):
        tips.append("Add more technical tools and platforms to improve matching accuracy.")

    if "experience" not in preview and "internship" not in preview:
        tips.append("Highlight work experience, internships, or placement projects more clearly.")

    if not lowered_quals:
        tips.append("State your degree or certifications more clearly in the CV.")

    if len(preview) < 250:
        tips.append("Your CV preview looks short. Add more detail on skills, projects, and achievements.")

    if not tips:
        tips.append("Your CV looks strong. Focus on role-specific keywords for better job matches.")

    return tips[:5]


def calculate_job_readiness(skills: list, qualifications: list, saved_jobs: list, applications: list) -> dict:
    score = 0
    reasons = []

    skill_count = len(skills or [])
    qual_count = len(qualifications or [])
    saved_count = len(saved_jobs or [])
    applications_count = len(applications or [])

    if skill_count >= 8:
        score += 30
        reasons.append("Strong visible technical skill base.")
    elif skill_count >= 4:
        score += 20
        reasons.append("Moderate skill coverage detected.")
    else:
        score += 10
        reasons.append("More visible skills should be added to improve matching.")

    if qual_count >= 2:
        score += 20
        reasons.append("Qualifications are clearly visible.")
    elif qual_count >= 1:
        score += 12
        reasons.append("At least one qualification is visible.")
    else:
        score += 5
        reasons.append("Qualifications are not clearly visible.")

    if saved_count >= 3:
        score += 15
        reasons.append("You are actively reviewing relevant roles.")
    elif saved_count >= 1:
        score += 8
        reasons.append("You have started saving target roles.")

    if applications_count >= 3:
        score += 20
        reasons.append("You are actively applying to jobs.")
    elif applications_count >= 1:
        score += 12
        reasons.append("You have started applying to live jobs.")

    if skill_count >= 1 and applications_count >= 1:
        score += 10

    if score >= 80:
        label = "High"
        summary = "You look job-ready for the roles currently being targeted."
    elif score >= 55:
        label = "Medium"
        summary = "You are on the right track, but a few improvements would help."
    else:
        label = "Low"
        summary = "Your profile needs more improvement before it becomes competitive."

    return {
        "score": min(score, 100),
        "label": label,
        "summary": summary,
        "reasons": reasons[:4],
    }


def get_latest_cv_data(user_email: str) -> dict:
    uploaded_cvs = get_uploaded_cvs_by_user(user_email)
    if not uploaded_cvs:
        return {
            "skills": [],
            "qualifications": [],
            "text_preview": "",
        }

    latest = uploaded_cvs[0]
    return {
        "skills": latest.get("skills", []),
        "qualifications": latest.get("qualifications", []),
        "text_preview": latest.get("text_preview", ""),
    }

# =========================================================
# ADZUNA HELPERS
# =========================================================
def build_search_query_from_skills(skills: list[str], career_target: str = "") -> str:
    if career_target:
        mapping = {
            "Data Analyst": "data analyst",
            "Frontend Developer": "frontend developer",
            "Cloud Engineer": "cloud engineer",
            "Software Engineer": "software engineer",
            "Full Stack Developer": "full stack developer",
            "UI/UX Designer": "ui ux designer",
        }
        if career_target in mapping:
            return mapping[career_target]

    lowered_skills = [str(skill).lower().strip() for skill in skills]

    if any(
        skill in lowered_skills
        for skill in ["python", "sql", "data analysis", "data analytics", "power bi", "machine learning"]
    ):
        return "data analyst"

    if any(
        skill in lowered_skills
        for skill in ["react", "javascript", "typescript", "html", "css", "ui", "ux", "figma"]
    ):
        return "frontend developer"

    if any(
        skill in lowered_skills
        for skill in ["aws", "azure", "cloud", "docker", "kubernetes", "terraform", "devops"]
    ):
        return "cloud engineer"

    if any(
        skill in lowered_skills
        for skill in ["django", "flask", "java", "node.js", "c#", "c++"]
    ):
        return "software engineer"

    return "software engineer"


def normalize_adzuna_job(job: dict, user_skills: list[str], user_quals: list[str]) -> dict:
    title = job.get("title") or "Untitled role"
    company = (job.get("company") or {}).get("display_name", "")
    location = (job.get("location") or {}).get("display_name", "")
    description = job.get("description") or ""
    category = ((job.get("category") or {}).get("label", "") or "").replace(" Jobs", "")
    redirect_url = job.get("redirect_url") or ""

    combined_text = f"{title} {description} {category}".lower()

    normalized_user_skills = [str(skill).lower().strip() for skill in user_skills]
    normalized_user_quals = [str(q).lower().strip() for q in user_quals]

    matched_skills = []
    for skill in normalized_user_skills:
        if skill and skill in combined_text:
            matched_skills.append(skill)

    missing_skills = []
    for skill in SKILL_KEYWORDS:
        skill_lower = skill.lower()
        if skill_lower in combined_text and skill_lower not in normalized_user_skills:
            missing_skills.append(skill)

    missing_qualifications = []
    for qual in QUALIFICATION_KEYWORDS:
        qual_lower = qual.lower()
        if qual_lower in combined_text and qual_lower not in normalized_user_quals:
            missing_qualifications.append(qual)

    title_bonus = 0
    title_lower = title.lower()

    if "data" in title_lower and any(
        x in normalized_user_skills for x in ["python", "sql", "data analysis", "data analytics", "power bi"]
    ):
        title_bonus += 2

    if "frontend" in title_lower and any(
        x in normalized_user_skills for x in ["react", "javascript", "typescript", "html", "css"]
    ):
        title_bonus += 2

    if "cloud" in title_lower and any(
        x in normalized_user_skills for x in ["aws", "azure", "cloud", "docker", "kubernetes"]
    ):
        title_bonus += 2

    if "software" in title_lower or "engineer" in title_lower:
        if any(x in normalized_user_skills for x in ["java", "python", "flask", "django", "node.js"]):
            title_bonus += 2

    skill_score = len(matched_skills)
    qual_score = sum(1 for q in normalized_user_quals if q and q in combined_text)
    total_score = (skill_score * 2) + qual_score + title_bonus

    total_relevant = len(matched_skills) + len(missing_skills)
    match_percentage = (
        round((len(matched_skills) / total_relevant) * 100)
        if total_relevant > 0 else 15
    )

    if title_bonus > 0 and match_percentage < 35:
        match_percentage = 35

    explanation = generate_job_explanation(matched_skills, missing_skills)

    return {
        "job_id": f"adzuna-{job.get('id')}",
        "external_job_id": str(job.get("id")),
        "source_name": "Adzuna",
        "title": title,
        "company": company,
        "location": location,
        "industry": category,
        "description": description[:500],
        "apply_url": redirect_url,
        "redirect_url": redirect_url,
        "total_score": total_score,
        "skill_score": skill_score,
        "qual_score": qual_score,
        "match_percentage": match_percentage,
        "matched_skills": matched_skills,
        "missing_skills": missing_skills[:8],
        "missing_qualifications": missing_qualifications[:5],
        "explanation": explanation,
    }


def search_live_jobs_adzuna(
    skills: list[str],
    qualifications: list[str],
    where: str = "",
    page: int = 1,
    results_per_page: int = 20,
    career_target: str = "",
):
    if not ADZUNA_APP_ID or not ADZUNA_APP_KEY:
        raise RuntimeError("Adzuna API credentials are missing.")

    primary_query = build_search_query_from_skills(skills, career_target=career_target)

    fallback_queries = [
        primary_query,
        "software engineer",
        "data analyst",
        "frontend developer",
        "cloud engineer",
        "full stack developer",
    ]

    seen_queries = []
    unique_queries = []
    for query in fallback_queries:
        if query not in seen_queries:
            seen_queries.append(query)
            unique_queries.append(query)

    seen_ids = set()
    combined_jobs = []
    total_results_seen = 0

    for query_text in unique_queries:
        url = f"https://api.adzuna.com/v1/api/jobs/{ADZUNA_COUNTRY}/search/{page}"
        params = {
            "app_id": ADZUNA_APP_ID,
            "app_key": ADZUNA_APP_KEY,
            "results_per_page": results_per_page,
            "what": query_text,
            "content-type": "application/json",
        }

        if where:
            params["where"] = where

        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        payload = response.json()

        raw_jobs = payload.get("results", [])
        total_results_seen += len(raw_jobs)

        print(f"[ADZUNA] query='{query_text}' returned {len(raw_jobs)} raw jobs")

        normalized_jobs = [
            normalize_adzuna_job(job, skills, qualifications)
            for job in raw_jobs
        ]

        for job in normalized_jobs:
            unique_id = job.get("external_job_id") or job.get("job_id")
            if unique_id and unique_id not in seen_ids:
                seen_ids.add(unique_id)
                combined_jobs.append(job)

        if len(combined_jobs) >= 20:
            break

    combined_jobs.sort(
        key=lambda j: (
            j.get("match_percentage", 0),
            j.get("total_score", 0),
            len(j.get("matched_skills", [])),
        ),
        reverse=True,
    )

    top_jobs = combined_jobs[:20]

    print(f"[ADZUNA] returning {len(top_jobs)} jobs to frontend")

    return {
        "jobs": top_jobs,
        "metadata": {
            "source": "Adzuna",
            "query_used": primary_query,
            "career_target": career_target,
            "total_results_returned": total_results_seen,
            "jobs_with_matches": len(
                [job for job in top_jobs if (job.get("total_score", 0) or 0) > 0]
            ),
            "page": page,
            "results_per_page": results_per_page,
        },
    }

# =========================================================
# PROFILE ANALYTICS
# =========================================================
def build_profile_analytics(saved_jobs: list, uploaded_cvs: list, applications: list):
    skill_counter = {}
    qualification_counter = {}
    missing_skill_counter = {}
    role_counter = {}
    industry_counter = {}
    status_counter = {}

    total_match_rate = 0
    strong_matches = 0
    good_matches = 0
    weak_matches = 0

    for cv in uploaded_cvs:
        for skill in cv.get("skills", []):
            key = str(skill).strip().lower()
            if key:
                skill_counter[key] = skill_counter.get(key, 0) + 1

        for qual in cv.get("qualifications", []):
            key = str(qual).strip().lower()
            if key:
                qualification_counter[key] = qualification_counter.get(key, 0) + 1

    for job in saved_jobs:
        match_percentage = int(job.get("match_percentage", 0) or 0)
        total_match_rate += match_percentage

        if match_percentage >= 80:
            strong_matches += 1
        elif match_percentage >= 50:
            good_matches += 1
        else:
            weak_matches += 1

        role_name = job.get("title") or job.get("job_title") or "Untitled role"
        role_counter[role_name] = role_counter.get(role_name, 0) + 1

        industry_name = job.get("industry") or ""
        if industry_name:
            industry_counter[industry_name] = industry_counter.get(industry_name, 0) + 1

        for missing_skill in job.get("missing_skills", []):
            key = str(missing_skill).strip().lower()
            if key:
                missing_skill_counter[key] = missing_skill_counter.get(key, 0) + 1

    for application in applications:
        status = str(application.get("status", "Applied"))
        status_counter[status] = status_counter.get(status, 0) + 1

    all_extracted_skills = [
        skill for skill, _ in sorted(
            skill_counter.items(),
            key=lambda x: (-x[1], x[0])
        )
    ]

    all_extracted_qualifications = [
        qualification for qualification, _ in sorted(
            qualification_counter.items(),
            key=lambda x: (-x[1], x[0])
        )
    ]

    top_missing_skills = [
        {"skill": skill, "count": count}
        for skill, count in sorted(
            missing_skill_counter.items(),
            key=lambda x: (-x[1], x[0])
        )[:5]
    ]

    role_breakdown = [
        {"name": name, "count": count}
        for name, count in sorted(
            role_counter.items(),
            key=lambda x: (-x[1], x[0])
        )[:5]
    ]

    application_status_breakdown = [
        {"name": name, "count": count}
        for name, count in sorted(
            status_counter.items(),
            key=lambda x: (-x[1], x[0])
        )
    ]

    best_fit_role = role_breakdown[0]["name"] if role_breakdown else ""
    best_fit_industry = (
        sorted(industry_counter.items(), key=lambda x: (-x[1], x[0]))[0][0]
        if industry_counter else ""
    )

    average_match_rate = round(total_match_rate / len(saved_jobs)) if saved_jobs else 0

    return {
        "all_extracted_skills": all_extracted_skills,
        "all_extracted_qualifications": all_extracted_qualifications,
        "analytics": {
            "average_match_rate": average_match_rate,
            "saved_jobs_count": len(saved_jobs),
            "uploaded_cv_count": len(uploaded_cvs),
            "applications_count": len(applications),
            "applied_jobs_count": len(applications),
            "interviewing_count": len([a for a in applications if a.get("status") == "Interviewing"]),
            "offer_count": len([a for a in applications if a.get("status") == "Offer"]),
            "rejected_count": len([a for a in applications if a.get("status") == "Rejected"]),
            "strong_matches": strong_matches,
            "good_matches": good_matches,
            "weak_matches": weak_matches,
            "top_missing_skills": top_missing_skills,
            "role_breakdown": role_breakdown,
            "application_status_breakdown": application_status_breakdown,
            "best_fit_role": best_fit_role,
            "best_fit_industry": best_fit_industry,
        },
    }

# =========================================================
# EMAIL HELPERS
# =========================================================
def can_send_email() -> bool:
    return bool(EMAIL_ADDRESS and EMAIL_APP_PASSWORD and EMAIL_ALERTS_ENABLED)


def send_email_html(to_email: str, subject: str, html_body: str, plain_body: str):
    if not can_send_email():
        raise RuntimeError("Email sender credentials are missing or email alerts are disabled.")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = EMAIL_ADDRESS
    msg["To"] = to_email

    msg.attach(MIMEText(plain_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(EMAIL_ADDRESS, EMAIL_APP_PASSWORD)
        server.sendmail(EMAIL_ADDRESS, to_email, msg.as_string())


def build_email_digest_content(user_name: str, career_target: str, jobs: list[dict]):
    target_text = career_target or "your profile"

    plain_lines = [
        f"Hi {user_name},",
        "",
        f"Here are new live jobs matched to {target_text}:",
        "",
    ]

    html_items = []

    for job in jobs:
        title = job.get("title", "Untitled role")
        company = job.get("company", "")
        location = job.get("location", "")
        match_percentage = job.get("match_percentage", 0)
        explanation = job.get("explanation", "Matched to your profile.")
        apply_url = job.get("apply_url") or job.get("redirect_url") or "#"

        plain_lines.extend([
            f"{title} - {company} - {location}",
            f"Match: {match_percentage}%",
            f"Why: {explanation}",
            f"Apply: {apply_url}",
            "",
        ])

        html_items.append(f"""
            <div style="border:1px solid #f0d7c2;border-radius:14px;padding:16px;margin-bottom:14px;background:#fffaf6;">
                <h3 style="margin:0 0 8px 0;color:#231f20;">{title}</h3>
                <p style="margin:0 0 8px 0;color:#5c4f47;">{company} • {location}</p>
                <p style="margin:0 0 8px 0;"><strong>Match:</strong> {match_percentage}%</p>
                <p style="margin:0 0 12px 0;color:#5c4f47;"><strong>Why this fits:</strong> {explanation}</p>
                <a href="{apply_url}" style="display:inline-block;background:#ff6200;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:700;">Apply Now</a>
            </div>
        """)

    plain_lines.append("Open Just Apply to review more jobs, saved roles, and analytics.")
    plain_body = "\n".join(plain_lines)

    html_body = f"""
        <html>
            <body style="font-family:Arial,sans-serif;background:#f7f1eb;padding:24px;color:#231f20;">
                <div style="max-width:700px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px;border:1px solid #f0d7c2;">
                    <p style="color:#ff6200;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin:0 0 8px 0;">Just Apply</p>
                    <h1 style="margin:0 0 16px 0;">New jobs matched to {target_text}</h1>
                    <p style="margin:0 0 22px 0;color:#5c4f47;">Hi {user_name}, here are fresh live opportunities matched to your CV, career target, and previous activity.</p>
                    {''.join(html_items)}
                    <p style="margin-top:24px;color:#5c4f47;">Open Just Apply to review more jobs, track applications, and improve your match rate.</p>
                </div>
            </body>
        </html>
    """

    return plain_body, html_body


def should_send_alert_today(preferences: dict) -> bool:
    if not preferences.get("alerts_enabled", False):
        return False

    frequency = preferences.get("frequency", "daily")
    last_sent_at = preferences.get("last_sent_at")

    if not last_sent_at:
        return True

    try:
        last_dt = datetime.fromisoformat(str(last_sent_at).replace("Z", ""))
    except Exception:
        return True

    now = datetime.now()

    if frequency == "daily":
        return (now - last_dt) >= timedelta(days=1)

    if frequency == "weekly":
        return (now - last_dt) >= timedelta(days=7)

    return False


def get_email_jobs_for_user(user_email: str, user_name: str) -> list[dict]:
    preferences = get_email_preferences_by_user(user_email)
    latest_cv = get_latest_cv_data(user_email)
    career_target = get_user_career_target(user_email)
    applications = get_job_applications_by_user(user_email)

    applied_job_ids = {
        str(app.get("external_job_id"))
        for app in applications
        if app.get("external_job_id")
    }

    results = search_live_jobs_adzuna(
        skills=latest_cv.get("skills", []),
        qualifications=latest_cv.get("qualifications", []),
        where=preferences.get("preferred_location", ""),
        page=1,
        results_per_page=max(10, preferences.get("jobs_per_email", 5) * 2),
        career_target=career_target,
    )

    filtered_jobs = []
    for job in results.get("jobs", []):
        external_job_id = str(job.get("external_job_id", ""))
        if not external_job_id:
            continue
        if external_job_id in applied_job_ids:
            continue
        if has_job_been_emailed_to_user(user_email, external_job_id):
            continue
        filtered_jobs.append(job)

    jobs_per_email = max(1, min(int(preferences.get("jobs_per_email", 5)), 10))
    return filtered_jobs[:jobs_per_email]


def send_job_alert_email_to_user(user_email: str, user_name: str):
    if not can_send_email():
        raise RuntimeError("Email is not configured.")

    preferences = get_email_preferences_by_user(user_email)
    if not should_send_alert_today(preferences):
        return {
            "sent": False,
            "reason": "Not due yet",
        }

    career_target = get_user_career_target(user_email)
    jobs = get_email_jobs_for_user(user_email, user_name)

    if not jobs:
        return {
            "sent": False,
            "reason": "No new jobs found",
        }

    subject = f"Just Apply: New jobs matched to {career_target or 'your profile'}"
    plain_body, html_body = build_email_digest_content(user_name, career_target, jobs)

    send_email_html(
        to_email=user_email,
        subject=subject,
        html_body=html_body,
        plain_body=plain_body,
    )

    for job in jobs:
        record_emailed_job(
            user_email=user_email,
            external_job_id=str(job.get("external_job_id", "")),
            title=job.get("title", ""),
        )

    update_email_last_sent_for_user(user_email)

    return {
        "sent": True,
        "jobs_sent": len(jobs),
        "subject": subject,
    }


def run_scheduled_email_alerts():
    print("[EMAIL ALERTS] Scheduler tick started")

    if not can_send_email():
        print("[EMAIL ALERTS] Skipped - email not configured")
        return

    users = get_all_alert_enabled_users()
    print(f"[EMAIL ALERTS] Users with alerts enabled: {len(users)}")

    for user in users:
        try:
            result = send_job_alert_email_to_user(
                user_email=user["email"],
                user_name=user["name"],
            )
            print(f"[EMAIL ALERTS] {user['email']} -> {result}")
        except Exception as e:
            print(f"[EMAIL ALERTS] Failed for {user['email']}: {e}")

# =========================================================
# ROUTES
# =========================================================
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "db_mode": DB_MODE}), 200


@app.route("/api/debug-db-mode", methods=["GET"])
def debug_db_mode():
    return jsonify({
        "db_mode": DB_MODE,
        "sqlite_path": SQLITE_PATH,
    }), 200


@app.route("/api/test-adzuna", methods=["GET"])
def test_adzuna():
    app_id = os.getenv("ADZUNA_APP_ID")
    app_key = os.getenv("ADZUNA_APP_KEY")
    country = os.getenv("ADZUNA_COUNTRY", "us")

    url = f"https://api.adzuna.com/v1/api/jobs/{country}/search/1"
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "results_per_page": 5,
        "what": "software engineer",
        "content-type": "application/json",
    }

    try:
        response = requests.get(url, params=params, timeout=20)
        response.raise_for_status()
        return jsonify(response.json()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/test-adzuna-raw", methods=["GET"])
def test_adzuna_raw():
    try:
        url = f"https://api.adzuna.com/v1/api/jobs/{ADZUNA_COUNTRY}/search/1"
        params = {
            "app_id": ADZUNA_APP_ID,
            "app_key": ADZUNA_APP_KEY,
            "results_per_page": 10,
            "what": "software engineer",
            "content-type": "application/json",
        }

        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        payload = response.json()

        return jsonify({
            "count": len(payload.get("results", [])),
            "sample_titles": [job.get("title") for job in payload.get("results", [])[:5]],
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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

    existing_user = get_user_by_email(email)
    if existing_user:
        return jsonify({"error": "User already exists"}), 400

    password_hash = generate_password_hash(password)
    user = create_user(name, email, password_hash)
    access_token = create_access_token(identity=email)

    return jsonify({
        "message": "User registered successfully",
        "access_token": access_token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
        },
        "db_mode": DB_MODE,
    }), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", "")).strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = get_user_by_email(email)

    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    if not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    access_token = create_access_token(identity=user["email"])

    return jsonify({
        "message": "Login successful",
        "access_token": access_token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
        },
        "db_mode": DB_MODE,
    }), 200


@app.route("/api/me", methods=["GET"])
@jwt_required()
def me():
    email = get_jwt_identity()
    user = get_user_by_email(email)

    if not user:
        return jsonify({"error": "User not found"}), 404

    return jsonify({
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
        },
        "db_mode": DB_MODE,
    }), 200


@app.route("/api/logout", methods=["POST"])
def logout():
    return jsonify({"message": "Logged out"}), 200


@app.route("/api/career-target", methods=["GET"])
@jwt_required()
def get_career_target():
    user_email = get_jwt_identity()
    target_role = get_user_career_target(user_email)
    return jsonify({
        "career_target": target_role,
        "db_mode": DB_MODE,
    }), 200


@app.route("/api/career-target", methods=["POST"])
@jwt_required()
def update_career_target():
    user_email = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    target_role = str(data.get("target_role", "")).strip()

    if target_role not in ALLOWED_CAREER_TARGETS:
        return jsonify({"error": "Invalid career target"}), 400

    save_user_career_target(user_email, target_role)

    return jsonify({
        "message": "Career target updated",
        "career_target": target_role,
        "db_mode": DB_MODE,
    }), 200


@app.route("/api/email-preferences", methods=["GET"])
@jwt_required()
def get_email_preferences():
    user_email = get_jwt_identity()
    preferences = get_email_preferences_by_user(user_email)
    return jsonify({
        "preferences": preferences,
        "db_mode": DB_MODE,
    }), 200


@app.route("/api/email-preferences", methods=["POST"])
@jwt_required()
def update_email_preferences():
    user_email = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    alerts_enabled = bool(data.get("alerts_enabled", True))
    frequency = str(data.get("frequency", "daily")).strip().lower()
    preferred_location = str(data.get("preferred_location", "")).strip()
    jobs_per_email = int(data.get("jobs_per_email", 5) or 5)

    if frequency not in ALERT_FREQUENCIES:
        return jsonify({"error": "Invalid frequency"}), 400

    if jobs_per_email < 1 or jobs_per_email > 10:
        return jsonify({"error": "jobs_per_email must be between 1 and 10"}), 400

    update_email_preferences_for_user(
        user_email=user_email,
        alerts_enabled=alerts_enabled,
        frequency=frequency,
        preferred_location=preferred_location,
        jobs_per_email=jobs_per_email,
    )

    preferences = get_email_preferences_by_user(user_email)

    return jsonify({
        "message": "Email preferences updated",
        "preferences": preferences,
        "db_mode": DB_MODE,
    }), 200


@app.route("/api/test-send-job-alert", methods=["POST"])
@jwt_required()
def test_send_job_alert():
    user_email = get_jwt_identity()
    user = get_user_by_email(user_email)

    if not user:
        return jsonify({"error": "User not found"}), 404

    try:
        result = send_job_alert_email_to_user(
            user_email=user["email"],
            user_name=user["name"],
        )
        return jsonify({
            "message": "Job alert test executed",
            "result": result,
            "db_mode": DB_MODE,
        }), 200
    except Exception as e:
        return jsonify({"error": f"Could not send email alert: {str(e)}"}), 500


@app.route("/api/upload-cv", methods=["POST"])
@jwt_required()
def upload_and_parse_cv():
    user_email = get_jwt_identity()

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

    text = clean_extracted_text(text)
    skills = extract_skills(text)
    qualifications = extract_qualifications(text)
    preview = text[:1200] if text else ""

    blob_url = upload_cv_to_azure(save_path, filename)

    save_cv_for_user(
        user_email=user_email,
        original_name=file.filename,
        stored_filename=filename,
        azure_blob_url=blob_url,
        skills=skills,
        qualifications=qualifications,
        text_preview=preview,
    )

    try:
        if os.path.exists(save_path):
            os.remove(save_path)
    except Exception as e:
        print("Could not delete temp file:", e)

    return jsonify({
        "message": "CV uploaded & parsed successfully",
        "original_name": file.filename,
        "skills": skills,
        "qualifications": qualifications,
        "text_preview": preview,
        "azure_blob_url": blob_url,
        "db_mode": DB_MODE,
    }), 201


@app.route("/api/live-jobs", methods=["POST"])
@jwt_required()
def live_jobs():
    user_email = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    raw_skills = data.get("skills", [])
    raw_quals = data.get("qualifications", [])
    where = str(data.get("where", "")).strip()
    page = int(data.get("page", 1) or 1)
    results_per_page = int(data.get("results_per_page", 20) or 20)
    career_target = str(data.get("career_target", "")).strip()

    if not career_target:
        career_target = get_user_career_target(user_email)

    if not isinstance(raw_skills, list):
        return jsonify({"error": "skills must be a list"}), 400

    if not isinstance(raw_quals, list):
        return jsonify({"error": "qualifications must be a list"}), 400

    try:
        results = search_live_jobs_adzuna(
            skills=raw_skills,
            qualifications=raw_quals,
            where=where,
            page=page,
            results_per_page=results_per_page,
            career_target=career_target,
        )
        results["db_mode"] = DB_MODE
        return jsonify(results), 200
    except Exception as e:
        print("Adzuna live jobs error:", e)
        return jsonify({"error": f"Could not fetch live jobs: {str(e)}"}), 500


@app.route("/api/save-job", methods=["POST"])
@jwt_required()
def save_job():
    user_email = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    job = data.get("job")

    if not isinstance(job, dict):
        return jsonify({"error": "No job provided"}), 400

    saved = save_job_for_user(user_email, job)
    jobs = get_saved_jobs_by_user(user_email)

    if not saved:
        return jsonify({
            "message": "Job already saved",
            "saved_jobs": jobs,
            "db_mode": DB_MODE,
        }), 200

    return jsonify({
        "message": "Job saved successfully",
        "saved_jobs": jobs,
        "db_mode": DB_MODE,
    }), 201


@app.route("/api/saved-jobs", methods=["GET"])
@jwt_required()
def get_saved_jobs():
    user_email = get_jwt_identity()
    jobs = get_saved_jobs_by_user(user_email)
    return jsonify({"saved_jobs": jobs, "db_mode": DB_MODE}), 200


@app.route("/api/remove-saved-job", methods=["POST"])
@jwt_required()
def remove_saved_job():
    user_email = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    job_id = data.get("job_id")

    if not job_id:
        return jsonify({"error": "job_id is required"}), 400

    remove_saved_job_for_user(user_email, job_id)
    jobs = get_saved_jobs_by_user(user_email)

    return jsonify({
        "message": "Job removed",
        "saved_jobs": jobs,
        "db_mode": DB_MODE,
    }), 200


@app.route("/api/apply-job", methods=["POST"])
@jwt_required()
def apply_job():
    user_email = get_jwt_identity()
    data = request.get_json(silent=True) or {}
    job = data.get("job")

    if not isinstance(job, dict):
        return jsonify({"error": "No job provided"}), 400

    apply_url = job.get("apply_url") or job.get("redirect_url")
    if not apply_url:
        return jsonify({"error": "This job has no application URL"}), 400

    save_job_application_for_user(
        user_email=user_email,
        job=job,
        status="Applied"
    )

    applications = get_job_applications_by_user(user_email)

    return jsonify({
        "message": "Application recorded",
        "apply_url": apply_url,
        "applications": applications,
        "db_mode": DB_MODE,
    }), 200


@app.route("/api/applications", methods=["GET"])
@jwt_required()
def get_applications():
    user_email = get_jwt_identity()
    applications = get_job_applications_by_user(user_email)
    return jsonify({"applications": applications, "db_mode": DB_MODE}), 200


@app.route("/api/update-application-status", methods=["POST"])
@jwt_required()
def update_application_status():
    user_email = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    application_id = data.get("application_id")
    status = str(data.get("status", "")).strip()

    if not application_id:
        return jsonify({"error": "application_id is required"}), 400

    if status not in ALLOWED_APPLICATION_STATUSES:
        return jsonify({"error": "Invalid status"}), 400

    update_job_application_status_for_user(user_email, int(application_id), status)
    applications = get_job_applications_by_user(user_email)

    return jsonify({
        "message": "Application status updated",
        "applications": applications,
        "db_mode": DB_MODE,
    }), 200


@app.route("/api/update-application-notes", methods=["POST"])
@jwt_required()
def update_application_notes():
    user_email = get_jwt_identity()
    data = request.get_json(silent=True) or {}

    application_id = data.get("application_id")
    notes = str(data.get("notes", "")).strip()

    if not application_id:
        return jsonify({"error": "application_id is required"}), 400

    update_job_application_notes_for_user(user_email, int(application_id), notes)
    applications = get_job_applications_by_user(user_email)

    return jsonify({
        "message": "Application notes updated",
        "applications": applications,
        "db_mode": DB_MODE,
    }), 200


@app.route("/api/profile-data", methods=["GET"])
@jwt_required()
def profile_data():
    user_email = get_jwt_identity()
    user = get_user_by_email(user_email)

    if not user:
        return jsonify({"error": "User not found"}), 404

    saved_jobs = get_saved_jobs_by_user(user_email)
    uploaded_cvs = get_uploaded_cvs_by_user(user_email)
    applications = get_job_applications_by_user(user_email)
    career_target = get_user_career_target(user_email)
    email_preferences = get_email_preferences_by_user(user_email)

    profile_bits = build_profile_analytics(
        saved_jobs=saved_jobs,
        uploaded_cvs=uploaded_cvs,
        applications=applications,
    )

    latest_cv = get_latest_cv_data(user_email)
    readiness = calculate_job_readiness(
        skills=latest_cv.get("skills", []),
        qualifications=latest_cv.get("qualifications", []),
        saved_jobs=saved_jobs,
        applications=applications,
    )
    cv_tips = generate_cv_improvement_tips(
        skills=latest_cv.get("skills", []),
        qualifications=latest_cv.get("qualifications", []),
        text_preview=latest_cv.get("text_preview", ""),
    )

    return jsonify({
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
        },
        "saved_jobs": saved_jobs,
        "uploaded_cvs": uploaded_cvs,
        "applications": applications,
        "all_extracted_skills": profile_bits["all_extracted_skills"],
        "all_extracted_qualifications": profile_bits["all_extracted_qualifications"],
        "analytics": profile_bits["analytics"],
        "career_target": career_target,
        "job_readiness": readiness,
        "cv_tips": cv_tips,
        "email_preferences": email_preferences,
        "db_mode": DB_MODE,
    }), 200

# =========================================================
# SCHEDULER
# =========================================================
scheduler = BackgroundScheduler()


def start_scheduler():
    if not EMAIL_ALERTS_ENABLED:
        print("[EMAIL ALERTS] Scheduler disabled by env")
        return

    if scheduler.get_jobs():
        return

    scheduler.add_job(
        func=run_scheduled_email_alerts,
        trigger="cron",
        hour=EMAIL_ALERTS_HOUR,
        minute=EMAIL_ALERTS_MINUTE,
        id="daily_job_alerts",
        replace_existing=True,
    )
    scheduler.start()
    print(f"[EMAIL ALERTS] Scheduler started for {EMAIL_ALERTS_HOUR:02d}:{EMAIL_ALERTS_MINUTE:02d}")

# =========================================================
# RUN
# =========================================================
if __name__ == "__main__":
    print("SQL SERVER =", AZURE_SQL_SERVER)
    print("SQL DATABASE =", AZURE_SQL_DATABASE)
    print("SQL USER =", AZURE_SQL_USERNAME)
    print("Available ODBC drivers:", pyodbc.drivers())
    print("ADZUNA COUNTRY =", ADZUNA_COUNTRY)
    print("ADZUNA APP ID FOUND =", bool(ADZUNA_APP_ID))
    print("ADZUNA APP KEY FOUND =", bool(ADZUNA_APP_KEY))
    print("EMAIL ADDRESS FOUND =", bool(EMAIL_ADDRESS))
    print("EMAIL APP PASSWORD FOUND =", bool(EMAIL_APP_PASSWORD))

    probe_db_mode()
    init_db()
    start_scheduler()

    app.run(host="0.0.0.0", port=5000, debug=True)
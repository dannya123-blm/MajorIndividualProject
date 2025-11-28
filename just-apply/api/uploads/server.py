import os
from datetime import datetime

from flask import Flask, request, jsonify
from flask_cors import CORS

from PyPDF2 import PdfReader
from docx import Document

import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize

from azure.storage.blob import BlobServiceClient
from dotenv import load_dotenv

import pandas as pd  

# ---------- Env + Azure setup ----------
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

# ---------- Flask setup ----------

app = Flask(__name__)
CORS(app)

# absolute path to folder containing this file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Local folder just for temporary storage (optional)
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ---------- Load job posts CSV ----------

JOB_CSV_PATH = os.path.join(BASE_DIR, "jobPosts", "jobposts.csv")

print("Looking for jobposts.csv at:", JOB_CSV_PATH)
try:
    job_df = pd.read_csv(JOB_CSV_PATH)
    print(f"Loaded {len(job_df)} job postings from {JOB_CSV_PATH}")
except Exception as e:
    print("ERROR loading jobposts.csv:", e)
    job_df = None

# ---------- NLTK setup ----------

# Make sure NLTK data is available 
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
            # phrase like "machine learning"
            if kw_lower in token_text:
                found.append(kw)
        else:
            # single word like "python"
            if kw_lower in token_set:
                found.append(kw)

    # remove duplicates, keep order
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


# ---------- Azure helper ----------

def upload_cv_to_azure(file_path: str, blob_name: str) -> str | None:
    """
    Uploads the file at file_path to Azure Blob Storage as blob_name
    and returns the blob URL. If Azure is not configured, returns None.
    """
    if container_client is None:
        # Azure not configured; skip upload
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


# ---------- Text extraction helpers ----------

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


# ---------- Routes ----------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/api/upload-cv", methods=["POST"])
def upload_and_parse_cv():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    # build timestamped filename
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"{timestamp}-{file.filename}"

    # save temporarily to local disk
    save_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(save_path)

    # extract text
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

    # upload to Azure Blob Storage
    blob_url = upload_cv_to_azure(save_path, filename)

    # optional: clean up local file
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
        "azure_blob_url": blob_url,  # None if Azure not configured
    }), 201


@app.route("/api/match-jobs", methods=["POST"])
def match_jobs():
    """
    Compare extracted skills/qualifications against jobposts.csv
    and return the best matching jobs.
    """
    global job_df
    if job_df is None:
        return jsonify({"error": "Job dataset not loaded on server"}), 500

    data = request.get_json(silent=True) or {}
    user_skills = [s.lower() for s in data.get("skills", [])]
    user_quals = [q.lower() for q in data.get("qualifications", [])]

    if not user_skills and not user_quals:
        return jsonify({"jobs": []})

    df = job_df.copy()

    # Build a single text blob from ALL string columns in the row.
    # This way we don't care what your CSV headers are called.
    def full_text_from_row(row):
        parts = []
        for value in row.values:
            if isinstance(value, str):
                parts.append(value.lower())
        return " ".join(parts)

    df["__full_text"] = df.apply(full_text_from_row, axis=1)

    def compute_scores(text: str):
        skill_score = sum(1 for s in user_skills if s in text)
        qual_score = sum(1 for q in user_quals if q in text)
        # weight skills a bit higher if you like
        total = skill_score * 2 + qual_score
        return skill_score, qual_score, total

    df["skill_score"], df["qual_score"], df["total_score"] = zip(
        *df["__full_text"].apply(compute_scores)
    )

    # Only keep jobs that have at least 1 match
    df = df[df["total_score"] > 0]

    # Return top 20 jobs
    df = df.sort_values(by="total_score", ascending=False).head(20)

    # Drop helper column before sending to frontend
    df = df.drop(columns=["__full_text"])

    #  Make it JSON-safe: replace NaN with empty string 
    df = df.fillna("")

    jobs = df.to_dict(orient="records")
    return jsonify({"jobs": jobs})


if __name__ == "__main__":
    app.run(debug=True)

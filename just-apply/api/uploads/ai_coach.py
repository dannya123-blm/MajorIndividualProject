import os
from flask import Blueprint, request, jsonify
from dotenv import load_dotenv
from google import genai

load_dotenv()

ai_coach_bp = Blueprint("ai_coach", __name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
AI_COACH_MODEL = os.getenv("AI_COACH_MODEL", "gemini-2.5-flash")

client = genai.Client(api_key=GEMINI_API_KEY)


def generate_ai_response(prompt: str) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is missing from .env")

    response = client.models.generate_content(
        model=AI_COACH_MODEL,
        contents=prompt,
    )

    return response.text or "No response generated."


@ai_coach_bp.route("/api/ai-coach/chat", methods=["POST"])
def ai_coach_chat():
    data = request.get_json(silent=True) or {}

    message = str(data.get("message", "")).strip()
    skills = data.get("skills", [])
    qualifications = data.get("qualifications", [])
    cv_text = str(data.get("cv_text", "")).strip()
    selected_job = data.get("selected_job") or {}

    if not message:
        return jsonify({"error": "Message is required"}), 400

    prompt = f"""
You are Just Appy, a professional AI career coach built into the Just Apply job matching platform.

Your role:
- Help users improve their CV
- Explain job-match weaknesses
- Give practical job-search advice
- Help with cover letters
- Keep answers clear, structured, and useful

User question:
{message}

User skills:
{skills}

User qualifications:
{qualifications}

CV preview:
{cv_text[:2500]}

Selected job context:
{selected_job}

Answer in a supportive, practical way. Use short sections and bullet points where helpful.
"""

    try:
        reply = generate_ai_response(prompt)
        return jsonify({"reply": reply}), 200
    except Exception as e:
        print("AI Coach chat error:", e)
        return jsonify({"error": str(e)}), 500


@ai_coach_bp.route("/api/ai-coach/cv-review", methods=["POST"])
def ai_coach_cv_review():
    data = request.get_json(silent=True) or {}

    cv_text = str(data.get("cv_text", "")).strip()
    skills = data.get("skills", [])
    qualifications = data.get("qualifications", [])

    if not cv_text and not skills:
        return jsonify({"error": "Upload a CV first so Just Appy can review it."}), 400

    prompt = f"""
You are Just Appy, an expert CV reviewer for students and graduate job seekers.

Review this CV/profile and provide:
1. Overall CV score out of 100
2. Strengths
3. Weaknesses
4. Missing sections or missing evidence
5. Skills to add
6. 5 practical improvements the user can make today

CV preview:
{cv_text[:4000]}

Extracted skills:
{skills}

Extracted qualifications:
{qualifications}

Be honest, specific, and helpful. Do not invent experience the user has not provided.
"""

    try:
        review = generate_ai_response(prompt)
        return jsonify({"review": review}), 200
    except Exception as e:
        print("AI Coach CV review error:", e)
        return jsonify({"error": str(e)}), 500


@ai_coach_bp.route("/api/ai-coach/cover-letter", methods=["POST"])
def ai_coach_cover_letter():
    data = request.get_json(silent=True) or {}

    job_title = str(data.get("job_title", "the role")).strip()
    company = str(data.get("company", "")).strip()
    skills = data.get("skills", [])
    cv_text = str(data.get("cv_text", "")).strip()
    job_description = str(data.get("job_description", "")).strip()

    prompt = f"""
You are Just Appy, a career assistant.

Generate a tailored cover letter for this user.

Job title:
{job_title}

Company:
{company or "the company"}

User skills:
{skills}

CV preview:
{cv_text[:3000]}

Job description:
{job_description[:2500]}

Requirements:
- Professional but natural tone
- Suitable for a student/graduate applicant
- 3 to 5 short paragraphs
- Mention relevant skills only if provided
- Do not invent work experience
- End with a confident closing paragraph
"""

    try:
        cover_letter = generate_ai_response(prompt)
        return jsonify({"cover_letter": cover_letter}), 200
    except Exception as e:
        print("AI Coach cover letter error:", e)
        return jsonify({"error": str(e)}), 500


@ai_coach_bp.route("/api/ai-coach/generate-cv", methods=["POST"])
def ai_coach_generate_cv():
    data = request.get_json(silent=True) or {}

    details = str(data.get("details", "")).strip()

    if not details:
        return jsonify({"error": "Profile details are required to generate a CV."}), 400

    prompt = f"""
You are Just Appy, a CV writing assistant.

Create a clean CV draft from the details below.

Details:
{details[:5000]}

Format the CV with these sections:
- Professional Summary
- Key Skills
- Projects / Experience
- Education
- Certifications
- Additional Information

Rules:
- Do not invent fake employers or fake degrees
- If information is missing, write [Add details here]
- Keep it professional and easy to read
"""

    try:
        cv = generate_ai_response(prompt)
        return jsonify({"cv": cv}), 200
    except Exception as e:
        print("AI Coach generate CV error:", e)
        return jsonify({"error": str(e)}), 500
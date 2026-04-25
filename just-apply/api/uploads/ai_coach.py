import os
from flask import Blueprint, request, jsonify
from dotenv import load_dotenv
from google import genai

load_dotenv()

ai_coach_bp = Blueprint("ai_coach", __name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
AI_COACH_MODEL = os.getenv("AI_COACH_MODEL", "gemini-2.5-flash")

client = genai.Client(api_key=GEMINI_API_KEY)


def clean_response(text: str) -> str:
    if not text:
        return "No response generated."

    text = text.replace("**", "")
    text = text.replace("---", "")
    return text.strip()


def generate_ai_response(prompt: str) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is missing from .env")

    response = client.models.generate_content(
        model=AI_COACH_MODEL,
        contents=prompt,
    )

    return clean_response(response.text)


def build_context(data):
    return {
        "message": str(data.get("message", "")).strip(),
        "skills": data.get("skills", []),
        "qualifications": data.get("qualifications", []),
        "cv_text": str(data.get("cv_text", "")).strip(),
        "selected_job": data.get("selected_job") or {},
    }


@ai_coach_bp.route("/api/ai-coach/chat", methods=["POST"])
def ai_coach_chat():
    data = request.get_json(silent=True) or {}
    ctx = build_context(data)

    if not ctx["message"]:
        return jsonify({"error": "Message is required"}), 400

    prompt = f"""
You are Just Appy, a professional AI career coach inside the Just Apply platform.

RULES:
- Be concise and structured
- Do not write long paragraphs
- Use short bullet points
- Do not invent experience
- Give practical advice
- Sound like a recruiter/career advisor, not a generic chatbot

FORMAT STRICTLY:

### Summary
2 short lines max.

### Key Advice
- point
- point
- point

### Improvements
- point
- point
- point

### Action Steps
- step
- step
- step

User question:
{ctx["message"]}

User skills:
{ctx["skills"]}

User qualifications:
{ctx["qualifications"]}

CV preview:
{ctx["cv_text"][:2500]}

Selected job:
{ctx["selected_job"]}
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
    ctx = build_context(data)

    if not ctx["cv_text"] and not ctx["skills"]:
        return jsonify({"error": "Upload a CV first so Just Appy can review it."}), 400

    prompt = f"""
You are Just Appy, an expert CV reviewer.

RULES:
- Be honest but supportive
- Use bullet points only
- Do not write essays
- Do not invent experience
- Keep it clear and easy to scan

FORMAT STRICTLY:

### CV Score
Give a score out of 100 and one short reason.

### Strengths
- point
- point
- point

### Weaknesses
- point
- point
- point

### Missing Content
- point
- point
- point

### Fix Today
- action
- action
- action

CV preview:
{ctx["cv_text"][:4000]}

Extracted skills:
{ctx["skills"]}

Qualifications:
{ctx["qualifications"]}
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
You are Just Appy, a professional cover letter assistant.

Create a tailored cover letter.

RULES:
- 4 short paragraphs max
- Professional but natural
- Suitable for student/graduate applicant
- Mention only skills provided
- Do not invent experience
- No markdown symbols

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

Create a clean CV draft.

RULES:
- Do not invent fake employers
- Do not invent fake degrees
- If information is missing, write [Add details here]
- Keep it professional and easy to scan

FORMAT:

### Professional Summary

### Key Skills

### Projects / Experience

### Education

### Certifications

### Additional Information

Details:
{details[:5000]}
"""

    try:
        cv = generate_ai_response(prompt)
        return jsonify({"cv": cv}), 200
    except Exception as e:
        print("AI Coach generate CV error:", e)
        return jsonify({"error": str(e)}), 500
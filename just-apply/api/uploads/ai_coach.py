from flask import Blueprint, request, jsonify
import os
import google.generativeai as genai

ai_coach_bp = Blueprint("ai_coach", __name__)

# Setup Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel(os.getenv("AI_COACH_MODEL", "gemini-1.5-flash"))


# General Chat (Coach)
@ai_coach_bp.route("/api/ai-coach/chat", methods=["POST"])
def chat():
    data = request.get_json()
    message = data.get("message", "")

    if not message:
        return jsonify({"error": "No message provided"}), 400

    prompt = f"""
    You are a professional AI career coach.

    Help the user with:
    - CV advice
    - Job applications
    - Career guidance
    - Interview preparation

    Be concise, helpful, and professional.

    User message:
    {message}
    """

    try:
        response = model.generate_content(prompt)
        return jsonify({"reply": response.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# CV Review
@ai_coach_bp.route("/api/ai-coach/cv-review", methods=["POST"])
def cv_review():
    data = request.get_json()
    cv_text = data.get("cv_text", "")

    if not cv_text:
        return jsonify({"error": "No CV text provided"}), 400

    prompt = f"""
    You are an expert CV reviewer.

    Analyse the following CV and provide:
    1. Strengths
    2. Weaknesses
    3. Missing skills
    4. Suggestions for improvement

    CV:
    {cv_text}
    """

    try:
        response = model.generate_content(prompt)
        return jsonify({"review": response.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



# Cover Letter Generator
@ai_coach_bp.route("/api/ai-coach/cover-letter", methods=["POST"])
def cover_letter():
    data = request.get_json()
    job_title = data.get("job_title", "")
    skills = data.get("skills", "")

    prompt = f"""
    Write a professional cover letter for a {job_title} role.

    Candidate skills:
    {skills}

    Keep it concise, strong, and tailored.
    """

    try:
        response = model.generate_content(prompt)
        return jsonify({"cover_letter": response.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



# CV Generator
@ai_coach_bp.route("/api/ai-coach/generate-cv", methods=["POST"])
def generate_cv():
    data = request.get_json()
    details = data.get("details", "")

    prompt = f"""
    Generate a professional CV based on:

    {details}

    Format it clearly with sections:
    - Summary
    - Skills
    - Experience
    - Education
    """

    try:
        response = model.generate_content(prompt)
        return jsonify({"cv": response.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
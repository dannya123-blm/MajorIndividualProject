import re
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize

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
    "git", "github", "linux", "power bi", "tableau", "excel",
    "pandas", "numpy", "matplotlib", "seaborn",
    "nlp", "natural language processing",
    "machine learning", "data analysis", "data analytics",
    "data visualisation", "data visualization",
    "ui", "ux", "figma", "cloud", "kubernetes", "devops", "terraform",
    "api", "rest api", "flask api", "next.js", "nextjs"
]

QUALIFICATION_KEYWORDS = [
    "bsc", "b.sc", "bachelor", "bachelors", "ba", "b.a",
    "msc", "m.sc", "master", "masters", "ma", "m.a",
    "phd", "doctorate", "degree",
    "computer science", "software engineering", "data science",
    "bachelor of science", "bachelor of engineering",
    "bachelor of arts", "master of science", "master of engineering",
    "master of arts", "honours", "hons", "higher diploma",
    "postgraduate diploma", "aws certified", "azure certification",
    "oracle certified", "microsoft certified", "ccna", "comptia"
]


def clean_extracted_text(text: str) -> str:
    if not text:
        return ""

    text = text.replace("\x00", " ")

    # Fix spaced-out PDF letters: P y t h o n -> Python
    text = re.sub(
        r"\b(?:[A-Za-z]\s){2,}[A-Za-z]\b",
        lambda m: m.group(0).replace(" ", ""),
        text,
    )

    # Fix common joined CV text
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)

    # Normalise symbols and spacing
    text = text.replace("•", " ")
    text = text.replace("►", " ")
    text = text.replace("|", " ")
    text = re.sub(r"[_\-]{3,}", " ", text)
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def normalize_tokens(text: str) -> list[str]:
    text = clean_extracted_text(text)

    try:
        tokens = word_tokenize(text)
    except Exception:
        tokens = re.findall(r"[A-Za-z0-9+#.]+", text)

    clean = []

    for tok in tokens:
        lower = tok.lower().strip()
        if lower and lower not in EN_STOPWORDS:
            clean.append(lower)

    return clean


def keyword_match(text: str, keywords: list[str]) -> list[str]:
    cleaned = clean_extracted_text(text).lower()
    compact_text = re.sub(r"[\s\-_.]", "", cleaned)

    found = []

    for kw in keywords:
        kw_lower = kw.lower().strip()
        compact_kw = re.sub(r"[\s\-_.]", "", kw_lower)

        # exact phrase / word match
        if re.search(rf"(?<![a-z0-9]){re.escape(kw_lower)}(?![a-z0-9])", cleaned):
            found.append(kw)
            continue

        # compact fallback: powerbi, nextjs, dataanalysis
        if compact_kw and compact_kw in compact_text:
            found.append(kw)
            continue

    return list(dict.fromkeys(found))


def extract_skills(text: str) -> list[str]:
    return keyword_match(text, SKILL_KEYWORDS)


def extract_qualifications(text: str) -> list[str]:
    return keyword_match(text, QUALIFICATION_KEYWORDS)
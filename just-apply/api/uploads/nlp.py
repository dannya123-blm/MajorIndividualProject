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

EN_STOPWORDS = set(stopwords.words("english"))

# KEYWORDS
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

# TEXT CLEANING
def clean_extracted_text(text: str) -> str:
    if not text:
        return ""

    # Fix spaced-out PDF text (P y t h o n -> Python)
    text = re.sub(
        r"\b(?:[A-Za-z]\s){2,}[A-Za-z]\b",
        lambda m: m.group(0).replace(" ", ""),
        text,
    )

    # Remove weird formatting
    text = text.replace("\x00", " ")
    text = re.sub(r"[_\-]{3,}", " ", text)
    text = re.sub(r"\s+", " ", text)

    return text.strip()

# TOKENIZATION
def normalize_tokens(text: str) -> list[str]:
    text = clean_extracted_text(text)
    tokens = word_tokenize(text)

    clean = []
    for tok in tokens:
        lower = tok.lower().strip()
        if lower and lower not in EN_STOPWORDS:
            clean.append(lower)

    return clean

# MATCHING
def keyword_match(text: str, keywords: list[str]) -> list[str]:
    text = clean_extracted_text(text).lower()
    token_text = " ".join(normalize_tokens(text))
    compact_text = text.replace(" ", "").replace("-", "").replace("_", "")

    found = []

    for kw in keywords:
        kw_lower = kw.lower().strip()
        compact_kw = kw_lower.replace(" ", "").replace("-", "").replace("_", "")

        if kw_lower in text or kw_lower in token_text or compact_kw in compact_text:
            found.append(kw)

    # remove duplicates
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
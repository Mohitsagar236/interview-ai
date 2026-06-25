# -*- coding: utf-8 -*-
import asyncio

import base64
import http
import io
import json
import logging
import os
import re
import socket
import struct  # unused
import time
from collections.abc import Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Optional, List, Dict, Set

# numpy lazy loaded
# FastAPI imports removed (unused; using raw websockets)
import websockets
from websockets.server import serve
from websockets.exceptions import ConnectionClosed, ConnectionClosedError
from dotenv import load_dotenv

# If running from a PyInstaller onefile bundle, imports for local modules
# (for example: ai_providers.py, ocr_utils.py, windows_capture.py) may be
# packaged under a 'python' data folder. When PyInstaller extracts the bundle
# at runtime it places files under sys._MEIPASS; add that folder to sys.path
# so regular imports continue to work.
try:
    import sys
    if getattr(sys, 'frozen', False):
        _meipass = getattr(sys, '_MEIPASS', None)
        if _meipass:
            # If the build script added the whole `python/` dir as data with
            # --add-data python;python then the bundled modules will be under
            # os.path.join(_meipass, 'python'). Add both locations defensively.
            bundled_python = os.path.join(_meipass, 'python')
            if os.path.isdir(bundled_python):
                sys.path.insert(0, bundled_python)
            # also allow imports directly from the extracted root
            if _meipass not in sys.path:
                sys.path.insert(0, _meipass)
except Exception:
    # Best-effort only; if this fails we'll rely on normal import paths
    pass

# Ensure logger available before conditional imports that may log
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("server")

# Import streaming fixes
from streaming_fixes import (
    format_markdown_blocks,
    should_send_final_response,
    clean_streamed_response,
    normalize_streaming_tokens
)

# Additional libraries and OCR/IO dependencies
# Lazy loaded: pypdf, docx, PIL, pytesseract
ImageFile = None # Will be imported with PIL

# Import OCR engines. PaddleOCR is primary; Tesseract is the local fallback.
try:
    from paddleocr_engine import process_ocr_paddleocr, get_paddle_ocr_engine, check_paddleocr_available
    _has_paddleocr = True
except ImportError as e:
    logger.warning(f"PaddleOCR module not found: {e} - will try Tesseract fallback")
    _has_paddleocr = False

try:
    from ocr_utils import OCRConfig, OCRProcessor
    _has_tesseract_ocr = True
except ImportError as e:
    logger.warning(f"Tesseract OCR fallback module not available: {e}")
    _has_tesseract_ocr = False

# Import our new AI providers system
from ai_providers import initialize_ai, generate_ai_response, get_ai_status, generate_ai_response_for, UserProviderConfig, create_provider_from_config

# Import Vision Provider
from vision_provider import VisionProvider

# Import intelligent routing modules (NEW - for smart model selection)
try:
    from question_classifier import classify_question, QuestionType
    from ai_router import route_model, get_router
    from context_manager import create_context_manager
    from confidence_scorer import score_answer
    _has_intelligent_routing = True
    logger.info("✅ Intelligent routing modules loaded successfully")
except ImportError as e:
    logger.warning(f"⚠️  Intelligent routing modules not available: {e}")
    _has_intelligent_routing = False

# Import performance optimization modules (NEW)
try:
    from ocr_cache import get_cached_ocr, cache_ocr_result, get_ocr_cache_stats
    from performance_metrics import PerformanceMetrics, get_metrics_tracker, record_metrics
    from vision_provider import get_vision_provider, analyze_image_with_vision
    from batch_processor import get_batch_processor, submit_batch_request, BatchRequest, RequestPriority
    _has_optimization_modules = True
    logger.info("✅ Performance optimization modules loaded successfully")
except ImportError as e:
    logger.warning(f"⚠️  Performance optimization modules not available: {e}")
    _has_optimization_modules = False
    # Provide fallback implementations
    def get_cached_ocr(image_bytes): return None
    def cache_ocr_result(image_bytes, text, engine, time_ms): pass
    def get_ocr_cache_stats(): return {}
    def record_metrics(metrics): pass
    def get_vision_provider(): return None
    def analyze_image_with_vision(image_bytes, prompt, question=None): return None

# Import answer quality enhancement modules (NEW - for postprocessing & quality validation)
try:
    from answer_quality import (
        postprocess_answer,
        compute_confidence,
        check_duplicate_question,
        cache_question_answer,
        create_seen_tokens_log,
    )
    _has_answer_quality = True
    logger.info("✅ Answer quality enhancement modules loaded successfully")
except ImportError as e:
    logger.warning(f"⚠️  Answer quality modules not available: {e}")
    _has_answer_quality = False

# Import Windows native capture for restricted applications
try:
    from windows_capture import (
        capture_screen_windows,
        capture_window_windows,
        get_available_windows,
        is_windows_capture_available,
        capture_screen_cross_platform,
        is_cross_platform_capture_available,
    )
    _has_windows_capture = is_windows_capture_available()
    _has_cross_platform_capture = is_cross_platform_capture_available()
    if _has_windows_capture:
        logger.info("✅ Windows native capture available - can capture restricted applications")
    if _has_cross_platform_capture:
        logger.info("✅ Cross-platform (mss) capture available")
except ImportError:
    _has_windows_capture = False
    _has_cross_platform_capture = False
    capture_screen_windows = None
    capture_window_windows = None
    get_available_windows = None
    capture_screen_cross_platform = None
    logger.info("Windows native capture not available (install pywin32)")

# Import streaming transcription engine
_streaming_module_path = os.path.join(os.path.dirname(__file__), 'streaming_transcription.py')
logger.info(f"Looking for streaming_transcription at: {_streaming_module_path}")
logger.info(f"File exists: {os.path.exists(_streaming_module_path)}")
try:
    from streaming_transcription import (
        StreamingTranscriptionEngine,
        TranscriptType,
        TranscriptResult
    )
    _has_streaming = True
    logger.info("✅ Streaming transcription module loaded successfully")
except ImportError as e:
    logger.error(f"❌ streaming_transcription module import failed: {e}")
    logger.error(f"Current directory: {os.getcwd()}")
    logger.error(f"Script directory: {os.path.dirname(__file__)}")
    logger.error(f"Module search path: {sys.path[:5]}")  # Show first 5 entries
    _has_streaming = False
except Exception as e:
    logger.error(f"❌ Unexpected error loading streaming_transcription: {e}", exc_info=True)
    _has_streaming = False

# Embedding (lazy)
SentenceTransformer = None  # type: ignore
embedder = None
try:
    import faiss  # type: ignore
    _has_faiss = True
except Exception:
    _has_faiss = False
last_coach_time = 0.0
recent_questions: List[tuple[str, float]] = []
current_speaker = "user1"  # Default speaker identifier
current_recording_mode = "interviewer"  # Track recording mode: 'interviewer' or 'student'
listen_student_enabled = False  # Whether to also listen to the student's speech
last_processed_student_utterance = ""

# Conversation history - stores recent Q&A pairs per session/mode
# Now indexed by session_id first, then by mode
conversation_history: Dict[str, Dict[str, List[Dict[str, str]]]] = {}
MAX_HISTORY_TURNS = 10  # Keep last 10 exchanges (20 messages)

def get_or_create_session_history(session_id: str) -> Dict[str, List[Dict[str, str]]]:
    """Get or create conversation history for a session"""
    if session_id not in conversation_history:
        conversation_history[session_id] = {
            "coach": [],
            "assistant": [],
            "chat": []
        }
    return conversation_history[session_id]

def get_company_brief_text():
    """Return concatenated company brief context"""
    if not company_brief_chunks:
        return ""
    return "\n\n".join(company_brief_chunks[-10:])


def format_company_brief(payload) -> str:
    """Normalize a company brief payload into readable text blocks."""
    if not payload:
        return ""
    try:
        if isinstance(payload, str):
            return payload.strip()
        if not isinstance(payload, Mapping):
            return ""

        parts: List[str] = []
        name = str(payload.get("name") or "").strip()
        if name:
            parts.append(f"Company: {name}")
        role = str(payload.get("role") or "").strip()
        if role:
            parts.append(f"Role: {role}")
        website = str(payload.get("website") or "").strip()
        if website:
            parts.append(f"Website: {website}")
        overview = str(payload.get("overview") or "").strip()
        if overview:
            parts.append(f"Overview:\n{overview}")
        notes = str(payload.get("notes") or "").strip()
        if notes:
            parts.append(f"Key Notes:\n{notes}")

        return "\n\n".join(parts).strip()
    except Exception as exc:
        logger.warning("Failed to format company brief: %s", exc)
        return ""
last_student_time = 0.0

# AI system initialization flag
ai_initialized = False

# UI connections list - maps session_id to WebSocket client
ui_clients: Dict[str, websockets.WebSocketServerProtocol] = {}

# Session tracking - maps WebSocket to user session ID
client_sessions: Dict[websockets.WebSocketServerProtocol, str] = {}

# BYOK: per-session API key config (populated by init_session message)
session_configs: Dict[str, dict] = {}

# Transcription state
partial_text = ""
captured_ocr_texts: List[str] = []
session_runtime_state: Dict[str, Dict[str, object]] = {}


def _session_state_key(session_id: Optional[str]) -> str:
    return session_id or "__global__"


def get_session_runtime_state(session_id: Optional[str] = None) -> Dict[str, object]:
    key = _session_state_key(session_id)
    if key not in session_runtime_state:
        session_runtime_state[key] = {"partial_text": "", "captured_ocr_texts": []}
    return session_runtime_state[key]


def get_session_captured_ocr_texts(session_id: Optional[str] = None) -> List[str]:
    if not session_id:
        return captured_ocr_texts
    state = get_session_runtime_state(session_id)
    texts = state.setdefault("captured_ocr_texts", [])
    return texts  # type: ignore[return-value]


def set_session_captured_ocr_text(session_id: Optional[str], capture_index: int, text: str) -> None:
    texts = get_session_captured_ocr_texts(session_id)
    while capture_index >= len(texts):
        texts.append("")
    texts[capture_index] = text or ""


def clear_session_captures(session_id: Optional[str] = None) -> None:
    if session_id:
        get_session_runtime_state(session_id)["captured_ocr_texts"] = []
    else:
        captured_ocr_texts.clear()


def get_combined_ocr_text(session_id: Optional[str] = None) -> str:
    """Get captured OCR text for one UI session."""
    texts = get_session_captured_ocr_texts(session_id)
    if not texts:
        return ""
    return "\n\n".join([f"Screen {i+1}: {text}" for i, text in enumerate(texts) if str(text).strip()])


def get_session_partial_text(session_id: Optional[str] = None) -> str:
    if not session_id:
        return partial_text or ""
    return str(get_session_runtime_state(session_id).get("partial_text") or "")


def set_session_partial_text(session_id: Optional[str], text: str) -> None:
    global partial_text
    clean_text = text or ""
    if session_id:
        get_session_runtime_state(session_id)["partial_text"] = clean_text
    else:
        partial_text = clean_text


def append_session_partial_text(session_id: Optional[str], text: str) -> str:
    current = get_session_partial_text(session_id)
    if current and not current.endswith((" ", "\n")):
        current += " "
    current += text or ""
    if len(current) > 12000:
        current = current[-8000:]
    set_session_partial_text(session_id, current)
    return current

# Company brief context chunks (fed into embedding store)
company_brief_chunks: List[str] = []

# Streaming transcription engine instance (Deepgram-only)
streaming_engine = None

# Auto-coach runtime flags
# Read from AUTO_COACH_ENABLED (primary) or AUTO_COACH (legacy fallback)
auto_coach_enabled = os.getenv("AUTO_COACH_ENABLED", os.getenv("AUTO_COACH", "0")).lower() in ("1", "true", "yes", "on")
coach_in_progress = False
last_coach_question: Optional[str] = None

# Embedding stores for resume/context personalization (PER SESSION)
# Structure: session_id -> {"index": faiss_index, "emb_texts": List[str], "emb_matrix": np.ndarray, "embedder": model}
session_resume_data: Dict[str, Dict] = {}

CONTEXT_STOPWORDS = {
    "about", "after", "again", "against", "also", "and", "are", "because",
    "been", "before", "being", "between", "both", "but", "can", "could",
    "did", "does", "doing", "during", "each", "for", "from", "had", "has",
    "have", "how", "into", "its", "more", "most", "not", "off", "our",
    "out", "over", "own", "same", "she", "should", "such", "than", "that",
    "the", "their", "then", "there", "these", "they", "this", "those",
    "through", "too", "under", "use", "used", "using", "very", "was",
    "were", "what", "when", "where", "which", "while", "who", "why", "will",
    "with", "would", "you", "your"
}


def get_or_create_resume_data(session_id: str) -> Dict:
    """Return the per-session resume/context store."""
    if session_id not in session_resume_data:
        session_resume_data[session_id] = {
            "index": None,
            "emb_texts": [],
            "emb_matrix": None,
            "embedder": None,
            "profile": empty_resume_profile(),
            "raw_text": ""
        }
    return session_resume_data[session_id]


def tokenize_context_text(text: str) -> Set[str]:
    """Tokenize text for the portable no-embedding context fallback."""
    tokens = re.findall(r"[a-z0-9][a-z0-9+#.\-]{1,}", (text or "").lower())
    return {token for token in tokens if token not in CONTEXT_STOPWORDS}


def retrieve_text_context(chunks: List[str], query: str, limit: int = 5) -> List[str]:
    """Retrieve relevant chunks without optional sentence-transformers/faiss deps."""
    if not chunks:
        return []
    query_terms = tokenize_context_text(query)
    if not query_terms:
        return chunks[:limit]

    ranked = []
    for idx, chunk in enumerate(chunks):
        terms = tokenize_context_text(chunk)
        if not terms:
            continue
        overlap = query_terms & terms
        score = len(overlap) * 4
        score += sum(1 for term in query_terms if term in chunk.lower())
        score += min(len(chunk), 1200) / 1200
        if score > 0:
            ranked.append((score, idx, chunk))

    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [chunk for _, _, chunk in ranked[:limit]] or chunks[:limit]


def empty_resume_profile() -> Dict:
    """Return the structured resume profile shape used for answer generation."""
    return {
        "name": "",
        "education": [],
        "skills": {
            "programming_languages": [],
            "frameworks": [],
            "ml_ai": [],
            "databases": [],
            "tools": []
        },
        "projects": [],
        "internships": [],
        "achievements": [],
        "certifications": [],
        "courses": [],
        "leadership": []
    }


RESUME_SECTION_ALIASES = {
    "education": ("education", "academic background", "academics"),
    "skills": ("skills", "technical skills", "technologies", "tools and technologies"),
    "projects": ("projects", "personal projects", "academic projects", "selected projects"),
    "internships": ("internships", "experience", "work experience", "professional experience"),
    "achievements": ("achievements", "awards", "honors", "accomplishments"),
    "certifications": ("certifications", "certificates"),
    "courses": ("courses", "coursework", "relevant coursework"),
    "leadership": ("leadership", "positions of responsibility", "responsibilities", "activities")
}


SKILL_KEYWORDS = {
    "programming_languages": (
        "python", "java", "c++", "cpp", "c", "javascript", "typescript", "go",
        "golang", "rust", "sql", "r", "matlab", "kotlin", "swift"
    ),
    "frameworks": (
        "react", "node", "node.js", "express", "django", "flask", "fastapi",
        "spring", "next.js", "angular", "vue", "tailwind", "bootstrap"
    ),
    "ml_ai": (
        "machine learning", "deep learning", "nlp", "computer vision", "tensorflow",
        "pytorch", "scikit-learn", "sklearn", "keras", "opencv", "pandas", "numpy"
    ),
    "databases": (
        "mysql", "postgresql", "postgres", "mongodb", "redis", "sqlite",
        "firebase", "dynamodb", "elasticsearch"
    ),
    "tools": (
        "git", "github", "docker", "kubernetes", "aws", "azure", "gcp",
        "linux", "postman", "figma", "tableau", "power bi", "jupyter"
    )
}


def _normalize_resume_line(line: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"^[\s\-*]+", "", line or "")).strip()


def _dedupe_preserve_order(items: List[str], limit: int = 20) -> List[str]:
    seen = set()
    out = []
    for item in items:
        clean = _normalize_resume_line(str(item))
        key = clean.lower()
        if clean and key not in seen:
            seen.add(key)
            out.append(clean)
        if len(out) >= limit:
            break
    return out


def _resume_section_for_line(line: str) -> Optional[str]:
    normalized = re.sub(r"[^a-z0-9&/ ]+", "", (line or "").strip().lower())
    normalized = re.sub(r"\s+", " ", normalized).strip(" :")
    if not normalized or len(normalized.split()) > 5:
        return None
    for section, aliases in RESUME_SECTION_ALIASES.items():
        if normalized in aliases:
            return section
    return None


def _split_resume_sections(text: str) -> Dict[str, List[str]]:
    sections = {key: [] for key in RESUME_SECTION_ALIASES}
    current = None
    for raw_line in (text or "").splitlines():
        line = _normalize_resume_line(raw_line)
        if not line:
            continue
        section = _resume_section_for_line(line)
        if section:
            current = section
            continue
        if current:
            sections[current].append(line)
    return sections


def _guess_resume_name(text: str) -> str:
    section_headers = {alias for aliases in RESUME_SECTION_ALIASES.values() for alias in aliases}
    header_like_terms = {
        "achievement", "achievements", "scholastic", "education", "skills", "projects",
        "internship", "internships", "experience", "responsibility", "responsibilities",
        "coursework", "certifications", "technical", "profile", "summary",
        "objective", "career objective", "professional summary", "core competency",
        "competencies", "academic", "work experience", "personal details", "contact",
        "awards", "honors", "publications", "activities", "interests"
    }
    education_like_terms = {
        "b.tech", "btech", "bachelor", "master", "m.tech", "mtech", "degree",
        "engineering", "science", "computer science", "university", "college",
        "institute", "iit", "school", "cgpa", "gpa", "semester"
    }
    for raw_line in (text or "").splitlines()[:12]:
        line = _normalize_resume_line(raw_line)
        if not line:
            continue
        lowered = line.lower().strip(":")
        if lowered in section_headers:
            continue
        if any(term in lowered for term in header_like_terms):
            continue
        if any(term in lowered for term in education_like_terms):
            continue
        if any(marker in lowered for marker in ("@", "http", "linkedin", "github")):
            continue
        if any(separator in line for separator in (",", "|", "•", "·", ";")):
            continue
        if line.endswith(".") or re.search(r"^(to|seeking|looking|aiming|aspiring)\b", lowered):
            continue
        if re.search(r"\b(build|develop|work|learn|contribute|leverage|seeking|pursue)\b", lowered):
            continue
        if len(line) > 60 or sum(ch.isdigit() for ch in line) > 3:
            continue
        skill_hits = 0
        for keywords in SKILL_KEYWORDS.values():
            for keyword in keywords:
                pattern = r"(?<![a-z0-9+#.])" + re.escape(keyword.lower()) + r"(?![a-z0-9+#.])"
                if re.search(pattern, lowered):
                    skill_hits += 1
                    if skill_hits >= 2:
                        break
            if skill_hits >= 2:
                break
        if skill_hits >= 2:
            continue
        words = re.findall(r"[A-Za-z][A-Za-z.'-]*", line)
        if 2 <= len(words) <= 5:
            return line
    return ""


def _extract_skills_from_text(text: str) -> Dict[str, List[str]]:
    haystack = (text or "").lower()
    skills = empty_resume_profile()["skills"]
    for category, keywords in SKILL_KEYWORDS.items():
        found = []
        for keyword in keywords:
            pattern = r"(?<![a-z0-9+#.])" + re.escape(keyword.lower()) + r"(?![a-z0-9+#.])"
            if re.search(pattern, haystack):
                label = "C++" if keyword in ("c++", "cpp") else keyword
                label = "Node.js" if keyword == "node.js" else label
                label = "Next.js" if keyword == "next.js" else label
                found.append(label)
        skills[category] = _dedupe_preserve_order(found, limit=30)
    return skills


def _section_items(lines: List[str], limit: int = 12) -> List[str]:
    items: List[str] = []
    buffer: List[str] = []
    for line in lines:
        starts_new = bool(re.match(r"^[-*]|\b(20\d{2}|19\d{2})\b", line)) or len(line) < 90
        if starts_new and buffer:
            items.append(" ".join(buffer))
            buffer = []
        buffer.append(line)
        if len(" ".join(buffer)) > 500:
            items.append(" ".join(buffer))
            buffer = []
        if len(items) >= limit:
            break
    if buffer and len(items) < limit:
        items.append(" ".join(buffer))
    return _dedupe_preserve_order(items, limit=limit)


def extract_structured_resume_profile(text: str) -> Dict:
    """Extract a conservative structured profile from resume text without inventing values."""
    profile = empty_resume_profile()
    clean_text = re.sub(r"\r\n?", "\n", text or "")
    sections = _split_resume_sections(clean_text)

    profile["name"] = _guess_resume_name(clean_text)
    profile["skills"] = _extract_skills_from_text("\n".join(sections.get("skills") or []) or clean_text)

    for key in ("education", "projects", "internships", "achievements", "certifications", "courses", "leadership"):
        profile[key] = _section_items(sections.get(key, []), limit=16 if key == "projects" else 10)

    return profile


def _flatten_resume_profile(profile: Dict) -> List[tuple[str, str]]:
    entries: List[tuple[str, str]] = []
    if not profile:
        return entries
    if profile.get("name"):
        entries.append(("name", f"Name: {profile['name']}"))
    for section in ("education", "projects", "internships", "achievements", "certifications", "courses", "leadership"):
        for item in profile.get(section, []) or []:
            entries.append((section, f"{section.replace('_', ' ').title()}: {item}"))
    skills = profile.get("skills") or {}
    for category, values in skills.items():
        if values:
            label = category.replace("_", " ").title()
            entries.append((f"skills.{category}", f"{label}: {', '.join(values)}"))
    return entries


def resume_profile_to_context(profile: Dict, question: str, question_type: str) -> str:
    """Format only the resume profile facts likely to be relevant to the question."""
    entries = _flatten_resume_profile(profile)
    if not entries:
        return ""

    q_terms = tokenize_context_text(question or "")
    preferred_sections = {
        "resume_hr": {"name", "education", "projects", "internships", "achievements", "leadership", "skills.programming_languages", "skills.frameworks", "skills.ml_ai", "skills.databases", "skills.tools"},
        "behavioral": {"projects", "internships", "achievements", "leadership"},
        "resume_specific": {"education", "projects", "internships", "achievements", "certifications", "courses", "leadership", "skills.programming_languages", "skills.frameworks", "skills.ml_ai", "skills.databases", "skills.tools"},
        "unsupported_resume_claim_check": {"name", "education", "projects", "internships", "achievements", "certifications", "courses", "leadership", "skills.programming_languages", "skills.frameworks", "skills.ml_ai", "skills.databases", "skills.tools"},
    }.get(question_type, set())

    ranked = []
    for idx, (section, text) in enumerate(entries):
        terms = tokenize_context_text(text)
        score = len(q_terms & terms) * 5
        if section in preferred_sections:
            score += 2
        if question_type == "resume_hr" and section in {"name", "education"}:
            score += 3
        if question_type == "behavioral" and section in {"projects", "internships"}:
            score += 3
        if score > 0:
            ranked.append((score, idx, text))

    ranked.sort(key=lambda item: (-item[0], item[1]))
    if not ranked:
        ranked = [(1, idx, text) for idx, (_, text) in enumerate(entries[:8])]

    selected = [text for _, _, text in ranked[:10]]
    return "Structured resume profile facts:\n" + "\n".join(f"- {item}" for item in selected)


def _claim_terms(question: str) -> Set[str]:
    claim_stopwords = {
        "did", "do", "does", "have", "has", "had", "resume", "cv", "intern", "interned",
        "internship", "work", "worked", "company", "which", "where", "claim", "the", "a",
        "an", "at", "for", "from", "to", "in", "on", "with", "about", "tell", "me", "my",
        "i", "you", "your", "it", "is", "are", "was", "were", "of", "experience", "see",
        "year", "years"
    }
    return {
        token for token in tokenize_context_text(question or "")
        if token not in claim_stopwords and len(token) > 2 and not token.isdigit()
    }


def build_context(
    question: str,
    resume_profile: Dict,
    conversation_history_for_session: Dict[str, List[Dict[str, str]]],
    question_type: str,
    resume_chunks: Optional[List[str]] = None,
) -> List[str]:
    """Build compact, question-aware context for the answer-generation prompt."""
    del conversation_history_for_session
    if question_type not in {"resume_hr", "behavioral", "resume_specific", "unsupported_resume_claim_check"}:
        return []

    contexts: List[str] = []
    profile_context = resume_profile_to_context(resume_profile or empty_resume_profile(), question, question_type)
    if profile_context:
        contexts.append(profile_context[:2200])

    chunks = resume_chunks or []
    if chunks:
        relevant_chunks = retrieve_text_context(chunks, question, limit=3)
        for chunk in relevant_chunks:
            if chunk and chunk not in contexts:
                contexts.append(chunk[:900])

    if question_type == "unsupported_resume_claim_check":
        resume_terms = tokenize_context_text("\n".join(contexts + chunks))
        terms = _claim_terms(question)
        found_terms = sorted(terms & resume_terms)
        if not terms or not found_terms:
            contexts.insert(0, "Claim check result: the requested claim was not found in the available resume facts.")
        else:
            contexts.insert(0, f"Claim check result: matching resume terms found: {', '.join(found_terms[:8])}.")

    return contexts[:4]


buildContext = build_context

# Initialize Vision Provider
vision_provider = VisionProvider()

# Lazy image provider handle (may be used for diagram generation)
image_provider = None

IMAGE_KEYWORDS = [
    'diagram', 'flowchart', 'architecture', 'sequence diagram', 'class diagram', 'er diagram',
    'timeline', 'gantt', 'graph', 'chart', 'ui mockup', 'wireframe', 'layout', 'component diagram',
    'state machine', 'state diagram', 'deployment diagram', 'network topology', 'mind map',
    'swimlane', 'journey map', 'data model', 'schema'
]

def needs_image(text: str) -> bool:
    if not text:
        return False
    lt = text.lower()
    if any(k in lt for k in IMAGE_KEYWORDS):
        return True
    if re.search(r"\b(draw|illustrate|visualize|sketch|show (a |an )?diagram|show (a |an )?graph)\b", lt):
        return True
    return False

# Server/network defaults
# Support cloud deployment via environment variables
CLOUD_MODE = os.getenv('CLOUD_MODE', 'false').lower() in ('true', '1', 'yes', 'on')
# Prefer an explicit HOST env var. If a PORT is provided by the platform (for
# example Koyeb or Heroku), default to binding on 0.0.0.0 so external health
# checks and load balancers can reach the service. When running locally and
# no PORT is set, keep the default of 'localhost' for safety.
HOST = os.getenv('HOST') or ('0.0.0.0' if (CLOUD_MODE or os.getenv('PORT')) else 'localhost')
# Use PORT if provided by the environment (platform buildpacks usually set PORT)
PORT = int(os.getenv('PORT') or '8765')
DEFAULT_LLM = os.getenv("DEFAULT_LLM", "openai/gpt-4o-mini")
FAST_SCREEN_VISION_FIRST = os.getenv("FAST_SCREEN_VISION_FIRST", "1").lower() in ("1", "true", "yes", "on")
FAST_SCREEN_MAX_SIDE = int(os.getenv("FAST_SCREEN_MAX_SIDE", "1800"))
FAST_SCREEN_JPEG_QUALITY = int(os.getenv("FAST_SCREEN_JPEG_QUALITY", "82"))


def _truthy(value) -> bool:
    return str(value).lower() in ("1", "true", "yes", "on")


def _model_looks_vision_capable(model: str) -> bool:
    lower = (model or "").lower()
    return any(
        marker in lower
        for marker in (
            "gpt-4o",
            "gpt-4.1",
            "gemini",
            "vision",
            "llava",
            "pixtral",
            "qwen-vl",
            "qwen2-vl",
            "qwen2.5-vl",
            "claude-3",
        )
    )


def _vision_model_for_provider(provider: str, requested_model: str = "") -> str:
    explicit = os.getenv("FAST_SCREEN_MODEL") or os.getenv("VISION_MODEL")
    if explicit:
        return explicit
    if _model_looks_vision_capable(requested_model):
        return requested_model
    defaults = {
        "openrouter": "openai/gpt-4o-mini",
        "openai": "gpt-4o-mini",
        "gemini": "gemini-1.5-flash",
        "groq": requested_model,
        "custom": requested_model or "gpt-4o-mini",
        "ollama": requested_model or "llava",
    }
    return defaults.get((provider or "").lower(), requested_model or "gpt-4o-mini")


def _select_fast_screen_provider_config(session_id: Optional[str] = None) -> Optional[UserProviderConfig]:
    """Pick a vision-capable provider for fast screenshot answering."""
    session_cfg = session_configs.get(session_id) if session_id else None
    if session_cfg:
        provider = (session_cfg.get("ai_provider") or "openai").lower()
        base_url = session_cfg.get("ai_base_url", "")
        api_key = session_cfg.get("ai_api_key", "")
        requested_model = session_cfg.get("ai_model", "")
        explicit_fast_model = bool(os.getenv("FAST_SCREEN_MODEL") or os.getenv("VISION_MODEL"))
        provider_can_try_vision = provider in {"openai", "openrouter", "gemini", "custom", "ollama"} or (
            provider == "groq" and (explicit_fast_model or _model_looks_vision_capable(requested_model))
        )
        local_no_key = provider == "ollama" or (
            provider == "custom" and any(host in base_url for host in ("localhost", "127.0.0.1", "::1"))
        )
        if provider_can_try_vision and (api_key or local_no_key):
            model = _vision_model_for_provider(provider, requested_model)
            return UserProviderConfig(
                provider=provider,
                api_key=api_key or "local-no-auth",
                model=model,
                base_url=base_url,
            )

    if os.getenv("OPENROUTER_API_KEY"):
        return UserProviderConfig(
            provider="openrouter",
            api_key=os.getenv("OPENROUTER_API_KEY", ""),
            model=_vision_model_for_provider("openrouter", DEFAULT_LLM),
            base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        )
    if os.getenv("OPENAI_API_KEY"):
        return UserProviderConfig(
            provider="openai",
            api_key=os.getenv("OPENAI_API_KEY", ""),
            model=_vision_model_for_provider("openai", DEFAULT_LLM),
            base_url="https://api.openai.com/v1",
        )
    if os.getenv("GEMINI_API_KEY"):
        return UserProviderConfig(
            provider="gemini",
            api_key=os.getenv("GEMINI_API_KEY", ""),
            model=_vision_model_for_provider("gemini", DEFAULT_LLM),
            base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        )
    if os.getenv("GROQ_API_KEY") and (os.getenv("FAST_SCREEN_MODEL") or os.getenv("VISION_MODEL")):
        return UserProviderConfig(
            provider="groq",
            api_key=os.getenv("GROQ_API_KEY", ""),
            model=_vision_model_for_provider("groq", os.getenv("FAST_SCREEN_MODEL") or os.getenv("VISION_MODEL", "")),
            base_url="https://api.groq.com/openai/v1",
        )
    return None

# CORS configuration for cloud deployment
# If ALLOWED_ORIGINS is '*', set to None to accept all origins
# Otherwise split comma-separated origins
origins_env = os.getenv('ALLOWED_ORIGINS', '*')
if CLOUD_MODE:
    if origins_env == '*':
        ALLOWED_ORIGINS = None  # None means accept all origins
    else:
        ALLOWED_ORIGINS = origins_env.split(',')
else:
    ALLOWED_ORIGINS = None

# Log deployment mode
if CLOUD_MODE:
    logger.info("🌐 Running in CLOUD MODE - accepting connections from %s", ALLOWED_ORIGINS or 'all origins')
else:
    logger.info("🏠 Running in LOCAL MODE - accepting connections from localhost only")

# Thread pool for blocking operations (OCR, file I/O, etc.)
# Increased from 2 to 4 workers for better parallelism during screen captures
executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="bg_")

def _is_blank_image_from_bytes(image_bytes: bytes) -> bool:
    """Check if image bytes represent a blank/empty image"""
    try:
        from PIL import Image, ImageStat
        img = Image.open(io.BytesIO(image_bytes))
        stats = ImageStat.Stat(img.convert('L'))
        min_gray, max_gray = stats.extrema[0]
        std_dev = stats.stddev[0]
        return (max_gray - min_gray) <= 2 and std_dev <= 1.5
    except Exception:
        return False


def _prepare_image_for_fast_vision(image_bytes: bytes) -> tuple[bytes, str]:
    """Resize and encode screenshots for low-latency vision-model reading."""
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes))
        img.load()
        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, "white")
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.getchannel("A") if "A" in img.getbands() else None)
            img = background
        else:
            img = img.convert("RGB")

        max_side = max(900, FAST_SCREEN_MAX_SIDE)
        width, height = img.size
        scale = min(1.0, max_side / max(width, height))
        if scale < 1.0:
            img = img.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.LANCZOS)

        output = io.BytesIO()
        quality = min(95, max(60, FAST_SCREEN_JPEG_QUALITY))
        img.save(output, format="JPEG", quality=quality, optimize=True)
        prepared = output.getvalue()
        if prepared and len(prepared) < len(image_bytes):
            return prepared, "jpeg"
    except Exception as exc:
        logger.debug("Fast vision image preparation skipped: %s", exc)

    image_format = "jpeg" if len(image_bytes) >= 3 and image_bytes[:3] == b"\xff\xd8\xff" else "png"
    return image_bytes, image_format


def _decode_capture_image_payload(payload) -> Optional[bytes]:
    """Decode renderer capture payloads into raw image bytes."""
    if isinstance(payload, Mapping):
        payload = payload.get("image_b64") or payload.get("image")
    if isinstance(payload, str):
        return base64.b64decode(payload)
    if payload is not None:
        return bytes(bytearray(payload))
    return None


async def preload_ocr_engines():
    """Pre-initialize PaddleOCR engine in background to avoid first-capture delay"""
    loop = asyncio.get_event_loop()
    
    if _has_paddleocr:
        try:
            logger.info("🔄 Pre-loading PaddleOCR engine in background...")
            await loop.run_in_executor(executor, _warmup_paddleocr)
            logger.info("✅ PaddleOCR engine pre-loaded")
        except Exception as e:
            logger.warning(f"PaddleOCR pre-load skipped: {e}")


def _warmup_paddleocr():
    """Synchronous warmup for PaddleOCR - called from thread pool"""
    try:
        from paddleocr_engine import get_paddle_ocr_engine
        get_paddle_ocr_engine()  # Forces initialization
    except Exception as e:
        logger.debug(f"PaddleOCR warmup: {e}")


def process_ocr_image(image_bytes: bytes) -> str:
    """Process OCR using PaddleOCR first, then local Tesseract as fallback."""

    start_time = time.perf_counter()
    cached_text = get_cached_ocr(image_bytes)
    if cached_text is not None:
        cache_time = (time.perf_counter() - start_time) * 1000
        logger.info(f"OCR cache HIT: {len(cached_text)} chars in {cache_time:.1f}ms")
        return cached_text

    errors: List[str] = []

    if _has_paddleocr:
        try:
            logger.info("Using PaddleOCR engine")
            text = process_ocr_paddleocr(image_bytes)
            processing_time_ms = (time.perf_counter() - start_time) * 1000
            if text and text.strip():
                logger.info(f"PaddleOCR: {len(text)} chars in {processing_time_ms:.1f}ms")
                cache_ocr_result(image_bytes, text, "paddleocr", processing_time_ms)
                return text
            logger.warning("PaddleOCR returned no text; trying Tesseract fallback")
        except Exception as exc:
            logger.warning("PaddleOCR processing failed; trying Tesseract fallback: %s", exc)
            errors.append(f"PaddleOCR: {exc}")

    if _has_tesseract_ocr:
        try:
            config = OCRConfig()
            config.use_paddle = False
            config.clean_text_only = True
            processor = OCRProcessor(config)
            if hasattr(processor, "process_image"):
                text = processor.process_image(image_bytes)
            else:
                text = processor.process(image_bytes)
            processing_time_ms = (time.perf_counter() - start_time) * 1000
            if text and text.strip():
                logger.info(f"Tesseract OCR: {len(text)} chars in {processing_time_ms:.1f}ms")
                cache_ocr_result(image_bytes, text, "tesseract", processing_time_ms)
                return text
            logger.warning("Tesseract OCR returned no text")
        except Exception as exc:
            logger.warning("Tesseract OCR fallback failed: %s", exc)
            errors.append(f"Tesseract: {exc}")

    if errors:
        return f"[OCR error: {'; '.join(errors)}]"
    return "[OCR unavailable: install PaddleOCR or configure bundled/system Tesseract]"

def ensure_asr():
    # Whisper ASR removed permanently; enforce Deepgram streaming usage
    raise RuntimeError("Whisper ASR disabled. Configure DEEPGRAM_API_KEY and use streaming.")


# Global flag to prevent duplicate auto-answers
_last_auto_answer_text = None
_last_auto_answer_time = 0

def is_garbled_text(text: str) -> bool:
    """
    Detect if OCR output is likely garbled/meaningless.
    Enhanced detection with stricter thresholds.
    """
    if not text or len(text.strip()) < 20:
        return True
    
    cleaned = text.strip()
    total = len(cleaned)
    
    # Count different character types
    letters = sum(c.isalpha() for c in cleaned)
    digits = sum(c.isdigit() for c in cleaned)
    spaces = cleaned.count(' ')
    newlines = cleaned.count('\n')
    alphanumeric = letters + digits
    symbols = sum(not c.isalnum() and not c.isspace() for c in cleaned)
    
    # Calculate ratios
    letter_ratio = letters / total if total > 0 else 0
    space_ratio = spaces / total if total > 0 else 0
    symbol_ratio = symbols / total if total > 0 else 0
    alphanumeric_ratio = alphanumeric / total if total > 0 else 0
    
    # STRICT CHECKS - More likely to catch garbled text
    
    # 1. Too few letters (less than 60% of text should be letters)
    if letter_ratio < 0.60:
        logger.info(f"Garbled: Low letter ratio {letter_ratio:.2f}")
        return True
    
    # 2. Very odd spacing patterns
    if space_ratio < 0.08 or space_ratio > 0.45:
        logger.info(f"Garbled: Abnormal spacing {space_ratio:.2f}")
        return True
    
    # 3. Too many symbols (more than 20% symbols is suspicious)
    if symbol_ratio > 0.20:
        logger.info(f"Garbled: High symbol ratio {symbol_ratio:.2f}")
        return True
    
    # 4. Check for common garbled patterns
    # - Lots of single characters separated by spaces
    # - Random capital/lowercase mixing
    # - Excessive punctuation clusters
    words = cleaned.split()
    if len(words) > 5:
        single_char_words = sum(1 for w in words if len(w) == 1)
        single_char_ratio = single_char_words / len(words)
        if single_char_ratio > 0.3:  # More than 30% single-char "words"
            logger.info(f"Garbled: Too many single-char words {single_char_ratio:.2f}")
            return True
    
    # 5. Check for repetitive patterns (e.g., "a a a a" or "1 2 3 4")
    if len(words) > 3:
        unique_words = set(words)
        uniqueness = len(unique_words) / len(words)
        if uniqueness < 0.4 and len(words) > 10:  # Less than 40% unique words
            logger.info(f"Garbled: Low word diversity {uniqueness:.2f}")
            return True
    
    # 6. Check for excessive consecutive punctuation
    import re
    punct_clusters = re.findall(r'[^\w\s]{3,}', cleaned)
    if len(punct_clusters) > 2:
        logger.info(f"Garbled: {len(punct_clusters)} punctuation clusters found")
        return True
    
    # 7. Check for mixed languages/scripts (unusual character combinations)
    # Count uppercase vs lowercase
    if letters > 0:
        uppercase = sum(c.isupper() for c in cleaned)
        lowercase = sum(c.islower() for c in cleaned)
        if uppercase > 0 and lowercase > 0:
            upper_ratio = uppercase / letters
            # Excessive uppercase (but not all caps) can indicate OCR errors
            if 0.4 < upper_ratio < 0.9 and total > 50:
                logger.info(f"Garbled: Unusual case mixing {upper_ratio:.2f}")
                return True
    
    # Text passes all checks
    return False


async def handle_auto_answer_after_capture(text: str, source: str, session_id: str = None):
    """Automatically trigger AI answer after capturing text (OCR/transcript/etc).
    
    Args:
        session_id: WebSocket session ID for user isolation (if None, broadcasts to all)
    """
    """
    Centralized handler for auto-answering after screen capture.
    Prevents duplicate responses and improves garbled text detection.
    
    Args:
        text: OCR text extracted from capture
        source: "ocr" or "windows" (capture source)
    """
    global _last_auto_answer_text, _last_auto_answer_time
    
    try:
        # Check for duplicate - if we just processed this text, skip
        current_time = time.time()
        if (_last_auto_answer_text == text and 
            current_time - _last_auto_answer_time < 2.0):  # Within 2 seconds
            logger.info(f"Skipping duplicate auto-answer from {source}")
            return
        
        # Update tracking
        _last_auto_answer_text = text
        _last_auto_answer_time = current_time
        
        # Check if text is garbled/meaningless
        # For capture mode, be more lenient since users explicitly requested analysis
        is_capture_mode = source in ("ocr", "windows")
        text_appears_garbled = is_garbled_text(text)
        
        if text_appears_garbled and not is_capture_mode:
            logger.info(f"OCR text from {source} appears garbled - skipping auto-answer")
            # Optionally notify user
            await broadcast({
                "type": "status",
                "message": "⚠️ Captured text appears unclear. Please try capturing again."
            })
            return
        elif text_appears_garbled and is_capture_mode:
            # For capture mode, still proceed but with a warning
            logger.info(f"OCR text from {source} appears garbled but proceeding due to capture mode")
            await broadcast({
                "type": "status", 
                "message": "⚠️ Text quality may be low, but analyzing anyway..."
            })
        
        # Extract question if present
        q = extract_last_question(text)
        
        if q:
            # Question detected - answer it
            logger.info(f"Auto-triggering AI for detected question from {source}: {q[:100]}...")
            broadcast_sync({"type": "coach", "text": "", "reset": True}, session_id=session_id)
            await stream_llm(DEFAULT_LLM, q, out_type="coach", mode="coach", strict=False, context_type="capture", session_id=session_id)
        elif len(text.strip()) > 50:
            # No clear question, but substantial content
            logger.info(f"Auto-triggering AI to answer based on captured content from {source}...")
            broadcast_sync({"type": "coach", "text": "", "reset": True}, session_id=session_id)
            # Pass the content directly
            await stream_llm(DEFAULT_LLM, text[:2000], out_type="coach", mode="coach", strict=False, context_type="capture", session_id=session_id)
        elif is_capture_mode and len(text.strip()) > 10:
            # For capture mode, provide analysis even for shorter text
            logger.info(f"Auto-triggering AI for short capture content from {source} (capture mode)...")
            broadcast_sync({"type": "coach", "text": "", "reset": True}, session_id=session_id)
            prompt = f"Please analyze this captured text and provide helpful insights or answer any questions you can identify:\n\n{text[:1000]}"
            await stream_llm(DEFAULT_LLM, prompt, out_type="coach", mode="coach", strict=False, context_type="capture", session_id=session_id)
        else:
            logger.info(f"Captured text from {source} too short (<{10 if is_capture_mode else 50} chars) - skipping auto-answer")
    
    except Exception as e:
        logger.warning(f"Auto-coach trigger from {source} failed: {e}")


async def broadcast(msg: Dict, session_id: str = None):
    """Send a message to UI clients in a specific session or all if no session specified.
    
    If session_id is provided, only sends to that user's session.
    If session_id is None, broadcasts to all (legacy behavior).
    Avoids noisy stack traces for expected disconnects (timeouts / network).
    """
    if not ui_clients:
        logger.debug(f"[Broadcast] No UI clients connected, skipping message type={msg.get('type')}")
        return
    
    if isinstance(msg, dict) and "text" in msg and "data" not in msg:
        msg = {**msg, "data": msg["text"]}
    data = json.dumps(msg)
    
    # Determine target clients
    if session_id and session_id in ui_clients:
        target_clients = [ui_clients[session_id]]
    elif session_id:
        logger.warning(f"[Broadcast] Session {session_id} not found")
        return
    else:
        # No session specified, send to all (legacy behavior)
        target_clients = list(ui_clients.values())
    
    # Log transcript broadcasts for debugging
    if msg.get('type') == 'transcript':
        logger.info(f"[Broadcast] Sending transcript to session {session_id}: '{msg.get('text', '')[:50]}'")
    
    # Send to target clients in parallel for better performance
    async def send_to_client(ws):
        try:
            await ws.send(data)
            return None  # Success
        except (ConnectionClosed, ConnectionClosedError):
            return ws  # Mark for removal
        except Exception as e:
            logger.warning("Broadcast send failure (%s): %s", getattr(ws, 'id', 'ui'), e)
            return ws  # Mark for removal
    
    # Parallel send with timeout
    results = await asyncio.gather(*[send_to_client(ws) for ws in target_clients], return_exceptions=True)
    
    # Remove stale connections
    stale = [r for r in results if r is not None and not isinstance(r, Exception)]
    if stale:
        stale_sessions = []
        for ws in stale:
            try:
                # Find and remove session
                for sid, swb in list(ui_clients.items()):
                    if swb == ws:
                        del ui_clients[sid]
                        stale_sessions.append(sid)
            except ValueError:
                pass
        if stale_sessions:
            logger.info("Pruned %d stale UI session(s): %s", len(stale_sessions), stale_sessions)


def broadcast_sync(msg: Dict, session_id: str = None):
    """Synchronous version of broadcast for use in streaming loops.
    
    If session_id is provided, only sends to that user's session.
    If session_id is None, broadcasts to all (legacy behavior).
    
    CRITICAL: This must create tasks without awaiting to avoid blocking
    the streaming loop. Tasks are fire-and-forget for maximum throughput.
    """
    if not ui_clients:
        return
    
    # Ensure both 'text' and 'data' are provided for renderer compatibility
    if isinstance(msg, dict) and "text" in msg and "data" not in msg:
        msg = {**msg, "data": msg["text"]}
    data = json.dumps(msg)
    
    # Determine target sessions
    if session_id:
        if session_id not in ui_clients:
            logger.warning(f"[Broadcast] Session {session_id} not found")
            return
        target_sessions = {session_id: ui_clients[session_id]}
    else:
        # No session specified, send to all (legacy behavior)
        target_sessions = ui_clients
    
    disconnected = []
    
    # Get the current event loop
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        logger.warning("No event loop available for broadcast_sync")
        return
    
    for session_id, ws in target_sessions.items():
        try:
            # Create task on the event loop - fire and forget
            # This ensures messages go out without blocking the generator
            loop.create_task(ws.send(data))
        except Exception as e:
            logger.debug("Broadcast error: %s", e)
            disconnected.append(session_id)
    
    # Remove disconnected sessions
    for sid in disconnected:
        try:
            del ui_clients[sid]
        except KeyError:
            pass


async def handle_ui(ws):
    global listen_student_enabled, current_speaker, captured_ocr_texts, partial_text
    
    # Generate unique session ID for this connection
    import uuid
    session_id = str(uuid.uuid4())
    user_id = None  # Will be set from first message containing user_id
    
    ui_clients[session_id] = ws
    client_sessions[ws] = session_id
    
    logger.info(f"[Session] New UI connection: {session_id}")
    
    try:
        # CRITICAL: Send session_id to client immediately so they can use it for audio WebSocket
        await ws.send(json.dumps({"type": "session_init", "session_id": session_id}))
        
        # On new UI connection, send current listen_student state to this session only
        await broadcast({"type": "status", "data": {"listen_student": listen_student_enabled}}, session_id=session_id)
        async for message in ws:
            try:
                if not message:
                    continue
                msg = json.loads(message)
                
                # CRITICAL: Extract user_id from message (sent by desktop app)
                if "user_id" in msg and not user_id:
                    user_id = msg.get("user_id")
                    logger.info(f"[Session {session_id}] User identified: {user_id}")
                
                # Support both 'type' and older 'action' keys
                mtype = msg.get("type") or msg.get("action")
                
                # Handle ping for health monitoring
                if mtype == "ping":
                    await ws.send(json.dumps({
                        "type": "pong",
                        "timestamp": msg.get("timestamp"),
                        "serverTime": time.time() * 1000
                    }))
                    continue
                
                # BYOK: store per-session API config supplied by the desktop app
                if mtype == "init_session":
                    session_configs[session_id] = {
                        "deepgram_api_key": msg.get("deepgram_api_key", ""),
                        "deepgram_model": msg.get("deepgram_model", "nova-2"),
                        "ai_provider": msg.get("ai_provider", "openai"),
                        "ai_api_key": msg.get("ai_api_key", ""),
                        "ai_model": msg.get("ai_model", ""),
                        "ai_base_url": msg.get("ai_base_url", ""),
                        "smart_routing": msg.get("smart_routing", True),
                        "budget_mode": msg.get("budget_mode", False),
                        "max_cost_per_request": msg.get("max_cost_per_request", 0.10),
                    }
                    logger.info(f"[Session {session_id}] init_session received: provider={session_configs[session_id]['ai_provider']}")
                    _provider = session_configs[session_id]["ai_provider"]
                    _base_url = session_configs[session_id].get("ai_base_url", "")
                    _local_custom = _provider == "custom" and any(host in _base_url for host in ("localhost", "127.0.0.1", "::1"))
                    if not session_configs[session_id]["ai_api_key"] and _provider != "ollama" and not _local_custom:
                        await ws.send(json.dumps({"type": "error", "code": "NO_CONFIG", "message": "API keys not configured. Open Settings to add them."}))
                    continue
                
                if mtype == "ask":
                    # Force to default LLM (single-model mode)
                    llm = DEFAULT_LLM
                    facts = msg.get("facts", "")
                    context_type = msg.get("contextType", "general")  # Get context type from client
                    await stream_llm(llm, facts, context_type=context_type, session_id=session_id)
                elif mtype == "ocr":
                    # Run OCR in thread pool to avoid blocking the event loop
                    try:
                        # Accept image as base64 in 'image_b64' or 'image' (string),
                        # or as a list of bytes in 'image'
                        arr: bytes
                        if "image_b64" in msg and isinstance(msg["image_b64"], str):
                            arr = base64.b64decode(msg["image_b64"])  # PNG bytes
                        elif "image" in msg and isinstance(msg["image"], str):
                            # Renderer sends base64 string under 'image'
                            arr = base64.b64decode(msg["image"])
                        elif "image" in msg:
                            # Fallback: list/array of numbers
                            arr = bytes(bytearray(msg["image"]))
                        else:
                            raise ValueError("No image provided for OCR")

                        # Optional debug: emit a quick status message before processing
                        if os.getenv("OCR_DEBUG", "0").lower() in ("1", "true", "yes", "on"):
                            try:
                                await broadcast({
                                    "type": "ocr_status",
                                    "stage": "received",
                                    "bytes": len(arr),
                                    "captureIndex": msg.get("captureIndex"),
                                }, session_id=session_id)
                            except Exception:
                                pass

                        # Fast screen path: answer from the screenshot directly before OCR.
                        # OCR remains as fallback when no vision-capable provider is configured.
                        fast_vision_requested = (
                            _truthy(msg.get("autoAnalyze"))
                            or _truthy(msg.get("fastVision"))
                            or FAST_SCREEN_VISION_FIRST
                        )
                        if fast_vision_requested:
                            await broadcast({
                                "type": "ocr_status",
                                "stage": "fast_vision",
                                "message": "Reading screen with vision model",
                                "captureIndex": msg.get("captureIndex"),
                            }, session_id=session_id)
                            vision_ok = await stream_vision_to_llm(
                                DEFAULT_LLM,
                                arr,
                                session_id=session_id,
                                coaching_mode=str(
                                    msg.get("coachingMode", msg.get("coaching_mode", "false"))
                                ).lower() in ("1", "true", "yes", "on"),
                            )
                            if vision_ok:
                                # Acknowledge to client so it resets its autoTriggerAI flag
                                await broadcast(
                                    {
                                        "type": "ocr_result",
                                        "text": "",
                                        "captureIndex": msg.get("captureIndex", 0),
                                        "totalCaptures": len(get_session_captured_ocr_texts(session_id)),
                                    },
                                    session_id=session_id,
                                )
                                continue  # skip OCR pipeline — LLM already answered
                            # vision failed — fall through to OCR pipeline below

                        # Vision-First Mode Check (legacy, requires VISION_MODE env var)
                        vision_result = None
                        is_vision_analysis = False
                        
                        # Check if Vision Mode is enabled (default to false unless explicitly enabled)
                        if vision_provider.is_available() and os.getenv("VISION_MODE", "false").lower() in ("true", "1", "yes", "on"):
                            logger.info("Vision-First Mode: Analyzing image directly with Vision Model...")
                            try:
                                # Send image to Vision Model
                                vision_prompt = "Analyze this screenshot for an interview context. If it contains a coding problem, solve it. If it contains a diagram, explain it. If it contains text, extract and summarize it. Be concise and direct."
                                # Run in executor to avoid blocking if the provider is synchronous (though it's async, better safe)
                                vision_result = await vision_provider.analyze_image(arr, prompt=vision_prompt)
                                if vision_result:
                                    text = vision_result
                                    is_vision_analysis = True
                                    logger.info("Vision analysis successful")
                            except Exception as ve:
                                logger.error(f"Vision analysis failed: {ve}")
                        
                        if not is_vision_analysis:
                            # Offload OCR processing to thread pool (CPU-intensive)
                            loop = asyncio.get_event_loop()
                            text = await loop.run_in_executor(None, process_ocr_image, arr)

                        # If improved processor / legacy returned install guidance, pass through
                        raw_text = text or ""
                        t_lower = raw_text.lower()
                        
                        # Flag to track if we should send helpful troubleshooting tips
                        send_troubleshooting_response = False
                        
                        if not raw_text.strip():
                            # No text detected - prepare troubleshooting tips
                            send_troubleshooting_response = True
                            hints = [
                                "No text detected from screen capture.",
                                "Tips:",
                                " - Increase capture area or ensure the problem text is fully visible.",
                                " - Avoid very small selections (target > ~1200px longest side after upscale).",
                                " - If using dark mode IDE, ensure high contrast (try light theme or zoom in).",
                                " - Disable fast mode for deeper scan: set OCR_FAST_MODE=0 in .env and restart.",
                                " - Verify Tesseract is installed (Start > 'tesseract' should exist) or set TESSERACT_CMD.",
                                " - Enable debug with OCR_DEBUG=1 to see preprocessing status.",
                            ]
                            text = "\n".join(hints)
                        elif "tesseract not found" in t_lower or "tesseract is required" in t_lower:
                            # Already an install guidance message – keep it but maybe enrich
                            text = raw_text + "\nIf already installed, add its install folder to PATH or set TESSERACT_CMD in .env then restart."

                        if os.getenv("OCR_DEBUG", "0").lower() in ("1", "true", "yes", "on"):
                            try:
                                await broadcast({
                                    "type": "ocr_status",
                                    "stage": "processed",
                                    "empty": not bool(raw_text.strip()),
                                    "length": len(raw_text),
                                }, session_id=session_id)
                            except Exception:
                                pass
                        
                        # Store this OCR result
                        capture_index = msg.get("captureIndex", len(get_session_captured_ocr_texts(session_id)))
                        auto_analyze = msg.get("autoAnalyze", False)

                        set_session_captured_ocr_text(session_id, int(capture_index), text or "")

                        # Metadata from client (optional)
                        meta = msg.get("meta") or {}

                        # Prepare structured steps if auto_analyze requested
                        structured = None
                        if auto_analyze:
                            sections_map = _parse_structured_ocr(text or "")
                            screen_layout_lines = sections_map.get('screen layout', [])
                            raw_text_lines = sections_map.get('raw text', [])
                            screen_layout = "\n".join(screen_layout_lines[:60]).strip()
                            raw_preview = "\n".join(raw_text_lines[:60]).strip()

                            question_lines = _parse_structured_questions(text or "")
                            key_lines_source = screen_layout_lines or raw_text_lines
                            key_lines = [ln.strip() for ln in key_lines_source if ln.strip()][:15]

                            structured = {
                                "steps": [
                                    {"step": 1, "title": "Screen Layout", "detail": screen_layout or raw_preview or (text or "")[:4000]},
                                    {"step": 2, "title": "Key Lines", "detail": key_lines},
                                    {"step": 3, "title": "Detected Questions", "detail": question_lines[:5]},
                                    {"step": 4, "title": "Potential Actions", "detail": []},
                                ],
                                "meta": {
                                    "captureIndex": capture_index,
                                    "dimensions": {"width": meta.get("width"), "height": meta.get("height"), "requestedWidth": meta.get("requestedWidth"), "requestedHeight": meta.get("requestedHeight"), "scaleFactor": meta.get("scaleFactor")},
                                },
                                "sections": sections_map
                            }
                            # Attempt quick heuristic actions
                            actions = []
                            if question_lines:
                                actions.append(f"Answer detected question: {question_lines[-1]}")
                            elif '?' in (text or ''):
                                actions.append("Prepare concise answer to detected question(s)")
                            if any(k in (text or '').lower() for k in ["error", "exception", "failed"]):
                                actions.append("Investigate highlighted error messages")
                            if len(actions) == 0:
                                actions.append("Review extracted text for next steps")
                            structured["steps"][3]["detail"] = actions

                        # Check if OCR result looks like UI chrome instead of content
                        # If so, automatically retry with Windows capture
                        should_retry_windows = False
                        ui_matches = 0
                        word_count = 0
                        alpha_ratio = 0.0
                        teams_matches = 0
                        
                        if text and text.strip():
                            text_lower = text.lower()
                            # Patterns that indicate we're capturing browser/desktop UI instead of content
                            ui_patterns = [
                                'file edit view',  # Browser menu
                                'new tab',  # Browser tabs
                                'reload',  # Browser controls
                                'back forward',  # Browser navigation
                                'address bar',  # Browser UI
                                'bookmarks',  # Browser UI
                                'extensions',  # Browser UI
                                'settings',  # Browser UI
                                'history',  # Browser UI
                                'downloads',  # Browser UI
                                'zoom in', 'zoom out',  # Browser controls
                                'minimize maximize close',  # Window controls
                                'start menu',  # Windows UI
                                'taskbar',  # Windows UI
                                'notification area',  # Windows UI
                                'system tray',  # Windows UI
                                'desktop',  # Windows UI
                                'recycle bin',  # Windows UI
                                'this pc',  # Windows UI
                                'network',  # Windows UI
                                'control panel',  # Windows UI
                                'meeting chat',  # Teams UI
                                'meeting controls',  # Teams UI
                                'participants',  # Teams UI
                                'mute unmute',  # Teams UI
                                'video on off',  # Teams UI
                                'share screen',  # Teams UI
                                'end meeting',  # Teams UI
                            ]
                            
                            # Check for UI patterns
                            ui_matches = sum(1 for pattern in ui_patterns if pattern in text_lower)
                            
                            # Also check for very short text with many non-alphanumeric chars (garbled capture)
                            word_count = len(text.split())
                            alpha_ratio = sum(1 for c in text if c.isalnum()) / len(text) if text else 0
                            
                            # Check for Teams-specific patterns that indicate we should capture Teams window
                            teams_patterns = ['meeting chat', 'participants', 'mute', 'unmute', 'share screen', 'end meeting']
                            teams_matches = sum(1 for pattern in teams_patterns if pattern in text_lower)
                            
                            # Retry if: many UI patterns OR very short text with low alphanumeric ratio OR Teams UI detected
                            should_retry_windows = (
                                ui_matches >= 3 or 
                                (word_count < 10 and alpha_ratio < 0.3 and len(text) > 50) or
                                teams_matches >= 2
                            )
                            
                            if should_retry_windows:
                                logger.info(f"OCR result appears to be UI chrome ({ui_matches} UI patterns, {teams_matches} Teams patterns), retrying with Windows capture")
                        
                        if should_retry_windows and _has_windows_capture:
                            try:
                                # Check if we should target a specific window (Teams)
                                target_window = None
                                if teams_matches >= 2:
                                    # Try to find Teams window
                                    from windows_capture import get_available_windows
                                    windows = get_available_windows()
                                    for w in windows:
                                        if 'teams' in w['title'].lower():
                                            target_window = w['title']
                                            logger.info(f"Detected Teams window for capture: {target_window}")
                                            break
                                
                                # Try Windows capture of specific window or foreground window
                                logger.info(f"Retrying OCR with Windows native capture{' (Teams)' if target_window else ''}")
                                result = capture_window_windows(window_title=target_window) if target_window else capture_window_windows()
                                
                                img_bytes = base64.b64decode(result['image']) if result and result.get('image') else b""
                                if img_bytes and not _is_blank_image_from_bytes(img_bytes):
                                    # Re-process with OCR
                                    
                                    try:
                                        text = process_ocr_image(img_bytes)
                                    except Exception as e:
                                        logger.warning(f"OCR failed in retry: {e}")
                                        text = ""
                                    
                                    # Update stored text
                                    set_session_captured_ocr_text(session_id, int(capture_index), text or "")
                                    
                                    logger.info(f"✅ Windows capture retry successful: {len(text or '')} characters")
                                    
                                    # Update structured analysis if needed
                                    if auto_analyze and text:
                                        sections_map = _parse_structured_ocr(text)
                                        screen_layout_lines = sections_map.get('screen layout', [])
                                        raw_text_lines = sections_map.get('raw text', [])
                                        screen_layout = "\n".join(screen_layout_lines[:60]).strip()
                                        raw_preview = "\n".join(raw_text_lines[:60]).strip()
                                        question_lines = _parse_structured_questions(text)
                                        key_lines_source = screen_layout_lines or raw_text_lines
                                        key_lines = [ln.strip() for ln in key_lines_source if ln.strip()][:15]
                                        
                                        structured["steps"][0]["detail"] = screen_layout or raw_preview or text[:4000]
                                        structured["steps"][1]["detail"] = key_lines
                                        structured["steps"][2]["detail"] = question_lines[:5]
                                        
                                        actions = []
                                        if question_lines:
                                            actions.append(f"Answer detected question: {question_lines[-1]}")
                                        elif '?' in text:
                                            actions.append("Prepare concise answer to detected question(s)")
                                        if any(k in text.lower() for k in ["error", "exception", "failed"]):
                                            actions.append("Investigate highlighted error messages")
                                        if len(actions) == 0:
                                            actions.append("Review extracted text for next steps")
                                        structured["steps"][3]["detail"] = actions
                                        structured["sections"] = sections_map
                                    
                                    # Update meta to indicate Windows capture was used
                                    if meta:
                                        meta['method'] = result.get('method', 'windows_retry')
                                    else:
                                        meta = {'method': result.get('method', 'windows_retry')}
                                    
                                    # text and meta are already updated above; no separate dict needed
                                    logger.info(f"Windows capture retry updated text ({len(text or '')} chars)")
                                    
                                else:
                                    logger.warning("Windows capture retry failed or returned blank image")
                            except Exception as retry_e:
                                logger.warning(f"Windows capture retry failed: {retry_e}")

                        # Send OCR result back to client
                        ocr_response = {
                            "type": "ocr_result" if structured else "ocr",
                            "text": text or "",
                            "captureIndex": capture_index,
                            "totalCaptures": len(get_session_captured_ocr_texts(session_id))
                        }
                        
                        if structured:
                            ocr_response["structured"] = structured
                        
                        if meta:
                            ocr_response["meta"] = meta
                        
                        await broadcast(ocr_response, session_id=session_id)
                        logger.info(f"[OCR] Sent result to session {session_id}: {len(text or '')} chars")

                        # Auto-trigger AI response after capture (only if text was successfully detected)
                        # Enable by default - AI will automatically analyze captured content
                        auto_coach_on_capture = os.getenv("AUTO_COACH_ON_CAPTURE", "1").lower() in ("1", "true", "yes", "on")
                        
                        if is_vision_analysis:
                             # If we already have the vision analysis, send it as the coach response directly
                             await broadcast({
                                "type": "coach",
                                "text": text,
                                "reset": True
                             }, session_id=session_id)
                             logger.info(f"Sent Vision analysis directly as coach response")
                        elif auto_coach_on_capture and text and text.strip() and not send_troubleshooting_response:
                            # Only trigger AI if we have actual text (not troubleshooting tips)
                            await handle_auto_answer_after_capture(text, "ocr", session_id=session_id)
                    except Exception as e:
                        logger.exception("OCR error")
                        error_msg = str(e)
                        if "tesseract is not installed" in error_msg.lower() or "tesseractnotfounderror" in str(type(e)).lower():
                            install_msg = "[Tesseract is required for OCR. Please install from: https://github.com/UB-Mannheim/tesseract/wiki. Be sure to check 'Add to PATH' during installation. After installing, restart the application.]"
                            await broadcast({"type": "ocr", "text": install_msg}, session_id=session_id)
                        elif "file not found" in error_msg.lower() or "the system cannot find the file" in error_msg.lower():
                            path_msg = "[Tesseract was found, but couldn't be executed. Make sure it's properly installed and added to PATH. Restart the application after installation.]"
                            await broadcast({"type": "ocr", "text": path_msg}, session_id=session_id)
                        else:
                            await broadcast({"type": "ocr", "text": f"[OCR error: {e}]"}, session_id=session_id)
                elif mtype == "windows_capture":
                    # Native screen capture — Windows-specific first, cross-platform fallback
                    try:
                        if not _has_windows_capture and not _has_cross_platform_capture:
                            await broadcast({
                                "type": "ocr",
                                "text": "[Native capture not available. Install pywin32 (Windows) or mss (cross-platform): pip install pywin32 mss]"
                            }, session_id=session_id)
                        else:
                            monitor_index = msg.get("monitor", 0)
                            window_title = msg.get("window_title")

                            if _has_windows_capture:
                                if window_title:
                                    logger.info(f"Capturing window (Windows): {window_title}")
                                    result = capture_window_windows(window_title=window_title)
                                else:
                                    logger.info(f"Capturing monitor {monitor_index} (Windows)")
                                    result = capture_screen_windows(monitor_index=monitor_index)
                            else:
                                logger.info(f"Capturing monitor {monitor_index} (cross-platform/mss)")
                                result = capture_screen_cross_platform(monitor_index=monitor_index)
                            
                            if result:
                                # Process with OCR
                                img_bytes = base64.b64decode(result['image'])
                                
                                try:
                                    text = process_ocr_image(img_bytes)
                                except Exception as e:
                                    logger.warning(f"OCR failed in windows_capture path: {e}")
                                    text = ""
                                
                                # Store captured text
                                capture_index = msg.get("captureIndex", len(get_session_captured_ocr_texts(session_id)))
                                set_session_captured_ocr_text(session_id, int(capture_index), text or "")
                                
                                await broadcast({
                                    "type": "ocr",
                                    "text": text or "[No text detected]",
                                    "captureIndex": capture_index,
                                    "totalCaptures": len(get_session_captured_ocr_texts(session_id)),
                                    "method": result.get('method', 'windows')
                                }, session_id=session_id)
                                
                                logger.info(f"✅ Windows capture successful: {len(text or '')} characters extracted")
                                
                                # Auto-trigger AI response after Windows capture
                                auto_coach_on_capture = os.getenv("AUTO_COACH_ON_CAPTURE", "1").lower() in ("1", "true", "yes", "on")
                                
                                if auto_coach_on_capture and text and text.strip():
                                    await handle_auto_answer_after_capture(text, "windows", session_id=session_id)
                            else:
                                await broadcast({
                                    "type": "ocr",
                                    "text": "[Windows capture failed - see logs for details]"
                                }, session_id=session_id)
                    except Exception as e:
                        logger.exception("Windows capture error")
                        await broadcast({"type": "ocr", "text": f"[Windows capture error: {e}]"}, session_id=session_id)
                elif mtype == "list_windows":
                    # List available windows for capture
                    try:
                        if not _has_windows_capture:
                            await broadcast({
                                "type": "windows_list",
                                "windows": [],
                                "error": "Windows capture not available"
                            }, session_id=session_id)
                        else:
                            windows = get_available_windows()
                            await broadcast({
                                "type": "windows_list",
                                "windows": [{"title": w["title"], "hwnd": w["hwnd"]} for w in windows[:50]]  # Limit to 50
                            }, session_id=session_id)
                    except Exception as e:
                        logger.exception("List windows error")
                        await broadcast({
                            "type": "windows_list",
                            "windows": [],
                            "error": str(e)
                        }, session_id=session_id)
                elif mtype == "resume":
                    # Accept resume as (name, data bytes) or (filename/content base64)
                    name = msg.get("name") or msg.get("filename") or "resume.txt"
                    if "data" in msg and isinstance(msg["data"], list):
                        raw = bytes(msg["data"])  # already bytes
                    elif "content" in msg and isinstance(msg["content"], str):
                        try:
                            raw = base64.b64decode(msg["content"])  # base64 file content
                        except Exception:
                            raw = msg["content"].encode("utf-8", errors="ignore")
                    else:
                        txt = msg.get("text") or msg.get("resume_text") or ""
                        raw = txt.encode("utf-8", errors="ignore")
                    await ingest_resume(str(name), raw, session_id=session_id)
                elif mtype == "resume_clear":
                    if session_id in session_resume_data:
                        del session_resume_data[session_id]
                    await broadcast({"type": "resume", "text": "Resume context cleared"}, session_id=session_id)
                elif mtype == "context" and msg.get("context_kind") == "company":
                    # Store company brief details so AI can use them for follow-ups
                    try:
                        formatted = format_company_brief(msg)
                        if not formatted:
                            await broadcast({"type": "context_ack", "context_kind": "company", "success": False, "error": "No company details supplied"}, session_id=session_id)
                        else:
                            await ingest_company_brief(formatted, session_id=session_id)
                            await broadcast({"type": "context_ack", "context_kind": "company", "success": True}, session_id=session_id)
                    except Exception as e:
                        logger.exception("Failed processing company context")
                        await broadcast({"type": "context_ack", "context_kind": "company", "success": False, "error": str(e)}, session_id=session_id)
                elif mtype == "parse_resume":
                    # Handle the simpler resume parsing format for testing
                    try:
                        resume_text = msg.get("resume_text", "")
                        if resume_text:
                            clean_resume_text = re.sub(r"\r\n?", "\n", resume_text)
                            clean_resume_text = re.sub(r"\n{3,}", "\n\n", clean_resume_text).strip()
                            chunks = [chunk.strip() for chunk in clean_resume_text.split("\n\n") if chunk.strip()] or [clean_resume_text]
                            session_data = get_or_create_resume_data(session_id)
                            session_data.update({
                                "index": None,
                                "emb_texts": chunks[:1500],
                                "emb_matrix": None,
                                "profile": extract_structured_resume_profile(clean_resume_text),
                                "raw_text": clean_resume_text,
                            })
                            await broadcast({"type": "resume_parsed", "success": True, "text": f"Processed {len(chunks)} resume chunks"}, session_id=session_id)
                        else:
                            await broadcast({"type": "resume_parsed", "success": False, "error": "No resume text provided"}, session_id=session_id)
                    except Exception as e:
                        logger.exception(f"Resume parsing error: {e}")
                        await broadcast({"type": "resume_parsed", "success": False, "error": str(e)}, session_id=session_id)
                elif mtype == "coach":
                    # Manual coach trigger optionally with provided question
                    q = msg.get("question") or ""
                    llm = DEFAULT_LLM
                    strict = bool(msg.get("strict"))
                    coaching_mode = str(
                        msg.get("coachingMode", msg.get("coaching_mode", "false"))
                    ).lower() in ("1", "true", "yes", "on")
                    question_channel = (msg.get("question_channel") or "auto").lower()
                    valid_channels = {"auto", "capture", "ocr", "transcription", "transcript", "speech", "general"}
                    if question_channel not in valid_channels:
                        question_channel = "auto"
                    
                    company_context_payload = msg.get("company_context")
                    company_context_text = format_company_brief(company_context_payload)

                    # Handle file upload if provided
                    file_upload = msg.get("file_upload")
                    file_context = ""
                    if file_upload:
                        try:
                            file_data = file_upload.get("data", "")
                            file_type = file_upload.get("type", "")
                            file_name = file_upload.get("name", "")
                            
                            logger.info(f"Processing uploaded file: {file_name} ({file_type})")
                            
                            if file_type.startswith("image/"):
                                # Handle image upload with PaddleOCR
                                logger.info("Starting OCR processing...")
                                img_bytes = base64.b64decode(file_data)

                                text = ""
                                try:
                                    text = process_ocr_image(img_bytes)
                                    logger.info(f"OCR completed. Extracted {len(text or '')} characters")
                                except Exception as e_ocr:
                                    logger.exception(f"Image OCR failed: {e_ocr}")
                                    file_context = f"\n\n[Image from {file_name}]:\n[OCR error: {str(e_ocr)}]"
                                else:
                                    # Intelligent text truncation for context management
                                    if text:
                                        text_lines = [line.strip() for line in text.splitlines() if line.strip()]
                                        if len(text) > 8000:
                                            logger.info(f"Truncating OCR text from {len(text)} to ~8000 chars")
                                            text = text[:7000] + "\n\n[... content truncated ...]\n\n" + text[-1000:]
                                        file_context = f"\n\n[Image Content from {file_name}]:\n{text or '(No text detected in image)'}"
                                        logger.info(f"File context prepared: {len(file_context)} chars from {len(text_lines)} lines")
                                    else:
                                        file_context = f"\n\n[Image from {file_name}]:\n(No text detected in image)"
                                        logger.warning("No text extracted from image")
                            
                            elif file_type == "application/pdf":
                                # Handle PDF upload (basic text extraction)
                                try:
                                    logger.info("Starting PDF processing...")
                                    from pypdf import PdfReader
                                    pdf_bytes = base64.b64decode(file_data)
                                    pdf_file = io.BytesIO(pdf_bytes)
                                    pdf_reader = PdfReader(pdf_file)
                                    
                                    pdf_text = []
                                    for page_num in range(min(len(pdf_reader.pages), 10)):  # Limit to first 10 pages
                                        page = pdf_reader.pages[page_num]
                                        pdf_text.append(page.extract_text())
                                    
                                    file_context = f"\n\n[PDF Content from {file_name}]:\n{' '.join(pdf_text)}"
                                    logger.info(f"Extracted text from {len(pdf_reader.pages)} pages of PDF")
                                except ImportError:
                                    logger.warning("pypdf not installed, cannot process PDF")
                                    file_context = f"\n\n[PDF Upload: {file_name}]\n(PDF text extraction requires pypdf library)"
                                except Exception as pdf_err:
                                    logger.exception(f"PDF processing error: {pdf_err}")
                                    file_context = f"\n\n[Error reading PDF: {str(pdf_err)}]"
                        except Exception as e:
                            logger.exception(f"Error processing uploaded file: {e}")
                            file_context = f"\n\n[Error processing file: {str(e)}]"
                            # Send error notification to client
                            await broadcast({"type": "error", "message": f"Failed to process file: {str(e)}"}, session_id=session_id)

                    use_capture_context = question_channel in ("capture", "ocr", "screen_capture")
                    use_transcript_context = question_channel in ("transcription", "transcript", "speech")
                    use_general_context = question_channel == "general"

                    if question_channel == "auto":
                        has_capture_payload = bool(msg.get("capturedScreens")) or (file_upload and isinstance(file_upload, dict) and str(file_upload.get("type", "")).startswith("image/"))
                        if has_capture_payload:
                            use_capture_context = True
                            use_transcript_context = False
                            use_general_context = False
                        else:
                            use_transcript_context = True
                            use_general_context = False
                    elif use_capture_context:
                        use_transcript_context = False
                        use_general_context = False
                    elif use_transcript_context:
                        use_general_context = False
                    elif not (use_capture_context or use_transcript_context or use_general_context):
                        # Fallback to transcription if nothing specified
                        use_transcript_context = True

                    # Handle captured screens if provided
                    current_capture_ocr_texts: List[str] = []
                    captured_screens = msg.get("capturedScreens", []) if use_capture_context else []
                    if captured_screens:
                        fast_vision_requested = _truthy(msg.get("fastVision")) or _truthy(msg.get("autoAnalyze")) or FAST_SCREEN_VISION_FIRST
                        if fast_vision_requested:
                            try:
                                latest_screen = captured_screens[-1]
                                arr = _decode_capture_image_payload(latest_screen)
                                if arr:
                                    await broadcast({
                                        "type": "ocr_status",
                                        "stage": "fast_vision",
                                        "message": "Reading captured screen with vision model",
                                    }, session_id=session_id)
                                    vision_prompt = (q or "").strip() or "Please solve or answer the interview question shown in this screen capture."
                                    vision_ok = await stream_vision_to_llm(
                                        DEFAULT_LLM,
                                        arr,
                                        user_prompt=vision_prompt,
                                        session_id=session_id,
                                        coaching_mode=coaching_mode,
                                    )
                                    if vision_ok:
                                        continue
                            except Exception as vision_err:
                                logger.warning("Fast screen vision failed for coach capture; falling back to OCR: %s", vision_err)

                        current_capture_ocr_texts = []
                        for i, screen_img in enumerate(captured_screens):
                            try:
                                # Process each captured screen for OCR
                                arr = _decode_capture_image_payload(screen_img)
                                if not arr:
                                    continue

                                loop = asyncio.get_event_loop()
                                text = await loop.run_in_executor(None, process_ocr_image, arr)
                                current_capture_ocr_texts.append(text or "")
                                logger.info(f"Processed captured screen {i+1}: {len(text or '')} characters")
                            except Exception as e:
                                logger.exception(f"Error processing captured screen {i+1}: {e}")
                                current_capture_ocr_texts.append("")

                    # Get inputs from various sources
                    provided_question = (q or "").strip()
                    transcript_q = extract_last_question(get_session_partial_text(session_id) or "") if use_transcript_context else ""
                    ocr_q = ""
                    ocr_content = ""
                    interviewer_recent = msg.get("interviewer_recent") or []
                    student_recent = msg.get("student_recent") or []
                    analysis_recent = msg.get("analysis_recent") or []
                    
                    # Get the latest OCR content (prioritize most recent capture)
                    if use_capture_context:
                        try:
                            if current_capture_ocr_texts:
                                # Use the most recent OCR text first
                                for ocr_text in reversed(current_capture_ocr_texts):
                                    if ocr_text and ocr_text.strip():
                                        ocr_content = ocr_text.strip()
                                        potential = extract_last_question(ocr_text)
                                        if potential:
                                            ocr_q = potential
                                        break
                        except Exception:
                            pass

                    actual_question = ""
                    question_source = "capture" if use_capture_context else ("transcription" if use_transcript_context else "general")
                    context_chunks: List[str] = []

                    # Attempt to pull an explicit question from provided text even if it's long
                    provided_question_candidate = ""
                    if provided_question:
                        candidate = provided_question.strip()
                        if candidate:
                            if _looks_like_question(candidate):
                                provided_question_candidate = candidate
                            else:
                                extracted = extract_last_question(candidate)
                                if extracted:
                                    provided_question_candidate = extracted

                    if use_capture_context:
                        if provided_question_candidate:
                            actual_question = provided_question_candidate
                            question_source = "capture"
                        elif ocr_q:
                            actual_question = ocr_q
                            question_source = "capture"
                        elif transcript_q:
                            actual_question = transcript_q
                            question_source = "transcription"
                        else:
                            actual_question = "Please analyze the captured screen."
                            question_source = "capture"

                        # Assemble supporting context
                        # DISABLED BY DEFAULT: Do not include queue context to focus only on current question
                        include_queue_context = os.getenv("INCLUDE_QUEUE_CONTEXT", "0").lower() in ("1", "true", "yes", "on")
                        
                        if provided_question and (not provided_question_candidate or provided_question_candidate != provided_question.strip()):
                            context_chunks.append(f"User context: {provided_question[:800]}")
                        
                        # Only include OCR/capture queue context if explicitly enabled
                        if include_queue_context:
                            if ocr_content:
                                context_chunks.append(f"Screen content excerpt:\n{ocr_content[:800]}")
                            if analysis_recent:
                                recent_analysis = " | ".join(str(item).strip() for item in analysis_recent[-3:] if str(item).strip())
                                if recent_analysis:
                                    context_chunks.append(f"Recent OCR analysis:\n{recent_analysis[:600]}")
                    elif use_transcript_context:
                        if provided_question_candidate:
                            actual_question = provided_question_candidate
                            question_source = "transcription"
                        elif transcript_q:
                            actual_question = transcript_q
                            question_source = "transcription"
                        else:
                            actual_question = provided_question.strip() if provided_question else "general interview preparation"
                            question_source = "general" if provided_question else "transcription"

                        # DISABLED BY DEFAULT: Do not include transcribe queue context to focus only on current question
                        include_queue_context = os.getenv("INCLUDE_QUEUE_CONTEXT", "0").lower() in ("1", "true", "yes", "on")
                        
                        if include_queue_context:
                            if interviewer_recent:
                                interviewer_snippet = " ".join(str(item).strip() for item in interviewer_recent[-15:] if str(item).strip())
                                if interviewer_snippet:
                                    context_chunks.append(f"Recent interviewer transcript:\n{interviewer_snippet[:800]}")
                            if student_recent:
                                student_snippet = " ".join(str(item).strip() for item in student_recent[-10:] if str(item).strip())
                                if student_snippet:
                                    context_chunks.append(f"Recent student response:\n{student_snippet[:600]}")
                    else:
                        if provided_question_candidate:
                            actual_question = provided_question_candidate
                            question_source = "general"
                        elif provided_question:
                            actual_question = provided_question.strip()
                            question_source = "general"
                        elif transcript_q:
                            actual_question = transcript_q
                            question_source = "transcription"
                        else:
                            actual_question = "general interview preparation"
                            question_source = "general"
                    
                    # Ensure we have a question to work with
                    if not actual_question:
                        if file_context:
                            # If we have a file but no question, ask to analyze it
                            actual_question = "Please analyze and explain the content shown in the uploaded file."
                            question_source = "capture"  # File upload is like capture context
                        else:
                            actual_question = "general interview preparation"
                    
                    # Append file context if available
                    if file_context:
                        context_chunks.append(file_context)
                        if question_source == "general":
                            question_source = "capture"  # File upload adds capture-like context

                    # Check if capture context was requested but no screen content is available
                    if question_source == "capture" and not ocr_content and not file_context and not provided_question:
                        logger.warning("Capture context requested but no current screen content available")
                        await broadcast({
                                "type": "status", 
                                "message": "⚠️ No screen content captured. Please capture the screen first using the capture button."
                            })
                    
                    logger.info(f"Processing coach request. Question length: {len(actual_question)}, Source: {question_source}, First 200 chars: {actual_question[:200]}...")
                    
                    # Send status update to UI with source information
                    if file_context:
                        await broadcast({"type": "status", "message": "Processing uploaded file and generating response..."}, session_id=session_id)
                    
                    # Send context type information to UI for labeling
                    context_label = {
                        "transcription": "🎤 Interview Question",
                        "capture": "📷 Screen Content", 
                        "general": "💭 General Question"
                    }.get(question_source, "❓ Question")
                    
                    # Early reset signal for UI with context information
                    broadcast_sync({
                        "type": "coach", 
                        "text": "", 
                        "reset": True,
                        "contextType": question_source,
                        "contextLabel": context_label
                    }, session_id=session_id)
                    # Pass the actual question directly, not prefixed with "Last question:"
                    supporting_ctx = [chunk.strip() for chunk in context_chunks if chunk and chunk.strip()]
                    if company_context_text and _is_company_related(actual_question, company_context_text):
                        supporting_ctx.append(company_context_text)
                    await stream_llm(
                        llm,
                        actual_question.strip(),
                        out_type="coach",
                        mode="coach",
                        strict=strict,
                        context_type=question_source,
                        extra_ctx=supporting_ctx or None,
                        session_id=session_id,
                        coaching_mode=coaching_mode,
                    )
                elif mtype == "clear_captures":
                    # Clear all captured OCR texts
                    clear_session_captures(session_id)
                    logger.info(f"[Session {session_id}] Cleared all captured OCR texts")
                    await broadcast({"type": "captures_cleared"}, session_id=session_id)
                elif mtype == "clear_transcript":
                    # Clear the accumulated transcript (partial_text) on server
                    old_len = len(get_session_partial_text(session_id))
                    set_session_partial_text(session_id, "")
                    logger.info(f"[Session {session_id}] Cleared transcript (was {old_len} chars)")
                    await broadcast({"type": "transcript_cleared"}, session_id=session_id)
                elif mtype == "clear_conversation":
                    # Clear conversation history for specified mode or all modes
                    global conversation_history
                    mode_to_clear = msg.get("mode", "all")
                    session_hist = get_or_create_session_history(session_id)
                    if mode_to_clear == "all":
                        for mode in session_hist:
                            session_hist[mode] = []
                        logger.info(f"[Session {session_id}] Cleared all conversation history")
                        await broadcast({"type": "conversation_cleared", "mode": "all"}, session_id=session_id)
                    elif mode_to_clear in session_hist:
                        session_hist[mode_to_clear] = []
                        logger.info(f"[Session {session_id}] Cleared conversation history for mode: {mode_to_clear}")
                        await broadcast({"type": "conversation_cleared", "mode": mode_to_clear}, session_id=session_id)
                elif mtype == "start_audio":
                    # Get speaker information and recording mode if provided
                    speaker = msg.get("speaker", "user1")
                    recording_mode = msg.get("recording_mode", "interviewer")  # 'interviewer' or 'student'
                    # Store current speaker and mode for transcription
                    current_speaker = speaker
                    # Store recording mode globally for use in transcription
                    globals()['current_recording_mode'] = recording_mode
                    # Inform UI we're listening (actual audio comes on /audio)
                    await broadcast({
                        "type": "status", 
                        "data": {
                            "audio": "listening", 
                            "speaker": speaker,
                            "recording_mode": recording_mode
                        }
                    }, session_id=session_id)
                elif mtype == "stop_audio":
                    # Reset recording mode to prevent further transcript accumulation
                    globals()['current_recording_mode'] = None
                    try:
                        # Optionally trim partial_text to reduce repeats next session
                        current_partial = get_session_partial_text(session_id)
                        if len(current_partial) > 1200:
                            set_session_partial_text(session_id, current_partial[-800:])
                    except Exception:
                        pass
                    await broadcast({"type": "status", "data": {"audio": "stopped"}}, session_id=session_id)
                elif mtype == "set_speaker":
                    # Update the current speaker
                    speaker = msg.get("speaker", "user1") 
                    current_speaker = speaker
                    await broadcast({"type": "status", "data": {"speaker": speaker}}, session_id=session_id)
                elif mtype == "listen_student":
                    # Toggle listening to student's utterances
                    enabled = bool(msg.get("enabled", False))
                    listen_student_enabled = enabled
                    logger.info(f"Listen student toggle: {listen_student_enabled}")
                    await asyncio.sleep(0)  # flush event loop
                    await broadcast({"type": "status", "data": {"listen_student": listen_student_enabled}}, session_id=session_id)
                elif mtype == "ai_status":
                    # Return AI provider status
                    await ensure_ai_initialized()
                    status = get_ai_status()
                    await broadcast({
                        "type": "ai_status",
                        "data": {
                            "initialized": ai_initialized,
                            **status
                        }
                    }, session_id=session_id)
                elif mtype == "set_language":
                    # Change transcription language
                    language = msg.get("language", "en-US")
                    logger.info(f"[Session {session_id}] Setting transcription language to: {language}")
                    if streaming_engine:
                        success = await streaming_engine.set_language(language)
                        await broadcast({
                            "type": "language_changed",
                            "language": language,
                            "success": success
                        }, session_id=session_id)
                    else:
                        # Store for when engine is created
                        globals()['pending_language'] = language
                        await broadcast({
                            "type": "language_changed",
                            "language": language,
                            "success": True
                        }, session_id=session_id)
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON from UI client: {e}")
            except Exception as e:
                logger.exception(f"Error processing message: {e}")
                try:
                    await broadcast({"type": "error", "text": f"[Message processing error: {e}]"}, session_id=session_id)
                except:
                    pass  # Ignore errors when broadcasting error messages
    except (ConnectionClosed, ConnectionClosedError):
        logger.info(f"[Session] UI client disconnected: {session_id}")
    except Exception as e:
        logger.error(f"UI connection error: {e}")
    finally:
        # Clean up session data
        if session_id in ui_clients:
            del ui_clients[session_id]
        if ws in client_sessions:
            del client_sessions[ws]

        if session_id in session_configs:
            del session_configs[session_id]
            logger.info(f"[Session] Cleared provider config for session: {session_id}")
        
        # Clean up session-specific resume data for privacy
        if session_id in session_resume_data:
            del session_resume_data[session_id]
            logger.info(f"[Session] Cleared resume data for session: {session_id}")
        
        # Clean up session conversation history
        if session_id in conversation_history:
            del conversation_history[session_id]
            logger.info(f"[Session] Cleared conversation history for session: {session_id}")
        
        logger.info(f"[Session] Cleaned up session: {session_id}")


async def ingest_resume(name: str, raw: bytes, session_id: str = None):
    """Ingest a resume file.
    
    Args:
        session_id: WebSocket session ID for user isolation (REQUIRED for privacy)
    """
    import numpy as np
    if not session_id:
        logger.error("⚠️ Resume ingestion without session_id - rejecting for privacy")
        return
    
    text = ""
    try:
        if name.lower().endswith(".pdf"):
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(raw))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        elif name.lower().endswith(".docx"):
            import docx
            doc = docx.Document(io.BytesIO(raw))
            text = "\n".join(p.text for p in doc.paragraphs)
        else:
            text = raw.decode("utf-8", errors="ignore")
    except Exception as e:
        logger.exception("Resume parse error: %s", e)
        await broadcast({"type": "resume", "text": f"[Resume parse error: {e}]"}, session_id=session_id)
        return

    # Basic cleanup
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Chunk to ~500 chars blocks preserving paragraphs
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: List[str] = []
    buf = []
    size = 0
    for p in paras:
        if size + len(p) + 1 > 500 and buf:
            chunks.append("\n".join(buf))
            buf, size = [], 0
        buf.append(p)
        size += len(p) + 1
    if buf:
        chunks.append("\n".join(buf))

    # Safety limits
    if len(chunks) > 1500:
        chunks = chunks[:1500]
    if not chunks:
        await broadcast({"type": "resume", "text": "[Resume contains no extractable text]"}, session_id=session_id)
        return
    
    # Initialize session data if not exists
    global SentenceTransformer, session_resume_data
    session_data = get_or_create_resume_data(session_id)
    existing_embedder = session_data.get("embedder")
    session_data.update({
        "index": None,
        "emb_texts": [],
        "emb_matrix": None,
        "embedder": existing_embedder,
        "profile": extract_structured_resume_profile(text),
        "raw_text": text
    })
    
    try:
        if SentenceTransformer is None:
            from sentence_transformers import SentenceTransformer as ST  # lazy import
            SentenceTransformer = ST
        if session_data["embedder"] is None:
            session_data["embedder"] = SentenceTransformer("all-MiniLM-L6-v2")
        
        vectors = session_data["embedder"].encode(chunks, normalize_embeddings=True)
        
        if _has_faiss:
            session_data["index"] = faiss.IndexFlatIP(vectors.shape[1])  # type: ignore
            session_data["index"].add(np.asarray(vectors, dtype='float32'))
        else:
            # Simple numpy-based store
            vecs = np.asarray(vectors, dtype='float32')
            session_data["emb_matrix"] = vecs
        
        session_data["emb_texts"].extend(chunks)
        logger.info("✅ Ingested %d resume chunks for session %s", len(chunks), session_id)
        await broadcast({"type": "resume", "text": f"✅ Ingested {len(chunks)} resume chunks"}, session_id=session_id)
    except Exception as e:
        # Fallback when embeddings are unavailable; still store text for minimal context
        logger.warning("Embedding unavailable, storing resume text only: %s", e)
        session_data["emb_texts"].extend(chunks)
        await broadcast({"type": "resume", "text": f"Ingested {len(chunks)} resume chunks (no embeddings)"}, session_id=session_id)


async def ingest_company_brief(text: str, session_id: str = None):
    """Persist company brief text into embedding store for personalization.
    
    Args:
        session_id: WebSocket session ID for user isolation (REQUIRED for privacy)
    """
    import numpy as np
    if not session_id:
        logger.error("⚠️ Company brief ingestion without session_id - rejecting for privacy")
        return
    
    global SentenceTransformer, company_brief_chunks, session_resume_data
    clean = text.strip()
    if not clean:
        return
    company_brief_chunks.append(clean)
    if len(company_brief_chunks) > 50:
        del company_brief_chunks[:-50]
    
    # Initialize session data if not exists
    session_data = get_or_create_resume_data(session_id)
    
    # Reuse existing embedding pipeline for consistency
    try:
        if SentenceTransformer is None:
            from sentence_transformers import SentenceTransformer as ST  # lazy import
            SentenceTransformer = ST
        if session_data["embedder"] is None:
            session_data["embedder"] = SentenceTransformer("all-MiniLM-L6-v2")
        
        vectors = session_data["embedder"].encode([clean], normalize_embeddings=True)
        session_data["emb_texts"].extend([clean])
        
        if _has_faiss:
            if session_data["index"] is None:
                session_data["index"] = faiss.IndexFlatIP(vectors.shape[1])  # type: ignore
            session_data["index"].add(np.asarray(vectors, dtype='float32'))
        else:
            vecs = np.asarray(vectors, dtype='float32')
            if session_data["emb_matrix"] is None:
                session_data["emb_matrix"] = vecs
            else:
                session_data["emb_matrix"] = np.vstack([session_data["emb_matrix"], vecs])
        logger.info("✅ Company brief ingested for session %s", session_id)
    except Exception as e:
        logger.warning("Embedding unavailable for company brief: %s", e)
        session_data["emb_texts"].extend([clean])


def enhance_response_formatting(text: str) -> str:
    """
    Enhance response formatting for better readability and interview context.
    Now includes proper markdown code block formatting.
    """
    if not text:
        return text
    
    enhanced = text
    
    # 1. First apply markdown code block formatting (critical for code display)
    enhanced = format_markdown_blocks(enhanced)
    
    # 2. Improve paragraph structure - add line breaks for better readability
    # Convert long sentences separated by periods into separate lines
    enhanced = re.sub(r'(\w\.)\s+(\d+\.\s*[A-Z])', r'\1\n\n\2', enhanced)  # Numbered lists
    enhanced = re.sub(r'([:.])\s*(###\s*[A-Z])', r'\1\n\n\2', enhanced)  # Headers with ###
    
    # 3. Format coordinates and mathematical expressions properly with LaTeX
    # Convert coordinate notation to LaTeX
    enhanced = re.sub(r'\(([i-z]),?\s*([i-z])\)', r'\\((\1, \2)\\)', enhanced)  # (i, j) -> \((i, j)\)
    enhanced = re.sub(r'\b(\d+)\s*x\s*(\d+)\s*matrix\b', r'\\(\1 \\times \2\\) matrix', enhanced)
    enhanced = re.sub(r'\b(\d+)\s*or\s*(\d+)\s*steps?\b', r'\\(\1\\) or \\(\2\\) steps', enhanced)
    
    # 4. Improve bullet point and list formatting
    enhanced = re.sub(r'^[\s]*[-•*]\s*', '• ', enhanced, flags=re.MULTILINE)
    enhanced = re.sub(r'\b(\d+)\.\s*([A-Z][^.]*:)', r'\n\n**\1. \2**\n', enhanced)  # Numbered sections
    enhanced = re.sub(r'###\s*([^\n]+)', r'\n\n### \1\n', enhanced)  # Headers
    
    # 5. Structure interview answers better
    # Look for common interview answer patterns and format them
    patterns = [
        (r'Current Position:', r'\n\n**Current Position:**'),
        (r'Contextual Explanation:', r'\n\n**Contextual Explanation:**'),
        (r'Next Steps:', r'\n\n**Next Steps:**'),
    ]
    
    for pattern, replacement in patterns:
        enhanced = re.sub(pattern, replacement, enhanced)
    
    # 5. Format key phrases as proper bullet points
    enhanced = re.sub(r'"([^"]+)"\s*•', r'\n• "\1"', enhanced)
    enhanced = re.sub(r'"\s*•\s*"', r'"\n• "', enhanced)
    
    # 6. Improve spacing and clean up
    enhanced = re.sub(r'\n{3,}', '\n\n', enhanced)  # Max 2 newlines
    enhanced = re.sub(r'^\s+', '', enhanced, flags=re.MULTILINE)  # Remove leading spaces
    enhanced = re.sub(r'\s+([.!?:;,])', r'\1', enhanced)  # Fix punctuation spacing
    
    # 7. Ensure proper LaTeX math formatting
    enhanced = re.sub(r'(?<!\$)\$([^$\n]+)\$(?!\$)', r' $\1$ ', enhanced)  # Inline math
    enhanced = re.sub(r'\\\[\s*([^\\]*?)\s*\\\]', r'\n$$\1$$\n', enhanced)  # Display math
    
    # 8. Clean up final formatting
    enhanced = enhanced.strip()
    
    return enhanced


def smart_truncate_content(content: str, question: str, max_total_tokens: int = 6000) -> str:
    """
    Intelligently truncate content based on question length and model capacity.
    
    Args:
        content: The full content (OCR text, PDF text, etc.)
        question: The user's question
        max_total_tokens: Maximum tokens for the entire context (default: 6000)
    
    Returns:
        Truncated content that fits within model limits
    """
    # Rough token estimation: 1 token ≈ 4 characters
    def estimate_tokens(text: str) -> int:
        return len(text) // 4
    
    question_tokens = estimate_tokens(question)
    system_prompt_tokens = 500  # Reserve for system prompt
    response_tokens = 1000  # Reserve for model response
    
    # Calculate available tokens for content
    available_tokens = max_total_tokens - question_tokens - system_prompt_tokens - response_tokens
    
    if available_tokens <= 0:
        logger.warning("Question too long, minimal content space available")
        available_tokens = 500
    
    available_chars = available_tokens * 4
    
    if len(content) <= available_chars:
        logger.info(f"Content fits within limits: {len(content)} chars, ~{estimate_tokens(content)} tokens")
        return content
    
    # Smart truncation strategies based on content type
    lines = content.split('\n')
    
    # Strategy 1: Keep most relevant parts (beginning and end)
    if len(lines) > 20:
        # Keep first 40% and last 20% of content (often contains key info)
        keep_start = int(len(lines) * 0.4)
        keep_end = int(len(lines) * 0.2)
        
        truncated_lines = (
            lines[:keep_start] + 
            ["\n... [Middle section truncated for length] ...\n"] + 
            lines[-keep_end:]
        )
        truncated = '\n'.join(truncated_lines)
        
        if len(truncated) <= available_chars:
            logger.info(f"Smart truncation applied: {len(content)} -> {len(truncated)} chars")
            return truncated
    
    # Strategy 2: Simple truncation with marker
    truncated = content[:available_chars]
    # Try to end at a sentence or line break
    last_period = truncated.rfind('.')
    last_newline = truncated.rfind('\n')
    cutoff = max(last_period, last_newline)
    
    if cutoff > available_chars * 0.8:  # If we found a good break point
        truncated = truncated[:cutoff + 1]
    
    logger.info(f"Simple truncation applied: {len(content)} -> {len(truncated)} chars (~{estimate_tokens(truncated)} tokens)")
    return truncated + "\n\n... [Content truncated to fit model context limits]"


def _extract_company_names(text: str) -> List[str]:
    names: List[str] = []
    if not text:
        return names
    try:
        # Look for lines like "Company: NAME", "Company Name: NAME", or "Organization: NAME"
        for line in text.splitlines():
            m = re.match(r"\s*(?:Company(?:\s+Name)?|Organization)\s*:\s*(.+)$", line.strip(), flags=re.IGNORECASE)
            if m:
                name = m.group(1).strip()
                if name:
                    names.append(name)
        # Fallback: take first non-empty line as a potential name if nothing found
        if not names:
            for line in text.splitlines():
                s = line.strip()
                if s:
                    # Avoid generic section headers
                    if not re.match(r"^(overview|role|website|notes)\s*:", s, flags=re.IGNORECASE):
                        names.append(s)
                        break
    except Exception:
        pass
    # Normalize and dedupe (case-insensitive)
    seen = set()
    uniq: List[str] = []
    for n in names:
        k = n.lower()
        if k not in seen:
            seen.add(k)
            uniq.append(n)
    return uniq


def _is_company_related(question_or_text: str, company_text: str) -> bool:
    """
    Detect if a question is related to company information.
    Company brief should ONLY be used when the interviewer asks about the company.
    """
    try:
        if not question_or_text or not company_text:
            return False
        # Prefer explicit last question if present
        q = extract_last_question(question_or_text) or question_or_text
        ql = q.lower()
        
        # If the question mentions the company name, it's relevant
        names = _extract_company_names(company_text)
        for name in names:
            clean_name = name.strip()
            company_base = re.sub(
                r"\b(inc\.?|corp\.?|corporation|llc|ltd\.?|limited|technologies|technology)\b",
                "",
                clean_name,
                flags=re.IGNORECASE,
            ).strip(" .,-")
            if clean_name and (clean_name.lower() in ql or (company_base and company_base.lower() in ql)):
                return True
        
        # Expanded patterns for company-related questions
        # These patterns indicate the interviewer is asking about the company
        patterns = [
            # Direct company questions
            r"\bwhy\s+(do\s+you\s+want\s+to\s+)?work\s+(here|at\s+.+?|with\s+us)\b",
            r"\bwhat\s+do\s+you\s+know\s+about\s+(us|our\s+company|this\s+company|.+?)\b",
            r"\btell\s+(me|us)\s+about\s+(the\s+)?company\b",
            r"\bwhat\s+interests\s+you\s+about\s+(this\s+)?(role|position|company)\b",
            
            # Company attributes (using "our" or "the company")
            r"\bour\s+(mission|values|culture|product|products|stack|technology|tech\s*stack|customers|market|competitors|team|vision)\b",
            r"\bthe\s+company['']?s\s+(mission|values|culture|product|products|goals|vision)\b",
            r"\bcompany\s+(mission|vision|values|culture|product|products|background|history)\b",
            
            # Specific company topics
            r"\babout\s+(the\s+)?company\b",
            r"\bhow\s+(would|do)\s+you\s+(fit|contribute)\s+(in|to|at)\s+(our|the|this)\s+(company|team|organization)\b",
            r"\bhow\s+(would|do)\s+you\s+improve\s+(our|the)\s+(product|website|app|service)\b",
            
            # Interviewer-specific phrases
            r"\bwhy\s+(should|do)\s+we\s+hire\s+you\b",
            r"\bwhat\s+can\s+you\s+bring\s+to\s+(our|the|this)\s+(company|team)\b",
            r"\bhow\s+do\s+you\s+align\s+with\s+(our|the)\s+(values|culture|mission)\b",
            
            # Research-based questions
            r"\bwhat\s+do\s+you\s+think\s+about\s+(our|the)\s+(product|approach|strategy)\b",
            r"\bwhat\s+would\s+you\s+change\s+about\s+(our|the)\s+(product|service|website)\b",
            
            # Company-specific terminology
            r"\bwhy\s+are\s+you\s+interested\s+in\s+(this|the|our)\s+(company|organization)\b",
            r"\bwhy\s+(are\s+you\s+interested\s+in|this)\s+(company|organization|role\s+at)\b",
        ]
        
        for pat in patterns:
            if re.search(pat, ql, re.IGNORECASE):
                logger.info(f"🏢 Company-related question detected (pattern: {pat[:50]}...)")
                return True
        
        return False
    except Exception as e:
        logger.warning(f"Error checking if question is company-related: {e}")
        return False


def _requested_code_language(question: str) -> str:
    q = (question or "").lower()
    language_patterns = [
        ("cpp", r"\b(c\+\+|cpp)\b"),
        ("python", r"\bpython\b"),
        ("java", r"\bjava\b"),
        ("javascript", r"\b(javascript|js)\b"),
        ("typescript", r"\b(typescript|ts)\b"),
        ("go", r"\b(golang|go)\b"),
        ("sql", r"\bsql\b"),
        ("c", r"\bc language\b|\bin c\b"),
    ]
    for language, pattern in language_patterns:
        if re.search(pattern, q):
            return language
    return "cpp"


def _build_interview_prompt(
    question: str,
    ctx: List[str],
    question_type: str,
    strict: bool = False,
    context_type: str = "general",
    additional_context: str = "",
    coaching_mode: bool = False,
) -> tuple[str, str]:
    del context_type
    supporting_context = "\n\n".join(chunk.strip() for chunk in (ctx or []) if chunk and chunk.strip())
    if additional_context.strip():
        supporting_context = (
            f"{supporting_context}\n\n{additional_context.strip()}"
            if supporting_context else additional_context.strip()
        )

    shared_guardrails = (
        "You are an Interview AI copilot. Answer the current interviewer question directly. "
        "Use provided candidate/resume context only when the question type requires it. "
        "Never invent companies, internships, CGPA, metrics, achievements, certifications, technologies, or outcomes. "
        "If a fact is missing, say it conservatively or leave it out. "
        "Do not mix in unrelated prior topics unless the question asks for them."
    )
    if strict:
        shared_guardrails += " Keep the answer especially focused and avoid optional background."
    if coaching_mode:
        shared_guardrails += (
            " Start with the direct final answer. After that, you may add a short coaching section with key points or follow-up questions. "
            "Avoid canned coaching labels and keep any coaching addendum short."
        )
    else:
        shared_guardrails += (
            " Coaching mode is off: show only the direct interview answer. "
            "Do not include coaching notes, tips, answer-planning language, or follow-up questions."
        )

    context_block = ""
    if supporting_context:
        label = "Relevant candidate context" if question_type in {
            "resume_hr", "behavioral", "resume_specific", "unsupported_resume_claim_check"
        } else "Supporting question context"
        context_block = f"\n\n{label}:\n{supporting_context[:3500]}"

    if question_type in {"resume_hr", "resume_specific"}:
        system = (
            f"{shared_guardrails} "
            "Generate a natural, interview-ready answer in first person, as if the candidate is speaking. "
            "Use resume facts from the context, keep it around 45-90 seconds, and write in polished paragraphs. "
            "Do not provide coaching notes or bullet-only answers."
        )
        user = (
            f"Interview question: {question}{context_block}\n\n"
            "Answer in first person using only supported resume facts. If relevant facts are missing, give a concise conservative answer without making them up."
        )
        return system, user

    if question_type == "behavioral":
        behavioral_missing_detail_rule = (
            "If resume facts are insufficient for a specific story, ask up to two short clarification questions after a brief note."
            if coaching_mode else
            "If resume facts are insufficient for a specific story, give a conservative first-person answer based only on known facts."
        )
        system = (
            f"{shared_guardrails} "
            "Use STAR reasoning internally, but output a natural spoken answer with Situation, Task, Action, Result, and Learning woven into paragraphs. "
            "Answer in first person as the candidate and do not label STAR sections. "
            "Prefer real projects, internships, leadership roles, hackathons, or achievements from the resume context. "
            "Do not invent numeric impact; use qualitative impact if exact results are not provided."
        )
        user = (
            f"Behavioral interview question: {question}{context_block}\n\n"
            f"Give one specific, conservative interview answer. {behavioral_missing_detail_rule}"
        )
        return system, user

    if question_type == "coding":
        language = _requested_code_language(question)
        system = (
            f"{shared_guardrails} "
            "You are a precise coding interview assistant. Do not use resume context. "
            "Return clean, syntactically correct code with proper line breaks and indentation. "
            "Always use fenced markdown code blocks with a language tag."
        )
        user = (
            f"Coding question: {question}{context_block}\n\n"
            "Return exactly these sections:\n"
            "1. Problem restatement\n"
            "2. Approach\n"
            f"3. Clean code in a fenced markdown block tagged `{language}`\n"
            "4. Edge cases\n"
            "5. Time complexity\n"
            "6. Space complexity\n\n"
            "If no language is specified by the question, use C++17. The code must compile and must not be compressed into one line. "
            "For C++ answers, include valid headers such as `#include <bits/stdc++.h>` or exact standard headers; never write a bare `#include`. "
            "For C++ virtual-function/OOP examples, include required headers and demonstrate polymorphism with a pointer, reference, or smart pointer."
        )
        return system, user

    if question_type == "system_design":
        q_lower = (question or "").lower()
        messaging_design = bool(re.search(r"\b(whatsapp|chat|messag(?:e|ing|er)?|dm|direct message|telegram|signal)\b", q_lower))
        domain_specific_depth = (
            "For messaging apps, explicitly cover real-time messaging, persistent WebSocket connections, queues, delivery status, online/offline handling, media storage, push notifications, group chat handling, end-to-end encryption, database schema, and horizontal scaling. "
            if messaging_design else
            "Keep domain-specific components tied to the actual product in the question; do not add unrelated chat or messaging sections unless the product needs them. "
        )
        system = (
            f"{shared_guardrails} "
            "You are a senior system design interviewer. Do not use resume context unless explicitly requested. "
            "Give a deep but interview-practical design answer. State assumptions clearly and keep them conservative."
        )
        user = (
            f"System design question: {question}{context_block}\n\n"
            "Cover: requirements and assumptions, rough APIs, data model, high-level architecture, storage choices, caching, scaling, consistency, reliability/failure handling, security/privacy where relevant, bottlenecks, and tradeoffs. "
            f"{domain_specific_depth}"
            "Avoid fake traffic numbers unless the question provides them."
        )
        return system, user

    if question_type == "technical":
        system = (
            f"{shared_guardrails} "
            "Answer as a strong technical interview candidate. Do not use resume context unless the question explicitly asks to connect the answer to the candidate's project or resume."
        )
        user = (
            f"Technical interview question: {question}{context_block}\n\n"
            "Give a clear explanation with examples when useful. Keep it accurate, concise, and interview-ready. "
            "For browser URL flow questions, cover DNS, TCP/TLS, HTTP request/response, and browser rendering."
        )
        return system, user

    if question_type == "unsupported_resume_claim_check":
        system = (
            f"{shared_guardrails} "
            "This is a resume claim-check. Search only the provided resume facts/context. "
            "If the claim is not found, say it is not found in the resume context. Never invent missing experience."
        )
        user = (
            f"Claim-check question: {question}{context_block}\n\n"
            "Answer directly: say whether the claim is supported by the resume facts shown, and cite the matching fact if present. "
            "If it is not supported, say it is not found in the resume context."
        )
        return system, user

    system = (
        f"{shared_guardrails} "
        "Answer using general AI knowledge. Do not use resume context unless the question explicitly asks about the candidate."
    )
    user = (
        f"Question: {question}{context_block}\n\n"
        "Give a direct, accurate answer. Avoid unsupported assumptions and unrelated context."
    )
    return system, user


def build_prompts(
    mode: str,
    facts: str,
    ctx: List[str],
    strict: bool = False,
    context_type: str = "general",
    classification=None,
    resume_profile: Optional[Dict] = None,
    coaching_mode: bool = False,
    session_id: Optional[str] = None,
):
    base_ctx = chr(10).join(ctx)
    company_context = get_company_brief_text()
    
    # ENV toggle to forcibly include company brief for all prompts (not recommended for general use)
    include_company_always = os.getenv("INCLUDE_COMPANY_ALWAYS", "0").lower() in ("1", "true", "yes", "on")
    
    # CONDITIONAL COMPANY BRIEF INCLUSION
    # Company information is ONLY included when:
    # 1. INCLUDE_COMPANY_ALWAYS env var is set (debugging/testing only), OR
    # 2. The question is detected as company-related (interviewer asking about the company)
    is_company_question = _is_company_related(facts or "", company_context)
    
    if company_context and (include_company_always or is_company_question):
        company_block = f"Company Brief:\n{company_context}"
        base_ctx = f"{base_ctx}\n\n{company_block}" if base_ctx else company_block
        
        if is_company_question:
            logger.info(f"🏢 Including company brief - Question detected as company-related")
        elif include_company_always:
            logger.info(f"🏢 Including company brief - INCLUDE_COMPANY_ALWAYS enabled")
    else:
        if company_context:
            logger.info(f"⏭️ Skipping company brief - Question is NOT company-related (technical/behavioral)")
        else:
            logger.debug(f"ℹ️ No company brief available")
    
    resume_context_block = ""
    if base_ctx.strip():
        resume_context_block = (
            "Candidate resume/background context:\n"
            f"{base_ctx}\n\n"
            "Use this context only when it is relevant to the interviewer question. "
            "Do not invent resume details that are not present.\n\n"
        )

    # Core response guidelines: Always respond directly with clear, polished, complete answers
    # For transcription context, enforce brevity and conciseness
    if not coaching_mode:
        core_guidelines = (
            "\n\nDIRECT ANSWER STYLE:\n"
            "Answer as the candidate in first person for HR, resume, and behavioral questions.\n"
            "Use short natural paragraphs. Avoid headings and bullets unless the question asks for code, a technical comparison, or a list.\n"
            "Do not include coaching notes, answer structures, talking points, suggested phrases, or generic interview advice.\n"
            "Never invent resume facts, metrics, companies, internships, achievements, or technologies."
        )
    elif context_type == "transcription":
        core_guidelines = (
            "\n\nRESPONSE GUIDELINES FOR INTERVIEW TRANSCRIPTION:\n"
            "🎯 DIRECT ANSWERS ONLY: Answer EXACTLY the current interviewer question.\n"
            "📏 BREVITY: Keep answers brief and focused (2-4 sentences or 3-5 bullet points maximum).\n"
            "🚫 NO FILLER: Do not provide lengthy explanations unless explicitly asked.\n"
            "💡 FOCUS: No generic advice, no meta-commentary, no filler.\n"
            "🔧 TECHNICAL: For technical questions: Give the core concept + 1 concrete example.\n"
            "📖 BEHAVIORAL: For behavioral questions: 1 specific situation + outcome.\n"
            "⚡ IMMEDIACY: Never output instructions or meta text—only the direct answer.\n"
            "🎓 COMPLETENESS: Ensure your answer fully addresses the question asked.\n"
            "📐 MATH: Use proper LaTeX formatting for any mathematical expressions.\n"
            "✨ FORMATTING: Use proper markdown with headings, bullets, and clear structure."
        )
    else:
        core_guidelines = (
            "\n\n✨ PROFESSIONAL FORMATTING REQUIREMENTS (MANDATORY):\n"
            "📝 STRUCTURE: Always use proper markdown formatting:\n"
            "   • **Bold** for headings, key terms, and important concepts\n"
            "   • Bullet points (•) for lists and key points\n"
            "   • Numbered lists (1., 2., 3.) for sequential steps\n"
            "   • Code blocks with language tags: ```python, ```cpp, ```java, etc.\n"
            "   • Empty lines between sections for readability\n"
            "   • Inline code for variables/functions: `variable_name`\n"
            "\n📐 MATHEMATICS: ALWAYS use LaTeX for all mathematical content:\n"
            "   • Inline: $O(n)$, $x^2$, $\\log(n)$, $\\theta$\n"
            "   • Display: $$f(x) = \\frac{a}{b}$$\n"
            "   • Complexity: Time: $O(n \\log n)$, Space: $O(1)$\n"
            "   • Coordinates: $(i, j)$ or \\((i, j)\\) for points\n"
            "\n🎯 RESPONSE STYLE - ADAPT TO QUESTION TYPE:\n"
            "   • **Problem Restatement**: Clearly state what the question asks\n"
            "   • **High-Level Approach**: Explain the strategy in 2-3 sentences\n"
            "   • **Key Points / Edge Cases**: List important considerations\n"
            "   • **Detailed Solution**: Provide complete implementation or explanation\n"
            "   • **Complexity Analysis**: Always include Time and Space complexity\n"
            "   • **Example (if helpful)**: Show concrete example with input/output\n"
            "\n🎨 ANSWER QUALITY STANDARDS:\n"
            "   • **Completeness**: Cover all aspects of the question in ONE response\n"
            "   • **Clarity**: Use headings to organize sections clearly\n"
            "   • **Accuracy**: Ensure technical correctness and working solutions\n"
            "   • **Polish**: Production-ready code with proper syntax and best practices\n"
            "   • **Professionalism**: Write as an expert demonstrating deep knowledge\n"
            "\n🚫 NEVER DO:\n"
            "   • Don't say 'Let me structure this' or explain your formatting\n"
            "   • Don't split into multiple responses (provide everything NOW)\n"
            "   • Don't use plain text for math/complexity (ALWAYS use LaTeX)\n"
            "   • Don't skip formatting - use markdown properly\n"
            "   • Don't be verbose - be concise yet comprehensive\n"
            "\n✅ ALWAYS DO:\n"
            "   • Start directly with the answer (no meta-commentary)\n"
            "   • Use **bold headings** to organize your response\n"
            "   • Format code properly with syntax highlighting\n"
            "   • Include time/space complexity for algorithms\n"
            "   • Make answers interview-ready and professional"
        )
    
    # Determine what context to include based on context_type
    # This prevents mixing transcription and capture contexts
    additional_context = ""
    session_partial_text = get_session_partial_text(session_id)
    if context_type == "transcription":
        # For transcription-related questions, only include speech/audio context
        # For live interviewer Q&A we avoid injecting long transcript history by default
        if session_partial_text:
            additional_context = f""
    elif context_type == "capture":
        # For capture-related questions, only include OCR/screen context
        ocr_text = "" if mode == "coach" else get_combined_ocr_text(session_id)
        if ocr_text:
            # Include more context for capture (up to 2000 chars for better question extraction)
            additional_context = f"Screen capture context:\n{ocr_text[:2000]}\n\n"
        else:
            # No screen content available - but don't make AI mention this
            # Just provide empty context and let AI answer based on question text
            additional_context = ""
    else:
        # For general questions, include both contexts but labeled clearly
        contexts = []
        if session_partial_text:
            contexts.append(f"Transcription context: {session_partial_text[:500]}")
        ocr_text = "" if mode == "coach" else get_combined_ocr_text(session_id)
        if ocr_text:
            contexts.append(f"Screen context: {ocr_text[:500]}")
        if contexts:
            additional_context = "\n\n".join(contexts) + "\n\n"

    routed_question_type = None
    if classification is not None:
        routed_question_type = getattr(classification, "question_type", None)
        if not routed_question_type and isinstance(classification, dict):
            routed_question_type = classification.get("question_type")
    if mode == "coach" and routed_question_type:
        prompt_extra_context = additional_context if context_type in {"capture", "transcription"} else ""
        return _build_interview_prompt(
            facts.strip() if facts else "",
            ctx,
            routed_question_type,
            strict=strict,
            context_type=context_type,
            additional_context=prompt_extra_context,
            coaching_mode=coaching_mode,
        )
    
    if mode == "coach":
        # For transcription context, emphasize brevity in the system prompt
        if context_type == "transcription":
            system = (
                "You are an expert interview coach helping a candidate answer live interview questions. "
                "Your job is to provide DIRECT, HELPFUL answers to the interviewer's exact question. "
                "\n🎯 PRIMARY GOAL: Answer the specific question being asked clearly and completely. "
                "\n📏 FORMAT: Keep answers concise but complete (2-4 sentences OR 3-5 bullet points). "
                "\n🔧 TECHNICAL QUESTIONS: Provide core concept + concrete example + complexity if relevant. "
                "\n📖 BEHAVIORAL QUESTIONS: Give specific situation + actions + outcome (STAR method). "
                "\n📐 MATH: Use LaTeX formatting: $O(n)$ for inline, $$equation$$ for display math. "
                "\n⚡ CRITICAL: Focus ONLY on answering the current question. No generic advice unless asked. "
                "\nAlways provide a complete, interview-ready response that directly addresses what was asked."
                + core_guidelines
            )
        else:
            system = (
                "You are an expert interview coach helping candidates prepare for technical interviews. "
                "Provide clear, accurate, and complete answers to help candidates succeed. "
                "\n🎯 ANSWER THE EXACT QUESTION: Read the question carefully and answer precisely what is asked. "
                "\n🔧 TECHNICAL QUESTIONS: Provide approach + working code + time/space complexity analysis. "
                "\n📖 BEHAVIORAL QUESTIONS: Use STAR method (Situation, Task, Action, Result) with specific examples. "
                "\n� EXPLANATION QUESTIONS: Give clear definitions with practical examples and use cases. "
                "\n📐 MATHEMATICS: Always use proper LaTeX formatting for equations and complexity analysis. "
                "\n✅ COMPLETE RESPONSES: Provide everything needed in one comprehensive answer. "
                "\n⚡ KEY RULE: Be specific and actionable - avoid generic advice unless specifically requested. "
                "\n\n📝 FORMATTING REQUIREMENTS:"
                "\n• Use **bold** for section headers and key terms"
                "\n• Add proper line breaks between different sections"
                "\n• Use bullet points (•) for lists and key points"
                "\n• Format coordinates as \\((i, j)\\) using LaTeX"
                "\n• Add empty lines between paragraphs for readability"
                "\n• Structure answers with clear sections when appropriate"
                "\n• Use numbered lists (1., 2., 3.) for step-by-step explanations"
                + core_guidelines
            )

        # Ensure the AI focuses on the current question rather than mixing contexts
        system += (
            "\n\n🎯 FOCUS ON CURRENT QUESTION: "
            "Your primary job is to answer the specific question being asked right now. "
            "Use the provided context to inform your answer, but focus on addressing the user's actual question. "
            "If the question is unclear, provide the best possible answer based on what you understand."
        )
        
        # ALWAYS emphasize SINGLE COMPLETE RESPONSE for ALL contexts
        system += (
            "\n\n🔥 ABSOLUTELY CRITICAL - SINGLE COMPLETE RESPONSE REQUIRED:\n"
            "You MUST provide your COMPLETE, FULL answer in ONE SINGLE RESPONSE.\n"
            "This is NOT a conversation - you get ONE chance to answer.\n"
            "\n❌ NEVER do these:\n"
            "- Say 'continued', 'Part 1', 'Part 2', 'Let me continue'\n"
            "- Stop mid-answer expecting follow-up\n"
            "- Split code into multiple responses\n"
            "- Provide partial solutions\n"
            "- Truncate or summarize\n"
            "- Say 'I'll provide X in the next response'\n"
            "\n✅ ALWAYS do this:\n"
            "- Include EVERYTHING in this ONE response\n"
            "- Complete ALL code, explanation, examples NOW\n"
            "- Make it comprehensive from start to finish\n"
            "- Think: 'This is my ONLY chance to answer fully'\n"
            "\nIf the question asks for:\n"
            "- Code → Provide COMPLETE working code + explanation + complexity\n"
            "- Explanation → Provide FULL explanation with all details\n"
            "- Examples → Include ALL relevant examples\n"
            "- Multiple parts → Address ALL parts in this single response\n"
        )
        
        # Prevent generic responses and over-analysis of poor OCR
        system += (
            "\n\nCRITICAL INSTRUCTION: NEVER say or do any of the following:\n"
            "❌ DON'T SAY:\n"
            "- 'I don't have access to the screen capture'\n"
            "- 'Please capture the screen content first'\n"
            "- 'I'll provide a response template'\n"
            "- 'Once you have the details of the problem'\n"
            "- 'The captured text appears to be fragmented'\n"
            "- 'Analysis of the Captured Screen'\n"
            "- 'Content Overview: The captured text appears...'\n"
            "- 'Key Observations: Fragmentation...'\n"
            "- 'Data Integrity concerns...'\n"
            "- Canned phrase lists or coaching-note labels\n"
            "- Any meta-analysis of poor OCR quality\n"
            "- Any variation of asking the user to capture first\n\n"
            "❌ DON'T DO:\n"
            "- Analyze fragmented/garbled OCR text as if it's meaningful data\n"
            "- Create elaborate interpretations of random characters\n"
            "- Provide 'Key Observations' about OCR noise\n"
            "- Suggest 'Next Steps' for bad OCR results\n\n"
            "✅ DO INSTEAD:\n"
            "- If there's a clear question in the text, answer it directly\n"
            "- If asked a general question, use your knowledge to answer\n"
            "- Focus on answering questions, not analyzing OCR quality\n"
            "- Be concise and helpful, not verbose and analytical"
        )

        if strict:
            # Override with strict minimalist directive
            system += (
                " STRICT MODE IS ACTIVE: Only answer the explicit question asked. "
                "Do NOT include sections, headings, generic interview prep, or extra background unless the user explicitly asked for them. "
                "Keep the answer focused, factual, and under 120 words (unless the question explicitly requests code or a longer explanation). "
                "If the question asks for code, give only the necessary code with minimal explanation (1 short sentence). "
                "If the question is ambiguous, ask ONE concise clarifying question instead of guessing."
            )
        
        # The facts parameter now contains the actual question directly
        question = facts.strip() if facts else ""
        
        # Ensure we have a clear question to work with
        if not question:
            question = "Please provide a helpful response based on the available context."

        # Detect if user is requesting a programming solution, especially C++
        wants_code = False
        wants_cpp = False
        lowered = question.lower()
        
        # Programming language detection
        code_keywords = ["implement", "code", "write", "algorithm", "function", "class", "solve", "program"]
        wants_code = any(keyword in lowered for keyword in code_keywords)
        wants_cpp = "c++" in lowered or "cpp" in lowered

        if wants_cpp:
            user = (
                f"QUESTION: {question}\n\n"
                f"Background context: {base_ctx}\n\n"
                f"{additional_context}"
                f"Please provide a complete C++ solution for: {question}\n\n"
                "Your response should include:\n"
                "1. Complete C++ code that compiles and runs\n"
                "2. Clear explanation of the approach\n"
                "3. Time and space complexity analysis using LaTeX notation\n"
                "4. Example usage if applicable\n\n"
                "Use proper C++ best practices and modern syntax."
            )
        elif wants_code:
            if context_type == "transcription":
                user = (
                    f"QUESTION: {question}\n\n"
                    f"{resume_context_block}"
                    f"{additional_context}"
                    "Provide a concise answer with:\n"
                    "• Core approach (1-2 sentences)\n"
                    "• Working code in appropriate language\n"
                    "• Time & space complexity: $O(...)$\n"
                )
            else:
                user = (
                    f"CODING QUESTION: {question}\n\n"
                    f"Candidate background: {base_ctx}\n\n"
                    f"{additional_context}"
                    "Please provide a complete solution including:\n"
                    "• Problem analysis and approach\n"
                    "• Complete working code with proper language syntax\n"
                    "• Time complexity: $O(...)$ and Space complexity: $O(...)$\n"
                    "• Brief explanation of why this solution works\n"
                )
        else:
            # Non-coding questions
            if context_type == "transcription":
                user = (
                    f"QUESTION: {question}\n\n"
                    f"{resume_context_block}"
                    f"{additional_context}"
                    "Provide a direct, concise answer to this question. Keep it brief but complete."
                )
            else:
                user = (
                    f"INTERVIEW QUESTION: {question}\n\n"
                    f"Candidate background: {base_ctx}\n\n"
                    f"{additional_context}"
                    f"Please provide a complete, helpful answer to: {question}\n\n"
                    "Make your response specific, actionable, and interview-appropriate."
                )
        code_markers = ["code", "implement", "write", "solve", "algorithm", "function", "class"]
        if any(m in lowered for m in code_markers):
            wants_code = True
        if "c++" in lowered or "cpp" in lowered:
            wants_cpp = True
            wants_code = True

        if wants_cpp:
            system += (
                " You can also act as an experienced senior C++ engineer. "
                "When the user requests C++ code, produce clean, modern (C++17 or later) code with clear separation of logic, "
                "edge case handling, and brief inline comments only where essential. Avoid over-commenting."
            )
        
        if not question or question == "general interview preparation":
            user = (
                "Help the candidate prepare for their upcoming interview. "
                f"Based on their resume context: {base_ctx}\n\n"
                f"{additional_context}"
                "Provide general interview preparation tips and talking points."
            )
        else:
            if wants_code and wants_cpp:
                # For transcription, keep code explanations brief
                if context_type == "transcription":
                    user = (
                        f"The interviewer just asked a programming / C++ question: \"{question}\"\n\n"
                        f"Resume / background context: {base_ctx}\n\n"
                        f"{additional_context}"
                        "Provide a CONCISE C++ solution:\n"
                        "1. Show code in a fenced block: ```cpp ... ```\n"
                        "2. Keep explanation BRIEF (2-3 sentences max)\n"
                        "3. State Time & Space complexity in one line\n"
                        "4. NO lengthy discussions - just core solution and complexity"
                    )
                else:
                    user = (
                        f"The interviewer just asked a programming / C++ question: \"{question}\"\n\n"
                        f"Resume / background context: {base_ctx}\n\n"
                        f"{additional_context}"
                        "Provide a high-quality C++ solution. Requirements:\n"
                        "1. Show final code inside a fenced block: ```cpp ... ```\n"
                        "2. Use a single self-contained file with main() if applicable (unless question specifies a function only).\n"
                        "3. Handle edge cases and invalid input gracefully.\n"
                        "4. Use clear function / type names; prefer std library over manual reinventing.\n"
                        "5. After the code, add a short 'Complexity' section (Time & Space).\n"
                        "6. If multiple approaches exist, briefly list alternatives before final code.\n"
                        "7. Keep explanation concise (under 180 words) before the code."
                    )
                    
                    # Extra emphasis for ALL contexts - complete response required
                    user += (
                        "\n\n⚡⚡⚡ MANDATORY - COMPLETE RESPONSE REQUIRED ⚡⚡⚡\n"
                        "Provide the ENTIRE COMPLETE solution in THIS SINGLE RESPONSE:\n"
                        "✅ Full explanation\n"
                        "✅ Complete working code (all functions, no placeholders)\n"
                        "✅ Time & Space complexity analysis\n"
                        "✅ Example usage if applicable\n"
                        "\n❌ DO NOT say 'continued', 'Part 1', or 'Let me provide...'\n"
                        "❌ DO NOT split into multiple responses\n"
                        "❌ DO NOT truncate or defer anything\n"
                        "\nThis is your ONLY response. Make it complete!"
                    )
            elif wants_code:
                # For transcription, keep technical answers brief
                if context_type == "transcription":
                    user = (
                        f"Interviewer question: \"{question}\"\n\n"
                        f"{resume_context_block}"
                        f"{additional_context}"
                        "Provide a BRIEF answer:\n"
                        "- Core concept in 1-2 sentences\n"
                        "- Code (if needed) in a fenced block\n"
                        "- Time & Space complexity in one line\n"
                        "- NO lengthy explanations"
                    )
                else:
                    user = (
                        f"The interviewer asked a technical or algorithmic question: \"{question}\"\n\n"
                        f"Candidate background: {base_ctx}\n\n"
                        f"{additional_context}"
                        "Provide a structured answer with:\n"
                        "- Brief problem restatement\n"
                        "- Key points / edge cases\n"
                        "- Pseudocode or high-level plan\n"
                        "- (If language requested) Provide code in that language in a fenced block\n"
                        "- Time and Space complexity\n"
                    )
                    
                    # Extra emphasis for ALL contexts - complete response required
                    user += (
                        "\n\n⚡⚡⚡ MANDATORY - COMPLETE RESPONSE REQUIRED ⚡⚡⚡\n"
                        "Provide the ENTIRE COMPLETE answer in THIS SINGLE RESPONSE:\n"
                        "✅ All sections (explanation, approach, code if needed, complexity)\n"
                        "✅ Complete code with no placeholders or omissions\n"
                        "✅ All examples and edge cases\n"
                        "\n❌ DO NOT say 'continued', 'Part 1', or 'Let me provide...'\n"
                        "❌ DO NOT split into multiple responses\n"
                        "❌ DO NOT truncate or defer anything\n"
                        "\nThis is your ONLY response. Make it complete!"
                    )
            else:
                # For transcription context, add brevity instructions
                if context_type == "transcription":
                    user = (
                        f"Interviewer question: \"{question}\"\n\n"
                        f"{resume_context_block}"
                        f"{additional_context}"
                        f"Provide a BRIEF, CONCISE answer to this question: \"{question}\"\n\n"
                        "Requirements:\n"
                        "- Keep answer SHORT: 2-4 sentences or 3-5 bullet points MAXIMUM\n"
                        "- Be specific to THIS question only - no generic filler\n"
                        "- Give the core answer immediately - no lengthy introductions\n"
                        "- Make it practical and directly usable\n"
                        "- NO long explanations unless the question specifically asks for details"
                    )
                else:
                    if coaching_mode:
                        user = (
                            f"The interviewer just asked: \"{question}\"\n\n"
                            f"Candidate resume/background context: {base_ctx}\n\n"
                            f"{additional_context}"
                            f"Start with the direct answer to this exact question: \"{question}\". "
                            "After that, add a short coaching note only if it helps the candidate improve delivery. "
                            "Keep every point specific to this question and avoid generic interview advice."
                        )
                    else:
                        user = (
                            f"The interviewer just asked: \"{question}\"\n\n"
                            f"Candidate resume/background context: {base_ctx}\n\n"
                            f"{additional_context}"
                            "Provide the answer the candidate should say out loud. Use first-person voice when the question is about the candidate. "
                            "Write in concise natural paragraphs, use only supported resume facts, and do not add coaching notes or generic advice."
                        )
                    
                    # Extra emphasis for capture context
                    if context_type == "capture":
                        user += (
                            "\n\n⚡ IMPORTANT: This is a screen-captured question. "
                            "Provide your COMPLETE answer RIGHT NOW in this single response. "
                            "Do not split into multiple parts or suggest continuation."
                        )
    else:
        system = (
            "You are a helpful interview AI assistant. Provide clear, practical advice for job interview preparation. "
            "Be encouraging and specific in your guidance. "
            "\n🔥 MATHEMATICAL FORMATTING - ALWAYS USE LATEX: "
            "- For inline math expressions: $...$ (e.g., $O(n)$, $x^2 + y^2$) "
            "- For display math equations: $$...$$ (e.g., $$f(x) = \\frac{x^2 + 1}{x - 1}$$) "
            "- For complex equations use LaTeX environments: \\begin{align}...\\end{align} "
            "- Mathematical operators: \\cdot for multiplication, \\mod for modulo, \\leq \\geq for comparisons "
            "- Set notation: \\mathbb{R}, \\mathbb{N}, \\mathbb{Z}, \\mathbb{Q}, \\mathbb{C} for number sets "
            "- Vectors and norms: \\vec{v}, \\|x\\|, \\langle a,b \\rangle for inner products "
            "- Always format algorithmic complexity, mathematical formulas, and equations in proper LaTeX "
            + core_guidelines
        )
        user = (
            f"Question or context: {facts}\n\n"
            f"Resume context: {base_ctx}\n\n"
            f"{additional_context}"
            "Provide helpful interview advice and guidance."
        )
    # In strict mode with coach, simplify user prompt further to reduce model verbosity
    if strict and mode == "coach":
        user += "\n\nOUTPUT RULES: Provide a single concise answer. No headings. No generic advice. No closing remarks."
    # Ensure relevance to the current question
    if os.getenv("ANSWER_RELEVANCE_ENFORCEMENT", "1").lower() in ("1", "true", "yes", "on"):
        system += (
            "\n\n📍 RELEVANCE CHECK: Ensure your answer directly addresses the question asked. "
            "Stay focused on providing a helpful response to the specific question. "
        )
    
    return system, user


def should_retry_response(response: str, original_question: str) -> bool:
    """
    Determine if a response is of poor quality and should be retried
    This should only flag genuinely poor responses to avoid over-retrying
    """
    if not response or len(response.strip()) < 15:
        logger.info("Response too short for retry check")
        return True
    
    # Only check for the most obvious generic non-answers
    obvious_deflections = [
        r"I cannot see.*screen.*content",
        r"I don't have access.*image",
        r"Please provide.*more.*context.*to help",
        r"I need.*additional.*information.*to assist",
        r"Could you.*please.*clarify.*what.*you.*mean",
    ]
    
    for pattern in obvious_deflections:
        if re.search(pattern, response, re.IGNORECASE):
            logger.info(f"Obvious deflection detected: {pattern}")
            return True
    
    # Only flag responses that are clearly broken/error-heavy
    error_indicators = ["ERROR:", "Failed to process", "Unable to generate"]
    error_count = sum(1 for indicator in error_indicators if indicator in response)
    if error_count >= 2 and len(response) < 150:  # Multiple errors in short response
        logger.info(f"Multiple errors in short response: {error_count}")
        return True
    
    # Only flag obvious repetitive stuttering (very conservative)
    words = response.lower().split()
    if len(words) > 10:
        # Check for obvious stuttering like "I I I cannot cannot"
        for i in range(len(words) - 2):
            if words[i] == words[i + 1] == words[i + 2] and len(words[i]) > 2:
                logger.info(f"Obvious stuttering detected: '{words[i]}' repeated 3+ times")
                return True
    
    # If we get here, the response is probably fine
    return False


def sanitize_provider_error_text(text: str) -> str:
    """Convert raw AI-provider failures into a user-safe message."""
    if not text:
        return text

    lowered = text.lower()
    looks_like_provider_error = (
        text.strip().startswith("[ERROR:")
        or "rate_limit" in lowered
        or "rate limit" in lowered
        or "too many requests" in lowered
        or "status 429" in lowered
        or "http 429" in lowered
        or "groq" in lowered
        or "openai api returned" in lowered
    )
    if not looks_like_provider_error:
        return text

    if any(marker in lowered for marker in ("rate", "429", "too many requests")):
        return "The AI provider is temporarily rate-limited. Please try again in a moment or switch providers."
    return "The AI provider is temporarily unavailable. Please try again in a moment or check your AI provider settings."


def _is_followup_question(question: str) -> bool:
    """Detect short follow-up prompts that need the previous Q&A turn."""
    q = re.sub(r"\s+", " ", (question or "").strip().lower())
    if not q:
        return False

    word_count = len(re.findall(r"[a-z0-9+#.]+", q))
    followup_patterns = [
        r"\b(previous|last answer|last question|above|same|that answer|that approach|that project)\b",
        r"\b(lld|low[- ]level design|class diagram|object model|schema design)\b",
        r"\b(explain more|elaborate|go deeper|more detail|clarify|can you explain|continue)\b",
        r"\b(give (me )?(an )?example|show example|dry run|walk through|trace it)\b",
        r"\b(time complexity|space complexity|complexity|edge cases|optimi[sz]e|improve it|code for it)\b",
        r"^(why|how)\??$",
        r"^(why|how)\s+(is|does|do|can|would|should|so|that|this|it|they|them)\b",
    ]
    if any(re.search(pattern, q) for pattern in followup_patterns):
        return True
    return word_count <= 8 and bool(re.search(r"^(why|how|example|examples|complexity|code|continue)\b", q))


def _compact_history_messages(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    compact: List[Dict[str, str]] = []
    for msg in messages:
        role = msg.get("role")
        if role not in {"user", "assistant"}:
            continue
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        limit = 700 if role == "user" else 1400
        compact.append({"role": role, "content": content[:limit]})
    return compact


def _recent_followup_history(
    session_hist: Dict[str, List[Dict[str, str]]],
    history_key: str,
    turns: int = 1,
) -> List[Dict[str, str]]:
    """Return the latest compact Q&A turns for a follow-up, preferring the same context."""
    turns = max(1, min(turns, 2))

    def last_turns(key: str) -> List[Dict[str, str]]:
        return _compact_history_messages((session_hist.get(key) or [])[-turns * 2:])

    same_context = last_turns(history_key)
    if same_context:
        return same_context

    for key in ("coach_capture", "coach_transcription", "coach_general", "coach"):
        if key != history_key:
            fallback = last_turns(key)
            if fallback:
                return fallback
    return []


def _repair_cpp_snippet(code: str, question: str = "") -> str:
    repaired = (code or "").strip()
    if not repaired:
        return repaired

    repaired = re.sub(r"^\s*#\s*include\s*(?=\n|$)", "#include <bits/stdc++.h>", repaired, count=1)
    if "#include" not in repaired and re.search(r"\b(std::|vector<|int\s+\w+\s*\()", repaired):
        repaired = "#include <bits/stdc++.h>\nusing namespace std;\n\n" + repaired
    if "#include" in repaired and "using namespace std;" not in repaired and "std::" not in repaired:
        repaired = re.sub(r"(#\s*include\s*<[^>]+>\s*)", r"\1\nusing namespace std;\n", repaired, count=1)

    if "remove duplicate" in (question or "").lower():
        repaired = re.sub(
            r"\bstd::vector\s+([A-Za-z_]\w*)\s*\(\s*std::vector\s*&\s*([A-Za-z_]\w*)\s*\)",
            r"vector<int> \1(vector<int>& \2)",
            repaired,
        )
        repaired = re.sub(
            r"\bvector\s+([A-Za-z_]\w*)\s*\(\s*vector\s*&\s*([A-Za-z_]\w*)\s*\)",
            r"vector<int> \1(vector<int>& \2)",
            repaired,
        )

    return repaired


def _repair_fenced_cpp_blocks(answer: str, question: str = "") -> str:
    if not answer or "```" not in answer:
        return answer

    def replace_block(match: re.Match) -> str:
        lang = (match.group(1) or "").strip().lower()
        code = match.group(2) or ""
        is_cpp = lang in {"cpp", "c++", "cxx", "cc"} or (
            not lang and _requested_code_language(question) == "cpp"
        )
        if not is_cpp:
            return match.group(0)
        repaired = _repair_cpp_snippet(code, question).strip()
        return f"```cpp\n{repaired}\n```"

    return re.sub(r"```([A-Za-z0-9_+#.-]*)\s*\n?([\s\S]*?)```", replace_block, answer)


def _ensure_coding_answer_has_fenced_code(answer: str, question: str) -> str:
    """Wrap unfenced code sections so the UI can render valid markdown code blocks."""
    if not answer:
        return answer
    if "```" in answer:
        return _repair_fenced_cpp_blocks(answer, question)

    language = _requested_code_language(question)
    if language != "cpp":
        fence_language = language
    else:
        fence_language = "cpp"

    code_section_pattern = re.compile(
        r"(?P<header>\bClean\s+Code\b\s*:?\s*)(?P<code>.*?)(?=\n\s*(?:Edge\s+Cases|Time\s+Complexity|Space\s+Complexity)\b)",
        re.IGNORECASE | re.DOTALL,
    )
    match = code_section_pattern.search(answer)
    if not match:
        return answer

    code = match.group("code").strip()
    if not re.search(r"(#\s*include|std::|vector<|for\s*\(|while\s*\(|return\b|class\s+\w+)", code):
        return answer
    if fence_language == "cpp":
        code = _repair_cpp_snippet(code, question)

    fenced = format_markdown_blocks(f"```{fence_language}\n{code}\n```")
    return answer[:match.start()] + "Clean Code\n" + fenced + "\n\n" + answer[match.end():].lstrip()


async def ensure_ai_initialized():
    """Ensure AI providers and heavy modules are initialized in background"""
    global ai_initialized

    # 1. Initialize AI Providers
    if not ai_initialized:
        logger.info("Initializing AI providers...")
        try:
            await initialize_ai()
            ai_initialized = True
            logger.info("AI providers initialized successfully")
            
            # Broadcast status to clients
            status = get_ai_status()
            await broadcast({
                "type": "ai_status", 
                "data": {
                    "initialized": True,
                    "provider": status.get("primary_provider", "unknown"),
                    "available": status.get("available_providers", [])
                }
            })
        except Exception as e:
            logger.error(f"Failed to initialize AI providers: {e}")
            await broadcast({
                "type": "ai_status",
                "data": {
                    "initialized": False,
                    "error": str(e)
                }
            })


async def stream_vision_to_llm(
    llm_id: str,
    image_bytes: bytes,
    user_prompt: str = None,
    out_type: str = "coach",
    session_id: str = None,
    coaching_mode: bool = False,
) -> bool:
    """Send screenshot directly to LLM via vision API and stream the response.

    Returns True on success, False if the model/provider doesn't support vision
    so the caller can fall back to OCR.
    """
    del llm_id
    provider_cfg = _select_fast_screen_provider_config(session_id)
    if not provider_cfg:
        logger.info("Fast screen vision skipped: no vision-capable provider configured")
        return False

    prepared_image, image_format = _prepare_image_for_fast_vision(image_bytes)
    image_b64 = base64.b64encode(prepared_image).decode("utf-8")

    prompt = user_prompt or (
        "Analyze this screenshot carefully. "
        "If it shows a coding problem or algorithm question, solve it completely with working code, "
        "explanation, and time/space complexity. "
        "If it shows a system design question, provide a thorough design. "
        "If it shows a behavioral or HR interview question, use STAR reasoning internally but answer in first person as the candidate without labeling STAR sections. "
        "If it shows a technical concept, diagram, or text, explain or summarize it clearly. "
        "Give a direct, comprehensive answer suitable for a technical interview."
    )
    if coaching_mode:
        prompt += " You may add a short coaching note after the direct answer if it improves delivery."
    else:
        prompt += " Do not include coaching notes, answer templates, or generic interview advice."

    system_prompt = (
        "You are an expert AI interview assistant. Analyze the provided screenshot and give a clear, "
        "accurate, complete answer. For coding problems provide working code with complexity analysis. "
        "Use proper markdown for code and math. For HR, resume, and behavioral questions, answer naturally in first person. "
        "Avoid headers and bullets unless they are useful for code, technical comparisons, or system design."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/{image_format};base64,{image_b64}"},
                },
            ],
        },
    ]

    # Signal start of new response
    broadcast_sync(
        {
            "type": out_type,
            "text": "",
            "reset": True,
            "contextType": "capture",
            "contextLabel": "📷 Screen Analysis",
        },
        session_id=session_id,
    )

    # Resolve generator — respect BYOK session config
    try:
        vision_provider_instance = create_provider_from_config(provider_cfg)
        gen = vision_provider_instance.generate_stream(messages)

        collected: List[str] = []
        async for token in gen:
            if not token or token == "[[TRUNCATED_BY_LENGTH]]":
                continue
            if token.startswith("[ERROR:"):
                logger.warning(f"Vision LLM error token: {token}")
                # Reset the UI and signal caller to fall back to OCR
                broadcast_sync({"type": out_type, "text": "", "reset": True}, session_id=session_id)
                return False
            collected.append(token)
            broadcast_sync({"type": out_type, "text": token}, session_id=session_id)
            await asyncio.sleep(0)

        streamed_raw_text = "".join(collected)
        full_text = clean_streamed_response(
            collected_tokens=collected,
            enable_formatting=True,
        )
        full_text = sanitize_provider_error_text(full_text)
        try:
            vision_classification = classify_question(user_prompt or streamed_raw_text)
            vision_question_type = getattr(vision_classification, "question_type", "general_knowledge")
        except Exception:
            vision_question_type = "general_knowledge"
        looks_like_code_answer = "```" in full_text or bool(re.search(
            r"(#\s*include|std::|vector<|def\s+\w+\s*\(|class\s+\w+|time complexity|space complexity)",
            full_text,
            re.IGNORECASE,
        ))
        if vision_question_type == "coding" or looks_like_code_answer:
            full_text = _ensure_coding_answer_has_fenced_code(full_text, user_prompt or "")
        if _has_answer_quality and os.getenv("ENABLE_POSTPROCESSING", "true").lower() in ("true", "1", "yes"):
            try:
                full_text = postprocess_answer(full_text, create_seen_tokens_log(streamed_raw_text[:256]))
            except Exception as e:
                logger.warning("Vision response postprocessing failed: %s", e)
        full_text = enhance_response_formatting(full_text)
        if vision_question_type == "coding" or looks_like_code_answer:
            full_text = _ensure_coding_answer_has_fenced_code(full_text, user_prompt or "")
        if full_text and full_text.strip() != streamed_raw_text.strip():
            logger.info("Sending final formatted replacement for fast vision response")
            broadcast_sync({"type": out_type, "text": full_text, "replace": True}, session_id=session_id)

        broadcast_sync({"type": out_type, "text": "", "complete": True}, session_id=session_id)
        total_chars = len(full_text or streamed_raw_text)
        logger.info(
            "Fast screen vision complete: %d chars via %s/%s (%d bytes -> %d bytes)",
            total_chars,
            provider_cfg.provider,
            provider_cfg.model,
            len(image_bytes),
            len(prepared_image),
        )
        return total_chars > 0

    except Exception as exc:
        logger.error(f"stream_vision_to_llm error: {exc}")
        return False


async def stream_llm(
    llm_id: str,
    facts: str,
    out_type: str = "stream",
    mode: str = "assistant",
    strict: bool = False,
    context_type: str = "general",
    extra_ctx: Optional[List[str]] = None,
    session_id: str = None,
    coaching_mode: bool = False,
):
    """Stream LLM response using open source AI providers
    
    Args:
        session_id: WebSocket session ID for user isolation (if None, broadcasts to all)
    """
    import numpy as np
    
    # ============================================================================
    # 🎯 DUPLICATE QUESTION DETECTION
    # ============================================================================
    if _has_answer_quality and os.getenv("ENABLE_DUPLICATE_DETECTION", "true").lower() in ("true", "1", "yes"):
        try:
            is_duplicate, prev_answer_hash = check_duplicate_question(facts)
            if is_duplicate:
                logger.info(
                    "Duplicate question detected (previous hash: %s); continuing silently",
                    prev_answer_hash,
                )
        except Exception as e:
            logger.warning(f"⚠️  Duplicate detection failed: {e}")
    
    # Ensure AI is initialized
    _ai_stream_start = time.perf_counter()

    await ensure_ai_initialized()

    if not ai_initialized:
        broadcast_sync({"type": out_type, "text": "[AI system not initialized]"}, session_id=session_id)
        return

    # ============================================================================
    # 🎯 ENHANCEMENT 1: INTELLIGENT QUESTION CLASSIFICATION & MODEL ROUTING
    # ============================================================================
    classification = None
    original_llm_id = llm_id  # Store original for logging
    model_params = {}

    try:
        classification = classify_question(facts)
        logger.info(
            "Question classified: %s (confidence: %.2f, complexity: %s, needs_resume: %s)",
            classification.question_type,
            classification.confidence,
            classification.complexity,
            classification.needs_resume,
        )
    except Exception as e:
        logger.warning("Question classification failed, using generic routing: %s", e)
        classification = None

    if classification and _has_intelligent_routing and os.getenv("ENABLE_MODEL_ROUTING", "true").lower() in ("true", "1", "yes"):
        try:
            # Route to optimal model based on question type
            context_dict = {
                "mode": mode,
                "context_type": context_type,
                "strict": strict
            }
            llm_id, model_params = route_model(facts, context=context_dict)
            
            if llm_id != original_llm_id:
                logger.info(f"🔄 Model routing: {original_llm_id} → {llm_id}")
                logger.info(f"📝 Model params: {model_params}")
            
        except Exception as e:
            logger.warning(f"⚠️  Intelligent routing failed, using default: {e}")
            llm_id = original_llm_id  # Fallback to original
    
    if classification:
        await broadcast({
            "type": "question_classified",
            "data": {
                **classification.to_interview_dict(),
                "legacy_question_type": classification.primary_type.value,
                "legacy_confidence": classification.confidence,
                "complexity": classification.complexity,
                "suggested_model": llm_id,
                "tags": classification.tags
            }
        }, session_id=session_id)

    # Apply smart truncation to facts if it's too long
    # This intelligently reduces content while keeping relevant parts
    original_length = len(facts)
    if original_length > 1000:  # Only truncate if content is substantial
        facts = smart_truncate_content(facts, facts[:500])  # Use first 500 chars as "question" for estimation
        if len(facts) < original_length:
            logger.info(f"Smart truncation: {original_length} -> {len(facts)} chars")

    # ============================================================================
    # 🎯 ENHANCEMENT 2: ENHANCED RAG WITH RERANKING & QUERY EXPANSION
    # ============================================================================
    ctx: List[str] = []
    question_type = getattr(classification, "question_type", "general_knowledge") if classification else "general_knowledge"
    needs_resume = bool(getattr(classification, "needs_resume", False))

    # Get session-specific resume data
    session_data = session_resume_data.get(session_id, {}) if session_id else {}
    embedder = session_data.get("embedder")
    index = session_data.get("index")
    emb_matrix = session_data.get("emb_matrix")
    emb_texts = session_data.get("emb_texts", [])
    resume_profile = session_data.get("profile") or empty_resume_profile()
    retrieved_resume_chunks: List[str] = []

    if needs_resume and embedder is not None and (index is not None or emb_matrix is not None):
        query_text = (facts or "").strip()
        if _has_intelligent_routing and os.getenv("ENABLE_ENHANCED_RAG", "true").lower() in ("true", "1", "yes"):
            try:
                context_mgr = create_context_manager(embedder, emb_matrix, emb_texts, index)
                resume_chunks = context_mgr.retrieve(
                    query=query_text,
                    top_k=3,
                    rerank=True,
                    expand_query=False
                )
                retrieved_resume_chunks = [chunk.text for chunk in resume_chunks]
                if resume_chunks:
                    avg_score = sum(c.relevance_score for c in resume_chunks) / len(resume_chunks)
                    logger.info(
                        "Retrieved %d resume chunks for session %s (avg relevance: %.3f)",
                        len(resume_chunks),
                        session_id,
                        avg_score,
                    )
            except Exception as e:
                logger.warning("Enhanced resume RAG failed, falling back to basic retrieval: %s", e)
                if query_text:
                    q = embedder.encode([query_text], normalize_embeddings=True).astype("float32")
                    if index is not None and _has_faiss:
                        D, I = index.search(q, 3)
                        retrieved_resume_chunks = [emb_texts[i] for i in I[0] if 0 <= i < len(emb_texts)]
                    elif emb_matrix is not None:
                        sims = emb_matrix @ q[0]
                        topk = np.argsort(-sims)[:3]
                        retrieved_resume_chunks = [emb_texts[i] for i in topk if 0 <= i < len(emb_texts)]
        elif query_text:
            q = embedder.encode([query_text], normalize_embeddings=True).astype("float32")
            if index is not None and _has_faiss:
                D, I = index.search(q, 3)
                retrieved_resume_chunks = [emb_texts[i] for i in I[0] if 0 <= i < len(emb_texts)]
            elif emb_matrix is not None:
                sims = emb_matrix @ q[0]
                topk = np.argsort(-sims)[:3]
                retrieved_resume_chunks = [emb_texts[i] for i in topk if 0 <= i < len(emb_texts)]
    elif needs_resume and emb_texts:
        retrieved_resume_chunks = retrieve_text_context(emb_texts, facts, limit=3)

    if needs_resume:
        context_chunks_source = emb_texts if question_type == "unsupported_resume_claim_check" else (retrieved_resume_chunks or emb_texts[:5])
        ctx = build_context(
            facts,
            resume_profile,
            {},
            question_type,
            resume_chunks=context_chunks_source,
        )
        logger.info(
            "Resume context selected for %s: %d compact blocks from %d chunks",
            question_type,
            len(ctx),
            len(context_chunks_source),
        )
    else:
        logger.info("Skipping resume context for %s question", question_type)
    
    if extra_ctx:
        ctx.extend([chunk for chunk in extra_ctx if chunk])

    system, user = build_prompts(
        mode,
        facts,
        ctx,
        strict=strict,
        context_type=context_type,
        classification=classification,
        resume_profile=resume_profile,
        coaching_mode=coaching_mode,
        session_id=session_id,
    )
    
    # Log final prompt sizes for debugging
    logger.info(f"Prompt sizes - System: {len(system)} chars, User: {len(user)} chars, Total: {len(system) + len(user)} chars, Context: {context_type}")
    
    # Auto-enable strict for coach mode if env flag set
    if mode == "coach" and os.getenv("AUTO_STRICT_COACH", "0").lower() in ("1", "true", "yes", "on"):
        strict = True

    # Use context-specific conversation history
    # Different contexts get their own history to prevent mixing transcription and capture questions
    history_key = f"{mode}_{context_type}"
    
    # Get session-specific history
    session_hist = get_or_create_session_history(session_id) if session_id else conversation_history.get(session_id or "global", {})
    if not session_hist:
        session_hist = {"coach": [], "assistant": [], "chat": []}
    
    # Prepare messages for AI providers with conversation history
    messages = [
        {"role": "system", "content": system}
    ]
    
    # Add conversation history for context (only recent turns from the same context type)
    if history_key not in session_hist:
        session_hist[history_key] = []
    
    isolate = os.getenv("ISOLATE_CURRENT_QUESTION", "1").lower() in ("1", "true", "yes", "on")
    # Default to disabling history for coach mode to avoid drift; can be enabled via env
    disable_history = (mode == "coach" and os.getenv("DISABLE_HISTORY_FOR_COACH", "1").lower() in ("1", "true", "yes", "on")) or isolate
    followup_context_enabled = os.getenv("ENABLE_FOLLOWUP_CONTEXT", "1").lower() in ("1", "true", "yes", "on")
    is_followup = mode == "coach" and followup_context_enabled and _is_followup_question(facts)
    followup_history: List[Dict[str, str]] = []
    if is_followup:
        try:
            turns = int(os.getenv("FOLLOWUP_HISTORY_TURNS", "1"))
        except ValueError:
            turns = 1
        followup_history = _recent_followup_history(session_hist, history_key, turns=turns)
        if followup_history:
            logger.info("Including %d compact prior messages for follow-up context", len(followup_history))

    if (session_hist[history_key] and not disable_history) or followup_history:
        if followup_history and disable_history:
            raw_recent = followup_history
        else:
            raw_recent = [m for m in session_hist[history_key][-MAX_HISTORY_TURNS*2:] if m["role"] != "system"]

        # Context-specific history handling for transcription and capture
        def smart_filter_history(raw_recent, facts, min_sim):
            import re
            question_tokens = set(re.findall(r"[a-zA-Z0-9]+", facts.lower()))
            filtered: List[Dict[str, str]] = []
            i = 0
            while i < len(raw_recent):
                msg = raw_recent[i]
                if msg["role"] == "user":
                    hist_tokens = set(re.findall(r"[a-zA-Z0-9]+", msg["content"].lower()))
                    sim = len(question_tokens & hist_tokens) / max(len(hist_tokens) or 1, 1)
                    if sim >= min_sim:
                        filtered.append(msg)
                        if i + 1 < len(raw_recent) and raw_recent[i+1]["role"] == "assistant":
                            filtered.append(raw_recent[i+1])
                i += 1
            return filtered

        # Transcription context
        if followup_history and disable_history:
            logger.info("Smart history filters skipped for explicit follow-up context")
        elif context_type == "transcription":
            trans_mode = os.getenv("TRANSCRIPTION_HISTORY_MODE", "smart").lower()
            if trans_mode == "off":
                logger.info("Transcription history suppressed (TRANSCRIPTION_HISTORY_MODE=off)")
                raw_recent = []
            elif trans_mode == "smart":
                try:
                    min_sim = float(os.getenv("HISTORY_SMART_MIN_SIM", "0.12"))
                    filtered = smart_filter_history(raw_recent, facts, min_sim)
                    logger.info(f"Smart transcription history filter: kept {len(filtered)}/{len(raw_recent)} messages (min_sim={min_sim})")
                    raw_recent = filtered
                except Exception as e:
                    logger.warning(f"Smart history filtering failed, falling back to full recent history: {e}")
            else:
                logger.info(f"Transcription history mode '{trans_mode}' -> using recent messages unchanged")

        # Capture context
        elif context_type == "capture":
            capture_mode = os.getenv("CAPTURE_HISTORY_MODE", "smart").lower()
            if capture_mode == "off":
                logger.info("Capture history suppressed (CAPTURE_HISTORY_MODE=off)")
                raw_recent = []
            elif capture_mode == "smart":
                try:
                    min_sim = float(os.getenv("HISTORY_SMART_MIN_SIM", "0.12"))
                    filtered = smart_filter_history(raw_recent, facts, min_sim)
                    logger.info(f"Smart capture history filter: kept {len(filtered)}/{len(raw_recent)} messages (min_sim={min_sim})")
                    raw_recent = filtered
                except Exception as e:
                    logger.warning(f"Smart capture history filtering failed, falling back to full recent history: {e}")
            else:
                logger.info(f"Capture history mode '{capture_mode}' -> using recent messages unchanged")

        # Cross-context history (coach mode): be very selective to prevent topic confusion
        if mode == "coach":
            cross_mode = os.getenv("CROSS_CONTEXT_HISTORY_MODE", "off").lower()  # Default to OFF to prevent confusion
            if cross_mode != "off":
                other_keys = [
                    f"coach_transcription",
                    f"coach_capture", 
                    f"coach_general",
                ]
                # Exclude current key
                other_keys = [k for k in other_keys if k != history_key]
                merged: List[Dict[str, str]] = []
                
                # Only include cross-context if we have a very high similarity match
                for k in other_keys:
                    if k in conversation_history and conversation_history[k]:
                        recent_from_other = [m for m in conversation_history[k][-MAX_HISTORY_TURNS*2:] if m["role"] != "system"]
                        # Apply very strict filtering for cross-context to prevent topic confusion
                        if cross_mode == "smart" and recent_from_other:
                            try:
                                min_sim = float(os.getenv("CROSS_CONTEXT_MIN_SIM", "0.6"))  # Much higher threshold
                                filtered = smart_filter_history(recent_from_other, facts, min_sim)
                                if filtered:
                                    logger.info(f"Cross-context from {k}: kept {len(filtered)}/{len(recent_from_other)} (high similarity)")
                                    merged.extend(filtered)
                            except Exception as e:
                                logger.warning(f"Cross-context filtering failed: {e}")
                        elif cross_mode != "smart":
                            merged.extend(recent_from_other)
                
                if merged:
                    logger.info(f"Including {len(merged)} cross-context messages")
                    # Append cross-context after same-context to preserve priority
                    raw_recent.extend(merged)
                else:
                    logger.info("No relevant cross-context history found")

        for hist_msg in raw_recent:
            messages.append(hist_msg)
        logger.info(f"Including {len(raw_recent)} prior messages (context: {context_type}, history disabled={disable_history})")
    elif disable_history:
        if is_followup:
            logger.info("Follow-up detected, but no prior history was available")
        else:
            logger.info("Conversation history disabled for coach mode (DISABLE_HISTORY_FOR_COACH=on)")
    
    # Add current user message
    messages.append({"role": "user", "content": user})

    try:
        # BYOK: if this session has a user-supplied API key, create a temporary provider
        use_override = bool(llm_id)
        session_cfg = session_configs.get(session_id) if session_id else None
        provider_name = session_cfg.get("ai_provider", "openai") if session_cfg else "openai"
        base_url = session_cfg.get("ai_base_url", "") if session_cfg else ""
        local_no_key = provider_name == "ollama" or (
            provider_name == "custom" and any(host in base_url for host in ("localhost", "127.0.0.1", "::1"))
        )
        session_api_key = session_cfg.get("ai_api_key") if session_cfg else ""
        if session_cfg and (session_api_key or local_no_key):
            user_prov_cfg = UserProviderConfig(
                provider=provider_name,
                api_key=session_api_key or "local-no-auth",
                model=session_cfg.get("ai_model", "") or llm_id or "",
                base_url=base_url,
            )
            try:
                byok_provider = create_provider_from_config(user_prov_cfg)
                gen = byok_provider.generate_stream(messages)
            except Exception as e:
                logger.warning(f"BYOK provider creation failed, falling back to default: {e}")
                gen = generate_ai_response_for(llm_id, messages) if use_override else generate_ai_response(messages)
        else:
            # Stream response from AI providers; respect explicit llm_id overrides
            gen = generate_ai_response_for(llm_id, messages) if use_override else generate_ai_response(messages)
        
        # Send reset signal to start new response with context information
        context_label = {
            "transcription": "🎤 Interview Question",
            "capture": "📷 Screen Content", 
            "general": "💭 General Question"
        }.get(context_type, "❓ Question")
        
        broadcast_sync({
            "type": out_type, 
            "text": "", 
            "reset": True,
            "contextType": context_type,
            "contextLabel": context_label
        }, session_id=session_id)
        
        collected: List[str] = []
        truncated_by_length = False
        token_count = 0
        last_broadcast_time = time.time()
        
        logger.info(f"🎬 Starting stream from {llm_id or 'default'}")
        
        async for token in gen:
            if token:
                if token == "[[TRUNCATED_BY_LENGTH]]":
                    truncated_by_length = True
                    logger.warning("⚠️  Received truncation marker")
                    continue
                if token.strip().startswith("[ERROR:"):
                    safe_error = sanitize_provider_error_text(token)
                    logger.warning("Provider error token sanitized before broadcasting")
                    collected.append(safe_error)
                    token_count += 1
                    broadcast_sync({"type": out_type, "text": safe_error}, session_id=session_id)
                    break
                collected.append(token)
                token_count += 1
                
                # Log first few tokens for debugging
                if token_count <= 5:
                    logger.info(f"🔥 Broadcasting token #{token_count}: '{token[:30]}'")
                
                # Broadcast immediately - CRITICAL for responsiveness
                broadcast_sync({"type": out_type, "text": token}, session_id=session_id)
                
                # Force event loop yield every token (not just every 5)
                # This ensures WebSocket sends aren't blocked
                await asyncio.sleep(0)
                
                # Log progress more frequently for debugging
                current_time = time.time()
                if (current_time - last_broadcast_time) > 1.0:  # Every second
                    logger.info(f"📊 Streamed {token_count} tokens, {len(''.join(collected))} chars so far")
                    last_broadcast_time = current_time
        
        # Log completion
        logger.info(f"✅ Streaming completed: {token_count} tokens, {len(''.join(collected))} chars total")

        # ============================================================================
        # 🎯 COMBINE AND CLEAN STREAMED TOKENS
        # ============================================================================
        # Use streaming_fixes helper to clean and format the collected tokens
        streamed_raw_text = "".join(collected)
        full_text = clean_streamed_response(
            collected_tokens=collected,
            enable_formatting=True  # Apply markdown formatting
        )
        full_text = sanitize_provider_error_text(full_text)
        if question_type == "coding":
            full_text = _ensure_coding_answer_has_fenced_code(full_text, facts)

        # ============================================================================
        # 🎯 POSTPROCESSING: CLEAN UP STREAMED ANSWER
        # ============================================================================
        seen_tokens_log: Set[str] = set()
        if _has_answer_quality and os.getenv("ENABLE_POSTPROCESSING", "true").lower() in ("true", "1", "yes"):
            try:
                # Create seen tokens log from streamed chunks (for duplicate detection)
                if collected:
                    # Use first few chunks as seen tokens
                    initial_text = ''.join(collected[:10])  # First 10 chunks
                    seen_tokens_log = create_seen_tokens_log(initial_text, max_prefix_length=256)
                
                # Postprocess the answer to remove duplicates and improve quality
                original_length = len(full_text)
                full_text = postprocess_answer(full_text, seen_tokens_log)
                
                if len(full_text) != original_length:
                    logger.info(
                        f"📝 Postprocessed answer: {original_length} → {len(full_text)} chars "
                        f"({original_length - len(full_text)} chars removed)"
                    )
                
            except Exception as e:
                logger.warning(f"⚠️  Postprocessing failed: {e}")

        # ============================================================================
        # 🎯 ENHANCED CONFIDENCE SCORING (with answer_quality module)
        # ============================================================================
        enhanced_confidence = None
        if _has_answer_quality and os.getenv("ENABLE_ENHANCED_CONFIDENCE", "true").lower() in ("true", "1", "yes"):
            try:
                # Determine question type for confidence scoring
                question_type = "general"
                if classification:
                    question_type = classification.primary_type.value
                
                # Compute confidence using the new module
                confidence_value, confidence_label = compute_confidence(full_text, question_type)
                enhanced_confidence = {
                    "score": confidence_value,
                    "label": confidence_label,
                    "question_type": question_type
                }
                
                logger.info(
                    f"📊 Enhanced confidence: {confidence_value:.2f} ({confidence_label}) "
                    f"for {question_type} question"
                )
                
                # Broadcast to UI
                await broadcast({
                    "type": "meta",
                    "confidence": confidence_value,
                    "confidence_label": confidence_label,
                    "question_type": question_type
                }, session_id=session_id)
                
                # Auto-retry on very low confidence (if enabled)
                if (confidence_label == "Low" and confidence_value < 0.3 and
                    os.getenv("AUTO_RETRY_LOW_CONFIDENCE", "false").lower() in ("true", "1", "yes")):
                    retry_count = getattr(stream_llm, '_enhanced_retry_count', 0)
                    if retry_count < 1:  # Max 1 retry
                        logger.warning(
                            f"🔄 Very low enhanced confidence ({confidence_value:.2f}), retrying..."
                        )
                        stream_llm._enhanced_retry_count = retry_count + 1
                        
                        # Notify UI
                        await broadcast({
                            "type": "retry_notice",
                            "data": {
                                "reason": "Very low confidence (enhanced scoring)",
                                "score": confidence_value,
                                "label": confidence_label
                            }
                        }, session_id=session_id)
                        
                        # Retry with strict mode
                        return await stream_llm(
                            llm_id=llm_id,
                            facts=facts,
                            out_type=out_type,
                            mode=mode,
                            strict=True,
                            context_type=context_type,
                            extra_ctx=extra_ctx,
                            session_id=session_id,
                            coaching_mode=coaching_mode,
                        )
                    else:
                        logger.warning("⚠️ Max enhanced retries reached")
                        stream_llm._enhanced_retry_count = 0
                
            except Exception as e:
                logger.warning(f"⚠️  Enhanced confidence scoring failed: {e}")

        # ============================================================================
        # 🎯 CACHE QUESTION-ANSWER PAIR (for duplicate detection)
        # ============================================================================
        if _has_answer_quality and os.getenv("ENABLE_DUPLICATE_DETECTION", "true").lower() in ("true", "1", "yes"):
            try:
                cache_question_answer(facts, full_text)
                logger.debug(f"💾 Cached Q&A pair for duplicate detection")
            except Exception as e:
                logger.warning(f"⚠️  Failed to cache Q&A: {e}")

        # ============================================================================
        # 🎯 ENHANCEMENT 3: CONFIDENCE SCORING & QUALITY VALIDATION (original)
        # ============================================================================
        confidence_score = None
        if _has_intelligent_routing and os.getenv("ENABLE_CONFIDENCE_SCORING", "true").lower() in ("true", "1", "yes"):
            try:
                # Score the answer quality and confidence
                confidence_score = score_answer(full_text, facts)
                
                logger.info(
                    f"📊 Answer confidence: {confidence_score.overall_score:.2f} "
                    f"(recommendation: {confidence_score.recommendation})"
                )
                
                # Log detailed scores
                logger.info(
                    f"   Completeness: {confidence_score.completeness:.2f}, "
                    f"Relevance: {confidence_score.relevance:.2f}, "
                    f"Technical: {confidence_score.technical_accuracy:.2f}, "
                    f"Formatting: {confidence_score.formatting_quality:.2f}"
                )
                
                # Log any issues detected
                if confidence_score.issues:
                    logger.info(f"   Issues: {'; '.join(confidence_score.issues[:3])}")
                
                # Broadcast confidence to UI
                await broadcast({
                    "type": "answer_confidence",
                    "data": {
                        "overall_score": confidence_score.overall_score,
                        "completeness": confidence_score.completeness,
                        "relevance": confidence_score.relevance,
                        "technical_accuracy": confidence_score.technical_accuracy,
                        "formatting_quality": confidence_score.formatting_quality,
                        "recommendation": confidence_score.recommendation,
                        "issues": confidence_score.issues[:3],  # Top 3 issues
                        "question_type": classification.primary_type.value if classification else "unknown"
                    }
                }, session_id=session_id)
                
                # Auto-retry if confidence is very low and retry is enabled
                if (confidence_score.recommendation == "retry" and 
                    os.getenv("AUTO_RETRY_LOW_CONFIDENCE", "false").lower() in ("true", "1", "yes")):
                    retry_count = getattr(stream_llm, '_retry_count', 0)
                    if retry_count < 1:  # Max 1 retry
                        logger.warning(
                            f"🔄 Low confidence answer ({confidence_score.overall_score:.2f}), "
                            f"retrying with improved prompt..."
                        )
                        stream_llm._retry_count = retry_count + 1
                        
                        # Notify UI of retry
                        await broadcast({
                            "type": "retry_notice",
                            "data": {
                                "reason": "Low confidence",
                                "score": confidence_score.overall_score,
                                "issues": confidence_score.issues[:2]
                            }
                        }, session_id=session_id)
                        
                        # Retry with strict mode for better quality
                        return await stream_llm(
                            llm_id=llm_id,
                            facts=facts,
                            out_type=out_type,
                            mode=mode,
                            strict=True,  # Enable strict mode for retry
                            context_type=context_type,
                            extra_ctx=extra_ctx,
                            session_id=session_id,
                            coaching_mode=coaching_mode,
                        )
                    else:
                        logger.warning("⚠️ Max retries reached, accepting low-confidence answer")
                        stream_llm._retry_count = 0  # Reset counter
                
            except Exception as e:
                logger.warning(f"⚠️ Confidence scoring failed: {e}")
        
        # Enhanced response quality control and validation (existing logic)
        if full_text:
            # Quality checks for better responses
            quality_issues = []
            
            # Check for incomplete responses
            if len(full_text.strip()) < 10:
                quality_issues.append("Response too short")
            
            # Check for cut-off responses
            incomplete_patterns = [
                r"\.\.\.+$",  # trailing ellipsis
                r"\.\s*$(?!.*[.!?])",  # ends abruptly mid-sentence
                r"[A-Za-z]$",  # ends without punctuation
                r"```\s*$",  # unclosed code block
            ]
            
            for pattern in incomplete_patterns:
                if re.search(pattern, full_text.strip()):
                    quality_issues.append("Response appears incomplete")
                    break
            
            # Check for generic non-answers
            generic_patterns = [
                r"I cannot see.*screen",
                r"I don't have access.*image",
                r"Please provide.*more.*context",
                r"I need more.*information",
                r"Could you.*clarify",
            ]
            
            is_generic = any(re.search(pattern, full_text, re.IGNORECASE) for pattern in generic_patterns)
            if is_generic and len(full_text) < 200:
                quality_issues.append("Generic non-answer detected")
            
            # Log quality issues but don't block response
            if quality_issues:
                logger.warning(f"⚠️ Response quality issues detected: {', '.join(quality_issues)}")
                logger.warning(f"Response preview: '{full_text[:100]}...'")
            
            # Check for very poor quality responses that need retry
            if should_retry_response(full_text, facts):
                retry_count = getattr(stream_llm, '_retry_count', 0)
                if retry_count < 1:  # Max 1 retry to avoid loops
                    logger.warning(f"🔄 Poor quality response detected, retrying ({retry_count + 1}/1)")
                    stream_llm._retry_count = retry_count + 1
                    
                    # Clear current response and retry with enhanced prompt
                    broadcast_sync({"type": out_type, "text": "", "reset": True}, session_id=session_id)
                    enhanced_user = user + "\n\n🚨 CRITICAL: Provide a complete, specific, helpful answer. Avoid generic responses or deflections."
                    
                    # Recursive call with enhanced prompt
                    await stream_llm(
                        llm_id=llm_id,
                        facts=facts,
                        out_type=out_type,
                        mode=mode,
                        strict=strict,
                        context_type=context_type,
                        extra_ctx=extra_ctx,
                        session_id=session_id,
                        coaching_mode=coaching_mode,
                    )
                    return
                else:
                    logger.warning(f"⚠️ Max retries reached, proceeding with current response")
            
            # Reset retry counter on successful response
            if hasattr(stream_llm, '_retry_count'):
                delattr(stream_llm, '_retry_count')
            
            # Enhance response with formatting improvements
            full_text = enhance_response_formatting(full_text)
            if question_type == "coding":
                full_text = _ensure_coding_answer_has_fenced_code(full_text, facts)
        
        logger.info(f"📝 Full response collected: {len(full_text)} chars, first 100: '{full_text[:100]}'")
        
        # Save conversation history for follow-up questions (session-specific)
        try:
            if history_key not in session_hist:
                session_hist[history_key] = []
            
            # Add user message and assistant response to history
            session_hist[history_key].append({"role": "user", "content": (facts or "")[:1000]})
            session_hist[history_key].append({"role": "assistant", "content": (full_text or "")[:3000]})
            
            # Trim history to max turns (keep only recent exchanges)
            if len(session_hist[history_key]) > MAX_HISTORY_TURNS * 2:
                session_hist[history_key] = session_hist[history_key][-MAX_HISTORY_TURNS * 2:]
            
            logger.info(f"💾 Saved to session {session_id} conversation history ({len(session_hist[history_key])} messages total, context: {context_type})")
        except Exception as hist_err:
            logger.warning(f"Failed to save conversation history: {hist_err}")
        
        completion_sent = False

        # Post-filter for strict mode: remove generic filler & enforce brevity
        # NOTE: We already streamed the response token-by-token, so we DO NOT re-broadcast
        # the entire filtered text. Instead, we just update full_text for history/confidence.
        if strict and mode == "coach" and full_text:
            original = full_text
            # Remove common generic prefaces
            filler_patterns = [
                r"^Certainly[,!]?\s*",
                r"^Sure[,!]?\s*",
                r"^Here('?s| is)\s+",
                r"^Of course[,!]?\s*",
                r"^I'm happy to\s+help\s*with\s*that[:,]?\s*",
            ]
            for pat in filler_patterns:
                full_text = re.sub(pat, "", full_text, flags=re.IGNORECASE)
            # If answer has headings but user didn't request them, strip heading markers
            full_text = re.sub(r"^#+\s*", "", full_text, flags=re.MULTILINE)
            # Enforce ~120 word soft cap unless code block present
            if "```" not in full_text:
                words = full_text.split()
                if len(words) > 130:
                    full_text = " ".join(words[:130])
            
            # FIX: Don't re-broadcast the filtered text since we already streamed it
            # The user already saw the full response during streaming
            # Only log the difference for debugging
            if full_text != original:
                logger.info(f"✂️ Strict mode filtered response: {len(original)} -> {len(full_text)} chars")
                # Do NOT send again - user already received streamed version
                # completion_sent remains False so completion signal below is sent

        if full_text and full_text.strip() != (streamed_raw_text or "").strip():
            logger.info("Sending final formatted replacement for streamed response")
            broadcast_sync({"type": out_type, "text": full_text, "replace": True}, session_id=session_id)

        auto_continue_enabled = os.getenv('AI_AUTO_CONTINUE', '0').lower() not in ('0','false','no','off')
        if auto_continue_enabled and full_text:
            try:
                max_passes = int(os.getenv('AI_CONTINUE_PASSES', '3'))
            except ValueError:
                max_passes = 3
            passes = 0
            aggregate_text = full_text
            while passes < max_passes:
                trimmed = aggregate_text.rstrip()
                incomplete = (
                    truncated_by_length
                    or trimmed.count("```") % 2 == 1
                    or bool(re.search(r"\.\.\.$", trimmed))
                )
                if not incomplete:
                    break
                passes += 1
                logger.info("Auto-continue pass %d before final completion", passes)
                cont_messages = [
                    {"role": "system", "content": "Continue the prior answer seamlessly. Only provide the missing remainder. Do NOT repeat previously sent content."},
                    {"role": "user", "content": f"Tail context to continue from (do not repeat):\n{aggregate_text[-1200:]}\n\nContinue:"}
                ]
                broadcast_sync({"type": out_type, "text": "", "reset": False, "continuation_pass": passes}, session_id=session_id)
                cont_gen = generate_ai_response_for(llm_id, cont_messages) if use_override else generate_ai_response(cont_messages)
                cont_collected: List[str] = []
                truncated_by_length = False
                async for ctoken in cont_gen:
                    if ctoken == "[[TRUNCATED_BY_LENGTH]]":
                        truncated_by_length = True
                        continue
                    if ctoken:
                        cont_collected.append(ctoken)
                        broadcast_sync({"type": out_type, "text": ctoken}, session_id=session_id)
                addition = "".join(cont_collected).strip()
                if not addition:
                    break
                aggregate_text += "\n" + addition
            if aggregate_text != full_text:
                full_text = aggregate_text
                if question_type == "coding":
                    full_text = _ensure_coding_answer_has_fenced_code(full_text, facts)
                if session_hist.get(history_key) and session_hist[history_key][-1].get("role") == "assistant":
                    session_hist[history_key][-1]["content"] = (full_text or "")[:3000]

        # ============================================================================
        # 🎯 SEND FINAL COMPLETION SIGNAL (EXACTLY ONCE)
        # ============================================================================
        # Send completion signal ONLY if not already sent
        # This ensures we never send duplicate completion signals
        if not completion_sent:
            logger.info(f"🏁 Sending completion signal for {out_type}")
            broadcast_sync({"type": out_type, "text": "", "complete": True}, session_id=session_id)
            completion_sent = True
            # Record performance metric for completed AI response
            try:
                _ai_elapsed_ms = (time.perf_counter() - _ai_stream_start) * 1000
                record_metrics({"type": "ai_response", "duration_ms": _ai_elapsed_ms, "model": llm_id, "chars": len(full_text)})
                logger.debug(f"[Metrics] AI response: {_ai_elapsed_ms:.0f}ms, {len(full_text)} chars")
            except Exception:
                pass
        else:
            logger.info(f"⏭️ Skipping completion signal (already sent for {out_type})")

            # Auto-continue detection with recursive passes (up to 3)
            try:
                passes = 0
                aggregate_text = full_text
                # Allow disabling via AI_AUTO_CONTINUE=0
                auto_continue_enabled = os.getenv('AI_AUTO_CONTINUE', '0').lower() not in ('0','false','no','off')
                max_passes = int(os.getenv('AI_CONTINUE_PASSES', '3')) if auto_continue_enabled else 0
                while passes < max_passes and aggregate_text:
                    trimmed = aggregate_text.rstrip()
                    incomplete = False
                    
                    # EXTREMELY conservative - only continue for OBVIOUS truncation
                    if truncated_by_length:
                        # Only if explicitly truncated by token limit
                        incomplete = True
                        logger.warning("Detected explicit token length truncation")
                    elif trimmed.count("```") % 2 == 1:
                        # Unclosed code block - this is a real issue
                        incomplete = True
                        logger.warning("Detected unclosed code block")
                    elif re.search(r"\.\.\.$", trimmed):
                        # Ends with ellipsis - clear continuation indicator
                        incomplete = True
                        logger.warning("Detected ellipsis continuation indicator")
                    
                    # DO NOT continue for these (they're valid endings):
                    # - Ends with ) or } (code)
                    # - Ends with numbers/notation like O(1), O(n log n)
                    # - Ends with punctuation like : ; - /
                    # - Doesn't end with period
                    # - Ends with technical terms
                    
                    if not incomplete:
                        logger.info("Response appears complete - no auto-continue needed")
                        break
                    passes += 1
                    logger.info(f"Auto-continue pass {passes} (potential truncation)")
                    continuation_user = aggregate_text[-1200:]
                    cont_messages = [
                        {"role": "system", "content": "Continue the prior answer seamlessly. Only provide the missing remainder. Do NOT repeat previously sent content."},
                        {"role": "user", "content": f"Tail context to continue from (do not repeat):\n{continuation_user}\n\nContinue:"}
                    ]
                    broadcast_sync({"type": out_type, "text": "", "reset": False, "continuation_pass": passes}, session_id=session_id)
                    cont_gen = generate_ai_response_for(llm_id, cont_messages) if use_override else generate_ai_response(cont_messages)
                    cont_collected: List[str] = []
                    async for ctoken in cont_gen:
                        if ctoken == "[[TRUNCATED_BY_LENGTH]]":
                            truncated_by_length = True
                            continue
                        if ctoken:
                            cont_collected.append(ctoken)
                            broadcast_sync({"type": out_type, "text": ctoken}, session_id=session_id)
                    addition = "".join(cont_collected).strip()
                    aggregate_text += ("\n" if addition else "") + addition
                    truncated_by_length = False
                    broadcast_sync({"type": out_type, "text": "", "complete": True, "continuation": True, "pass": passes}, session_id=session_id)
            except Exception as ce:
                logger.warning(f"Auto-continue logic failed: {ce}")

        if not completion_sent:
            # Ensure non-strict flows still notify the UI that streaming completed
            logger.info(f"🏁 (non-strict) Sending completion signal for {out_type}")
            broadcast_sync({"type": out_type, "text": "", "complete": True}, session_id=session_id)
        
    except Exception as e:
        # Attempt to detect common rate-limit patterns
        err_txt = str(e)
        retry_after = None
        m = re.search(r"retry[- ]?after[=: ](\d+)", err_txt, re.IGNORECASE)
        if m:
            try: retry_after = int(m.group(1))
            except: retry_after = None
        rate_limited = any(kw in err_txt.lower() for kw in ["rate limit", "too many requests", "status 429", "http 429", "code 429"])
        if rate_limited:
            if retry_after is None:
                # Fallback heuristic small backoff
                retry_after = 15
            logger.warning(f"Rate limit encountered (retry_after={retry_after}s): {err_txt}")
            broadcast_sync({
                "type": out_type,
                "error": "rate_limit",
                "retry_after": retry_after,
                "text": f"[Rate limit: retry in {retry_after}s]",
                "complete": True
            }, session_id=session_id)
        else:
            logger.error(f"AI generation error: {e}")
            broadcast_sync({"type": out_type, "text": f"[AI Error: {e}]", "complete": True}, session_id=session_id)

    return


async def handle_audio_streaming(ws, session_id=None):
    """
    Real-time streaming audio handler using Deepgram for low-latency transcription.
    Streams audio directly to provider and forwards interim/final results to UI immediately.
    """
    import numpy as np
    global current_speaker, listen_student_enabled, last_processed_student_utterance, last_student_time
    streaming_engine_local = None
    
    logger.info(f"[Streaming] Audio WebSocket connected - session_id: {session_id}")
    
    # Initialize session transcript buffer
    set_session_partial_text(session_id, get_session_partial_text(session_id))
    
    # Broadcast that audio websocket connected
    await broadcast({"type": "status", "data": {"audio": "socket_open", "mode": "streaming"}}, session_id=session_id)
    
    # Initialize streaming transcription engine
    try:
        logger.info("[Streaming] Creating session streaming transcription engine")
        from streaming_transcription import StreamingTranscriptionEngine
        # BYOK: use session-specific Deepgram key if available
        _cfg = session_configs.get(session_id, {})
        streaming_engine_local = StreamingTranscriptionEngine(
            api_key=_cfg.get("deepgram_api_key") or None,
            model=_cfg.get("deepgram_model") or None,
        )
        
        # Connect to streaming provider (Deepgram)
        logger.info("[Streaming] Connecting to transcription provider...")
        connected = await streaming_engine_local.connect()
        
        if not connected:
            logger.error("[Streaming] Failed to connect to streaming transcription provider")
            await broadcast({"type": "error", "message": "Streaming transcription unavailable - check DEEPGRAM_API_KEY"}, session_id=session_id)
            return
        
        logger.info(f"[Streaming] Connected to {streaming_engine_local.provider_name} - ready for audio")
        await broadcast({"type": "status", "data": {"audio": "streaming_ready", "provider": streaming_engine_local.provider_name}}, session_id=session_id)
        
    except Exception as e:
        logger.error(f"[Streaming] Engine initialization failed: {e}")
        await broadcast({"type": "error", "message": f"Streaming initialization error: {e}"}, session_id=session_id)
        return
    
    # State for tracking transcription
    last_final_text = ""
    interim_buffer = ""
    bytes_received = 0
    results_received = 0
    last_broadcast_time = time.time()
    announced_receiving = False
    last_ack_time = time.time()
    
    # Callback for interim results (partial transcriptions)
    def on_interim_result(result: TranscriptResult):
        nonlocal interim_buffer, last_broadcast_time
        
        # Broadcast interim result immediately for real-time display
        recording_mode = globals().get('current_recording_mode', 'interviewer')
        
        # Throttle interim broadcasts to avoid UI overload (max 10/sec)
        now = time.time()
        if (now - last_broadcast_time) < 0.07:  # 70ms throttle for snappier interims
            return
        
        last_broadcast_time = now
        interim_buffer = result.text
        
        logger.debug(f"[Streaming] Interim: '{result.text[:50]}...' (conf: {result.confidence:.2f})")
        
        asyncio.create_task(broadcast({
            "type": "transcript",
            "text": result.text,
            "interim": True,
            "is_final": False,
            "speaker": current_speaker,
            "recording_mode": recording_mode,
            "confidence": result.confidence
        }, session_id=session_id))
    
    # Callback for final results (confirmed transcriptions)
    def on_final_result(result: TranscriptResult):
        nonlocal last_final_text, interim_buffer, results_received
        global last_processed_student_utterance, last_student_time
        
        results_received += 1
        text = result.text.strip()
        
        if not text:
            return
        
        # Append to rolling transcript without injecting speaker tags.
        # Keep the aggregated transcript clean; UI gets speaker via message fields.
        full_transcript = append_session_partial_text(session_id, text)
        
        last_final_text = text
        interim_buffer = ""  # Clear interim buffer
        
        recording_mode = globals().get('current_recording_mode', 'interviewer')
        
        logger.info(f"[Streaming] Final ({results_received}): '{text[:80]}' (conf: {result.confidence:.2f})")
        
        # Broadcast final result
        asyncio.create_task(broadcast({
            "type": "transcript",
            "text": text,
            "full": full_transcript,
            "interim": False,
            "is_final": True,
            "speaker": current_speaker,
            "recording_mode": recording_mode,
            "confidence": result.confidence,
            "results_count": results_received
        }, session_id=session_id))
        
        # Auto-coach is DISABLED - user must click "Ask AI" button manually
        # No automatic AI triggering on transcription
    
    # Create background task to receive transcription results
    async def receive_results_loop():
        """Background task to receive and process transcription results"""
        try:
            async for result in streaming_engine_local.stream_results(
                on_interim=on_interim_result,
                on_final=on_final_result
            ):
                # Results are handled by callbacks above
                pass
        except Exception as e:
            logger.error(f"[Streaming] Results loop error: {e}")
            await broadcast({"type": "error", "message": "Transcription stream interrupted"}, session_id=session_id)
    
    # Start results receiver in background
    results_task = asyncio.create_task(receive_results_loop())
    
    try:
        # Main loop: forward audio chunks directly to streaming provider
        logger.info("[Streaming] Starting audio forwarding loop")
        
        async for data in ws:
            if isinstance(data, bytes):
                bytes_received += len(data)
                
                try:
                    # Forward audio chunk directly to streaming provider (zero buffering)
                    await streaming_engine_local.send_audio(data)
                    # On first audio, announce receiving status to UI
                    if not announced_receiving:
                        announced_receiving = True
                        asyncio.create_task(broadcast({"type": "status", "data": {"audio": "receiving"}}, session_id=session_id))
                    
                    # Periodic lightweight ack back to the audio WebSocket for diagnostics (every ~1s)
                    now = time.time()
                    if (now - last_ack_time) >= 1.0:
                        last_ack_time = now
                        try:
                            # Send a small JSON text frame; renderer logs it if present
                            asyncio.create_task(ws.send(json.dumps({
                                "type": "audio_ack",
                                "bytes": bytes_received
                            })))
                        except Exception:
                            pass
                    
                    # Log progress every 5 seconds
                    if bytes_received % (16000 * 2 * 5) < 4096:  # ~5 sec intervals
                        logger.debug(f"[Streaming] Forwarded {bytes_received:,} bytes, {results_received} results")
                        
                except ConnectionError as ce:
                    logger.warning(f"[Streaming] Connection lost: {ce}, attempting reconnect...")
                    await broadcast({"type": "status", "data": {"audio": "reconnecting"}}, session_id=session_id)
                    
                    # Try to reconnect
                    reconnected = await streaming_engine_local.connect()
                    if reconnected:
                        logger.info("[Streaming] Reconnected successfully")
                        await broadcast({"type": "status", "data": {"audio": "streaming_ready"}}, session_id=session_id)
                    else:
                        logger.error("[Streaming] Reconnection failed")
                        await broadcast({"type": "error", "message": "Transcription connection lost"}, session_id=session_id)
                        break
                        
    except (ConnectionClosed, ConnectionClosedError):
        logger.info("[Streaming] Client disconnected")
    except Exception as e:
        logger.error(f"[Streaming] Audio loop error: {e}")
    finally:
        # Clean up
        logger.info(f"[Streaming] Closing - received {bytes_received:,} bytes, {results_received} results")
        
        # Cancel results receiver
        results_task.cancel()
        try:
            await results_task
        except asyncio.CancelledError:
            pass
        
        # Close streaming engine connection
        if streaming_engine_local:
            try:
                await streaming_engine_local.close()
            except Exception as e:
                logger.warning(f"[Streaming] Error closing engine: {e}")


async def handle_audio(ws):
    global partial_text, current_speaker, listen_student_enabled, last_processed_student_utterance, last_student_time
    import numpy as np
    
    # Initialize partial_text if it doesn't exist
    if 'partial_text' not in globals() or partial_text is None:
        partial_text = ""

    # Broadcast that audio websocket connected
    await broadcast({"type": "status", "data": {"audio": "socket_open"}})

    # Lazy load ASR (may block briefly). If it fails we still accept audio and retry later.
    try:
        ensure_asr()
    except Exception as e:
        logger.error("ASR initialization failed: %s", e)

    # Notify UI that ASR is (attempting) ready; actual availability depends on model load
    await broadcast({"type": "status", "data": {"asr": "initializing"}})

    # Expect stream of PCM16 (mono) at 16kHz from renderer
    # Use circular buffer with memoryview for efficient memory operations
    BUFFER_SECONDS = 8
    SAMPLE_RATE = 16000
    ring = np.zeros(SAMPLE_RATE * BUFFER_SECONDS, dtype=np.float32)
    wpos = 0
    last_emit = time.time()
    audio_received = False  # Track if we've received any audio
    announced_receiving = False
    bytes_received = 0
    emissions = 0
    last_segment_time = 0.0
    last_partial_sent = ""  # legacy unused
    last_emitted_full = ""  # Track cumulative text we have already emitted to clients - INITIALIZE HERE
    last_transcribed_text = ""  # Track last raw transcribed text to detect duplicates

    # Tunables for emission - optimized for lower latency
    EMIT_MIN_INTERVAL = 0.4   # seconds between decode attempts (reduced from 0.5)
    SPAN_SECONDS = 2.0        # decode last 2.0s (reduced from 2.5s) for faster response
    MAX_SPAN_SECONDS = 3.5    # cap slice (reduced from 4.0s)

    def push_pcm(pcm_i16: bytes):
        """Push PCM data into circular buffer efficiently"""
        nonlocal wpos, audio_received, bytes_received
        # Use memoryview for zero-copy numpy conversion
        pcm = np.frombuffer(pcm_i16, dtype=np.int16).astype(np.float32, copy=False) / 32768.0
        if pcm.size == 0:
            return
        bytes_received += len(pcm_i16)
        n = min(pcm.size, ring.size)
        end = (wpos + n) % ring.size
        # Circular buffer write
        if wpos + n <= ring.size:
            ring[wpos:wpos+n] = pcm[:n]
        else:
            first = ring.size - wpos
            ring[wpos:] = pcm[:first]
            ring[:end] = pcm[first:n]
        wpos = (wpos + n) % ring.size
        audio_received = True

    async def emit_if_ready(force: bool = False):
        nonlocal last_emit, audio_received, announced_receiving, emissions, last_segment_time, last_partial_sent, last_emitted_full, last_transcribed_text
        global partial_text, current_speaker, current_recording_mode
        now = time.time()
        if not force and (now - last_emit) < EMIT_MIN_INTERVAL:
            return
        if not audio_received:
            return  # Don't try to transcribe if no audio has been received yet
        elif not announced_receiving:
            # Inform UI that audio stream is active
            logger.info("[Audio] Receiving audio data, starting transcription pipeline")
            await broadcast({"type": "status", "data": {"audio": "receiving"}})
            announced_receiving = True
        # Determine slice duration adaptively
        elapsed_since_emit = now - last_emit
        desired_span = int(min(MAX_SPAN_SECONDS, max(SPAN_SECONDS, elapsed_since_emit + SPAN_SECONDS/2)) * 16000)
        span = desired_span
        if wpos - span >= 0:
            audio = ring[wpos - span:wpos].copy()
        else:
            audio = np.concatenate([ring[wpos - span:], ring[:wpos]])
            
        try:
            # Legacy Whisper path disabled; no transcription performed here
            return
            
            # Skip if this is very similar to what we just transcribed (Whisper repeating due to overlapping windows)
            # Use simple substring check: if new text is contained in old or vice versa, it's likely a repeat
            if text and last_transcribed_text:
                text_normalized = text.lower().strip()
                last_normalized = last_transcribed_text.lower().strip()
                # If either is a substring of the other (with some tolerance), skip
                if (text_normalized in last_normalized or last_normalized in text_normalized) and \
                   abs(len(text_normalized) - len(last_normalized)) < 10:  # Similar length
                    logger.debug(f"Skipping similar transcription: '{text[:50]}'")
                    last_emit = now
                    return
            
            if text:
                last_transcribed_text = text  # Remember this transcription
                emissions += 1
                last_segment_time = now
                # Append to rolling partial_text without speaker tags for cleaner display
                if partial_text and not partial_text.endswith((" ", "\n")):
                    partial_text += " "
                partial_text += text
                if len(partial_text) > 12000:
                    partial_text = partial_text[-8000:]

                # Incremental diff: find new suffix not yet emitted
                new_portion = ""
                if len(partial_text) > len(last_emitted_full):
                    new_portion = partial_text[len(last_emitted_full):].strip()
                else:
                    # If model re-wrote earlier context, emit full refresh once (rare)
                    if partial_text != last_emitted_full:
                        new_portion = text  # fallback to latest segment
                if not new_portion:
                    # Nothing genuinely new
                    last_emit = now
                    return
                last_emitted_full = partial_text
                recording_mode = globals().get('current_recording_mode', 'interviewer')
                logger.info(f"[Transcript] Broadcasting: speaker={current_speaker}, mode={recording_mode}, text='{new_portion[:80]}'")
                await broadcast({
                    "type": "transcript",
                    "text": new_portion,
                    "full": partial_text,
                    "interim": False,
                    "is_final": True,
                    "speaker": current_speaker,
                    "recording_mode": recording_mode,
                    "bytes": bytes_received,
                    "emissions": emissions
                })
                # Auto-coach is DISABLED - user must click "Ask AI" button manually
                # No automatic AI triggering on transcription
                logger.debug("ASR segment %d (total_bytes=%d, span_samples=%d): %s", emissions, bytes_received, span, text[:120])
            else:
                # No speech detected - reset duplicate tracking after silence
                if last_transcribed_text and (now - last_segment_time) > 3.0:
                    logger.debug("Resetting duplicate tracking after silence")
                    last_transcribed_text = ""
                # Optionally emit a light heartbeat every few seconds if completely silent
                if (now - last_segment_time) > 6.0 and (now - last_emit) > 5.5:
                    await broadcast({"type": "status", "data": {"audio": "silent"}})
        except Exception as e:
            logger.error("Transcription error: %s", e)
            
        last_emit = now

    try:
        async for data in ws:
            if isinstance(data, bytes):
                push_pcm(data)
                await emit_if_ready()
    except (ConnectionClosed, ConnectionClosedError):
        logger.info("Audio client disconnected")
    except Exception as e:
        logger.error(f"Audio connection error: {e}")
    finally:
        try:
            # Final forced flush to capture trailing audio that may not have met timing window
            await emit_if_ready(force=True)
        except Exception as fe:
            logger.debug(f"Final emit skipped: {fe}")
        logger.info("Audio stream closed")


def find_available_port(host: str = HOST, start_port: int = 8765, max_attempts: int = 10) -> int:
    """Find an available port starting from start_port, binding to the provided host."""
    for port in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind((host, port))
                return port
        except OSError:
            continue
    raise OSError(f"No available ports found in range {start_port}-{start_port + max_attempts - 1}")


def _parse_structured_ocr(text: str) -> Dict[str, List[str]]:
    sections: Dict[str, List[str]] = {}
    if not text:
        return sections

    current = "meta"
    sections[current] = []
    for raw_line in text.splitlines():
        if raw_line.startswith("## "):
            current = raw_line[3:].strip().lower()
            sections.setdefault(current, [])
            continue
        if raw_line.startswith("# "):
            continue
        sections.setdefault(current, []).append(raw_line.rstrip("\n"))

    # Drop empty lines while preserving indentation
    cleaned_sections: Dict[str, List[str]] = {}
    for key, values in sections.items():
        filtered = [ln for ln in values if ln.strip()]
        if filtered:
            cleaned_sections[key] = filtered
    return cleaned_sections


def _parse_structured_questions(text: str) -> List[str]:
    """Extract questions from the structured OCR output if available."""
    sections = _parse_structured_ocr(text)
    questions: List[str] = []
    for line in sections.get('questions detected', []):
        cleaned = re.sub(r"^[\-\*•–—·]+\s*", "", line.strip())
        cleaned = re.sub(r"^\d+[.)]\s*", "", cleaned)
        cleaned = cleaned.strip()
        if cleaned:
            questions.append(cleaned)

    if questions:
        return questions

    # Fallback: look for entries in structured lines with confidence tags ending in '?'
    pattern = re.compile(r"\[conf=[^\]]+\]\s*(.+?\?)\s*$")
    for match in pattern.finditer(text):
        candidate = match.group(1).strip()
        if candidate.endswith("?"):
            questions.append(candidate)
    return questions


def extract_last_question(text: str) -> str:
    """Return the last plausible question from the transcript or structured OCR."""
    try:
        if not text or not text.strip():
            return ""

        text = text.strip()

        structured_questions = _parse_structured_questions(text)
        for candidate in reversed(structured_questions):
            if candidate and len(candidate) >= 8 and candidate.endswith('?'):
                return candidate

        # Prefer explicit questions ending with ? in free-form text
        parts = re.findall(r"([^\.\?!]{8,}?\?)", text)
        if parts:
            question = parts[-1].strip()
            question = re.sub(r'^[^\w]*', '', question)
            return question

        # Fallback: search for interrogative phrases in the last 300 chars
        tail = text[-300:] if len(text) > 300 else text
        lower_tail = tail.lower()
        cues = [
            r"can you[\w\s,.']*",
            r"could you[\w\s,.']*",
            r"would you[\w\s,.']*",
            r"tell me[\w\s,.']*",
            r"what is[\w\s,.']*",
            r"what are[\w\s,.']*",
            r"what's[\w\s,.']*",
            r"how do[\w\s,.']*",
            r"how would[\w\s,.']*",
            r"why[\w\s,.']*",
            r"when[\w\s,.']*",
            r"where[\w\s,.']*",
            r"describe[\w\s,.']*",
            r"explain[\w\s,.']*",
        ]
        for cue in cues:
            m = re.search(cue, lower_tail)
            if m:
                fragment = lower_tail[m.start():]
                sentence_end = re.search(r'[.!?]', fragment)
                if sentence_end:
                    fragment = fragment[:sentence_end.start()]
                return fragment.strip()
        return ""
    except Exception:
        return ""


def _normalize_question(q: str) -> str:
    q = q.lower().strip()
    # Remove punctuation and extra spaces
    q = re.sub(r"[^a-z0-9\s]", "", q)
    q = re.sub(r"\s+", " ", q)
    return q


def _looks_like_question(text: str) -> bool:
    """Heuristic to determine whether a string is likely an explicit question."""
    if not text:
        return False
    stripped = text.strip()
    if not stripped:
        return False
    # Treat very long or multi-paragraph inputs as contextual blobs, not single questions
    if len(stripped) > 350:
        return False
    if stripped.count("\n") > 1:
        return False
    if "?" in stripped:
        return True
    first_word = stripped.split(maxsplit=1)[0].lower()
    interrogatives = {
        "what", "why", "how", "when", "where", "who", "which",
        "can", "could", "would", "should", "explain", "describe",
        "compare", "analyze", "outline", "list", "tell"
    }
    return first_word in interrogatives


def _is_similar(a: str, b: str, threshold: float = 0.9) -> bool:
    try:
        from difflib import SequenceMatcher
        return SequenceMatcher(None, a, b).ratio() >= threshold
    except Exception:
        return a == b


async def maybe_trigger_auto_coach():
    global auto_coach_enabled, coach_in_progress, last_coach_question, last_coach_time, recent_questions
    if not auto_coach_enabled or coach_in_progress:
        return
    q = extract_last_question(partial_text)
    now = time.time()
    # Debounce and avoid repeats
    if not q:
        return
    nq = _normalize_question(q)
    nlast = _normalize_question(last_coach_question) if last_coach_question else ""
    # Suppress if same as last or very similar within a short window
    if nlast and _is_similar(nq, nlast, 0.92):
        return
    # Also suppress if similar to any very recent question (last 20s)
    recent_window = 20.0
    recent_questions = [(qq, ts) for (qq, ts) in recent_questions if (now - ts) <= recent_window]
    for qq, ts in recent_questions:
        if _is_similar(nq, qq, 0.92):
            logger.info("Auto-coach duplicate question suppressed silently")
            return
    # Throttle minimum spacing between triggers
    if (now - last_coach_time) < 8.0:
        return
    last_coach_question = q
    last_coach_time = now
    recent_questions.append((nq, now))

    async def run():
        global coach_in_progress
        coach_in_progress = True
        try:
            # Reset UI for new suggestion
            broadcast_sync({"type": "coach", "text": "", "reset": True})
            # Auto-coach is triggered by speech, so use transcription context
            # Broadcast to all sessions — pick the first active session for BYOK key lookup
            _auto_sid = next(iter(session_configs), None)
            await stream_llm(DEFAULT_LLM, q, out_type="coach", mode="coach", strict=True, context_type="transcription", session_id=_auto_sid)
        finally:
            coach_in_progress = False

    asyncio.create_task(run())


async def ws_router(websocket, path):
    """Route WebSocket connections to appropriate handlers"""
    # Health check endpoint for cloud deployment monitoring
    if path == "/health":
        await websocket.send(json.dumps({
            "status": "healthy",
            "mode": "cloud" if CLOUD_MODE else "local",
            "ai_providers": get_ai_status(),
            "timestamp": time.time()
        }))
        await websocket.close()
        return
    
    # Treat empty or root path as UI for compatibility with renderer
    if path in ("/ui", "", "/"):
        await handle_ui(websocket)
    elif path.startswith("/audio"):
        # Deepgram streaming only
        if _has_streaming:
            # Extract session_id from query parameters
            session_id = None
            if '?' in path:
                from urllib.parse import parse_qs
                query_string = path.split('?', 1)[1]
                query_params = parse_qs(query_string)
                session_id = query_params.get('session_id', [None])[0]
            
            logger.info(f"[Router] Audio connection - session_id: {session_id}")
            await handle_audio_streaming(websocket, session_id=session_id)
        else:
            logger.error("[Router] Streaming module missing. Please ensure streaming_transcription.py is present.")
            # Send error message before closing
            try:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Audio streaming not available - streaming_transcription module failed to load. Check server logs for import errors."
                }))
            except Exception:
                pass
            await websocket.close()


async def process_request(path, request_headers):
    """
    Process HTTP requests before WebSocket upgrade.
    This allows health checks from cloud platforms (Koyeb, Railway, etc.)
    to work without needing a WebSocket upgrade.
    """
    # Health check endpoints - respond with HTTP 200
    if path in ("/health", "/"):
        # Check if this is a regular HTTP GET request (not WebSocket upgrade)
        upgrade_header = request_headers.get("Upgrade", "").lower()
        # Log debug info for non-upgrade requests so we can differentiate health checks vs bad HTTP
        if upgrade_header != "websocket":
            logger.debug("process_request: responding HTTP 200 for path=%s, Upgrade=%s, remote=%s", path, upgrade_header, request_headers.get('X-Forwarded-For') or request_headers.get('Host'))
            # Return HTTP response for health check
            health_data = json.dumps({
                "status": "healthy",
                "mode": "cloud" if CLOUD_MODE else "local",
                "ai_providers": get_ai_status(),
                "timestamp": time.time()
            })
            return (
                http.HTTPStatus.OK,
                [("Content-Type", "application/json")],
                health_data.encode()
            )
    # If not a health check, proceed with normal WebSocket handling
    return None


async def main():
    # Initialize AI providers on startup (background) and start server immediately
    logger.info("Starting AI Interview Assistant Server...")
    asyncio.create_task(ensure_ai_initialized())
    
    # Pre-initialize OCR engines in background to avoid first-capture delay
    asyncio.create_task(preload_ocr_engines())

    # Find an available port
    try:
        available_port = find_available_port(HOST, PORT)
        if available_port != PORT:
            logger.info(f"Port {PORT} is busy, using port {available_port} instead")
        
        # Set up signal handlers for graceful shutdown
        def signal_handler(signum, frame):
            logger.info(f"Received signal {signum}, shutting down gracefully...")
            # Don't raise KeyboardInterrupt immediately, let the server close naturally
        
        import signal
        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)
        
        # Allow tuning of ping interval & timeout from environment to reduce accidental 1011 timeouts
        ping_interval_env = os.getenv("WS_PING_INTERVAL")
        ping_timeout_env = os.getenv("WS_PING_TIMEOUT")
        kwargs = {}
        try:
            if ping_interval_env:
                kwargs['ping_interval'] = float(ping_interval_env)
            if ping_timeout_env:
                kwargs['ping_timeout'] = float(ping_timeout_env)
        except ValueError:
            logger.warning("Invalid WS_PING_* env values; using defaults")

        # Add CORS origins support for cloud deployment
        # If ALLOWED_ORIGINS is None, the websockets library accepts all origins
        # If it's a list, only those origins are allowed
        if CLOUD_MODE:
            # In cloud mode, we must be permissive with origins to allow connections from
            # various clients (Electron app, web dashboard, etc.)
            # Setting origins=None in websockets library means "don't check origin"
            logger.info("Setting allowed WebSocket origins: all origins (check disabled)")
            kwargs['origins'] = None


        # Add process_request handler for HTTP health checks
        kwargs['process_request'] = process_request

        async with serve(ws_router, HOST, available_port, max_size=8 * 1024 * 1024, **kwargs):
            logger.info("Server listening on ws://%s:%d (Cloud Mode: %s)", HOST, available_port, CLOUD_MODE)
            logger.info("HTTP health checks available at http://%s:%d/health", HOST, available_port)
            # Keep the server running indefinitely
            try:
                while True:
                    await asyncio.sleep(1)
            except KeyboardInterrupt:
                logger.info("Server shutting down...")
            finally:
                # Cleanup thread pool
                executor.shutdown(wait=True)
                logger.info("Thread pool executor shut down")
    except OSError as e:
        logger.error(f"Failed to start server: {e}")
        logger.info("Try stopping any existing server instances or use a different port")
        return


if __name__ == "__main__":
    asyncio.run(main())

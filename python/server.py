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

import numpy as np
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
from pypdf import PdfReader
import docx
from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ImageStat, ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True
import pytesseract

# Import improved OCR utilities (optional)
try:
    from ocr_utils import OCRProcessor, OCRConfig
    _has_ocr_utils = True
except ImportError:
    logger.warning("ocr_utils module not found, using legacy OCR processing")
    _has_ocr_utils = False

# Import our new AI providers system
from ai_providers import initialize_ai, generate_ai_response, get_ai_status, generate_ai_response_for

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
        is_windows_capture_available
    )
    _has_windows_capture = is_windows_capture_available()
    if _has_windows_capture:
        logger.info("✅ Windows native capture available - can capture restricted applications")
except ImportError:
    _has_windows_capture = False
    capture_screen_windows = None
    capture_window_windows = None
    get_available_windows = None
    logger.info("Windows native capture not available (install pywin32)")

# Import streaming transcription engine
try:
    from streaming_transcription import (
        StreamingTranscriptionEngine,
        TranscriptType,
        TranscriptResult
    )
    _has_streaming = True
    logger.info("Streaming transcription module loaded successfully")
except ImportError as e:
    logger.error(f"streaming_transcription module not available: {e}")
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
conversation_history: Dict[str, List[Dict[str, str]]] = {
    "coach": [],
    "assistant": [],
    "chat": []
}
MAX_HISTORY_TURNS = 10  # Keep last 10 exchanges (20 messages)

def get_combined_ocr_text():
    """Get all captured OCR texts combined"""
    if not captured_ocr_texts:
        return ""
    return "\n\n".join([f"Screen {i+1}: {text}" for i, text in enumerate(captured_ocr_texts) if text.strip()])


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

# Global OCR processor instance
_ocr_processor = None
# UI connections list
ui_clients: List[websockets.WebSocketServerProtocol] = []

# Transcription state
partial_text = ""
captured_ocr_texts: List[str] = []

# Company brief context chunks (fed into embedding store)
company_brief_chunks: List[str] = []

# Streaming transcription engine instance (Deepgram-only)
streaming_engine = None

# Auto-coach runtime flags
auto_coach_enabled = os.getenv("AUTO_COACH", "0").lower() in ("1", "true", "yes", "on")
coach_in_progress = False
last_coach_question: Optional[str] = None

# Embedding stores for resume/context personalization
index = None  # faiss index when available
emb_texts: List[str] = []
emb_matrix = None  # numpy matrix fallback

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

# Thread pool retained for blocking operations (non-transcription)
executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="bg_")

def get_ocr_processor():
    """Get or create OCR processor instance"""
    global _ocr_processor
    if _ocr_processor is None:
        if _has_ocr_utils:
            try:
                config = OCRConfig()
                _ocr_processor = OCRProcessor(config)
                logger.info("Using improved OCR processor")
            except Exception as e:
                logger.warning(f"Failed to initialize OCR processor: {e}, falling back to legacy")
                _ocr_processor = False  # Mark as failed, use legacy
        else:
            _ocr_processor = False  # Use legacy
    return _ocr_processor if _ocr_processor else None


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


def process_ocr_image(image_bytes: bytes) -> str:
    """Process OCR in a thread-safe manner with multi-pass preprocessing."""
    
    # Try to use improved OCR processor first
    processor = get_ocr_processor()
    if processor:
        try:
            # Configure for screen capture (faster but still accurate)
            processor.config.fast_mode = False  # Use thorough mode for better accuracy
            # Give a bit more time for tough screens and small fonts
            processor.config.variant_budget_seconds = float(os.getenv("OCR_VARIANT_BUDGET_SECONDS", "6.0"))
            # Upscale more aggressively for HiDPI/zoomed UIs
            processor.config.min_upscale_size = int(os.getenv("OCR_MIN_UPSCALE_SIZE", "1600"))
            processor.config.clean_text_only = True  # Clean output for analysis
            # Honor language and whitelist if provided
            lang = os.getenv("OCR_LANG", "eng").strip()
            if lang:
                processor.config.tesseract_lang = lang
            whitelist = os.getenv("OCR_CHAR_WHITELIST", "").strip()
            if whitelist:
                processor.config.char_whitelist = whitelist
            return processor.process(image_bytes)
        except Exception as e:
            logger.warning(f"Improved OCR processor failed: {e}, falling back to legacy")
    
    # Legacy OCR processing (fallback) - Enhanced for screen captures
    try:
        start_time = time.perf_counter()
        # For screen captures, use balanced mode (not too fast, not too slow)
        fast_mode = os.getenv("OCR_FAST_MODE", "0").lower() not in ("0", "false", "no", "off")  # Default thorough for captures
        try:
            tesseract_lang = os.getenv("OCR_LANG", "eng").strip()
            quick_config = os.getenv("OCR_QUICK_CONFIG", f"--oem 3 --psm 6 -l {tesseract_lang}")
            quick_min_chars = int(os.getenv("OCR_QUICK_MIN_CHARS", "60"))
        except ValueError:
            quick_min_chars = 60
        try:
            quick_conf_threshold = float(os.getenv("OCR_QUICK_CONF_THRESHOLD", "65"))
        except ValueError:
            quick_conf_threshold = 65.0
        try:
            variant_budget = float(os.getenv("OCR_VARIANT_BUDGET_SECONDS", "4.0"))  # Increased from 2.5 for better accuracy
        except ValueError:
            variant_budget = 4.0
        variant_budget = max(0.0, variant_budget)

        # Configure Tesseract path
        if os.getenv('TESSERACT_CMD'):
            pytesseract.pytesseract.tesseract_cmd = os.getenv('TESSERACT_CMD')  # type: ignore
        elif os.name == 'nt':
            candidates = [
                r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
                r"C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
                os.path.join(os.environ.get('USERPROFILE', ''), r"AppData\\Local\\Tesseract-OCR\\tesseract.exe"),
                os.path.join(os.environ.get('USERPROFILE', ''), r"AppData\\Local\\Programs\\Tesseract-OCR\\tesseract.exe"),
                r"C:\\Tesseract-OCR\\tesseract.exe",
                r"D:\\Tesseract-OCR\\tesseract.exe",
            ]
            for candidate in candidates:
                if os.path.exists(candidate):
                    pytesseract.pytesseract.tesseract_cmd = candidate
                    logger.info("Found Tesseract at %s", candidate)
                    break
            else:
                return "[Tesseract not found. Please install from: https://github.com/UB-Mannheim/tesseract/wiki]"

        # Load the image
        img_raw = Image.open(io.BytesIO(image_bytes))
        original_size = img_raw.size

        # Convert to RGB to safely handle transparency and palettes
        if img_raw.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img_raw.size, (255, 255, 255))
            if img_raw.mode == 'P':
                img_raw = img_raw.convert('RGBA')
            mask = img_raw.split()[-1] if img_raw.mode in ('RGBA', 'LA') else None
            background.paste(img_raw, mask=mask)
            img_raw = background
        else:
            img_raw = img_raw.convert('RGB')

        # Work in grayscale for OCR
        img_gray = img_raw.convert('L')

        # Enhanced upscaling for screen captures (especially video conferencing)
        # Video conference text (Zoom chat, Google Meet captions) is often small
        w, h = img_gray.size
        logger.debug(f"OCR processing image size: {w}x{h}")
        
        # More aggressive upscaling for video conferencing scenarios
        min_target_size = 1600  # Higher target for better text recognition
        
        if max(w, h) < min_target_size:
            # Calculate scale factor based on size
            if max(w, h) < 400:
                scale = 4.0  # Very small captures (typical for chat messages)
            elif max(w, h) < 600:
                scale = 3.5
            elif max(w, h) < 900:
                scale = 2.5
            elif max(w, h) < 1200:
                scale = 2.0
            else:
                scale = 1.5
            
            new_size = (int(w * scale), int(h * scale))
            # Use LANCZOS for best quality upscaling
            img_gray = img_gray.resize(new_size, Image.LANCZOS)
            logger.info(f"OCR upscaled {original_size} -> {new_size} ({scale:.1f}x) for better text recognition")
        else:
            # Even larger images benefit from slight upscaling for OCR
            if max(w, h) < min_target_size * 1.3:
                scale = 1.2
                new_size = (int(w * scale), int(h * scale))
                img_gray = img_gray.resize(new_size, Image.LANCZOS)
                logger.debug(f"OCR slight upscale {original_size} -> {new_size} for optimization")
            else:
                logger.debug(f"OCR image size adequate: {original_size}")

        working_img = img_gray.copy()

        # Fast-path pass: try a single Tesseract run and return immediately if it looks good enough
        quick_text = ""
        quick_conf = 0.0
        if fast_mode:
            try:
                quick_text = pytesseract.image_to_string(working_img, config=quick_config).strip()
            except Exception as exc:
                logger.debug("OCR fast path image_to_string failed: %s", exc)
                quick_text = ""
            if quick_text:
                try:
                    quick_data = pytesseract.image_to_data(working_img, config=quick_config, output_type=pytesseract.Output.DICT)
                    quick_confidences = [int(conf) for conf in quick_data.get('conf', []) if conf not in (-1, '-1')]
                    quick_conf = sum(quick_confidences) / len(quick_confidences) if quick_confidences else 0.0
                except Exception as exc:
                    logger.debug("OCR fast path confidence failed: %s", exc)
                    quick_conf = 0.0

                quick_lines = [ln for ln in quick_text.splitlines() if ln.strip()]
                if len(quick_text) >= quick_min_chars or quick_conf >= quick_conf_threshold or len(quick_lines) >= 2:
                    logger.info(
                        "OCR fast path accepted (%d chars, %.1f%% confidence, %.2fs)",
                        len(quick_text), quick_conf, time.perf_counter() - start_time
                    )
                    return quick_text

        # Histogram equalisation for contrast
        try:
            img_array = np.array(working_img)
            hist, _ = np.histogram(img_array.flatten(), 256, [0, 256])
            cdf = hist.cumsum()
            cdf_masked = np.ma.masked_equal(cdf, 0)
            cdf_scaled = (cdf_masked - cdf_masked.min()) * 255 / (cdf_masked.max() - cdf_masked.min())
            cdf_final = np.ma.filled(cdf_scaled, 0).astype('uint8')
            equalized = Image.fromarray(cdf_final[img_array])
        except Exception as exc:
            logger.debug("Histogram equalization failed: %s", exc)
            equalized = working_img

        # Enhanced denoising for video conferencing artifacts
        # Video compression creates artifacts that affect OCR accuracy
        try:
            # First pass: remove compression artifacts
            denoised = equalized.filter(ImageFilter.MedianFilter(size=3))
            # Second pass: stronger denoising for video artifacts
            denoised = denoised.filter(ImageFilter.MedianFilter(size=3))
            logger.debug("Applied double median filter for video artifact removal")
        except Exception as exc:
            logger.debug("Median filter failed: %s", exc)
            denoised = equalized

        # Autocontrast + enhancement variants
        auto_contrast = ImageOps.autocontrast(denoised)
        if fast_mode and not quick_text:
            try:
                quick_text = pytesseract.image_to_string(auto_contrast, config=quick_config).strip()
            except Exception as exc:
                logger.debug("OCR fast path (autocontrast) failed: %s", exc)
                quick_text = ""
            if quick_text:
                try:
                    quick_data = pytesseract.image_to_data(auto_contrast, config=quick_config, output_type=pytesseract.Output.DICT)
                    quick_confidences = [int(conf) for conf in quick_data.get('conf', []) if conf not in (-1, '-1')]
                    quick_conf = sum(quick_confidences) / len(quick_confidences) if quick_confidences else 0.0
                except Exception as exc:
                    logger.debug("OCR fast path (autocontrast) confidence failed: %s", exc)
                    quick_conf = 0.0
                quick_lines = [ln for ln in quick_text.splitlines() if ln.strip()]
                if len(quick_text) >= quick_min_chars or quick_conf >= quick_conf_threshold or len(quick_lines) >= 2:
                    logger.info(
                        "OCR fast path (autocontrast) accepted (%d chars, %.1f%% confidence, %.2fs)",
                        len(quick_text), quick_conf, time.perf_counter() - start_time
                    )
                    return quick_text
        try:
            contrast_boost = ImageEnhance.Contrast(auto_contrast).enhance(2.0)
        except Exception:
            contrast_boost = auto_contrast
        try:
            sharpened = ImageEnhance.Sharpness(contrast_boost).enhance(1.6)
        except Exception:
            sharpened = contrast_boost

        # Adaptive threshold (Otsu)
        threshold = 127
        try:
            hist = denoised.histogram()
            total = sum(hist)
            sumB = 0.0
            wB = 0.0
            maximum = 0.0
            sum1 = sum(i * hist[i] for i in range(256))
            for i in range(256):
                wB += hist[i]
                if wB == 0:
                    continue
                wF = total - wB
                if wF == 0:
                    break
                sumB += i * hist[i]
                mB = sumB / wB
                mF = (sum1 - sumB) / wF
                between = wB * wF * (mB - mF) ** 2
                if between > maximum:
                    maximum = between
                    threshold = i
            logger.debug("OCR Otsu threshold: %d", threshold)
        except Exception as exc:
            logger.debug("Otsu thresholding failed: %s", exc)

        binary = denoised.point(lambda p: 255 if p > threshold else 0)
        binary_soft = denoised.point(lambda p: 255 if p > max(0, threshold - 10) else 0)

        # Morphological refinements
        try:
            binary_clean = binary.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.SHARPEN)
        except Exception:
            binary_clean = binary

        inverted = ImageOps.invert(binary_clean)
        inverted_soft = ImageOps.invert(binary_soft)

        # Brightness heuristic (dark backgrounds benefit from inversion)
        try:
            brightness = ImageStat.Stat(working_img).mean[0]
        except Exception:
            brightness = 128

        # Orientation detection (auto-rotate)
        rotate_angle = 0
        try:
            osd = pytesseract.image_to_osd(auto_contrast, output_type=pytesseract.Output.DICT)
            rotate_angle = int(osd.get('rotate', 0))
        except Exception as exc:
            logger.debug("OSD orientation detection failed: %s", exc)

        def maybe_rotate(image: Image.Image, label: str) -> tuple[str, Image.Image]:
            if rotate_angle and rotate_angle % 360 != 0:
                try:
                    rotated = image.rotate(-rotate_angle, expand=True)
                    return f"{label}_rot{rotate_angle}", rotated
                except Exception:
                    pass
            return label, image

        # Build variant list for voting
        variants: List[tuple[str, Image.Image]] = []
        for name, variant in [
            ("gray", working_img),
            ("equalized", equalized),
            ("autocontrast", auto_contrast),
            ("contrast", contrast_boost),
            ("sharpened", sharpened),
            ("binary", binary_clean),
            ("binary_soft", binary_soft),
        ]:
            variants.append(maybe_rotate(variant.copy(), name))

        # Always include inverted variants for dark mode UI (common in Zoom/Meet)
        # Video conferencing apps often use dark backgrounds with light text
        inverted_variants = [
            ("inverted", inverted),
            ("inverted_soft", inverted_soft),
        ]
        # Prioritize inverted variants for dark UI (typical in video apps)
        if brightness < 140:  # Increased threshold for video conferencing dark mode
            inverted_variants.extend([
                ("contrast_inverted", ImageOps.invert(contrast_boost)),
                ("sharpened_inverted", ImageOps.invert(sharpened)),
                ("equalized_inverted", ImageOps.invert(equalized)),  # Better for dark mode chat
            ])
        for name, variant in inverted_variants:
            variants.append(maybe_rotate(variant.copy(), name))

        # Deduplicate variants by hashing raw bytes to avoid redundant work
        unique_variants: Dict[str, Image.Image] = {}
        for label, image in variants:
            try:
                key = f"{label}:{hash(image.tobytes())}"
            except Exception:
                key = label
            if key not in unique_variants:
                unique_variants[key] = image

        # Enhanced configs for video conferencing scenarios
        configs_to_try = [
            '--oem 3 --psm 6',   # Uniform block of text (best for chat messages)
            '--oem 3 --psm 11',  # Sparse text, best-effort (good for captions)
            '--oem 3 --psm 3',   # Fully automatic page segmentation
            '--oem 3 --psm 4',   # Column detection
            '--oem 3 --psm 7',   # Single text line (captions/usernames)
            '--oem 1 --psm 6',   # LSTM engine for better modern text
        ]

        best_text = ""
        best_confidence = -1.0
        best_length = 0
        best_label = ""
        best_config = ""
        variant_deadline = None
        if fast_mode and variant_budget > 0:
            variant_deadline = start_time + max(0.5, variant_budget)

        for key, variant in unique_variants.items():
            if variant_deadline and time.perf_counter() > variant_deadline:
                logger.info("OCR variant search stopped at %.2fs (fast mode budget reached)", time.perf_counter() - start_time)
                break
            label = key.split(':', 1)[0]
            for config in configs_to_try:
                if variant_deadline and time.perf_counter() > variant_deadline:
                    logger.debug("Stopping OCR config search after %.2fs", time.perf_counter() - start_time)
                    break
                try:
                    data = pytesseract.image_to_data(variant, config=config, output_type=pytesseract.Output.DICT)
                    confidences = [int(conf) for conf in data.get('conf', []) if conf not in (-1, '-1')]
                    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
                    text = pytesseract.image_to_string(variant, config=config).strip()
                    if not text:
                        continue

                    text_length = len(text)
                    # Prefer higher confidence; tie-breaker on text length
                    if (avg_conf > best_confidence + 0.5) or (abs(avg_conf - best_confidence) <= 0.5 and text_length > best_length):
                        best_confidence = avg_conf
                        best_length = text_length
                        best_text = text
                        best_label = label
                        best_config = config
                        logger.debug("OCR variant %s with %s achieved %.1f%% confidence (%d chars)", label, config, avg_conf, text_length)
                except Exception as exc:
                    logger.debug("OCR variant %s with %s failed: %s", label, config, exc)

        if not best_text:
            # Last resort fallback on auto contrast image
            best_text = pytesseract.image_to_string(auto_contrast, config='--oem 3 --psm 6').strip()
            best_confidence = 0.0
            best_label = 'fallback'
            best_config = '--oem 3 --psm 6'

        if best_text:
            logger.info(
                "OCR extracted %d characters (confidence: %.1f%%) using %s / %s",
                len(best_text),
                best_confidence,
                best_label,
                best_config,
            )
        else:
            logger.warning("OCR extracted no text")

        return best_text

    except Exception as exc:
        logger.exception("OCR processing error")
        return f"[OCR error: {str(exc)}]"


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


async def handle_auto_answer_after_capture(text: str, source: str):
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
            broadcast_sync({"type": "coach", "text": "", "reset": True})
            await stream_llm(DEFAULT_LLM, q, out_type="coach", mode="coach", strict=False, context_type="capture")
        elif len(text.strip()) > 50:
            # No clear question, but substantial content
            logger.info(f"Auto-triggering AI to answer based on captured content from {source}...")
            broadcast_sync({"type": "coach", "text": "", "reset": True})
            # Pass the content directly
            await stream_llm(DEFAULT_LLM, text[:2000], out_type="coach", mode="coach", strict=False, context_type="capture")
        elif is_capture_mode and len(text.strip()) > 10:
            # For capture mode, provide analysis even for shorter text
            logger.info(f"Auto-triggering AI for short capture content from {source} (capture mode)...")
            broadcast_sync({"type": "coach", "text": "", "reset": True})
            prompt = f"Please analyze this captured text and provide helpful insights or answer any questions you can identify:\n\n{text[:1000]}"
            await stream_llm(DEFAULT_LLM, prompt, out_type="coach", mode="coach", strict=False, context_type="capture")
        else:
            logger.info(f"Captured text from {source} too short (<{10 if is_capture_mode else 50} chars) - skipping auto-answer")
    
    except Exception as e:
        logger.warning(f"Auto-coach trigger from {source} failed: {e}")


async def broadcast(msg: Dict):
    """Send a message to all UI clients, pruning dead connections quietly.

    Avoids noisy stack traces for expected disconnects (timeouts / network).
    Optimized with asyncio.gather for parallel sends.
    """
    if not ui_clients:
        logger.debug(f"[Broadcast] No UI clients connected, skipping message type={msg.get('type')}")
        return
    if isinstance(msg, dict) and "text" in msg and "data" not in msg:
        msg = {**msg, "data": msg["text"]}
    data = json.dumps(msg)
    
    # Log transcript broadcasts for debugging
    if msg.get('type') == 'transcript':
        logger.info(f"[Broadcast] Sending transcript to {len(ui_clients)} client(s): '{msg.get('text', '')[:50]}'")
    
    # Send to all clients in parallel for better performance
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
    results = await asyncio.gather(*[send_to_client(ws) for ws in list(ui_clients)], return_exceptions=True)
    
    # Remove stale connections
    stale = [r for r in results if r is not None and not isinstance(r, Exception)]
    if stale:
        for ws in stale:
            try:
                ui_clients.remove(ws)
            except ValueError:
                pass
        logger.info("Pruned %d stale UI websocket(s)", len(stale))


def broadcast_sync(msg: Dict):
    """Synchronous version of broadcast for use in streaming loops.
    
    CRITICAL: This must create tasks without awaiting to avoid blocking
    the streaming loop. Tasks are fire-and-forget for maximum throughput.
    """
    if not ui_clients:
        return
    # Ensure both 'text' and 'data' are provided for renderer compatibility
    if isinstance(msg, dict) and "text" in msg and "data" not in msg:
        msg = {**msg, "data": msg["text"]}
    data = json.dumps(msg)
    disconnected = []
    
    # Get the current event loop
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        logger.warning("No event loop available for broadcast_sync")
        return
    
    for ws in list(ui_clients):
        try:
            # Create task on the event loop - fire and forget
            # This ensures messages go out without blocking the generator
            loop.create_task(ws.send(data))
        except Exception as e:
            logger.debug("Broadcast error: %s", e)
            disconnected.append(ws)
    
    # Remove disconnected clients
    for ws in disconnected:
        try:
            ui_clients.remove(ws)
        except ValueError:
            pass


async def handle_ui(ws):
    global listen_student_enabled, current_speaker, captured_ocr_texts, partial_text
    ui_clients.append(ws)
    try:
        # On new UI connection, broadcast current listen_student state
        await broadcast({"type": "status", "data": {"listen_student": listen_student_enabled}})
        async for message in ws:
            try:
                if not message:
                    continue
                msg = json.loads(message)
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
                
                if mtype == "ask":
                    # Force to default LLM (single-model mode)
                    llm = DEFAULT_LLM
                    facts = msg.get("facts", "")
                    context_type = msg.get("contextType", "general")  # Get context type from client
                    await stream_llm(llm, facts, context_type=context_type)
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
                                })
                            except Exception:
                                pass
                        
                        # Offload OCR processing to thread pool (CPU-intensive)
                        loop = asyncio.get_event_loop()
                        text = await loop.run_in_executor(None, process_ocr_image, arr)

                        # If improved processor / legacy returned install guidance, pass through
                        raw_text = text or ""
                        t_lower = raw_text.lower()
                        if not raw_text.strip():
                            # Provide user-facing hints when extraction is blank
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
                                })
                            except Exception:
                                pass
                        
                        # Store this OCR result
                        capture_index = msg.get("captureIndex", len(captured_ocr_texts))
                        auto_analyze = msg.get("autoAnalyze", False)
                        
                        if capture_index >= len(captured_ocr_texts):
                            captured_ocr_texts.append(text or "")
                        else:
                            captured_ocr_texts[capture_index] = text or ""

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
                                
                                if result and not _is_blank_image_from_bytes(result['image']):
                                    # Re-process with OCR
                                    img_bytes = base64.b64decode(result['image'])
                                    
                                    if _has_ocr_utils:
                                        try:
                                            text = process_ocr_image(img_bytes)
                                        except Exception as e:
                                            logger.warning(f"Improved OCR failed in retry: {e}, falling back")
                                            from PIL import Image
                                            img = Image.open(io.BytesIO(img_bytes))
                                            text = pytesseract.image_to_string(img)
                                    else:
                                        from PIL import Image
                                        img = Image.open(io.BytesIO(img_bytes))
                                        text = pytesseract.image_to_string(img)
                                    
                                    # Update stored text
                                    if capture_index >= len(captured_ocr_texts):
                                        captured_ocr_texts.append(text or "")
                                    else:
                                        captured_ocr_texts[capture_index] = text or ""
                                    
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
                                    
                                    ocr_result['text'] = text
                                    ocr_result['meta'] = meta
                                    
                                else:
                                    logger.warning("Windows capture retry failed or returned blank image")
                            except Exception as retry_e:
                                logger.warning(f"Windows capture retry failed: {retry_e}")

                        # Auto-trigger AI response after capture
                        # Enable by default - AI will automatically analyze captured content
                        auto_coach_on_capture = os.getenv("AUTO_COACH_ON_CAPTURE", "1").lower() in ("1", "true", "yes", "on")
                        
                        if auto_coach_on_capture and text and text.strip():
                            await handle_auto_answer_after_capture(text, "ocr")
                    except Exception as e:
                        logger.exception("OCR error")
                        error_msg = str(e)
                        if "tesseract is not installed" in error_msg.lower() or "tesseractnotfounderror" in str(type(e)).lower():
                            install_msg = "[Tesseract is required for OCR. Please install from: https://github.com/UB-Mannheim/tesseract/wiki. Be sure to check 'Add to PATH' during installation. After installing, restart the application.]"
                            await broadcast({"type": "ocr", "text": install_msg})
                        elif "file not found" in error_msg.lower() or "the system cannot find the file" in error_msg.lower():
                            path_msg = "[Tesseract was found, but couldn't be executed. Make sure it's properly installed and added to PATH. Restart the application after installation.]"
                            await broadcast({"type": "ocr", "text": path_msg})
                        else:
                            await broadcast({"type": "ocr", "text": f"[OCR error: {e}]"})
                elif mtype == "windows_capture":
                    # Windows native screen capture for restricted applications
                    try:
                        if not _has_windows_capture:
                            await broadcast({
                                "type": "ocr",
                                "text": "[Windows native capture not available. Install pywin32: pip install pywin32]"
                            })
                        else:
                            monitor_index = msg.get("monitor", 0)
                            window_title = msg.get("window_title")
                            
                            if window_title:
                                logger.info(f"Capturing window: {window_title}")
                                result = capture_window_windows(window_title=window_title)
                            else:
                                logger.info(f"Capturing monitor {monitor_index}")
                                result = capture_screen_windows(monitor_index=monitor_index)
                            
                            if result:
                                # Process with OCR
                                img_bytes = base64.b64decode(result['image'])
                                
                                if _has_ocr_utils:
                                    try:
                                        # Use the improved OCR pipeline defined above
                                        text = process_ocr_image(img_bytes)
                                    except Exception as e:
                                        logger.warning(f"Improved OCR failed in windows_capture path: {e}, falling back")
                                        from PIL import Image
                                        img = Image.open(io.BytesIO(img_bytes))
                                        text = pytesseract.image_to_string(img)
                                else:
                                    # Fallback to basic OCR
                                    from PIL import Image
                                    img = Image.open(io.BytesIO(img_bytes))
                                    text = pytesseract.image_to_string(img)
                                
                                # Store captured text
                                capture_index = msg.get("captureIndex", len(captured_ocr_texts))
                                if capture_index >= len(captured_ocr_texts):
                                    captured_ocr_texts.append(text or "")
                                else:
                                    captured_ocr_texts[capture_index] = text or ""
                                
                                await broadcast({
                                    "type": "ocr",
                                    "text": text or "[No text detected]",
                                    "captureIndex": capture_index,
                                    "totalCaptures": len(captured_ocr_texts),
                                    "method": result.get('method', 'windows')
                                })
                                
                                logger.info(f"✅ Windows capture successful: {len(text or '')} characters extracted")
                                
                                # Auto-trigger AI response after Windows capture
                                auto_coach_on_capture = os.getenv("AUTO_COACH_ON_CAPTURE", "1").lower() in ("1", "true", "yes", "on")
                                
                                if auto_coach_on_capture and text and text.strip():
                                    await handle_auto_answer_after_capture(text, "windows")
                            else:
                                await broadcast({
                                    "type": "ocr",
                                    "text": "[Windows capture failed - see logs for details]"
                                })
                    except Exception as e:
                        logger.exception("Windows capture error")
                        await broadcast({"type": "ocr", "text": f"[Windows capture error: {e}]"})
                elif mtype == "list_windows":
                    # List available windows for capture
                    try:
                        if not _has_windows_capture:
                            await broadcast({
                                "type": "windows_list",
                                "windows": [],
                                "error": "Windows capture not available"
                            })
                        else:
                            windows = get_available_windows()
                            await broadcast({
                                "type": "windows_list",
                                "windows": [{"title": w["title"], "hwnd": w["hwnd"]} for w in windows[:50]]  # Limit to 50
                            })
                    except Exception as e:
                        logger.exception("List windows error")
                        await broadcast({
                            "type": "windows_list",
                            "windows": [],
                            "error": str(e)
                        })
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
                    await ingest_resume(str(name), raw)
                elif mtype == "context" and msg.get("context_kind") == "company":
                    # Store company brief details so AI can use them for follow-ups
                    try:
                        formatted = format_company_brief(msg)
                        if not formatted:
                            await broadcast({"type": "context_ack", "context_kind": "company", "success": False, "error": "No company details supplied"})
                        else:
                            await ingest_company_brief(formatted)
                            await broadcast({"type": "context_ack", "context_kind": "company", "success": True})
                    except Exception as e:
                        logger.exception("Failed processing company context")
                        await broadcast({"type": "context_ack", "context_kind": "company", "success": False, "error": str(e)})
                elif mtype == "parse_resume":
                    # Handle the simpler resume parsing format for testing
                    try:
                        resume_text = msg.get("resume_text", "")
                        if resume_text:
                            # Process the resume text (simplified for testing)
                            chunks = [resume_text]
                            await broadcast({"type": "resume_parsed", "success": True, "text": f"Processed {len(chunks)} resume chunks"})
                        else:
                            await broadcast({"type": "resume_parsed", "success": False, "error": "No resume text provided"})
                    except Exception as e:
                        logger.exception(f"Resume parsing error: {e}")
                        await broadcast({"type": "resume_parsed", "success": False, "error": str(e)})
                elif mtype == "coach":
                    # Manual coach trigger optionally with provided question
                    q = msg.get("question") or ""
                    llm = DEFAULT_LLM
                    strict = bool(msg.get("strict"))
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
                                # Handle image upload with enhanced OCR
                                logger.info("Starting enhanced OCR processing...")
                                img_bytes = base64.b64decode(file_data)

                                text = ""
                                tnf = getattr(pytesseract, 'TesseractNotFoundError', Exception)
                                try:
                                    # Use enhanced OCR processor if available
                                    if _has_ocr_utils:
                                        try:
                                            # Configure OCR for better accuracy
                                            ocr_config = OCRConfig()
                                            ocr_config.fast_mode = False  # Use thorough processing for uploads
                                            ocr_config.variant_budget_seconds = 6.0  # More time for better accuracy
                                            ocr_config.min_upscale_size = 1600  # Larger upscaling
                                            ocr_config.clean_text_only = True  # Return clean text for AI processing

                                            processor = OCRProcessor(ocr_config)
                                            text = processor.process(img_bytes)
                                            logger.info(f"Enhanced OCR completed. Extracted {len(text or '')} characters")
                                        except Exception as ocr_error:
                                            # If tesseract is missing, short-circuit with guidance
                                            if isinstance(ocr_error, tnf) or 'tesseract is not installed' in str(ocr_error).lower():
                                                raise ocr_error
                                            logger.warning(f"Enhanced OCR failed, falling back to basic: {ocr_error}")
                                            # Fallback to basic OCR
                                            img = Image.open(io.BytesIO(img_bytes))
                                            if img.mode not in ('L', 'LA'):
                                                img = img.convert('L')
                                            config = '--oem 3 --psm 6'
                                            text = pytesseract.image_to_string(img, config=config)
                                    else:
                                        # Basic OCR path
                                        img = Image.open(io.BytesIO(img_bytes))
                                        logger.info(f"Image loaded: {img.size}, mode: {img.mode}")
                                        if img.mode not in ('L', 'LA'):
                                            img = img.convert('L')
                                        config = '--oem 3 --psm 6'
                                        text = pytesseract.image_to_string(img, config=config)
                                        logger.info(f"Basic OCR completed. Extracted {len(text or '')} characters")
                                except Exception as e_ocr:
                                    # Provide a clear, user-facing message if Tesseract is missing
                                    msg_txt = str(e_ocr)
                                    if isinstance(e_ocr, tnf) or 'tesseract is not installed' in msg_txt.lower() or 'not found' in msg_txt.lower():
                                        guidance = (
                                            "[OCR setup required] Tesseract is not installed or not on PATH. "
                                            "Install from: https://github.com/UB-Mannheim/tesseract/wiki and restart the app. "
                                            "If already installed, set TESSERACT_CMD in your .env to the full path (e.g., C:\\Program Files\\Tesseract-OCR\\tesseract.exe)."
                                        )
                                        logger.warning("Tesseract missing for image upload OCR")
                                        file_context = f"\n\n[Image from {file_name}]:\n{guidance}"
                                    else:
                                        logger.exception(f"Image OCR failed: {e_ocr}")
                                        file_context = f"\n\n[Image from {file_name}]:\n[OCR error: {msg_txt}]"
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
                            await broadcast({"type": "error", "message": f"Failed to process file: {str(e)}"})

                    use_capture_context = question_channel in ("capture", "ocr")
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
                    captured_screens = msg.get("capturedScreens", []) if use_capture_context else []
                    if captured_screens:
                        captured_ocr_texts = []
                        for i, screen_img in enumerate(captured_screens):
                            try:
                                # Process each captured screen for OCR
                                if isinstance(screen_img, str):
                                    # Base64 image
                                    arr = base64.b64decode(screen_img)
                                elif isinstance(screen_img, list):
                                    # Byte array
                                    arr = bytes(bytearray(screen_img))
                                else:
                                    continue

                                img = Image.open(io.BytesIO(arr))
                                if img.mode not in ('L', 'LA'):
                                    img = img.convert('L')
                                config = '--oem 3 --psm 6'
                                text = pytesseract.image_to_string(img, config=config)
                                captured_ocr_texts.append(text or "")
                                logger.info(f"Processed captured screen {i+1}: {len(text or '')} characters")
                            except Exception as e:
                                logger.exception(f"Error processing captured screen {i+1}: {e}")
                                captured_ocr_texts.append("")

                    # Get inputs from various sources
                    provided_question = (q or "").strip()
                    transcript_q = extract_last_question(partial_text or "") if use_transcript_context else ""
                    ocr_q = ""
                    ocr_content = ""
                    interviewer_recent = msg.get("interviewer_recent") or []
                    student_recent = msg.get("student_recent") or []
                    analysis_recent = msg.get("analysis_recent") or []
                    
                    # Get the latest OCR content (prioritize most recent capture)
                    if use_capture_context:
                        try:
                            if captured_ocr_texts:
                                # Use the most recent OCR text first
                                for ocr_text in reversed(captured_ocr_texts):
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

                    if context_chunks:
                        actual_question = actual_question.strip()
                        actual_question = actual_question + "\n\n" + "\n\n".join(chunk.strip() for chunk in context_chunks if chunk.strip())
                    
                    # Check if capture context was requested but no screen content is available
                    if question_source == "capture" and not ocr_content and not file_context:
                        ocr_text_available = get_combined_ocr_text()
                        if not ocr_text_available:
                            logger.warning("Capture context requested but no screen content available")
                            await broadcast({
                                "type": "status", 
                                "message": "⚠️ No screen content captured. Please capture the screen first using the capture button."
                            })
                    
                    logger.info(f"Processing coach request. Question length: {len(actual_question)}, Source: {question_source}, First 200 chars: {actual_question[:200]}...")
                    
                    # Send status update to UI with source information
                    if file_context:
                        await broadcast({"type": "status", "message": "Processing uploaded file and generating response..."})
                    
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
                    })
                    # Pass the actual question directly, not prefixed with "Last question:"
                    extra_company_ctx = [company_context_text] if company_context_text else None
                    await stream_llm(
                        llm,
                        actual_question,
                        out_type="coach",
                        mode="coach",
                        strict=strict,
                        context_type=question_source,
                        extra_ctx=extra_company_ctx,
                    )
                elif mtype == "clear_captures":
                    # Clear all captured OCR texts
                    captured_ocr_texts = []
                    logger.info("Cleared all captured OCR texts")
                    await broadcast({"type": "captures_cleared"})
                elif mtype == "clear_conversation":
                    # Clear conversation history for specified mode or all modes
                    global conversation_history
                    mode_to_clear = msg.get("mode", "all")
                    if mode_to_clear == "all":
                        for mode in conversation_history:
                            conversation_history[mode] = []
                        logger.info("Cleared all conversation history")
                        await broadcast({"type": "conversation_cleared", "mode": "all"})
                    elif mode_to_clear in conversation_history:
                        conversation_history[mode_to_clear] = []
                        logger.info(f"Cleared conversation history for mode: {mode_to_clear}")
                        await broadcast({"type": "conversation_cleared", "mode": mode_to_clear})
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
                    })
                elif mtype == "stop_audio":
                    # Reset recording mode to prevent further transcript accumulation
                    globals()['current_recording_mode'] = None
                    try:
                        # Optionally trim partial_text to reduce repeats next session
                        if 'partial_text' in globals() and isinstance(partial_text, str):
                            if len(partial_text) > 1200:
                                partial_text = partial_text[-800:]
                    except Exception:
                        pass
                    await broadcast({"type": "status", "data": {"audio": "stopped"}})
                elif mtype == "set_speaker":
                    # Update the current speaker
                    speaker = msg.get("speaker", "user1") 
                    current_speaker = speaker
                    await broadcast({"type": "status", "data": {"speaker": speaker}})
                elif mtype == "listen_student":
                    # Toggle listening to student's utterances
                    enabled = bool(msg.get("enabled", False))
                    listen_student_enabled = enabled
                    logger.info(f"Listen student toggle: {listen_student_enabled}")
                    await asyncio.sleep(0)  # flush event loop
                    await broadcast({"type": "status", "data": {"listen_student": listen_student_enabled}})
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
                    })
            except json.JSONDecodeError as e:
                logger.warning(f"Invalid JSON from UI client: {e}")
            except Exception as e:
                logger.exception(f"Error processing message: {e}")
                try:
                    await broadcast({"type": "error", "text": f"[Message processing error: {e}]"})
                except:
                    pass  # Ignore errors when broadcasting error messages
    except (ConnectionClosed, ConnectionClosedError):
        logger.info("UI client disconnected")
    except Exception as e:
        logger.error(f"UI connection error: {e}")
    finally:
        if ws in ui_clients:
            ui_clients.remove(ws)


async def ingest_resume(name: str, raw: bytes):
    text = ""
    try:
        if name.lower().endswith(".pdf"):
            reader = PdfReader(io.BytesIO(raw))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        elif name.lower().endswith(".docx"):
            doc = docx.Document(io.BytesIO(raw))
            text = "\n".join(p.text for p in doc.paragraphs)
        else:
            text = raw.decode("utf-8", errors="ignore")
    except Exception as e:
        logger.exception("Resume parse error: %s", e)
        await broadcast({"type": "resume", "text": f"[Resume parse error: {e}]"})
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
        await broadcast({"type": "resume", "text": "[Resume contains no extractable text]"})
        return
    global SentenceTransformer, embedder, index, emb_texts, emb_matrix
    try:
        if SentenceTransformer is None:
            from sentence_transformers import SentenceTransformer as ST  # lazy import
            SentenceTransformer = ST
        if embedder is None:
            embedder = SentenceTransformer("all-MiniLM-L6-v2")
        vectors = embedder.encode(chunks, normalize_embeddings=True)
        if _has_faiss:
            if index is None:
                index = faiss.IndexFlatIP(vectors.shape[1])  # type: ignore
            index.add(np.asarray(vectors, dtype='float32'))
        else:
            # Simple numpy-based store
            vecs = np.asarray(vectors, dtype='float32')
            if emb_matrix is None:
                emb_matrix = vecs
            else:
                emb_matrix = np.vstack([emb_matrix, vecs])
        emb_texts.extend(chunks)
        logger.info("Ingested %d resume chunks", len(chunks))
        await broadcast({"type": "resume", "text": f"Ingested {len(chunks)} resume chunks"})
    except Exception as e:
        # Fallback when embeddings are unavailable; still store text for minimal context
        logger.warning("Embedding unavailable, storing resume text only: %s", e)
        emb_texts.extend(chunks)
        await broadcast({"type": "resume", "text": f"Ingested {len(chunks)} resume chunks (no embeddings)"})


async def ingest_company_brief(text: str):
    """Persist company brief text into embedding store for personalization."""
    global SentenceTransformer, embedder, index, emb_texts, emb_matrix, company_brief_chunks
    clean = text.strip()
    if not clean:
        return
    company_brief_chunks.append(clean)
    if len(company_brief_chunks) > 50:
        del company_brief_chunks[:-50]
    # Reuse existing embedding pipeline for consistency
    try:
        if SentenceTransformer is None:
            from sentence_transformers import SentenceTransformer as ST  # lazy import
            SentenceTransformer = ST
        if embedder is None:
            embedder = SentenceTransformer("all-MiniLM-L6-v2")
        vectors = embedder.encode([clean], normalize_embeddings=True)
        emb_texts.extend([clean])
        if _has_faiss:
            if index is None:
                index = faiss.IndexFlatIP(vectors.shape[1])  # type: ignore
            index.add(np.asarray(vectors, dtype='float32'))
        else:
            vecs = np.asarray(vectors, dtype='float32')
            if emb_matrix is None:
                emb_matrix = vecs
            else:
                emb_matrix = np.vstack([emb_matrix, vecs])
        logger.info("Company brief ingested")
    except Exception as e:
        logger.warning("Embedding unavailable for company brief: %s", e)
        emb_texts.extend([clean])


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
        (r'Answer Structure\s*1\.', r'\n\n**Answer Structure:**\n\n**1.**'),
        (r'Current Position:', r'\n\n**Current Position:**'),
        (r'Contextual Explanation:', r'\n\n**Contextual Explanation:**'),
        (r'Next Steps:', r'\n\n**Next Steps:**'),
        (r'Suggested Key Phrases\s*-', r'\n\n**Suggested Key Phrases:**\n\n'),
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
        # Look for lines like "Company: NAME"
        for line in text.splitlines():
            m = re.match(r"\s*Company\s*:\s*(.+)$", line.strip(), flags=re.IGNORECASE)
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
            if name and name.strip() and name.lower() in ql:
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


def build_prompts(mode: str, facts: str, ctx: List[str], strict: bool = False, context_type: str = "general"):
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
    
    # Core response guidelines: Always respond directly with clear, polished, complete answers
    # For transcription context, enforce brevity and conciseness
    if context_type == "transcription":
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
            "📐 MATH: Use proper LaTeX formatting for any mathematical expressions."
        )
    else:
        core_guidelines = (
            "\n\nENHANCED RESPONSE GUIDELINES:\n"
            "🎯 DIRECT RESPONSE: Always respond directly to the user's question with a clear, polished, and complete answer.\n"
            "🚫 NO META: Do not repeat or explain how you are structuring the answer.\n"
            "🔄 ADAPTIVE STYLE: Adapt your response style to the type of question:\n"
            "   • Definition/explanation → concise definition, then practical examples\n"
            "   • Math/logic → step-by-step reasoning with LaTeX formatting, then final answer\n"
            "   • Coding → clean working code first, then brief explanation if needed\n"
            "   • Resume/interview → turn notes into a fluent, professional response\n"
            "   • Open-ended/essay → structured content with clear headings/bullets\n"
            "📝 FORMATTING: Use headings, bullets, or LaTeX math notation when helpful for clarity.\n"
            "🔍 ACCURACY: Ensure technical accuracy and provide working, tested solutions.\n"
            "⚡ EFFICIENCY: Be concise but comprehensive - no unnecessary verbosity.\n"
            "🎨 POLISH: Provide production-ready answers that demonstrate expertise.\n"
            "Never output instructions (like 'start with…'). Only give the final answer."
        )
    
    # Determine what context to include based on context_type
    # This prevents mixing transcription and capture contexts
    additional_context = ""
    if context_type == "transcription":
        # For transcription-related questions, only include speech/audio context
        # For live interviewer Q&A we avoid injecting long transcript history by default
        if partial_text:
            additional_context = f""
    elif context_type == "capture":
        # For capture-related questions, only include OCR/screen context
        ocr_text = get_combined_ocr_text()
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
        if partial_text:
            contexts.append(f"Transcription context: {partial_text[:500]}")
        ocr_text = get_combined_ocr_text()
        if ocr_text:
            contexts.append(f"Screen context: {ocr_text[:500]}")
        if contexts:
            additional_context = "\n\n".join(contexts) + "\n\n"
    
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
            "- 'I'll provide a structured response template'\n"
            "- 'Once you have the details of the problem'\n"
            "- 'The captured text appears to be fragmented'\n"
            "- 'Analysis of the Captured Screen'\n"
            "- 'Content Overview: The captured text appears...'\n"
            "- 'Key Observations: Fragmentation...'\n"
            "- 'Data Integrity concerns...'\n"
            "- 'Suggested Key Phrases...'\n"
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
                        # Avoid adding resume/background to reduce drift during live Q&A
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
                    user = (
                        f"The interviewer just asked: \"{question}\"\n\n"
                        f"Based on this candidate's resume/background: {base_ctx}\n\n"
                        f"{additional_context}"
                        f"Provide specific, actionable talking points to answer this exact question: \"{question}\"\n\n"
                        "Requirements:\n"
                        "- Give bullet points specific to this question only\n"
                        "- Include suggested key phrases the candidate can use\n"
                        "- Provide a clear answer structure\n"
                        "- Make it practical and immediately usable\n"
                        "- Do NOT give generic advice that applies to any interview question"
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


async def ensure_ai_initialized():
    """Ensure AI providers are initialized"""
    global ai_initialized
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


async def stream_llm(
    llm_id: str,
    facts: str,
    out_type: str = "stream",
    mode: str = "assistant",
    strict: bool = False,
    context_type: str = "general",
    extra_ctx: Optional[List[str]] = None,
):
    """Stream LLM response using open source AI providers"""
    
    # ============================================================================
    # 🎯 DUPLICATE QUESTION DETECTION
    # ============================================================================
    if _has_answer_quality and os.getenv("ENABLE_DUPLICATE_DETECTION", "true").lower() in ("true", "1", "yes"):
        try:
            is_duplicate, prev_answer_hash = check_duplicate_question(facts)
            if is_duplicate:
                logger.info(f"🔄 Duplicate question detected, skipping processing")
                
                # Send duplicate notice to UI
                duplicate_message = "⚠️ Duplicate question detected; using previous answer context."
                broadcast_sync({
                    "type": out_type,
                    "text": "",
                    "reset": True
                })
                broadcast_sync({
                    "type": out_type,
                    "text": duplicate_message
                })
                broadcast_sync({
                    "type": "duplicate_detected",
                    "data": {
                        "message": duplicate_message,
                        "previous_hash": prev_answer_hash
                    }
                })
                return  # Skip processing
        except Exception as e:
            logger.warning(f"⚠️  Duplicate detection failed: {e}")
    
    # Ensure AI is initialized
    await ensure_ai_initialized()
    
    if not ai_initialized:
        broadcast_sync({"type": out_type, "text": "[AI system not initialized]"})
        return

    # ============================================================================
    # 🎯 ENHANCEMENT 1: INTELLIGENT QUESTION CLASSIFICATION & MODEL ROUTING
    # ============================================================================
    classification = None
    original_llm_id = llm_id  # Store original for logging
    model_params = {}
    
    if _has_intelligent_routing and os.getenv("ENABLE_MODEL_ROUTING", "true").lower() in ("true", "1", "yes"):
        try:
            # Classify the question to understand its type
            classification = classify_question(facts)
            logger.info(
                f"📊 Question classified: {classification.primary_type.value} "
                f"(confidence: {classification.confidence:.2f}, "
                f"complexity: {classification.complexity})"
            )
            
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
            
            # Broadcast classification info to UI
            await broadcast({
                "type": "question_classified",
                "data": {
                    "question_type": classification.primary_type.value,
                    "confidence": classification.confidence,
                    "complexity": classification.complexity,
                    "suggested_model": llm_id,
                    "tags": classification.tags
                }
            })
            
        except Exception as e:
            logger.warning(f"⚠️  Intelligent routing failed, using default: {e}")
            llm_id = original_llm_id  # Fallback to original
    
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
    if embedder is not None and (index is not None or emb_matrix is not None):
        query_text = (partial_text or "").strip() or (facts or "").strip() or (get_combined_ocr_text() or "").strip()
        
        if _has_intelligent_routing and os.getenv("ENABLE_ENHANCED_RAG", "true").lower() in ("true", "1", "yes"):
            try:
                # Use enhanced context manager with reranking
                context_mgr = create_context_manager(embedder, emb_matrix, emb_texts, index)
                
                # Retrieve with reranking and query expansion
                resume_chunks = context_mgr.retrieve(
                    query=query_text or facts,
                    top_k=5,
                    rerank=True,
                    expand_query=True
                )
                
                ctx = [chunk.text for chunk in resume_chunks]
                
                # Log retrieval quality
                if resume_chunks:
                    avg_score = sum(c.relevance_score for c in resume_chunks) / len(resume_chunks)
                    logger.info(
                        f"📚 Retrieved {len(resume_chunks)} resume chunks "
                        f"(avg relevance: {avg_score:.3f}, "
                        f"sections: {set(c.section for c in resume_chunks)})"
                    )
                
            except Exception as e:
                logger.warning(f"⚠️  Enhanced RAG failed, falling back to basic retrieval: {e}")
                # Fallback to original logic
                if query_text:
                    q = embedder.encode([query_text], normalize_embeddings=True).astype('float32')
                    if index is not None and _has_faiss:
                        D, I = index.search(q, 5)
                        ctx = [emb_texts[i] for i in I[0] if 0 <= i < len(emb_texts)]
                    elif emb_matrix is not None:
                        sims = emb_matrix @ q[0]
                        topk = np.argsort(-sims)[:5]
                        ctx = [emb_texts[i] for i in topk if 0 <= i < len(emb_texts)]
        else:
            # Original basic retrieval logic
            if query_text:
                q = embedder.encode([query_text], normalize_embeddings=True).astype('float32')
                if index is not None and _has_faiss:
                    D, I = index.search(q, 5)
                    ctx = [emb_texts[i] for i in I[0] if 0 <= i < len(emb_texts)]
                elif emb_matrix is not None:
                    # cosine similarity with normalized embeddings reduces to dot product
                    sims = emb_matrix @ q[0]
                    topk = np.argsort(-sims)[:5]
                    ctx = [emb_texts[i] for i in topk if 0 <= i < len(emb_texts)]
            else:
                # Fallback to first few chunks if no query context yet
                ctx = emb_texts[:5]
    
    if extra_ctx:
        ctx.extend([chunk for chunk in extra_ctx if chunk])

    system, user = build_prompts(mode, facts, ctx, strict=strict, context_type=context_type)
    
    # Log final prompt sizes for debugging
    logger.info(f"Prompt sizes - System: {len(system)} chars, User: {len(user)} chars, Total: {len(system) + len(user)} chars, Context: {context_type}")
    
    # Auto-enable strict for coach mode if env flag set
    if mode == "coach" and os.getenv("AUTO_STRICT_COACH", "0").lower() in ("1", "true", "yes", "on"):
        strict = True

    # Use context-specific conversation history
    # Different contexts get their own history to prevent mixing transcription and capture questions
    history_key = f"{mode}_{context_type}"
    
    # Prepare messages for AI providers with conversation history
    messages = [
        {"role": "system", "content": system}
    ]
    
    # Add conversation history for context (only recent turns from the same context type)
    global conversation_history
    if history_key not in conversation_history:
        conversation_history[history_key] = []
    
    isolate = os.getenv("ISOLATE_CURRENT_QUESTION", "1").lower() in ("1", "true", "yes", "on")
    # Default to disabling history for coach mode to avoid drift; can be enabled via env
    disable_history = (mode == "coach" and os.getenv("DISABLE_HISTORY_FOR_COACH", "1").lower() in ("1", "true", "yes", "on")) or isolate
    if conversation_history[history_key] and not disable_history:
        raw_recent = [m for m in conversation_history[history_key][-MAX_HISTORY_TURNS*2:] if m["role"] != "system"]

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
        if context_type == "transcription":
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
        logger.info("Conversation history disabled for coach mode (DISABLE_HISTORY_FOR_COACH=on)")
    
    # Add current user message
    messages.append({"role": "user", "content": user})

    try:
        # Stream response from AI providers; respect explicit llm_id overrides
        use_override = bool(llm_id)
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
        })
        
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
                collected.append(token)
                token_count += 1
                
                # Log first few tokens for debugging
                if token_count <= 5:
                    logger.info(f"🔥 Broadcasting token #{token_count}: '{token[:30]}'")
                
                # Broadcast immediately - CRITICAL for responsiveness
                broadcast_sync({"type": out_type, "text": token})
                
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
        full_text = clean_streamed_response(
            collected_tokens=collected,
            enable_formatting=True  # Apply markdown formatting
        )

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
                })
                
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
                        })
                        
                        # Retry with strict mode
                        return await stream_llm(
                            llm_id=llm_id,
                            facts=facts,
                            out_type=out_type,
                            mode=mode,
                            strict=True,
                            context_type=context_type,
                            extra_ctx=extra_ctx
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
                })
                
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
                        })
                        
                        # Retry with strict mode for better quality
                        return await stream_llm(
                            llm_id=llm_id,
                            facts=facts,
                            out_type=out_type,
                            mode=mode,
                            strict=True,  # Enable strict mode for retry
                            context_type=context_type,
                            extra_ctx=extra_ctx
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
                    broadcast_sync({"type": out_type, "text": "", "reset": True})
                    enhanced_user = user + "\n\n🚨 CRITICAL: Provide a complete, specific, helpful answer. Avoid generic responses or deflections."
                    
                    # Recursive call with enhanced prompt
                    await stream_llm(llm_id, facts, out_type, mode, strict, context_type, extra_ctx)
                    return
                else:
                    logger.warning(f"⚠️ Max retries reached, proceeding with current response")
            
            # Reset retry counter on successful response
            if hasattr(stream_llm, '_retry_count'):
                delattr(stream_llm, '_retry_count')
            
            # Enhance response with formatting improvements
            full_text = enhance_response_formatting(full_text)
        
        logger.info(f"📝 Full response collected: {len(full_text)} chars, first 100: '{full_text[:100]}'")
        
        # Save conversation history for follow-up questions
        try:
            if history_key not in conversation_history:
                conversation_history[history_key] = []
            
            # Add user message and assistant response to history
            conversation_history[history_key].append({"role": "user", "content": user})
            conversation_history[history_key].append({"role": "assistant", "content": full_text})
            
            # Trim history to max turns (keep only recent exchanges)
            if len(conversation_history[history_key]) > MAX_HISTORY_TURNS * 2:
                conversation_history[history_key] = conversation_history[history_key][-MAX_HISTORY_TURNS * 2:]
            
            logger.info(f"💾 Saved to conversation history ({len(conversation_history[history_key])} messages total, context: {context_type})")
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

        
        # ============================================================================
        # 🎯 SEND FINAL COMPLETION SIGNAL (EXACTLY ONCE)
        # ============================================================================
        # Send completion signal ONLY if not already sent
        # This ensures we never send duplicate completion signals
        if not completion_sent:
            logger.info(f"🏁 Sending completion signal for {out_type}")
            broadcast_sync({"type": out_type, "text": "", "complete": True})
            completion_sent = True
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
                    broadcast_sync({"type": out_type, "text": "", "reset": False, "continuation_pass": passes})
                    cont_gen = generate_ai_response_for(llm_id, cont_messages) if use_override else generate_ai_response(cont_messages)
                    cont_collected: List[str] = []
                    async for ctoken in cont_gen:
                        if ctoken == "[[TRUNCATED_BY_LENGTH]]":
                            truncated_by_length = True
                            continue
                        if ctoken:
                            cont_collected.append(ctoken)
                            broadcast_sync({"type": out_type, "text": ctoken})
                    addition = "".join(cont_collected).strip()
                    aggregate_text += ("\n" if addition else "") + addition
                    truncated_by_length = False
                    broadcast_sync({"type": out_type, "text": "", "complete": True, "continuation": True, "pass": passes})
            except Exception as ce:
                logger.warning(f"Auto-continue logic failed: {ce}")

        if not completion_sent:
            # Ensure non-strict flows still notify the UI that streaming completed
            logger.info(f"🏁 (non-strict) Sending completion signal for {out_type}")
            broadcast_sync({"type": out_type, "text": "", "complete": True})
        
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
            })
        else:
            logger.error(f"AI generation error: {e}")
            broadcast_sync({"type": out_type, "text": f"[AI Error: {e}]", "complete": True})

    return


async def handle_audio_streaming(ws):
    """
    Real-time streaming audio handler using Deepgram/AssemblyAI for <200ms latency.
    Streams audio directly to provider and forwards interim/final results to UI immediately.
    """
    global partial_text, current_speaker, listen_student_enabled, last_processed_student_utterance, last_student_time, streaming_engine
    
    logger.info("[Streaming] Audio WebSocket connected - initializing streaming transcription")
    
    # Initialize partial_text if it doesn't exist
    if 'partial_text' not in globals() or partial_text is None:
        partial_text = ""
    
    # Broadcast that audio websocket connected
    await broadcast({"type": "status", "data": {"audio": "socket_open", "mode": "streaming"}})
    
    # Initialize streaming transcription engine
    try:
        if streaming_engine is None:
            logger.info("[Streaming] Creating new streaming transcription engine")
            from streaming_transcription import StreamingTranscriptionEngine
            streaming_engine = StreamingTranscriptionEngine()
        
        # Connect to streaming provider (Deepgram/AssemblyAI)
        logger.info("[Streaming] Connecting to transcription provider...")
        connected = await streaming_engine.connect()
        
        if not connected:
            logger.error("[Streaming] Failed to connect to streaming transcription provider")
            await broadcast({"type": "error", "message": "Streaming transcription unavailable - check DEEPGRAM_API_KEY"})
            return
        
        logger.info(f"[Streaming] Connected to {streaming_engine.provider_name} - ready for audio")
        await broadcast({"type": "status", "data": {"audio": "streaming_ready", "provider": streaming_engine.provider_name}})
        
    except Exception as e:
        logger.error(f"[Streaming] Engine initialization failed: {e}")
        await broadcast({"type": "error", "message": f"Streaming initialization error: {e}"})
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
            "interim": True,  # Mark as interim
            "speaker": current_speaker,
            "recording_mode": recording_mode,
            "confidence": result.confidence
        }))
    
    # Callback for final results (confirmed transcriptions)
    def on_final_result(result: TranscriptResult):
        nonlocal last_final_text, interim_buffer, results_received
        global partial_text, last_processed_student_utterance, last_student_time
        
        results_received += 1
        text = result.text.strip()
        
        if not text:
            return
        
        # Append to rolling partial_text without injecting speaker tags
        # Keep the aggregated transcript clean; UI gets speaker via message fields
        if partial_text and not partial_text.endswith((" ", "\n")):
            partial_text += " "
        partial_text += text
        
        # Trim if too long (keep last 8000 chars)
        if len(partial_text) > 12000:
            partial_text = partial_text[-8000:]
        
        last_final_text = text
        interim_buffer = ""  # Clear interim buffer
        
        recording_mode = globals().get('current_recording_mode', 'interviewer')
        
        logger.info(f"[Streaming] Final ({results_received}): '{text[:80]}' (conf: {result.confidence:.2f})")
        
        # Broadcast final result
        asyncio.create_task(broadcast({
            "type": "transcript",
            "text": text,
            "full": partial_text,
            "interim": False,  # Mark as final
            "speaker": current_speaker,
            "recording_mode": recording_mode,
            "confidence": result.confidence,
            "results_count": results_received
        }))
        
        # Auto-coach is DISABLED - user must click "Ask AI" button manually
        # No automatic AI triggering on transcription
    
    # Create background task to receive transcription results
    async def receive_results_loop():
        """Background task to receive and process transcription results"""
        try:
            async for result in streaming_engine.stream_results(
                on_interim=on_interim_result,
                on_final=on_final_result
            ):
                # Results are handled by callbacks above
                pass
        except Exception as e:
            logger.error(f"[Streaming] Results loop error: {e}")
            await broadcast({"type": "error", "message": "Transcription stream interrupted"})
    
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
                    await streaming_engine.send_audio(data)
                    # On first audio, announce receiving status to UI
                    if not announced_receiving:
                        announced_receiving = True
                        asyncio.create_task(broadcast({"type": "status", "data": {"audio": "receiving"}}))
                    
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
                    await broadcast({"type": "status", "data": {"audio": "reconnecting"}})
                    
                    # Try to reconnect
                    reconnected = await streaming_engine.connect()
                    if reconnected:
                        logger.info("[Streaming] Reconnected successfully")
                        await broadcast({"type": "status", "data": {"audio": "streaming_ready"}})
                    else:
                        logger.error("[Streaming] Reconnection failed")
                        await broadcast({"type": "error", "message": "Transcription connection lost"})
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
        if streaming_engine:
            try:
                await streaming_engine.close()
            except Exception as e:
                logger.warning(f"[Streaming] Error closing engine: {e}")


async def handle_audio(ws):
    global partial_text, current_speaker, listen_student_enabled, last_processed_student_utterance, last_student_time
    
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
                    "text": new_portion,     # incremental diff portion
                    "full": partial_text,    # full rolling history
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
            # Inform UI (optional)
            await broadcast({"type": "status", "data": {"coach_suppressed": True, "reason": "duplicate_question"}})
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
            await stream_llm(DEFAULT_LLM, q, out_type="coach", mode="coach", strict=True, context_type="transcription")
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
    elif path == "/audio":
        # Deepgram streaming only
        if _has_streaming:
            logger.info("[Router] Using streaming transcription handler (Deepgram-only)")
            await handle_audio_streaming(websocket)
        else:
            logger.error("[Router] Streaming module missing. Please ensure streaming_transcription.py is present.")
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
            if ALLOWED_ORIGINS is None:
                logger.info("Setting allowed WebSocket origins: all origins (*)")
            else:
                logger.info("Setting allowed WebSocket origins: %s", ALLOWED_ORIGINS)
                kwargs['origins'] = ALLOWED_ORIGINS

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

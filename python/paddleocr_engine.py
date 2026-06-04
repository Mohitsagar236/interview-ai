# -*- coding: utf-8 -*-
"""
PaddleOCR v3 Integration — Best-in-class OCR for screen captures.

Rewritten for PaddleOCR 3.x API (predict-based).
This is the ONLY OCR engine used by the application.
"""

import io
import logging
from typing import Optional, List, Dict

logger = logging.getLogger(__name__)

# Lazy-loaded heavy imports
Image = None
np = None

_has_paddleocr: Optional[bool] = None


def check_paddleocr_available() -> bool:
    """Check if PaddleOCR is importable."""
    global _has_paddleocr
    if _has_paddleocr is not None:
        return _has_paddleocr
    try:
        import paddleocr  # noqa: F401
        _has_paddleocr = True
        logger.info("✅ PaddleOCR is available (v%s)", getattr(paddleocr, "__version__", "?"))
    except ImportError:
        _has_paddleocr = False
        logger.warning("⚠️ PaddleOCR not available. Install with: pip install paddleocr")
    return _has_paddleocr


class PaddleOCREngine:
    """PaddleOCR 3.x wrapper optimised for screen-capture OCR."""

    def __init__(self):
        from paddleocr import PaddleOCR  # will raise ImportError if missing

        # Screen captures are always upright → disable doc orientation/unwarping
        # Lower detection thresholds so faint / small text is still found
        try:
            self.ocr = PaddleOCR(
                lang="en",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                text_det_thresh=0.25,
                text_det_box_thresh=0.4,
                text_rec_score_thresh=0.2,
            )
            logger.info("PaddleOCR 3.x engine initialised (optimised for screenshots)")
        except TypeError:
            # Fallback if some kwargs are removed in a future version
            self.ocr = PaddleOCR(lang="en")
            logger.info("PaddleOCR 3.x engine initialised (default params)")

    # ------------------------------------------------------------------ #
    #  Public helpers
    # ------------------------------------------------------------------ #

    def extract_text(self, image_bytes: bytes) -> str:
        """Return plain text extracted from *image_bytes* (PNG / JPEG)."""
        global Image, np
        if Image is None:
            from PIL import Image as _Image
            import numpy as _np
            Image = _Image
            np = _np

        try:
            img = Image.open(io.BytesIO(image_bytes))
            if img.mode != "RGB":
                if img.mode in ("RGBA", "LA", "P"):
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    mask = img.split()[-1] if img.mode in ("RGBA", "LA") else None
                    bg.paste(img, mask=mask)
                    img = bg
                else:
                    img = img.convert("RGB")

            # Upscale small images for better detection
            w, h = img.size
            min_side = 1600
            if max(w, h) < min_side:
                scale = min_side / max(w, h)
                img = img.resize(
                    (int(w * scale), int(h * scale)),
                    Image.LANCZOS,
                )
                logger.debug("Upscaled %dx%d → %dx%d (%.1fx)", w, h, *img.size, scale)

            img_array = np.array(img)
            texts, scores = self._run_predict(img_array)

            if not texts:
                logger.warning("PaddleOCR detected no text in image (%dx%d)", w, h)
                return ""

            combined = "\n".join(texts)
            avg_score = sum(scores) / len(scores) if scores else 0
            logger.info(
                "PaddleOCR extracted %d chars / %d lines (avg confidence %.2f)",
                len(combined), len(texts), avg_score,
            )
            return combined

        except Exception as exc:
            logger.error("PaddleOCR extraction failed: %s", exc)
            return ""

    def extract_text_with_layout(self, image_bytes: bytes) -> Dict:
        """Return structured output: text + per-line bbox / confidence."""
        global Image, np
        if Image is None:
            from PIL import Image as _Image
            import numpy as _np
            Image = _Image
            np = _np

        try:
            img = Image.open(io.BytesIO(image_bytes))
            if img.mode != "RGB":
                img = img.convert("RGB")

            img_array = np.array(img)
            texts, scores, polys = self._run_predict(img_array, return_polys=True)

            lines = []
            for txt, sc, poly in zip(texts, scores, polys):
                lines.append({"text": txt, "confidence": sc, "bbox": poly})

            return {
                "text": "\n".join(texts),
                "lines": lines,
                "metadata": {
                    "total_lines": len(lines),
                    "avg_confidence": sum(scores) / len(scores) if scores else 0,
                    "image_size": img.size,
                },
            }
        except Exception as exc:
            logger.error("PaddleOCR layout extraction failed: %s", exc)
            return {"text": "", "lines": [], "metadata": {}}

    # ------------------------------------------------------------------ #
    #  Internal
    # ------------------------------------------------------------------ #

    def _run_predict(self, img_array, return_polys=False):
        """Run PaddleOCR predict and return (texts, scores[, polys])."""
        texts: List[str] = []
        scores: List[float] = []
        polys: List = []

        for result in self.ocr.predict(img_array):
            res = result.json
            if isinstance(res, dict) and "res" in res:
                res = res["res"]

            rec_texts = res.get("rec_texts", [])
            rec_scores = res.get("rec_scores", [])
            rec_polys = res.get("rec_polys", res.get("dt_polys", []))

            for i, (txt, sc) in enumerate(zip(rec_texts, rec_scores)):
                texts.append(txt)
                scores.append(sc)
                if return_polys:
                    poly = rec_polys[i] if i < len(rec_polys) else []
                    if hasattr(poly, "tolist"):
                        poly = poly.tolist()
                    polys.append(poly)

        if return_polys:
            return texts, scores, polys
        return texts, scores


# ------------------------------------------------------------------ #
#  Module-level singleton helpers
# ------------------------------------------------------------------ #

_engine: Optional[PaddleOCREngine] = None


def get_paddle_ocr_engine() -> Optional[PaddleOCREngine]:
    """Return (or create) the singleton PaddleOCR engine."""
    global _engine
    if not check_paddleocr_available():
        return None
    if _engine is None:
        try:
            _engine = PaddleOCREngine()
        except Exception as exc:
            logger.error("Failed to create PaddleOCR engine: %s", exc)
            return None
    return _engine


def process_ocr_paddleocr(image_bytes: bytes) -> str:
    """Convenience: extract text via the singleton engine."""
    engine = get_paddle_ocr_engine()
    if engine is None:
        return ""
    return engine.extract_text(image_bytes)

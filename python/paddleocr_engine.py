"""
PaddleOCR Integration - Superior OCR for production use
Much better accuracy than Tesseract, especially for screenshots and code
"""
import os
import io
import logging
from typing import Optional, List, Tuple
from PIL import Image
import numpy as np

logger = logging.getLogger(__name__)

# Global variable for lazy loading
_paddle_ocr_instance = None
_has_paddleocr = None


def check_paddleocr_available():
    """Check if PaddleOCR is available without importing it"""
    global _has_paddleocr
    if _has_paddleocr is not None:
        return _has_paddleocr
    
    try:
        import paddleocr
        _has_paddleocr = True
        logger.info("✅ PaddleOCR is available")
    except ImportError:
        _has_paddleocr = False
        logger.warning("PaddleOCR not available. Install with: pip install paddleocr")
    
    return _has_paddleocr


class PaddleOCREngine:
    """PaddleOCR wrapper for superior text detection"""
    
    def __init__(self):
        # Lazy import PaddleOCR only when needed
        try:
            from paddleocr import PaddleOCR
        except ImportError:
            raise ImportError("PaddleOCR not installed. Run: pip install paddleocr")
        
        # Initialize PaddleOCR with minimal, compatible settings
        # use_angle_cls=True enables text rotation detection
        # lang='en' for English (supports 80+ languages)
        try:
            self.ocr = PaddleOCR(
                use_angle_cls=True,
                lang='en'
            )
            logger.info("PaddleOCR initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize PaddleOCR: {e}")
            raise
    
    def extract_text(self, image_bytes: bytes) -> str:
        """
        Extract text from image bytes using PaddleOCR
        
        Args:
            image_bytes: Raw image bytes (PNG, JPEG, etc.)
            
        Returns:
            Extracted text as string
        """
        try:
            # Load image
            img = Image.open(io.BytesIO(image_bytes))
            
            # Convert to RGB if needed
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Convert to numpy array for PaddleOCR
            img_array = np.array(img)
            
            # Run OCR (without cls parameter - not supported in newer versions)
            result = self.ocr.ocr(img_array)
            
            # Debug: log the raw result structure
            logger.info(f"PaddleOCR raw result type: {type(result)}, length: {len(result) if result else 0}")
            if result and len(result) > 0:
                logger.info(f"First element type: {type(result[0])}, content: {result[0]}")
            
            # Extract text from results
            if not result or not result[0]:
                logger.warning("PaddleOCR detected no text")
                return ""
            
            # Combine all detected text
            # result[0] is list of [bbox, (text, confidence)]
            texts = []
            for line in result[0]:
                if line and len(line) >= 2:
                    text_info = line[1]
                    if isinstance(text_info, (tuple, list)) and len(text_info) >= 1:
                        text = text_info[0]
                        confidence = text_info[1] if len(text_info) > 1 else 0
                        
                        # Only include text with reasonable confidence (>0.5)
                        if confidence > 0.5:
                            texts.append(text)
            
            combined_text = '\n'.join(texts)
            logger.info(f"PaddleOCR extracted {len(combined_text)} characters from {len(texts)} lines")
            
            return combined_text
            
        except Exception as e:
            logger.error(f"PaddleOCR extraction failed: {e}")
            return ""
    
    def extract_text_with_layout(self, image_bytes: bytes) -> dict:
        """
        Extract text with layout information (bounding boxes, confidence)
        
        Returns:
            dict with 'text', 'lines' (with bbox and confidence), 'metadata'
        """
        try:
            img = Image.open(io.BytesIO(image_bytes))
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            img_array = np.array(img)
            result = self.ocr.ocr(img_array, cls=True)
            
            if not result or not result[0]:
                return {'text': '', 'lines': [], 'metadata': {}}
            
            lines = []
            all_text = []
            
            for line in result[0]:
                if line and len(line) >= 2:
                    bbox = line[0]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                    text_info = line[1]
                    
                    if isinstance(text_info, (tuple, list)) and len(text_info) >= 1:
                        text = text_info[0]
                        confidence = text_info[1] if len(text_info) > 1 else 0
                        
                        if confidence > 0.5:
                            all_text.append(text)
                            lines.append({
                                'text': text,
                                'confidence': confidence,
                                'bbox': bbox,
                            })
            
            return {
                'text': '\n'.join(all_text),
                'lines': lines,
                'metadata': {
                    'total_lines': len(lines),
                    'avg_confidence': sum(l['confidence'] for l in lines) / len(lines) if lines else 0,
                    'image_size': img.size,
                }
            }
            
        except Exception as e:
            logger.error(f"PaddleOCR layout extraction failed: {e}")
            return {'text': '', 'lines': [], 'metadata': {}}


# Global instance
_paddle_ocr_engine = None


def get_paddle_ocr_engine() -> Optional[PaddleOCREngine]:
    """Get or create PaddleOCR engine instance (lazy loading)"""
    global _paddle_ocr_engine
    
    # Check if PaddleOCR is available first
    if not check_paddleocr_available():
        return None
    
    if _paddle_ocr_engine is None:
        try:
            _paddle_ocr_engine = PaddleOCREngine()
        except Exception as e:
            logger.error(f"Failed to initialize PaddleOCR: {e}")
            return None
    
    return _paddle_ocr_engine


def process_ocr_paddleocr(image_bytes: bytes) -> str:
    """
    Process image with PaddleOCR
    
    Args:
        image_bytes: Raw image bytes
        
    Returns:
        Extracted text
    """
    engine = get_paddle_ocr_engine()
    if not engine:
        raise ImportError("PaddleOCR not available")
    
    return engine.extract_text(image_bytes)

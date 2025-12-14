"""
EasyOCR Integration - Excellent for screenshots and varied text
Often more accurate than PaddleOCR for screen captures
"""
import os
import io
import logging
from typing import Optional, List, Tuple

# Lazy loaded
Image = None
np = None

logger = logging.getLogger(__name__)

# Global variable for lazy loading
_easyocr_reader = None
_has_easyocr = None


def check_easyocr_available():
    """Check if EasyOCR is available without importing it"""
    global _has_easyocr
    if _has_easyocr is not None:
        return _has_easyocr
    
    try:
        import easyocr
        _has_easyocr = True
        logger.info("✅ EasyOCR is available")
    except ImportError:
        _has_easyocr = False
        logger.warning("EasyOCR not available. Install with: pip install easyocr")
    
    return _has_easyocr


class EasyOCREngine:
    """EasyOCR wrapper for superior screenshot text detection"""
    
    def __init__(self):
        # Lazy import EasyOCR only when needed
        try:
            import easyocr
        except ImportError:
            raise ImportError("EasyOCR not installed. Run: pip install easyocr")
        
        # Initialize EasyOCR
        # gpu=False for CPU mode (set to True if GPU available)
        # languages: ['en'] for English
        try:
            gpu_enabled = os.getenv("OCR_GPU", "false").lower() in ("1", "true", "yes", "on")
            self.reader = easyocr.Reader(
                ['en'],
                gpu=gpu_enabled,
                verbose=False
            )
            logger.info(f"EasyOCR initialized successfully (GPU: {gpu_enabled})")
        except Exception as e:
            logger.error(f"Failed to initialize EasyOCR: {e}")
            raise
    
    def extract_text(self, image_bytes: bytes) -> str:
        """
        Extract text from image bytes using EasyOCR
        
        Args:
            image_bytes: Raw image bytes (PNG, JPEG, etc.)
            
        Returns:
            Extracted text as string
        """
        global Image, np
        if Image is None:
            from PIL import Image
            import numpy as np

        try:
            # Load image
            img = Image.open(io.BytesIO(image_bytes))
            
            # Convert to RGB if needed
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Convert to numpy array for EasyOCR
            img_array = np.array(img)
            
            # Run OCR with detailed output
            # Returns list of ([bbox], text, confidence)
            result = self.reader.readtext(img_array, detail=1, paragraph=False)
            
            logger.info(f"EasyOCR detected {len(result)} text regions")
            
            # Extract text from results
            if not result:
                logger.warning("EasyOCR detected no text")
                return ""
            
            # Combine all detected text with confidence filtering
            # Lower threshold for better extraction (0.2 = 20%)
            min_confidence = float(os.getenv("EASYOCR_MIN_CONFIDENCE", "0.2"))
            
            texts = []
            for detection in result:
                bbox, text, confidence = detection
                
                # Only include text with reasonable confidence
                if confidence > min_confidence:
                    texts.append(text)
                    logger.debug(f"EasyOCR line: '{text}' (confidence: {confidence:.2f})")
                else:
                    logger.debug(f"EasyOCR skipped low confidence: '{text}' ({confidence:.2f})")
            
            # Intelligently combine text with proper spacing
            combined_text = self._combine_text_intelligently(result, min_confidence)
            
            logger.info(f"EasyOCR extracted {len(combined_text)} characters from {len(texts)} lines")
            
            return combined_text
            
        except Exception as e:
            logger.error(f"EasyOCR extraction failed: {e}")
            return ""
    
    def _combine_text_intelligently(self, result: List, min_confidence: float) -> str:
        """
        Intelligently combine text with proper spacing and line breaks
        based on position analysis
        """
        if not result:
            return ""
        
        # Extract texts with positions
        items = []
        for detection in result:
            bbox, text, confidence = detection
            
            if confidence <= min_confidence:
                continue
            
            # Calculate center position
            xs = [p[0] for p in bbox]
            ys = [p[1] for p in bbox]
            center_y = sum(ys) / len(ys)
            center_x = sum(xs) / len(xs)
            height = max(ys) - min(ys)
            
            items.append({
                'text': text,
                'y': center_y,
                'x': center_x,
                'height': height
            })
        
        if not items:
            return ""
        
        # Sort by Y position (top to bottom)
        items.sort(key=lambda x: x['y'])
        
        # Group into lines based on Y proximity
        lines = []
        current_line = []
        last_y = None
        
        for item in items:
            if last_y is None or abs(item['y'] - last_y) < item['height'] * 0.5:
                # Same line (within 50% of text height)
                current_line.append(item)
            else:
                # New line
                if current_line:
                    # Sort current line by X position (left to right)
                    current_line.sort(key=lambda x: x['x'])
                    lines.append(current_line)
                current_line = [item]
            last_y = item['y']
        
        # Don't forget the last line
        if current_line:
            current_line.sort(key=lambda x: x['x'])
            lines.append(current_line)
        
        # Combine lines with appropriate spacing
        result_lines = []
        for line_items in lines:
            line_text = ' '.join(item['text'] for item in line_items)
            result_lines.append(line_text)
        
        return '\n'.join(result_lines)
    
    def extract_text_with_layout(self, image_bytes: bytes) -> dict:
        """
        Extract text with layout information (bounding boxes, confidence)
        
        Returns:
            dict with 'text', 'lines' (with bbox and confidence), 'metadata'
        """
        global Image, np
        if Image is None:
            from PIL import Image
            import numpy as np
        
        try:
            img = Image.open(io.BytesIO(image_bytes))
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            img_array = np.array(img)
            result = self.reader.readtext(img_array, detail=1, paragraph=False)
            
            if not result:
                return {'text': '', 'lines': [], 'metadata': {}}
            
            min_confidence = float(os.getenv("EASYOCR_MIN_CONFIDENCE", "0.2"))
            
            lines = []
            all_text = []
            
            for detection in result:
                bbox, text, confidence = detection
                
                if confidence > min_confidence:
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
            logger.error(f"EasyOCR layout extraction failed: {e}")
            return {'text': '', 'lines': [], 'metadata': {}}


# Global instance
_easyocr_engine = None


def get_easyocr_engine() -> Optional[EasyOCREngine]:
    """Get or create EasyOCR engine instance (lazy loading)"""
    global _easyocr_engine
    
    # Check if EasyOCR is available first
    if not check_easyocr_available():
        return None
    
    if _easyocr_engine is None:
        try:
            _easyocr_engine = EasyOCREngine()
        except Exception as e:
            logger.error(f"Failed to initialize EasyOCR: {e}")
            return None
    
    return _easyocr_engine


def process_ocr_easyocr(image_bytes: bytes) -> str:
    """
    Process image with EasyOCR
    
    Args:
        image_bytes: Raw image bytes
        
    Returns:
        Extracted text
    """
    engine = get_easyocr_engine()
    if not engine:
        raise ImportError("EasyOCR not available")
    
    return engine.extract_text(image_bytes)

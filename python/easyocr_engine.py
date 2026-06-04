# -*- coding: utf-8 -*-
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
            from PIL import Image, ImageEnhance, ImageOps
            import numpy as np

        try:
            # Load image
            img = Image.open(io.BytesIO(image_bytes))
            
            # Convert to RGB if needed
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # IMPROVED: Preprocess image for better OCR
            img = self._preprocess_image(img)
            
            # Convert to numpy array for EasyOCR
            img_array = np.array(img)
            
            # Run OCR with optimized settings
            # detail=1: return bbox, text, and confidence
            # paragraph=False: line by line for better control
            # text_threshold=0.5: lower text detection threshold
            # low_text=0.3: detect low-confidence text regions
            result = self.reader.readtext(
                img_array, 
                detail=1, 
                paragraph=False,
                text_threshold=0.5,
                low_text=0.3,
                link_threshold=0.3
            )
            
            logger.info(f"EasyOCR detected {len(result)} text regions")
            
            # Extract text from results
            if not result:
                logger.warning("EasyOCR detected no text")
                return ""
            
            # Combine all detected text with confidence filtering
            # Very low threshold for maximum extraction (0.1 = 10%)
            min_confidence = float(os.getenv("EASYOCR_MIN_CONFIDENCE", "0.1"))
            
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
            
            # Post-process text for better quality
            combined_text = self._post_process_text(combined_text)
            
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
    
    def _preprocess_image(self, img):
        """Enhanced image preprocessing for better OCR accuracy"""
        from PIL import ImageEnhance, ImageOps, ImageFilter
        import numpy as np
        
        # Get image dimensions
        width, height = img.size
        
        # 1. Upscale small images (improves OCR on low-res screenshots)
        min_size = int(os.getenv("OCR_MIN_SIZE", "1800"))
        if width < min_size or height < min_size:
            scale = min_size / min(width, height)
            new_width = int(width * scale)
            new_height = int(height * scale)
            img = img.resize((new_width, new_height), Image.LANCZOS)
            logger.debug(f"Upscaled image: {width}x{height} -> {new_width}x{new_height}")
        
        # 2. Enhance contrast (makes text more readable)
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.5)  # Boost contrast by 50%
        
        # 3. Enhance sharpness (makes edges clearer)
        enhancer = ImageEnhance.Sharpness(img)
        img = enhancer.enhance(2.0)  # Double sharpness
        
        # 4. Slight denoising (remove artifacts)
        img = img.filter(ImageFilter.MedianFilter(size=3))
        
        return img
    
    def _post_process_text(self, text: str) -> str:
        """Clean up and improve OCR output"""
        if not text:
            return text
        
        import re
        
        # Remove extra whitespace
        lines = text.splitlines()
        cleaned_lines = []
        
        for line in lines:
            line = line.strip()
            # Replace multiple spaces with single space
            line = re.sub(r' {2,}', ' ', line)
            if line:
                cleaned_lines.append(line)
        
        result = '\n'.join(cleaned_lines)
        
        # Fix common OCR errors
        # Fix spacing around punctuation
        result = re.sub(r'\s+([.,;:!?])', r'\1', result)  # Remove space before punctuation
        result = re.sub(r'([.,;:!?])([A-Za-z])', r'\1 \2', result)  # Add space after punctuation
        
        # Fix common character substitutions
        result = re.sub(r'(\d)O(\d)', r'\g<1>0\g<2>', result)  # O -> 0 in numbers
        result = re.sub(r'(\d)l(\d)', r'\g<1>1\g<2>', result)  # l -> 1 in numbers
        
        return result.strip()
    
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

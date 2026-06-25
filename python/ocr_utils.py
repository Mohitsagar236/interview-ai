# -*- coding: utf-8 -*-
"""
Enhanced OCR Utilities with better preprocessing and error handling
"""
import os
import io
import time
import logging
from typing import Optional, Dict, List, Tuple, Any

# Lazy loaded imports
Image = None
ImageOps = None
ImageEnhance = None
ImageFilter = None
ImageStat = None
np = None
pytesseract = None

logger = logging.getLogger(__name__)


class OCRConfig:
    """OCR Configuration with sensible defaults"""
    def __init__(self):
        self.fast_mode = os.getenv("OCR_FAST_MODE", "0").lower() not in ("0", "false", "no", "off")  # Default to thorough
        self.quick_config = os.getenv("OCR_QUICK_CONFIG", "--oem 3 --psm 6")
        self.quick_min_chars = self._safe_int(os.getenv("OCR_QUICK_MIN_CHARS", "80"), 80)  # Higher threshold
        self.quick_conf_threshold = self._safe_float(os.getenv("OCR_QUICK_CONF_THRESHOLD", "75"), 75.0)  # Higher confidence needed
        self.variant_budget_seconds = self._safe_float(os.getenv("OCR_VARIANT_BUDGET_SECONDS", "4.0"), 4.0)  # More time for accuracy
        self.min_upscale_size = self._safe_int(os.getenv("OCR_MIN_UPSCALE_SIZE", "1600"), 1600)  # Larger upscale threshold (was 1400)
        self.dpi = self._safe_int(os.getenv("OCR_DPI", "300"), 300)  # DPI for better quality
        self.tesseract_cmd = self._find_tesseract()
        # NEW: Output format control
        self.clean_text_only = os.getenv("OCR_CLEAN_TEXT_ONLY", "false").lower() in ("1", "true", "yes", "on")  # Return only clean text without metadata
        # NEW: Enhanced preprocessing
        self.use_advanced_preprocessing = os.getenv("OCR_ADVANCED_PREPROCESSING", "true").lower() in ("1", "true", "yes", "on")
        # NEW: Language support (default to English, can add more like 'eng+fra+deu')
        self.tesseract_lang = os.getenv("OCR_LANG", "eng")
        # NEW: Character whitelist for specific use cases (empty = no restriction)
        self.char_whitelist = os.getenv("OCR_CHAR_WHITELIST", "")
        # NEW: PaddleOCR support (default to enabled)
        self.use_paddle = os.getenv("USE_PADDLEOCR", "1").lower() not in ("0", "false", "no", "off")
        
    @staticmethod
    def _safe_int(value, default):
        try:
            return int(value)
        except (ValueError, TypeError):
            return default
    
    @staticmethod
    def _safe_float(value, default):
        try:
            return float(value)
        except (ValueError, TypeError):
            return default
    
    def _find_tesseract(self) -> Optional[str]:
        """Find Tesseract executable."""
        env_path = os.getenv("TESSERACT_CMD")
        if env_path:
            if os.path.exists(env_path):
                return env_path
            logger.warning(f"TESSERACT_CMD set but file not found: {env_path}")

        candidates = []
        if os.name == "nt":
            candidates.extend([
                r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
                os.path.join(os.environ.get("USERPROFILE", ""), r"AppData\Local\Tesseract-OCR\tesseract.exe"),
                os.path.join(os.environ.get("USERPROFILE", ""), r"AppData\Local\Programs\Tesseract-OCR\tesseract.exe"),
                r"C:\Tesseract-OCR\tesseract.exe",
                r"D:\Tesseract-OCR\tesseract.exe",
            ])

            module_dir = os.path.dirname(os.path.abspath(__file__))
            repo_root = os.path.dirname(module_dir)
            cwd = os.getcwd()
            local_roots = [repo_root, cwd, os.path.dirname(cwd)]
            for root in local_roots:
                if not root:
                    continue
                candidates.append(os.path.join(root, "external-deps", "tesseract", "tesseract.exe"))
                candidates.append(os.path.join(root, "tesseract", "tesseract.exe"))

        seen = set()
        for candidate in candidates:
            if not candidate:
                continue
            candidate = os.path.normpath(candidate)
            if candidate in seen:
                continue
            seen.add(candidate)
            if os.path.exists(candidate):
                tessdata = os.path.join(os.path.dirname(candidate), "tessdata")
                if os.path.isdir(tessdata):
                    os.environ.setdefault("TESSDATA_PREFIX", tessdata)
                logger.info(f"Found Tesseract at: {candidate}")
                return candidate

        # On Unix-like systems, assume it is in PATH.
        return None


class ImagePreprocessor:
    """Image preprocessing for better OCR results"""
    
    @staticmethod
    def prepare_image(image_bytes: bytes, config: OCRConfig) -> Tuple[Any, Dict]:
        """Load and prepare image for OCR"""
        global Image, ImageOps, ImageEnhance, ImageFilter, ImageStat, np
        if Image is None:
            from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ImageStat
            import numpy as np

        img_raw = Image.open(io.BytesIO(image_bytes))
        original_size = img_raw.size
        original_mode = img_raw.mode
        
        # Convert to RGB safely
        if img_raw.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img_raw.size, (255, 255, 255))
            if img_raw.mode == 'P':
                img_raw = img_raw.convert('RGBA')
            mask = img_raw.split()[-1] if img_raw.mode in ('RGBA', 'LA') else None
            background.paste(img_raw, mask=mask)
            img_raw = background
        else:
            img_raw = img_raw.convert('RGB')
        
        # Convert to grayscale for OCR
        img_gray = img_raw.convert('L')
        
        # Calculate brightness for dark mode detection
        try:
            brightness = ImageStat.Stat(img_gray).mean[0]
        except Exception:
            brightness = 128
        
        # More aggressive upscaling for better accuracy
        w, h = img_gray.size
        scale_factor = 1.0
        target_size = config.min_upscale_size
        
        if max(w, h) < target_size:
            # Calculate scale to reach target size
            scale_factor = target_size / max(w, h)
            # Round to common scales for consistency
            if scale_factor < 1.5:
                scale_factor = 1.5
            elif scale_factor < 2.0:
                scale_factor = 2.0
            elif scale_factor < 2.5:
                scale_factor = 2.5
            elif scale_factor < 3.0:
                scale_factor = 3.0
            else:
                scale_factor = min(scale_factor, 4.5)  # Cap at 4.5x (increased from 4x)
            
            new_size = (int(w * scale_factor), int(h * scale_factor))
            # Use LANCZOS for best quality upscaling
            img_gray = img_gray.resize(new_size, Image.LANCZOS)
            logger.info(f"OCR upscaled {original_size} -> {new_size} (scale={scale_factor:.1f}x)")
        else:
            # Even if image is large enough, slightly upscale for better accuracy
            if max(w, h) < target_size * 1.2:
                scale_factor = 1.15
                new_size = (int(w * scale_factor), int(h * scale_factor))
                img_gray = img_gray.resize(new_size, Image.LANCZOS)
                logger.info(f"OCR slight upscale {original_size} -> {new_size} for accuracy")
            else:
                logger.debug(f"OCR image size OK: {original_size}")
        
        meta = {
            'original_size': original_size,
            'original_mode': original_mode,
            'processed_size': img_gray.size,
            'scale_factor': scale_factor,
            'brightness': brightness,
        }
        
        return img_gray, meta
    
    @staticmethod
    def create_variants(img_gray: Any, brightness: float) -> List[Tuple[str, Any]]:
        """Create preprocessed image variants for OCR"""
        global Image, ImageOps, ImageEnhance, ImageFilter, ImageStat, np
        if Image is None:
            from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ImageStat
            import numpy as np

        variants = []
        
        # 1. Original grayscale
        variants.append(('gray', img_gray.copy()))
        
        # 2. Histogram equalization for better contrast
        try:
            img_array = np.array(img_gray)
            hist, _ = np.histogram(img_array.flatten(), 256, [0, 256])
            cdf = hist.cumsum()
            cdf_masked = np.ma.masked_equal(cdf, 0)
            cdf_scaled = (cdf_masked - cdf_masked.min()) * 255 / (cdf_masked.max() - cdf_masked.min())
            cdf_final = np.ma.filled(cdf_scaled, 0).astype('uint8')
            equalized = Image.fromarray(cdf_final[img_array])
            variants.append(('equalized', equalized))
        except Exception as e:
            logger.debug(f"Histogram equalization failed: {e}")
            equalized = img_gray
        
        # 3. Median filter for noise reduction (stronger)
        try:
            denoised = equalized.filter(ImageFilter.MedianFilter(size=3))
            # Second pass for heavy noise
            denoised2 = denoised.filter(ImageFilter.MedianFilter(size=3))
            variants.append(('denoised', denoised2))
        except Exception:
            denoised = equalized
        
        # 4. Autocontrast (essential for OCR)
        auto_contrast = ImageOps.autocontrast(denoised)
        variants.append(('autocontrast', auto_contrast))
        
        # 5. Enhanced contrast boost (stronger)
        try:
            contrast_boost = ImageEnhance.Contrast(auto_contrast).enhance(2.5)
            variants.append(('contrast_boost', contrast_boost))
        except Exception:
            contrast_boost = auto_contrast
        
        # 6. Sharpening (more aggressive)
        try:
            sharpened = ImageEnhance.Sharpness(contrast_boost).enhance(2.0)
            variants.append(('sharpened', sharpened))
            # Extra sharp for very blurry images
            extra_sharp = sharpened.filter(ImageFilter.SHARPEN)
            variants.append(('extra_sharp', extra_sharp))
        except Exception:
            sharpened = contrast_boost
        
        # 7. Adaptive threshold with multiple methods
        threshold = ImagePreprocessor._calculate_otsu_threshold(denoised)
        
        # Standard binary
        binary = denoised.point(lambda p: 255 if p > threshold else 0)
        variants.append(('binary', binary))
        
        # Soft threshold (lower)
        binary_soft = denoised.point(lambda p: 255 if p > max(0, threshold - 15) else 0)
        variants.append(('binary_soft', binary_soft))
        
        # Hard threshold (higher)
        binary_hard = denoised.point(lambda p: 255 if p > min(255, threshold + 15) else 0)
        variants.append(('binary_hard', binary_hard))
        
        # 8. Morphological cleanup (essential for text)
        try:
            # Remove small noise
            binary_clean = binary.filter(ImageFilter.MinFilter(3))
            # Fill small gaps
            binary_clean = binary_clean.filter(ImageFilter.MaxFilter(3))
            # Sharpen edges
            binary_clean = binary_clean.filter(ImageFilter.SHARPEN)
            variants.append(('binary_clean', binary_clean))
        except Exception:
            variants.append(('binary_fallback', binary))
        
        # 9. Inverted variants (critical for dark backgrounds)
        inverted = ImageOps.invert(binary)
        inverted_soft = ImageOps.invert(binary_soft)
        inverted_clean = ImageOps.invert(binary_clean) if 'binary_clean' in [v[0] for v in variants] else inverted
        
        variants.append(('inverted', inverted))
        variants.append(('inverted_soft', inverted_soft))
        variants.append(('inverted_clean', inverted_clean))
        
        # 10. Extra inverted variants for dark UIs (more aggressive)
        if brightness < 120:
            logger.debug(f"Dark background detected (brightness={brightness:.1f}), adding extra inverted variants")
            try:
                # Invert from different preprocessing stages
                variants.append(('contrast_inverted', ImageOps.invert(contrast_boost)))
                variants.append(('sharp_inverted', ImageOps.invert(sharpened)))
                variants.append(('auto_inverted', ImageOps.invert(auto_contrast)))
                # Very aggressive for dark mode
                dark_enhanced = ImageEnhance.Brightness(img_gray).enhance(1.5)
                dark_enhanced = ImageEnhance.Contrast(dark_enhanced).enhance(2.0)
                variants.append(('dark_enhanced', dark_enhanced))
            except Exception as e:
                logger.debug(f"Dark mode variants failed: {e}")
        
        # 11. Brightness-adjusted variants for light images
        if brightness > 200:
            logger.debug(f"Very bright image detected (brightness={brightness:.1f}), adjusting")
            try:
                dimmed = ImageEnhance.Brightness(img_gray).enhance(0.8)
                variants.append(('dimmed', dimmed))
            except Exception:
                pass
        
        logger.debug(f"Created {len(variants)} OCR preprocessing variants")
        return variants
    
    @staticmethod
    def _calculate_otsu_threshold(img: Any) -> int:
        """Calculate Otsu's threshold for binary conversion"""
        try:
            hist = img.histogram()
            total = sum(hist)
            sumB = 0.0
            wB = 0.0
            maximum = 0.0
            threshold = 127
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
            
            logger.debug(f"Otsu threshold calculated: {threshold}")
            return threshold
        except Exception as e:
            logger.debug(f"Otsu calculation failed: {e}")
            return 127


class OCRProcessor:
    """Main OCR processing class"""
    
    def __init__(self, config: Optional[OCRConfig] = None):
        global pytesseract
        if pytesseract is None:
            import pytesseract

        self.config = config or OCRConfig()
        if self.config.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = self.config.tesseract_cmd
        elif not self.config.tesseract_cmd and os.name == 'nt':
            raise FileNotFoundError(
                "Tesseract not found. Please install from: "
                "https://github.com/UB-Mannheim/tesseract/wiki"
            )
    
    def _post_process_text(self, text: str) -> str:
        """Clean up and improve OCR output with advanced corrections"""
        if not text:
            return text
        
        # Remove excessive whitespace
        lines = text.splitlines()
        cleaned_lines = []
        
        for line in lines:
            # Remove leading/trailing whitespace
            line = line.strip()
            # Replace multiple spaces with single space
            line = ' '.join(line.split())
            if line:
                cleaned_lines.append(line)
        
        # Join with single newlines
        result = '\n'.join(cleaned_lines)
        
        # Enhanced OCR error corrections
        # Common character confusions that appear in specific contexts
        
        # 1. Fix common punctuation/symbol errors
        result = result.replace(' ,', ',')  # Space before comma
        result = result.replace(' .', '.')  # Space before period
        result = result.replace(' ;', ';')  # Space before semicolon
        result = result.replace(' :', ':')  # Space before colon (but be careful)
        result = result.replace('( ', '(')  # Space after opening paren
        result = result.replace(' )', ')')  # Space before closing paren
        
        # 2. Fix common OCR character substitutions (context-aware)
        # Only apply these when they make sense
        import re
        
        # Fix "0" (zero) vs "O" (letter O) - common in numbers
        # Replace O with 0 when surrounded by digits
        result = re.sub(r'(\d)O(\d)', r'\g<1>0\g<2>', result)
        result = re.sub(r'^O(\d)', r'0\g<1>', result, flags=re.MULTILINE)
        result = re.sub(r'(\d)O$', r'\g<1>0', result, flags=re.MULTILINE)
        result = re.sub(r'(\d)O\s', r'\g<1>0 ', result)
        
        # Fix "l" (lowercase L) vs "1" (one) vs "I" (uppercase i) - common in numbers
        # Replace l with 1 when surrounded by digits
        result = re.sub(r'(\d)l(\d)', r'\g<1>1\g<2>', result)
        result = re.sub(r'^l(\d)', r'1\g<1>', result, flags=re.MULTILINE)
        
        # Fix "S" vs "5" in numbers
        result = re.sub(r'(\d)S(\d)', r'\g<1>5\g<2>', result)
        
        # 3. Fix common word-level errors
        # These are very common OCR mistakes
        word_corrections = {
            'rn': 'm',      # rn looks like m
            'vv': 'w',      # vv looks like w
            'tlie': 'the',
            'tbe': 'the',
            'tion': 'tion',
            'tue': 'the',
            'wi11': 'will',
            'c0de': 'code',
            'pr0gram': 'program',
        }
        
        # Apply word corrections carefully (whole word only)
        for wrong, correct in word_corrections.items():
            # Match whole words with word boundaries
            pattern = r'\b' + re.escape(wrong) + r'\b'
            result = re.sub(pattern, correct, result, flags=re.IGNORECASE)
        
        # 4. Fix common programming/technical terms
        tech_corrections = {
            'def1ne': 'define',
            'funct10n': 'function',
            'c1ass': 'class',
            'pr1nt': 'print',
            '1mport': 'import',
            'ret_urn': 'return',
            'wh1le': 'while',
        }
        
        for wrong, correct in tech_corrections.items():
            result = result.replace(wrong, correct)
        
        # 5. Fix spacing around common operators and keywords
        # This helps with code recognition
        result = re.sub(r'(\w)=(\w)', r'\1 = \2', result)  # Add spaces around =
        result = re.sub(r'(\w)==(\w)', r'\1 == \2', result)  # Add spaces around ==
        result = re.sub(r'(\w)!=(\w)', r'\1 != \2', result)  # Add spaces around !=
        
        # 6. Remove common OCR artifacts
        result = result.replace('`', "'")  # Backtick to apostrophe in regular text
        
        # 7. Fix multiple consecutive spaces that might have been missed
        result = re.sub(r' {2,}', ' ', result)
        
        # 8. Remove standalone single characters that are likely noise
        # But keep common single letters and code/math operators.
        allowed_single_chars = set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-*/=%<>!?&|.,:;()[]{}#_~^')
        lines = result.split('\n')
        cleaned_lines = []
        for line in lines:
            words = line.split()
            # Filter out likely noise characters
            filtered_words = []
            for word in words:
                if len(word) == 1 and word not in allowed_single_chars:
                    # Likely OCR noise
                    continue
                filtered_words.append(word)
            if filtered_words:
                cleaned_lines.append(' '.join(filtered_words))
        
        result = '\n'.join(cleaned_lines)
        
        return result.strip()
    
    def process(self, image_bytes: bytes) -> str:
        """Process image and extract text via OCR"""
        start_time = time.perf_counter()
        
        try:
            # Try PaddleOCR first if enabled (Superior accuracy)
            if self.config.use_paddle:
                try:
                    # Lazy import to avoid circular dependencies
                    import sys
                    if '.' not in sys.path: sys.path.append('.')
                    try:
                        from paddleocr_engine import process_ocr_paddleocr, check_paddleocr_available
                    except ImportError:
                        # Try relative import if running as package
                        from .paddleocr_engine import process_ocr_paddleocr, check_paddleocr_available

                    if check_paddleocr_available():
                        paddle_text = process_ocr_paddleocr(image_bytes)
                        if paddle_text and len(paddle_text.strip()) > 5:
                            elapsed = time.perf_counter() - start_time
                            logger.info(f"PaddleOCR successful: {len(paddle_text)} chars in {elapsed:.2f}s")
                            return self._post_process_text(paddle_text)
                except Exception as e:
                    logger.warning(f"PaddleOCR attempt failed: {e}")

            # Prepare image
            img_gray, meta = ImagePreprocessor.prepare_image(image_bytes, self.config)
            
            # Fast path: try quick OCR first
            if self.config.fast_mode:
                quick_result = self._try_fast_path(img_gray)
                if quick_result:
                    raw_text, data, config_used = quick_result
                    processed_text = self._post_process_text(raw_text)
                    summary_stats = self._summarize_data(data, processed_text)
                    summary_stats.update({
                        'label': 'fast_path',
                        'config': config_used,
                    })
                    elapsed = time.perf_counter() - start_time
                    logger.info(
                        f"OCR fast path: {len(processed_text)} chars in {elapsed:.2f}s"
                    )
                    # Return clean text if configured
                    if self.config.clean_text_only:
                        return processed_text
                    return self._format_structured_output(processed_text, data, meta, summary_stats)
            
            # Create preprocessed variants
            variants = ImagePreprocessor.create_variants(img_gray, meta['brightness'])
            
            # Try multiple configurations
            best_text, best_stats, best_data = self._try_variants(
                variants, 
                start_time, 
                self.config.variant_budget_seconds
            )
            
            elapsed = time.perf_counter() - start_time
            if best_text:
                processed_text = self._post_process_text(best_text)
                logger.info(
                    f"OCR extracted {len(processed_text)} chars "
                    f"(conf: {best_stats.get('confidence', 0):.1f}%, "
                    f"quality: {best_stats.get('quality_score', 0):.1f}, "
                    f"method: {best_stats.get('label', 'n/a')}/{best_stats.get('config', 'n/a')}, "
                    f"time: {elapsed:.2f}s)"
                )
                # Return clean text if configured
                if self.config.clean_text_only:
                    return processed_text
                return self._format_structured_output(processed_text, best_data, meta, best_stats)
            else:
                logger.warning(f"OCR extracted no text after {elapsed:.2f}s")
                return ""
            
        except Exception as e:
            logger.exception("OCR processing error")
            return f"[OCR error: {str(e)}]"
    
    def _try_fast_path(self, img: Any) -> Optional[Tuple[str, Dict[str, List[Any]], str]]:
        """Try quick OCR with basic preprocessing"""
        quick_config = self.config.quick_config
        try:
            # Try original image
            text = pytesseract.image_to_string(img, config=quick_config).strip()
            data = self._safe_image_to_data(img, quick_config)
            if self._is_good_result(text, data):
                return text, data, quick_config
            
            # Try with autocontrast
            img_contrast = ImageOps.autocontrast(img)
            text = pytesseract.image_to_string(img_contrast, config=quick_config).strip()
            data = self._safe_image_to_data(img_contrast, quick_config)
            if self._is_good_result(text, data):
                return text, data, quick_config
                
        except Exception as e:
            logger.debug(f"Fast path failed: {e}")
        
        return None
    
    def _is_good_result(self, text: str, data: Optional[Dict[str, List[Any]]]) -> bool:
        """Check if OCR result is good enough to skip further processing"""
        if not text:
            return False
        
        # Check length
        if len(text) >= self.config.quick_min_chars:
            return True
        
        # Check confidence
        avg_conf = self._compute_average_confidence(data)
        if avg_conf >= self.config.quick_conf_threshold:
            return True
        
        # Check number of lines
        lines = [ln for ln in text.splitlines() if ln.strip()]
        if len(lines) >= 2:
            return True
        
        return False
    
    def _try_variants(
        self, 
        variants: List[Tuple[str, Any]], 
        start_time: float,
        budget: float
    ) -> Tuple[str, Dict]:
        """Try multiple preprocessing variants and configs"""
        # Expanded Tesseract configurations for better accuracy
        # Build configs with language support
        lang_param = f'-l {self.config.tesseract_lang}' if self.config.tesseract_lang else ''
        char_whitelist = f'-c tessedit_char_whitelist="{self.config.char_whitelist}"' if self.config.char_whitelist else ''
        
        configs_to_try = [
            f'--oem 3 --psm 6 {lang_param} {char_whitelist}',   # Uniform block of text (best for most cases)
            f'--oem 3 --psm 3 {lang_param} {char_whitelist}',   # Fully automatic page segmentation
            f'--oem 3 --psm 4 {lang_param} {char_whitelist}',   # Column detection (good for structured text)
            f'--oem 3 --psm 1 {lang_param} {char_whitelist}',   # Automatic with OSD (orientation and script detection)
            f'--oem 3 --psm 11 {lang_param} {char_whitelist}',  # Sparse text (good for scattered text)
            f'--oem 1 --psm 6 {lang_param} {char_whitelist}',   # LSTM engine only
            f'--oem 3 --psm 12 {lang_param} {char_whitelist}',  # Sparse text with OSD
            f'--oem 3 --psm 13 {lang_param}',  # Raw line (no word segmentation)
        ]
        
        # Clean up extra spaces in configs
        configs_to_try = [' '.join(c.split()) for c in configs_to_try]
        
        best_text = ""
        best_stats: Dict[str, Any] = {
            'confidence': -1.0,
            'length': 0,
            'label': '',
            'config': ''
        }
        best_data: Optional[Dict[str, List[Any]]] = None
        
        deadline = start_time + max(1.0, budget) if budget > 0 else None
        
        # Prioritize certain variants that typically work better
        priority_variants = []
        normal_variants = []
        
        for label, variant in variants:
            # Prioritize these preprocessing methods
            if any(x in label for x in ['autocontrast', 'sharpened', 'binary_clean', 'contrast_boost']):
                priority_variants.append((label, variant))
            else:
                normal_variants.append((label, variant))
        
        # Process priority variants first
        all_variants = priority_variants + normal_variants
        
        tested_count = 0
        for label, variant in all_variants:
            if deadline and time.perf_counter() > deadline:
                logger.info(f"OCR variant search stopped after {tested_count} tests (budget reached)")
                break
            
            for config in configs_to_try:
                if deadline and time.perf_counter() > deadline:
                    break
                
                try:
                    tested_count += 1
                    
                    # Get text and confidence
                    data = self._safe_image_to_data(variant, config)
                    avg_conf = self._compute_average_confidence(data)
                    text = pytesseract.image_to_string(variant, config=config).strip()
                    
                    if not text:
                        continue
                    
                    summary = self._summarize_data(data, text)
                    summary.update({
                        'label': label,
                        'config': config
                    })
                    quality_score = summary.get('quality_score', avg_conf)
                    text_length = summary.get('length', len(text))
                    # Check if this is better
                    is_better = (
                        quality_score > best_stats.get('quality_score', -1) + 5 or  # Clear improvement
                        (abs(quality_score - best_stats.get('quality_score', -1)) <= 5 and text_length > best_stats.get('length', 0) * 1.2)  # Similar quality but much longer
                    )
                    
                    if is_better:
                        best_text = text
                        best_stats = summary
                        best_data = data
                        logger.debug(
                            f"New best: {label}/{config} -> {text_length} chars, "
                            f"{summary.get('words', 0)} words @ {avg_conf:.1f}% conf (score: {quality_score:.1f})"
                        )
                
                except Exception as e:
                    logger.debug(f"Variant {label}/{config} failed: {e}")
        
        logger.info(f"OCR tested {tested_count} variant/config combinations in {time.perf_counter() - start_time:.2f}s")
        
        # Fallback if nothing worked
        if not best_text:
            logger.warning("No OCR text extracted from any variant, attempting fallback...")
            try:
                # Try the most aggressive preprocessing
                for label, variant in all_variants:
                    if 'sharp' in label or 'contrast' in label:
                        text = pytesseract.image_to_string(
                            variant,
                            config='--oem 3 --psm 6'
                        ).strip()
                        if text:
                            best_text = text
                            best_data = self._safe_image_to_data(variant, '--oem 3 --psm 6')
                            best_stats = self._summarize_data(best_data, text)
                            best_stats.update({
                                'label': label + '_fallback',
                                'config': '--oem 3 --psm 6'
                            })
                            logger.info(f"Fallback extracted {len(text)} chars using {label}")
                            break
            except Exception as e:
                logger.error(f"Even fallback OCR failed: {e}")
        
        return best_text, best_stats, best_data

    def _safe_image_to_data(self, img: Any, config: str) -> Dict[str, List[Any]]:
        """Safely call pytesseract.image_to_data and return dictionary output"""
        try:
            return pytesseract.image_to_data(
                img,
                config=config,
                output_type=pytesseract.Output.DICT
            )
        except Exception as exc:  # pragma: no cover - logging path
            logger.debug(f"image_to_data failed for config {config}: {exc}")
            return {}

    def _compute_average_confidence(self, data: Optional[Dict[str, List[Any]]]) -> float:
        """Compute average confidence from pytesseract data output"""
        if not data:
            return 0.0
        confidences: List[float] = []
        for raw_conf in data.get('conf', []):
            try:
                conf_val = float(raw_conf)
            except (ValueError, TypeError):
                continue
            if conf_val >= 0:
                confidences.append(conf_val)
        if not confidences:
            return 0.0
        return sum(confidences) / len(confidences)

    def _summarize_data(self, data: Optional[Dict[str, List[Any]]], text: str) -> Dict[str, Any]:
        """Create a summary dictionary with confidence, length, words, and heuristics"""
        length = len(text)
        words = len(text.split())
        lines = len([ln for ln in text.splitlines() if ln.strip()])
        avg_conf = self._compute_average_confidence(data)
        quality_score = avg_conf
        if 50 < length < 5000:
            quality_score += 5
        if words > 3:
            quality_score += 3
        if lines > 1:
            quality_score += 2
        return {
            'confidence': avg_conf,
            'quality_score': quality_score,
            'length': length,
            'words': words,
            'lines': lines
        }

    def _format_structured_output(
        self,
        text: str,
        data: Optional[Dict[str, List[Any]]],
        meta: Dict[str, Any],
        stats: Dict[str, Any]
    ) -> str:
        """Format OCR output into a structured, information-rich string"""
        line_entries = self._build_line_entries(data) if data else []
        if not line_entries and text:
            line_entries = self._fallback_line_entries_from_text(text)

        layout_text = self._generate_visual_layout(line_entries)
        primary_text = layout_text if layout_text else text

        meta_lines = ["# OCR Structured Extraction"]
        original_size = meta.get('original_size')
        processed_size = meta.get('processed_size')
        scale_factor = meta.get('scale_factor')
        brightness = meta.get('brightness')
        if original_size:
            meta_lines.append(f"- Original size: {original_size[0]}x{original_size[1]}")
        if processed_size:
            meta_lines.append(f"- Processed size: {processed_size[0]}x{processed_size[1]}")
        if scale_factor:
            meta_lines.append(f"- Scale factor: {scale_factor:.2f}x")
        if brightness is not None:
            meta_lines.append(f"- Estimated brightness: {brightness:.1f}")

        confidence = stats.get('confidence')
        if confidence is not None and confidence >= 0:
            meta_lines.append(f"- Average confidence: {confidence:.1f}%")
        quality = stats.get('quality_score')
        if quality is not None:
            meta_lines.append(f"- Quality score: {quality:.1f}")
        length = stats.get('length')
        if length is not None:
            meta_lines.append(f"- Characters detected: {length}")
        words = stats.get('words')
        if words is not None:
            meta_lines.append(f"- Words detected: {words}")
        lines_count = stats.get('lines')
        if lines_count is not None:
            meta_lines.append(f"- Lines detected: {lines_count}")
        method_label = stats.get('label')
        config_used = stats.get('config')
        if method_label or config_used:
            meta_lines.append(f"- Best variant: {method_label or 'n/a'} | Config: {config_used or 'n/a'}")

        sections: List[str] = ["\n".join(meta_lines)]
        sections.append("")
        sections.append("## Screen Layout")
        sections.append(layout_text if layout_text else "[layout unavailable]")
        sections.append("")
        sections.append("## Raw Text")
        sections.append(primary_text if primary_text else "[no text extracted]")

        if line_entries:
            sections.append("")
            sections.append("## Structured Lines")
            for idx, line in enumerate(line_entries, start=1):
                conf_val = line.get('confidence')
                conf_str = f"{conf_val:.1f}%" if conf_val is not None else "n/a"
                bbox = line.get('bbox')
                if bbox:
                    bbox_str = f"x={bbox[0]}, y={bbox[1]}, w={bbox[2]}, h={bbox[3]}"
                else:
                    bbox_str = "n/a"
                sections.append(f"{idx}. [conf={conf_str}] {line.get('text', '')}")
                sections.append(
                    f"   bbox: {bbox_str} | words={line.get('word_count', 0)}"
                )

        key_values = self._extract_key_value_pairs(line_entries)
        if key_values:
            sections.append("")
            sections.append("## Key-Value Pairs")
            for key, value in key_values:
                sections.append(f"- {key}: {value}")

        questions = self._detect_questions(line_entries)
        if questions:
            sections.append("")
            sections.append("## Questions Detected")
            for question in questions:
                sections.append(f"- {question}")

        list_items = self._detect_list_items(line_entries)
        if list_items:
            sections.append("")
            sections.append("## List Items")
            for item in list_items:
                sections.append(f"- {item}")

        return "\n".join(sections).strip()

    def _build_line_entries(self, data: Dict[str, List[Any]]) -> List[Dict[str, Any]]:
        """Group pytesseract word-level data into line-level entries"""
        required_keys = {'text', 'conf', 'left', 'top', 'width', 'height', 'block_num', 'par_num', 'line_num'}
        if not data or not required_keys.issubset(data.keys()):
            return []
        entries: Dict[Tuple[int, int, int], Dict[str, Any]] = {}
        total_items = len(data.get('text', []))

        def _parse_int(value: Any, default: int = 0) -> int:
            try:
                return int(float(value))
            except (ValueError, TypeError):
                return default

        def _parse_float(value: Any) -> Optional[float]:
            try:
                return float(value)
            except (ValueError, TypeError):
                return None

        for idx in range(total_items):
            text = str(data['text'][idx] or '').strip()
            if not text:
                continue
            key = (
                _parse_int(data['block_num'][idx]),
                _parse_int(data['par_num'][idx]),
                _parse_int(data['line_num'][idx])
            )
            entry = entries.setdefault(key, {
                'words': [],
                'confidence_values': [],
                'left': None,
                'top': None,
                'right': None,
                'bottom': None
            })
            left = _parse_int(data['left'][idx])
            top = _parse_int(data['top'][idx])
            width = _parse_int(data['width'][idx])
            height = _parse_int(data['height'][idx])
            right = left + width
            bottom = top + height

            entry['words'].append(text)
            conf_val = _parse_float(data['conf'][idx])
            if conf_val is not None and conf_val >= 0:
                entry['confidence_values'].append(conf_val)

            entry['left'] = left if entry['left'] is None else min(entry['left'], left)
            entry['top'] = top if entry['top'] is None else min(entry['top'], top)
            entry['right'] = right if entry['right'] is None else max(entry['right'], right)
            entry['bottom'] = bottom if entry['bottom'] is None else max(entry['bottom'], bottom)

        line_entries: List[Dict[str, Any]] = []
        for entry in entries.values():
            if not entry['words']:
                continue
            bbox = None
            if None not in (entry['left'], entry['top'], entry['right'], entry['bottom']):
                bbox = (
                    int(entry['left']),
                    int(entry['top']),
                    int(entry['right'] - entry['left']),
                    int(entry['bottom'] - entry['top'])
                )
            confidence = None
            if entry['confidence_values']:
                confidence = sum(entry['confidence_values']) / len(entry['confidence_values'])
            line_entries.append({
                'text': " ".join(entry['words']).strip(),
                'confidence': confidence,
                'bbox': bbox,
                'word_count': len(entry['words'])
            })

        line_entries.sort(key=lambda item: (
            item.get('bbox', (0, 0, 0, 0))[1],
            item.get('bbox', (0, 0, 0, 0))[0]
        ))
        return line_entries

    def _fallback_line_entries_from_text(self, text: str) -> List[Dict[str, Any]]:
        """Create simple line entries when OCR data is unavailable"""
        entries: List[Dict[str, Any]] = []
        for raw_line in text.splitlines():
            clean_line = raw_line.strip()
            if not clean_line:
                continue
            entries.append({
                'text': clean_line,
                'confidence': None,
                'bbox': None,
                'word_count': len(clean_line.split())
            })
        return entries

    def _extract_key_value_pairs(self, line_entries: List[Dict[str, Any]]) -> List[Tuple[str, str]]:
        """Extract key-value style pairs from structured lines"""
        pairs: List[Tuple[str, str]] = []
        for entry in line_entries:
            text = entry.get('text', '')
            if ':' not in text:
                continue
            key, value = text.split(':', 1)
            key = key.strip()
            value = value.strip()
            if not key or not value:
                continue
            if len(key) > 60:
                continue
            pairs.append((key, value))
        return pairs

    def _detect_questions(self, line_entries: List[Dict[str, Any]]) -> List[str]:
        """Detect question-form lines for better AI comprehension"""
        questions: List[str] = []
        for entry in line_entries:
            text = entry.get('text', '')
            if not text:
                continue
            if '?' in text:
                questions.append(text)
        return questions

    def _detect_list_items(self, line_entries: List[Dict[str, Any]]) -> List[str]:
        """Detect bullet or enumerated list items"""
        items: List[str] = []
        bullet_prefixes = ('- ', '* ', '•', '– ', '— ', '· ', '• ', '○ ', '● ')
        for entry in line_entries:
            text = entry.get('text', '')
            if not text:
                continue
            trimmed = text.lstrip()
            lower_trim = trimmed.lower()
            if any(trimmed.startswith(prefix) for prefix in bullet_prefixes):
                items.append(text)
                continue
            if len(trimmed) > 2 and trimmed[1] in ('.', ')') and trimmed[0].isalnum():
                items.append(text)
                continue
            if lower_trim.startswith(('option ', 'choice ')):
                items.append(text)
        return items

    def _generate_visual_layout(self, line_entries: List[Dict[str, Any]]) -> str:
        """Reconstruct screen order with spacing resembling on-screen layout."""
        if not line_entries:
            return ""

        layout_lines: List[str] = []
        prev_bottom: Optional[int] = None
        prev_height: Optional[int] = None

        for entry in line_entries:
            text = entry.get('text', '').strip()
            if not text:
                continue

            bbox = entry.get('bbox')
            if bbox:
                left, top, width, height = bbox
                bottom = top + height
                if prev_bottom is not None:
                    gap = top - prev_bottom
                    threshold = 24
                    if prev_height is not None:
                        threshold = max(threshold, int(prev_height * 0.7))
                    if gap > threshold and (not layout_lines or layout_lines[-1] != ""):
                        layout_lines.append("")
                prev_bottom = bottom
                prev_height = height
                indent_level = max(0, min(6, left // 90))
                prefix = "  " * indent_level
            else:
                prefix = ""
                prev_bottom = None
                prev_height = None

            layout_lines.append(f"{prefix}{text}")

        return "\n".join(line for line in layout_lines if line is not None).strip()


# Convenience function for backward compatibility
def process_ocr_image(image_bytes: bytes, config: Optional[OCRConfig] = None) -> str:
    """Process OCR image - convenience wrapper"""
    processor = OCRProcessor(config)
    return processor.process(image_bytes)

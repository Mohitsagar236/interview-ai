"""
OCR Cache Manager for Interview AI
Caches OCR results to avoid redundant processing
"""

import hashlib
import logging
import time
from typing import Optional, Dict, Tuple
from dataclasses import dataclass
import os

logger = logging.getLogger(__name__)


@dataclass
class OCRCacheEntry:
    """Cached OCR result"""
    text: str
    timestamp: float
    engine_used: str
    processing_time_ms: float


class OCRCache:
    """
    LRU cache for OCR results.
    Uses image hash as key to detect identical captures.
    """
    
    def __init__(self, max_size: int = 100, ttl_seconds: int = 300):
        """
        Initialize OCR cache.
        
        Args:
            max_size: Maximum number of cached results
            ttl_seconds: Time-to-live for cache entries in seconds
        """
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self.cache: Dict[str, OCRCacheEntry] = {}
        self.access_times: Dict[str, float] = {}
        
        # Statistics
        self.hits = 0
        self.misses = 0
        self.evictions = 0
        
        logger.info(f"OCRCache initialized: max_size={max_size}, ttl={ttl_seconds}s")
    
    def _compute_hash(self, image_bytes: bytes) -> str:
        """Compute hash of image bytes"""
        return hashlib.md5(image_bytes).hexdigest()
    
    def get(self, image_bytes: bytes) -> Optional[str]:
        """
        Get cached OCR result for image.
        
        Args:
            image_bytes: Raw image data
            
        Returns:
            Cached OCR text if available, None otherwise
        """
        image_hash = self._compute_hash(image_bytes)
        current_time = time.time()
        
        # Check if in cache and not expired
        if image_hash in self.cache:
            entry = self.cache[image_hash]
            age = current_time - entry.timestamp
            
            if age < self.ttl_seconds:
                # Cache hit
                self.hits += 1
                self.access_times[image_hash] = current_time
                
                logger.debug(
                    f"OCR cache HIT: {len(entry.text)} chars, "
                    f"age={age:.1f}s, engine={entry.engine_used}"
                )
                return entry.text
            else:
                # Expired entry
                del self.cache[image_hash]
                del self.access_times[image_hash]
                logger.debug(f"OCR cache entry expired: age={age:.1f}s")
        
        # Cache miss
        self.misses += 1
        return None
    
    def put(self, image_bytes: bytes, text: str, engine: str, processing_time_ms: float):
        """
        Cache OCR result.
        
        Args:
            image_bytes: Raw image data
            text: Extracted OCR text
            engine: OCR engine used (paddleocr, easyocr, tesseract)
            processing_time_ms: Time taken to process in milliseconds
        """
        image_hash = self._compute_hash(image_bytes)
        current_time = time.time()
        
        # Evict if at capacity
        if len(self.cache) >= self.max_size and image_hash not in self.cache:
            self._evict_lru()
        
        # Store entry
        entry = OCRCacheEntry(
            text=text,
            timestamp=current_time,
            engine_used=engine,
            processing_time_ms=processing_time_ms
        )
        
        self.cache[image_hash] = entry
        self.access_times[image_hash] = current_time
        
        logger.debug(
            f"OCR cache PUT: {len(text)} chars, engine={engine}, "
            f"time={processing_time_ms:.1f}ms"
        )
    
    def _evict_lru(self):
        """Evict least recently used entry"""
        if not self.access_times:
            return
        
        # Find LRU entry
        lru_key = min(self.access_times, key=self.access_times.get)
        
        # Remove it
        del self.cache[lru_key]
        del self.access_times[lru_key]
        self.evictions += 1
        
        logger.debug(f"OCR cache evicted LRU entry")
    
    def clear(self):
        """Clear all cache entries"""
        count = len(self.cache)
        self.cache.clear()
        self.access_times.clear()
        logger.info(f"OCR cache cleared: {count} entries removed")
    
    def get_stats(self) -> Dict:
        """Get cache statistics"""
        total_requests = self.hits + self.misses
        hit_rate = self.hits / total_requests if total_requests > 0 else 0
        
        return {
            "size": len(self.cache),
            "max_size": self.max_size,
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": hit_rate,
            "evictions": self.evictions,
            "ttl_seconds": self.ttl_seconds
        }


# Global OCR cache instance
_ocr_cache: Optional[OCRCache] = None


def get_ocr_cache() -> OCRCache:
    """Get or create global OCR cache"""
    global _ocr_cache
    if _ocr_cache is None:
        # Read config from environment
        enabled = os.getenv("OCR_CACHE_ENABLED", "1").lower() in ("1", "true", "yes", "on")
        if not enabled:
            # Return disabled cache
            _ocr_cache = OCRCache(max_size=0, ttl_seconds=0)
        else:
            max_size = int(os.getenv("OCR_CACHE_SIZE", "100"))
            ttl = int(os.getenv("OCR_CACHE_TTL", "300"))
            _ocr_cache = OCRCache(max_size=max_size, ttl_seconds=ttl)
    
    return _ocr_cache


def get_cached_ocr(image_bytes: bytes) -> Optional[str]:
    """Get cached OCR result"""
    cache = get_ocr_cache()
    return cache.get(image_bytes)


def cache_ocr_result(image_bytes: bytes, text: str, engine: str, processing_time_ms: float):
    """Cache OCR result"""
    cache = get_ocr_cache()
    cache.put(image_bytes, text, engine, processing_time_ms)


def get_ocr_cache_stats() -> Dict:
    """Get OCR cache statistics"""
    cache = get_ocr_cache()
    return cache.get_stats()

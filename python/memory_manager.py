"""
Memory Manager for Interview AI
Prevents memory leaks and optimizes resource usage during long sessions.
"""

import asyncio
import gc
import logging
import os
import sys
import time
import weakref
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Dict, Optional, Callable
import threading

logger = logging.getLogger(__name__)


@dataclass
class MemoryConfig:
    """Memory management configuration"""
    # Cache limits
    max_cache_size_mb: float = 100.0  # Maximum cache size in MB
    max_cache_items: int = 1000  # Maximum items in any cache
    cache_ttl_seconds: float = 300.0  # Default TTL for cached items
    
    # Garbage collection
    gc_interval_seconds: float = 60.0  # How often to run GC
    gc_threshold_mb: float = 200.0  # Run GC when memory exceeds this
    
    # Session cleanup
    session_timeout_seconds: float = 3600.0  # 1 hour
    max_sessions: int = 100


class LRUCache:
    """
    Thread-safe LRU cache with TTL and size limits.
    Prevents unbounded memory growth.
    """
    
    def __init__(
        self,
        max_items: int = 100,
        max_size_bytes: int = 10 * 1024 * 1024,  # 10MB
        ttl_seconds: float = 300.0
    ):
        self.max_items = max_items
        self.max_size_bytes = max_size_bytes
        self.ttl_seconds = ttl_seconds
        
        self._cache: OrderedDict = OrderedDict()
        self._sizes: Dict[str, int] = {}
        self._timestamps: Dict[str, float] = {}
        self._total_size: int = 0
        self._lock = threading.RLock()
        
        # Stats
        self.hits = 0
        self.misses = 0
        self.evictions = 0
    
    def get(self, key: str) -> Optional[Any]:
        """Get item from cache"""
        with self._lock:
            if key not in self._cache:
                self.misses += 1
                return None
            
            # Check TTL
            if time.time() - self._timestamps[key] > self.ttl_seconds:
                self._remove(key)
                self.misses += 1
                return None
            
            # Move to end (most recently used)
            self._cache.move_to_end(key)
            self.hits += 1
            return self._cache[key]
    
    def set(self, key: str, value: Any, size_bytes: Optional[int] = None):
        """Set item in cache"""
        with self._lock:
            # Estimate size if not provided
            if size_bytes is None:
                size_bytes = self._estimate_size(value)
            
            # Remove if exists (will re-add)
            if key in self._cache:
                self._remove(key)
            
            # Evict if necessary
            while (
                (len(self._cache) >= self.max_items or
                 self._total_size + size_bytes > self.max_size_bytes)
                and self._cache
            ):
                self._evict_oldest()
            
            # Add new item
            self._cache[key] = value
            self._sizes[key] = size_bytes
            self._timestamps[key] = time.time()
            self._total_size += size_bytes
    
    def _remove(self, key: str):
        """Remove item from cache"""
        if key in self._cache:
            del self._cache[key]
            self._total_size -= self._sizes.pop(key, 0)
            self._timestamps.pop(key, None)
    
    def _evict_oldest(self):
        """Evict the oldest item"""
        if self._cache:
            key = next(iter(self._cache))
            self._remove(key)
            self.evictions += 1
    
    def _estimate_size(self, value: Any) -> int:
        """Estimate memory size of value"""
        try:
            return sys.getsizeof(value)
        except TypeError:
            return 1024  # Default estimate
    
    def clear(self):
        """Clear all items"""
        with self._lock:
            self._cache.clear()
            self._sizes.clear()
            self._timestamps.clear()
            self._total_size = 0
    
    def cleanup_expired(self) -> int:
        """Remove all expired items, return count removed"""
        with self._lock:
            now = time.time()
            expired = [
                k for k, ts in self._timestamps.items()
                if now - ts > self.ttl_seconds
            ]
            for k in expired:
                self._remove(k)
            return len(expired)
    
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        with self._lock:
            hit_rate = self.hits / (self.hits + self.misses) if (self.hits + self.misses) > 0 else 0
            return {
                'items': len(self._cache),
                'size_bytes': self._total_size,
                'size_mb': self._total_size / (1024 * 1024),
                'hits': self.hits,
                'misses': self.misses,
                'hit_rate': hit_rate,
                'evictions': self.evictions
            }


class SessionManager:
    """
    Manages user sessions with automatic cleanup.
    Prevents memory leaks from abandoned sessions.
    """
    
    def __init__(self, config: Optional[MemoryConfig] = None):
        self.config = config or MemoryConfig()
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._last_activity: Dict[str, float] = {}
        self._lock = threading.RLock()
    
    def get_session(self, session_id: str) -> Dict[str, Any]:
        """Get or create session data"""
        with self._lock:
            if session_id not in self._sessions:
                # Enforce max sessions
                if len(self._sessions) >= self.config.max_sessions:
                    self._cleanup_oldest_session()
                
                self._sessions[session_id] = {}
            
            self._last_activity[session_id] = time.time()
            return self._sessions[session_id]
    
    def update_session(self, session_id: str, key: str, value: Any):
        """Update a session value"""
        with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = {}
            self._sessions[session_id][key] = value
            self._last_activity[session_id] = time.time()
    
    def remove_session(self, session_id: str):
        """Remove a session"""
        with self._lock:
            self._sessions.pop(session_id, None)
            self._last_activity.pop(session_id, None)
    
    def cleanup_inactive(self) -> int:
        """Remove inactive sessions, return count removed"""
        with self._lock:
            now = time.time()
            timeout = self.config.session_timeout_seconds
            
            expired = [
                sid for sid, last in self._last_activity.items()
                if now - last > timeout
            ]
            
            for sid in expired:
                self._sessions.pop(sid, None)
                self._last_activity.pop(sid, None)
            
            if expired:
                logger.info(f"Cleaned up {len(expired)} inactive sessions")
            
            return len(expired)
    
    def _cleanup_oldest_session(self):
        """Remove the oldest session to make room"""
        with self._lock:
            if not self._last_activity:
                return
            
            oldest = min(self._last_activity, key=self._last_activity.get)
            self._sessions.pop(oldest, None)
            self._last_activity.pop(oldest, None)
            logger.info(f"Evicted oldest session: {oldest}")
    
    def stats(self) -> Dict[str, Any]:
        """Get session statistics"""
        with self._lock:
            return {
                'active_sessions': len(self._sessions),
                'max_sessions': self.config.max_sessions,
                'timeout_seconds': self.config.session_timeout_seconds
            }


class MemoryMonitor:
    """
    Background memory monitoring and garbage collection.
    Prevents memory bloat during long-running sessions.
    """
    
    def __init__(self, config: Optional[MemoryConfig] = None):
        self.config = config or MemoryConfig()
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._caches: weakref.WeakSet = weakref.WeakSet()
        self._session_managers: weakref.WeakSet = weakref.WeakSet()
        
        # Stats
        self.gc_runs = 0
        self.total_freed_mb = 0.0
    
    def register_cache(self, cache: LRUCache):
        """Register a cache for monitoring"""
        self._caches.add(cache)
    
    def register_session_manager(self, manager: SessionManager):
        """Register a session manager for monitoring"""
        self._session_managers.add(manager)
    
    async def start(self):
        """Start background monitoring"""
        if self._running:
            return
        
        self._running = True
        self._task = asyncio.create_task(self._monitor_loop())
        logger.info("Memory monitor started")
    
    async def stop(self):
        """Stop background monitoring"""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Memory monitor stopped")
    
    async def _monitor_loop(self):
        """Main monitoring loop"""
        while self._running:
            try:
                await asyncio.sleep(self.config.gc_interval_seconds)
                await self._run_maintenance()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Memory monitor error: {e}")
    
    async def _run_maintenance(self):
        """Run maintenance tasks"""
        # Get current memory usage
        memory_mb = self._get_process_memory_mb()
        
        # Cleanup caches
        for cache in list(self._caches):
            try:
                expired = cache.cleanup_expired()
                if expired > 0:
                    logger.debug(f"Cleaned {expired} expired cache items")
            except Exception as e:
                logger.warning(f"Cache cleanup error: {e}")
        
        # Cleanup sessions
        for manager in list(self._session_managers):
            try:
                manager.cleanup_inactive()
            except Exception as e:
                logger.warning(f"Session cleanup error: {e}")
        
        # Run GC if memory is high
        if memory_mb > self.config.gc_threshold_mb:
            before_mb = memory_mb
            gc.collect()
            after_mb = self._get_process_memory_mb()
            freed = before_mb - after_mb
            
            self.gc_runs += 1
            self.total_freed_mb += freed
            
            logger.info(
                f"GC run #{self.gc_runs}: freed {freed:.1f}MB "
                f"({before_mb:.1f}MB -> {after_mb:.1f}MB)"
            )
    
    def _get_process_memory_mb(self) -> float:
        """Get current process memory usage in MB"""
        try:
            import psutil
            process = psutil.Process(os.getpid())
            return process.memory_info().rss / (1024 * 1024)
        except ImportError:
            # Fallback: estimate from gc
            return sum(sys.getsizeof(obj) for obj in gc.get_objects()) / (1024 * 1024)
        except Exception:
            return 0.0
    
    def stats(self) -> Dict[str, Any]:
        """Get memory monitor statistics"""
        return {
            'current_memory_mb': self._get_process_memory_mb(),
            'gc_runs': self.gc_runs,
            'total_freed_mb': self.total_freed_mb,
            'registered_caches': len(list(self._caches)),
            'registered_session_managers': len(list(self._session_managers))
        }


# Global instances
_memory_monitor: Optional[MemoryMonitor] = None
_global_cache: Optional[LRUCache] = None
_session_manager: Optional[SessionManager] = None


def get_memory_monitor() -> MemoryMonitor:
    """Get or create global memory monitor"""
    global _memory_monitor
    if _memory_monitor is None:
        _memory_monitor = MemoryMonitor()
    return _memory_monitor


def get_global_cache() -> LRUCache:
    """Get or create global LRU cache"""
    global _global_cache
    if _global_cache is None:
        _global_cache = LRUCache(
            max_items=500,
            max_size_bytes=50 * 1024 * 1024,  # 50MB
            ttl_seconds=300.0
        )
        get_memory_monitor().register_cache(_global_cache)
    return _global_cache


def get_session_manager() -> SessionManager:
    """Get or create global session manager"""
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
        get_memory_monitor().register_session_manager(_session_manager)
    return _session_manager

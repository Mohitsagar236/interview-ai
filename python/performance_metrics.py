"""
Performance Metrics Tracker for Interview AI
Monitors and logs system performance metrics
"""

import time
import logging
import asyncio
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from collections import deque
import json

logger = logging.getLogger(__name__)


@dataclass
class PerformanceMetrics:
    """Container for performance measurements"""
    # Transcription metrics
    transcription_latency_ms: float = 0
    transcription_accuracy: float = 0
    
    # OCR metrics
    ocr_processing_time_ms: float = 0
    ocr_engine_used: str = ""
    ocr_cache_hit: bool = False
    
    # AI generation metrics
    ai_first_token_latency_ms: float = 0
    ai_total_generation_time_ms: float = 0
    ai_tokens_generated: int = 0
    ai_model_used: str = ""
    ai_cache_hit: bool = False
    
    # End-to-end metrics
    end_to_end_latency_ms: float = 0
    
    # Resource usage
    memory_usage_mb: float = 0
    cpu_usage_percent: float = 0
    
    # Quality metrics
    answer_confidence: float = 0
    answer_completeness: float = 0
    
    # Timestamp
    timestamp: datetime = field(default_factory=datetime.now)
    session_id: Optional[str] = None
    request_id: Optional[str] = None


class MetricsTracker:
    """
    Tracks and aggregates performance metrics.
    Provides real-time monitoring and analytics.
    """
    
    def __init__(self, max_history: int = 1000):
        """
        Initialize metrics tracker.
        
        Args:
            max_history: Maximum number of metrics to keep in memory
        """
        self.max_history = max_history
        self.metrics_history: deque = deque(maxlen=max_history)
        
        # Real-time aggregates
        self.total_requests = 0
        self.total_tokens_generated = 0
        self.total_ocr_processed = 0
        self.cache_hits = 0
        self.cache_misses = 0
        
        # Performance windows (rolling averages)
        self.window_1min: deque = deque(maxlen=60)
        self.window_5min: deque = deque(maxlen=300)
        self.window_1hour: deque = deque(maxlen=3600)
        
        # Background monitoring
        self.monitoring_task: Optional[asyncio.Task] = None
        self.is_monitoring = False
        
        logger.info("MetricsTracker initialized")
    
    def record(self, metrics: PerformanceMetrics):
        """Record a performance measurement"""
        self.metrics_history.append(metrics)
        self.window_1min.append(metrics)
        self.window_5min.append(metrics)
        self.window_1hour.append(metrics)
        
        # Update counters
        self.total_requests += 1
        self.total_tokens_generated += metrics.ai_tokens_generated
        
        if metrics.ocr_processing_time_ms > 0:
            self.total_ocr_processed += 1
        
        if metrics.ai_cache_hit or metrics.ocr_cache_hit:
            self.cache_hits += 1
        else:
            self.cache_misses += 1
        
        # Log slow requests
        if metrics.end_to_end_latency_ms > 5000:  # > 5 seconds
            logger.warning(
                f"Slow request detected: {metrics.end_to_end_latency_ms:.1f}ms "
                f"(AI: {metrics.ai_total_generation_time_ms:.1f}ms, "
                f"OCR: {metrics.ocr_processing_time_ms:.1f}ms)"
            )
    
    def get_stats(self, window: str = "1min") -> Dict[str, Any]:
        """
        Get aggregated statistics for a time window.
        
        Args:
            window: Time window ('1min', '5min', '1hour', 'all')
            
        Returns:
            Dictionary with aggregated metrics
        """
        if window == "1min":
            data = list(self.window_1min)
        elif window == "5min":
            data = list(self.window_5min)
        elif window == "1hour":
            data = list(self.window_1hour)
        else:
            data = list(self.metrics_history)
        
        if not data:
            return self._empty_stats()
        
        # Calculate aggregates
        total_requests = len(data)
        
        # Latency stats
        e2e_latencies = [m.end_to_end_latency_ms for m in data if m.end_to_end_latency_ms > 0]
        ai_latencies = [m.ai_total_generation_time_ms for m in data if m.ai_total_generation_time_ms > 0]
        ocr_latencies = [m.ocr_processing_time_ms for m in data if m.ocr_processing_time_ms > 0]
        first_token_latencies = [m.ai_first_token_latency_ms for m in data if m.ai_first_token_latency_ms > 0]
        
        # Token stats
        total_tokens = sum(m.ai_tokens_generated for m in data)
        
        # Cache stats
        cache_hits = sum(1 for m in data if m.ai_cache_hit or m.ocr_cache_hit)
        cache_hit_rate = cache_hits / total_requests if total_requests > 0 else 0
        
        # Quality stats
        avg_confidence = sum(m.answer_confidence for m in data if m.answer_confidence > 0) / len([m for m in data if m.answer_confidence > 0]) if any(m.answer_confidence > 0 for m in data) else 0
        
        return {
            "window": window,
            "total_requests": total_requests,
            "total_tokens": total_tokens,
            "cache_hit_rate": cache_hit_rate,
            "latency": {
                "end_to_end": {
                    "avg": sum(e2e_latencies) / len(e2e_latencies) if e2e_latencies else 0,
                    "p50": self._percentile(e2e_latencies, 0.5),
                    "p95": self._percentile(e2e_latencies, 0.95),
                    "p99": self._percentile(e2e_latencies, 0.99),
                    "max": max(e2e_latencies) if e2e_latencies else 0
                },
                "ai_generation": {
                    "avg": sum(ai_latencies) / len(ai_latencies) if ai_latencies else 0,
                    "p95": self._percentile(ai_latencies, 0.95),
                },
                "first_token": {
                    "avg": sum(first_token_latencies) / len(first_token_latencies) if first_token_latencies else 0,
                    "p95": self._percentile(first_token_latencies, 0.95),
                },
                "ocr": {
                    "avg": sum(ocr_latencies) / len(ocr_latencies) if ocr_latencies else 0,
                    "count": len(ocr_latencies)
                }
            },
            "quality": {
                "avg_confidence": avg_confidence
            },
            "throughput": {
                "requests_per_second": total_requests / 60 if window == "1min" else 0
            }
        }
    
    def _percentile(self, values: List[float], p: float) -> float:
        """Calculate percentile of values"""
        if not values:
            return 0
        sorted_vals = sorted(values)
        idx = int(len(sorted_vals) * p)
        return sorted_vals[min(idx, len(sorted_vals) - 1)]
    
    def _empty_stats(self) -> Dict[str, Any]:
        """Return empty stats structure"""
        return {
            "window": "none",
            "total_requests": 0,
            "total_tokens": 0,
            "cache_hit_rate": 0,
            "latency": {
                "end_to_end": {"avg": 0, "p50": 0, "p95": 0, "p99": 0, "max": 0},
                "ai_generation": {"avg": 0, "p95": 0},
                "first_token": {"avg": 0, "p95": 0},
                "ocr": {"avg": 0, "count": 0}
            },
            "quality": {"avg_confidence": 0},
            "throughput": {"requests_per_second": 0}
        }
    
    async def start_monitoring(self, interval_seconds: int = 60):
        """Start background monitoring task"""
        if self.is_monitoring:
            return
        
        self.is_monitoring = True
        self.monitoring_task = asyncio.create_task(self._monitoring_loop(interval_seconds))
        logger.info(f"Started performance monitoring (interval: {interval_seconds}s)")
    
    async def stop_monitoring(self):
        """Stop background monitoring"""
        self.is_monitoring = False
        if self.monitoring_task:
            self.monitoring_task.cancel()
            try:
                await self.monitoring_task
            except asyncio.CancelledError:
                pass
        logger.info("Stopped performance monitoring")
    
    async def _monitoring_loop(self, interval: int):
        """Background monitoring loop"""
        while self.is_monitoring:
            try:
                # Log current stats
                stats = self.get_stats("1min")
                logger.info(
                    f"Performance [1min]: "
                    f"Requests: {stats['total_requests']}, "
                    f"Avg Latency: {stats['latency']['end_to_end']['avg']:.1f}ms, "
                    f"Cache Hit Rate: {stats['cache_hit_rate']:.1%}, "
                    f"Tokens: {stats['total_tokens']}"
                )
                
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Monitoring loop error: {e}")
                await asyncio.sleep(interval)
    
    def export_metrics(self, filepath: str):
        """Export metrics to JSON file"""
        try:
            data = {
                "summary": self.get_stats("all"),
                "history": [
                    {
                        "timestamp": m.timestamp.isoformat(),
                        "end_to_end_latency_ms": m.end_to_end_latency_ms,
                        "ai_total_generation_time_ms": m.ai_total_generation_time_ms,
                        "ai_tokens_generated": m.ai_tokens_generated,
                        "ai_model_used": m.ai_model_used,
                        "ocr_processing_time_ms": m.ocr_processing_time_ms,
                        "answer_confidence": m.answer_confidence,
                        "session_id": m.session_id
                    }
                    for m in list(self.metrics_history)
                ]
            }
            
            with open(filepath, 'w') as f:
                json.dump(data, f, indent=2)
            
            logger.info(f"Metrics exported to {filepath}")
        except Exception as e:
            logger.error(f"Failed to export metrics: {e}")


# Global metrics tracker instance
_metrics_tracker: Optional[MetricsTracker] = None


def get_metrics_tracker() -> MetricsTracker:
    """Get or create global metrics tracker"""
    global _metrics_tracker
    if _metrics_tracker is None:
        _metrics_tracker = MetricsTracker()
    return _metrics_tracker


def record_metrics(metrics: PerformanceMetrics):
    """Convenience function to record metrics"""
    tracker = get_metrics_tracker()
    tracker.record(metrics)


def get_performance_stats(window: str = "1min") -> Dict[str, Any]:
    """Convenience function to get performance stats"""
    tracker = get_metrics_tracker()
    return tracker.get_stats(window)

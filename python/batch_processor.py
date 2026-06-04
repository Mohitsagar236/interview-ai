"""
Batch Request Processor for Interview AI
Processes multiple AI requests in parallel for improved throughput
"""

import asyncio
import logging
import time
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class RequestPriority(str, Enum):
    """Request priority levels"""
    HIGH = "high"      # Real-time transcription responses
    NORMAL = "normal"  # User-triggered questions
    LOW = "low"        # Background processing


@dataclass
class BatchRequest:
    """Single request in a batch"""
    id: str
    prompt: str
    context: Optional[str] = None
    model: Optional[str] = None
    priority: RequestPriority = RequestPriority.NORMAL
    max_tokens: int = 1000
    temperature: float = 0.1
    callback: Optional[callable] = None
    session_id: Optional[str] = None


@dataclass
class BatchResponse:
    """Response for a batch request"""
    request_id: str
    response: str
    success: bool
    error: Optional[str] = None
    latency_ms: float = 0
    tokens_used: int = 0
    cost_usd: float = 0


class BatchProcessor:
    """
    Intelligent batch processor for AI requests.
    Combines multiple requests for parallel processing while respecting priorities.
    """
    
    def __init__(
        self,
        max_batch_size: int = 5,
        batch_timeout_seconds: float = 0.5,
        max_parallel_batches: int = 3
    ):
        """
        Initialize batch processor.
        
        Args:
            max_batch_size: Maximum requests per batch
            batch_timeout_seconds: Max time to wait for batch to fill
            max_parallel_batches: Number of batches to process simultaneously
        """
        self.max_batch_size = max_batch_size
        self.batch_timeout = batch_timeout_seconds
        self.max_parallel_batches = max_parallel_batches
        
        # Request queues by priority
        self.high_priority_queue: List[BatchRequest] = []
        self.normal_priority_queue: List[BatchRequest] = []
        self.low_priority_queue: List[BatchRequest] = []
        
        # Processing state
        self.active_batches = 0
        self.lock = asyncio.Lock()
        
        # Statistics
        self.total_processed = 0
        self.total_batches = 0
        self.total_latency = 0
        
        logger.info(f"BatchProcessor initialized: max_batch_size={max_batch_size}, timeout={batch_timeout_seconds}s")
    
    async def submit(self, request: BatchRequest) -> BatchResponse:
        """
        Submit a request for batch processing.
        
        Args:
            request: The batch request to process
            
        Returns:
            BatchResponse with the AI-generated content
        """
        start_time = time.perf_counter()
        
        # Add to appropriate priority queue
        async with self.lock:
            if request.priority == RequestPriority.HIGH:
                self.high_priority_queue.append(request)
            elif request.priority == RequestPriority.NORMAL:
                self.normal_priority_queue.append(request)
            else:
                self.low_priority_queue.append(request)
        
        # Process batches if we have capacity
        asyncio.create_task(self._process_batches())
        
        # Wait for response (simplified - in production use futures/callbacks)
        # For now, process immediately
        response = await self._process_single(request)
        
        latency_ms = (time.perf_counter() - start_time) * 1000
        response.latency_ms = latency_ms
        
        return response
    
    async def _process_batches(self):
        """Process queued requests in batches"""
        if self.active_batches >= self.max_parallel_batches:
            return
        
        async with self.lock:
            # Collect batch prioritizing high-priority requests
            batch = []
            
            # High priority first
            while self.high_priority_queue and len(batch) < self.max_batch_size:
                batch.append(self.high_priority_queue.pop(0))
            
            # Then normal priority
            while self.normal_priority_queue and len(batch) < self.max_batch_size:
                batch.append(self.normal_priority_queue.pop(0))
            
            # Finally low priority
            while self.low_priority_queue and len(batch) < self.max_batch_size:
                batch.append(self.low_priority_queue.pop(0))
            
            if not batch:
                return
            
            self.active_batches += 1
        
        try:
            # Process batch in parallel
            tasks = [self._process_single(req) for req in batch]
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Execute callbacks
            for req, resp in zip(batch, responses):
                if req.callback and not isinstance(resp, Exception):
                    try:
                        await req.callback(resp)
                    except Exception as e:
                        logger.error(f"Callback error for request {req.id}: {e}")
            
            self.total_batches += 1
            self.total_processed += len(batch)
            
            logger.debug(f"Processed batch of {len(batch)} requests")
            
        finally:
            async with self.lock:
                self.active_batches -= 1
    
    async def _process_single(self, request: BatchRequest) -> BatchResponse:
        """Process a single request"""
        try:
            # Import AI provider
            from ai_providers import generate_ai_response_for
            
            # Generate response
            response_text = await generate_ai_response_for(
                model=request.model or "openai/gpt-4o-mini",
                prompt=request.prompt,
                context=request.context or "",
                max_tokens=request.max_tokens,
                temperature=request.temperature
            )
            
            # Estimate tokens (rough approximation)
            tokens_used = len(response_text) // 4
            
            # Estimate cost (very rough - should use actual model pricing)
            cost_usd = tokens_used * 0.000001  # Placeholder
            
            return BatchResponse(
                request_id=request.id,
                response=response_text,
                success=True,
                tokens_used=tokens_used,
                cost_usd=cost_usd
            )
            
        except Exception as e:
            logger.error(f"Batch processing error for request {request.id}: {e}")
            return BatchResponse(
                request_id=request.id,
                response="",
                success=False,
                error=str(e)
            )
    
    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        avg_latency = self.total_latency / self.total_processed if self.total_processed > 0 else 0
        
        return {
            "total_processed": self.total_processed,
            "total_batches": self.total_batches,
            "active_batches": self.active_batches,
            "avg_latency_ms": avg_latency,
            "queue_sizes": {
                "high": len(self.high_priority_queue),
                "normal": len(self.normal_priority_queue),
                "low": len(self.low_priority_queue)
            }
        }


# Global batch processor instance
_batch_processor: Optional[BatchProcessor] = None


def get_batch_processor() -> BatchProcessor:
    """Get or create global batch processor"""
    global _batch_processor
    if _batch_processor is None:
        _batch_processor = BatchProcessor()
    return _batch_processor


async def submit_batch_request(
    prompt: str,
    context: str = "",
    model: str = None,
    priority: RequestPriority = RequestPriority.NORMAL,
    session_id: str = None
) -> str:
    """
    Convenience function to submit a batch request.
    
    Args:
        prompt: The user prompt
        context: Additional context
        model: Model to use (optional)
        priority: Request priority
        session_id: User session ID
        
    Returns:
        AI-generated response text
    """
    import uuid
    
    processor = get_batch_processor()
    
    request = BatchRequest(
        id=str(uuid.uuid4()),
        prompt=prompt,
        context=context,
        model=model,
        priority=priority,
        session_id=session_id
    )
    
    response = await processor.submit(request)
    
    if response.success:
        return response.response
    else:
        raise Exception(f"Batch request failed: {response.error}")

# -*- coding: utf-8 -*-
"""
Response Streaming Optimizer
Ultra-low latency streaming for real-time AI responses.
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import AsyncGenerator, Callable, Optional, List
from collections import deque

logger = logging.getLogger(__name__)


@dataclass
class StreamConfig:
    """Configuration for streaming optimization"""
    # Yield timing
    max_buffer_time_ms: float = 10.0  # Max time before forcing yield (10ms = ultra-fast)
    min_chunk_size: int = 1  # Minimum characters to yield (1 = instant)
    max_chunk_size: int = 100  # Maximum characters per yield
    
    # Sentence detection
    sentence_boundaries: tuple = ('.', '!', '?', '\n', '```')
    yield_on_sentence: bool = True
    
    # Code block handling
    preserve_code_blocks: bool = True
    
    # Latency tracking
    track_latency: bool = True


class StreamingOptimizer:
    """
    Optimizes LLM response streaming for minimal perceived latency.
    
    Features:
    - Ultra-fast first-token delivery
    - Smart buffering for sentence boundaries
    - Code block preservation
    - Latency metrics tracking
    """
    
    def __init__(self, config: Optional[StreamConfig] = None):
        self.config = config or StreamConfig()
        
        # Metrics
        self.first_token_time: Optional[float] = None
        self.total_tokens: int = 0
        self.total_chars: int = 0
        self.start_time: Optional[float] = None
        
        # State
        self.buffer: str = ""
        self.in_code_block: bool = False
        self.last_yield_time: float = 0
        self.yields: List[str] = []
    
    def reset(self):
        """Reset optimizer state for new stream"""
        self.buffer = ""
        self.in_code_block = False
        self.last_yield_time = time.time()
        self.first_token_time = None
        self.total_tokens = 0
        self.total_chars = 0
        self.start_time = time.time()
        self.yields = []
    
    async def process_stream(
        self,
        token_generator: AsyncGenerator[str, None],
        on_token: Optional[Callable[[str], None]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Process an incoming token stream with optimization.
        
        Args:
            token_generator: Async generator yielding tokens
            on_token: Optional callback for each yielded chunk
            
        Yields:
            Optimized text chunks
        """
        self.reset()
        
        async for token in token_generator:
            # Track first token time
            if self.first_token_time is None:
                self.first_token_time = time.time()
                latency_ms = (self.first_token_time - self.start_time) * 1000
                logger.info(f"⚡ First token latency: {latency_ms:.0f}ms")
            
            self.total_tokens += 1
            self.total_chars += len(token)
            
            # Track code blocks
            if '```' in token:
                self.in_code_block = not self.in_code_block
            
            # Add to buffer
            self.buffer += token
            
            # Decide when to yield
            chunks_to_yield = self._decide_yield()
            
            for chunk in chunks_to_yield:
                if chunk:
                    self.yields.append(chunk)
                    if on_token:
                        on_token(chunk)
                    yield chunk
        
        # Flush remaining buffer
        if self.buffer:
            self.yields.append(self.buffer)
            if on_token:
                on_token(self.buffer)
            yield self.buffer
            self.buffer = ""
        
        # Log final metrics
        if self.config.track_latency and self.start_time:
            total_time = time.time() - self.start_time
            tokens_per_sec = self.total_tokens / total_time if total_time > 0 else 0
            chars_per_sec = self.total_chars / total_time if total_time > 0 else 0
            logger.info(
                f"📊 Stream complete: {self.total_tokens} tokens, "
                f"{self.total_chars} chars in {total_time:.2f}s "
                f"({tokens_per_sec:.0f} tok/s, {chars_per_sec:.0f} char/s)"
            )
    
    def _decide_yield(self) -> List[str]:
        """Decide what to yield from the buffer"""
        chunks = []
        now = time.time()
        time_since_yield = (now - self.last_yield_time) * 1000  # ms
        
        # ULTRA-FAST mode: always yield immediately
        if self.config.min_chunk_size == 1 and self.buffer:
            chunks.append(self.buffer)
            self.buffer = ""
            self.last_yield_time = now
            return chunks
        
        # Force yield if time threshold exceeded
        if time_since_yield >= self.config.max_buffer_time_ms:
            if self.buffer:
                chunks.append(self.buffer)
                self.buffer = ""
                self.last_yield_time = now
            return chunks
        
        # Preserve code blocks (don't split mid-block)
        if self.in_code_block and self.config.preserve_code_blocks:
            # Only yield complete lines in code blocks
            if '\n' in self.buffer:
                lines = self.buffer.split('\n')
                # Keep last incomplete line in buffer
                to_yield = '\n'.join(lines[:-1]) + '\n'
                self.buffer = lines[-1]
                if to_yield.strip():
                    chunks.append(to_yield)
                    self.last_yield_time = now
            return chunks
        
        # Yield on sentence boundaries
        if self.config.yield_on_sentence:
            for boundary in self.config.sentence_boundaries:
                if boundary in self.buffer:
                    idx = self.buffer.rfind(boundary)
                    to_yield = self.buffer[:idx + len(boundary)]
                    self.buffer = self.buffer[idx + len(boundary):]
                    if to_yield.strip():
                        chunks.append(to_yield)
                        self.last_yield_time = now
                    break
        
        # Yield if buffer exceeds max size
        if len(self.buffer) >= self.config.max_chunk_size:
            # Try to break at word boundary
            last_space = self.buffer.rfind(' ', 0, self.config.max_chunk_size)
            if last_space > self.config.min_chunk_size:
                to_yield = self.buffer[:last_space + 1]
                self.buffer = self.buffer[last_space + 1:]
            else:
                to_yield = self.buffer[:self.config.max_chunk_size]
                self.buffer = self.buffer[self.config.max_chunk_size:]
            
            if to_yield:
                chunks.append(to_yield)
                self.last_yield_time = now
        
        return chunks
    
    def get_metrics(self) -> dict:
        """Get streaming performance metrics"""
        total_time = (time.time() - self.start_time) if self.start_time else 0
        
        return {
            'first_token_latency_ms': (
                (self.first_token_time - self.start_time) * 1000
                if self.first_token_time and self.start_time else None
            ),
            'total_tokens': self.total_tokens,
            'total_chars': self.total_chars,
            'total_time_s': total_time,
            'tokens_per_second': self.total_tokens / total_time if total_time > 0 else 0,
            'chars_per_second': self.total_chars / total_time if total_time > 0 else 0,
            'yield_count': len(self.yields),
            'avg_yield_size': sum(len(y) for y in self.yields) / len(self.yields) if self.yields else 0
        }


class TokenBuffer:
    """
    High-performance token buffer with backpressure handling.
    Useful for buffering between producer (LLM API) and consumer (WebSocket).
    """
    
    def __init__(self, max_size: int = 1000):
        self.buffer: deque = deque(maxlen=max_size)
        self.lock = asyncio.Lock()
        self.not_empty = asyncio.Event()
        self.closed = False
    
    async def put(self, token: str):
        """Add token to buffer"""
        async with self.lock:
            self.buffer.append(token)
            self.not_empty.set()
    
    async def get(self) -> Optional[str]:
        """Get next token from buffer (waits if empty)"""
        while True:
            async with self.lock:
                if self.buffer:
                    token = self.buffer.popleft()
                    if not self.buffer:
                        self.not_empty.clear()
                    return token
                
                if self.closed:
                    return None
            
            # Wait for tokens
            await self.not_empty.wait()
    
    async def get_all(self) -> List[str]:
        """Get all available tokens without waiting"""
        async with self.lock:
            tokens = list(self.buffer)
            self.buffer.clear()
            self.not_empty.clear()
            return tokens
    
    def close(self):
        """Mark buffer as closed (no more tokens coming)"""
        self.closed = True
        self.not_empty.set()  # Wake up waiters
    
    def __len__(self):
        return len(self.buffer)


# Convenience function
def create_optimizer(
    ultra_fast: bool = True,
    track_latency: bool = True
) -> StreamingOptimizer:
    """Create a streaming optimizer with common configurations"""
    if ultra_fast:
        config = StreamConfig(
            max_buffer_time_ms=5.0,  # 5ms max latency
            min_chunk_size=1,  # Yield every character
            max_chunk_size=50,
            yield_on_sentence=False,  # Don't wait for sentences
            track_latency=track_latency
        )
    else:
        config = StreamConfig(
            max_buffer_time_ms=50.0,  # 50ms max latency
            min_chunk_size=5,
            max_chunk_size=100,
            yield_on_sentence=True,
            track_latency=track_latency
        )
    
    return StreamingOptimizer(config)

# -*- coding: utf-8 -*-
"""
Groq API Provider for Ultra-Fast LLM Inference
Provides 500+ tokens/second using Groq's Language Processing Units (LPUs)
"""

import asyncio
import json
import logging
import os
import time
from typing import AsyncGenerator, Dict, List, Optional, Any
import httpx

logger = logging.getLogger(__name__)


class GroqProvider:
    """
    Groq API provider for ultra-fast inference.
    Uses specialized LPU hardware for 500+ tokens/second.
    """
    
    GROQ_BASE_URL = "https://api.groq.com/openai/v1"
    
    # Recommended models (ordered by speed/quality tradeoff)
    MODELS = {
        "llama-3.3-70b-versatile": {"speed": "fast", "quality": "high", "context": 128000},
        "llama-3.1-8b-instant": {"speed": "ultra-fast", "quality": "good", "context": 128000},
        "mixtral-8x7b-32768": {"speed": "fast", "quality": "high", "context": 32768},
        "gemma2-9b-it": {"speed": "ultra-fast", "quality": "good", "context": 8192},
    }
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        self.model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        self.initialized = False
        self._client: Optional[httpx.AsyncClient] = None
        
        if not self.api_key:
            logger.warning("Groq API key not found. Set GROQ_API_KEY to enable ultra-fast inference.")
    
    def is_available(self) -> bool:
        """Check if Groq is available"""
        return bool(self.api_key)
    
    async def initialize(self):
        """Initialize the async HTTP client"""
        if self._client:
            return
        
        timeout = httpx.Timeout(60.0, connect=5.0)
        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            },
            http2=True
        )
        self.initialized = True
        logger.info(f"✅ Groq provider initialized with model: {self.model}")
    
    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048,
        temperature: float = 0.1
    ) -> AsyncGenerator[str, None]:
        """
        Stream response from Groq API.
        
        Groq is typically 10-50x faster than OpenAI for the same model size.
        """
        if not self.is_available():
            yield "[ERROR: Groq API key not configured]"
            return
        
        if not self._client:
            await self.initialize()
        
        try:
            payload = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": True
            }
            
            start_time = time.time()
            token_count = 0
            
            async with self._client.stream(
                "POST",
                f"{self.GROQ_BASE_URL}/chat/completions",
                json=payload
            ) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    logger.error(f"Groq API error: {response.status_code} - {error_text}")
                    yield f"[ERROR: Groq API returned {response.status_code}]"
                    return
                
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    
                    data = line[6:]  # Remove "data: " prefix
                    if data == "[DONE]":
                        break
                    
                    try:
                        chunk = json.loads(data)
                        if "choices" in chunk and chunk["choices"]:
                            delta = chunk["choices"][0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                token_count += 1
                                yield content
                    except json.JSONDecodeError:
                        continue
            
            elapsed = time.time() - start_time
            tokens_per_sec = token_count / elapsed if elapsed > 0 else 0
            logger.info(f"⚡ Groq: {token_count} tokens in {elapsed:.2f}s ({tokens_per_sec:.0f} tok/s)")
            
        except httpx.TimeoutException:
            yield "[ERROR: Groq request timed out]"
        except Exception as e:
            logger.error(f"Groq streaming error: {e}")
            yield f"[ERROR: {str(e)}]"
    
    async def generate_complete(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 2048,
        temperature: float = 0.1
    ) -> str:
        """Generate complete (non-streaming) response"""
        if not self.is_available():
            return "[ERROR: Groq API key not configured]"
        
        if not self._client:
            await self.initialize()
        
        try:
            payload = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False
            }
            
            start_time = time.time()
            
            response = await self._client.post(
                f"{self.GROQ_BASE_URL}/chat/completions",
                json=payload
            )
            
            if response.status_code != 200:
                return f"[ERROR: Groq API returned {response.status_code}]"
            
            result = response.json()
            elapsed = time.time() - start_time
            
            if "choices" in result and result["choices"]:
                content = result["choices"][0]["message"]["content"]
                usage = result.get("usage", {})
                total_tokens = usage.get("total_tokens", 0)
                logger.info(f"⚡ Groq complete: {total_tokens} tokens in {elapsed:.2f}s")
                return content
            
            return "[ERROR: No response from Groq]"
            
        except Exception as e:
            logger.error(f"Groq generation error: {e}")
            return f"[ERROR: {str(e)}]"
    
    async def close(self):
        """Close the HTTP client"""
        if self._client:
            await self._client.aclose()
            self._client = None


# Global instance
_groq_provider: Optional[GroqProvider] = None


def get_groq_provider() -> GroqProvider:
    """Get or create the global Groq provider instance"""
    global _groq_provider
    if _groq_provider is None:
        _groq_provider = GroqProvider()
    return _groq_provider


async def generate_with_groq(
    prompt: str,
    system_prompt: str = "You are a helpful AI assistant.",
    max_tokens: int = 2048,
    temperature: float = 0.1,
    stream: bool = True
) -> AsyncGenerator[str, None] | str:
    """
    Convenience function to generate with Groq.
    
    Usage:
        # Streaming
        async for chunk in generate_with_groq("Hello", stream=True):
            print(chunk, end="")
        
        # Complete
        response = await generate_with_groq("Hello", stream=False)
    """
    provider = get_groq_provider()
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt}
    ]
    
    if stream:
        return provider.generate_stream(messages, max_tokens, temperature)
    else:
        return await provider.generate_complete(messages, max_tokens, temperature)

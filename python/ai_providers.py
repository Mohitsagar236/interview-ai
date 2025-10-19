"""
OpenAI Provider Module
Supports OpenAI API with proper formatting and response handling.
"""

import asyncio
import json
import logging
import os
import requests  # kept for sync complete responses
import re
import base64
import time
from typing import AsyncGenerator, Dict, List, Optional, Any
from dataclasses import dataclass
import httpx  # new async client

logger = logging.getLogger(__name__)


@dataclass
class AIConfig:
    model: str = "gpt-4o-mini"
    base_url: str = "https://api.openai.com/v1"
    # Set to 0 to allow unlimited tokens (model decides completion length)
    max_new_tokens: int = 0
    temperature: float = 0.2
    allow_auto_continue: bool = True  # whether server may trigger continuation passes


class MessageFormatter:
    """Utility class for formatting messages and responses"""
    
    @staticmethod
    def format_user_message(content: str, context: str = "") -> List[Dict[str, str]]:
        """Format user input into proper message format with clear system instructions"""
        messages = []
        # Add enhanced system context with clear instructions
        system_instruction = """You are a helpful AI assistant for technical interview preparation.

CRITICAL INTERVIEW BEHAVIOR:
1. Always answer the interviewer's question directly in the first sentence or two. Give a concise direct answer first, then (if useful) add a short elaboration in 2-4 sentences.
2. Stay strictly on-topic: do not invent context or introduce unrelated examples unless the question asks for them.
3. If asked a multi-part question, label answers clearly: "Answer 1:", "Answer 2:", etc., and address each part explicitly.
4. When giving examples, ensure they directly illustrate the point asked for and are brief.
5. If the question asks for personal experience, answer with a single specific example and focus on facts (what you did, result, and learning).

CRITICAL TECHNICAL INSTRUCTIONS:
6. When asked for code, provide CLEAN, RUNNABLE code only. Do not include extra commentary inside the code block unless explicitly requested.
7. If providing explanations, keep them separate from the code and mark sections clearly.
8. For algorithm problems, structure responses as: brief understanding, code, then explanation and complexity.
9. Be precise and thorough — do not provide partial answers. If you cannot answer, state what information is missing.

FORMAT RULE (strict):
- Start with a one-line direct answer.
- If more detail is needed, provide a short elaboration paragraph (2-4 sentences).
- For multi-part questions, explicitly label each part.
- End with a single-sentence summary.

Use this policy for every response in this interview context. If unsure, ask a brief clarifying question before answering."""

        if context and context.strip():
            system_instruction += f"\n\nAdditional Context: {context.strip()}"
        messages.append({"role": "system", "content": system_instruction})
        # Add user message
        messages.append({"role": "user", "content": content.strip()})
        return messages
    
    @staticmethod
    def clean_response(text: str) -> str:
        """Clean and format AI response - preserve natural AI output"""
        # Preserve AI's natural formatting, but fix common cases where newlines
        # or tabs are returned as the literal sequences "\\n", "\\t" or
        # duplicated like "\\\\n". Also convert simple HTML breaks.
        if not isinstance(text, str):
            return text

        # Normalize simple HTML line breaks
        text = text.replace('<br/>', '\n').replace('<br>', '\n')

        # Convert literal escaped sequences (handles "\\n", "\\\\n", etc.)
        # into actual newlines/tabs so code blocks and indentation render correctly.
        try:
            # Replace one-or-more backslashes followed by n/t/r with the actual char
            text = re.sub(r'\\+n', '\n', text)
            text = re.sub(r'\\+r', '\r', text)
            text = re.sub(r'\\+t', '\t', text)
        except Exception:
            # If regex fails for any reason, fall back to original text
            pass

        # Only strip trailing whitespace/newlines — preserve internal formatting
        return text.rstrip()
    
    @staticmethod
    def is_complete_response(text: str) -> bool:
        """Check if response appears complete"""
        text = text.strip()
        if not text:
            return False
        
        # Check for common completion indicators
        complete_endings = ['.', '!', '?', '```', '</code>', '</pre>']
        return any(text.endswith(ending) for ending in complete_endings)


class OpenAIProvider:
    def __init__(self, config: AIConfig):
        self.config = config
        # Enforce OpenRouter only
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        self.initialized = False
        self.formatter = MessageFormatter()
        self._async_client: Optional[httpx.AsyncClient] = None
        # Optionally emit smallest chunks immediately when STREAM_CHUNK_MODE=fast
        # Changed default to "fast" to prevent hanging on incomplete sentences
        self.stream_mode = os.getenv("STREAM_CHUNK_MODE", "fast").lower().strip() or "fast"
        # Response cache for frequent queries (LRU)
        self._cache: Dict[str, tuple[str, float]] = {}
        self._cache_max_size = 50
        self._cache_ttl = 300  # 5 minutes
        # Fallback models - use stable, known-working models
        self._fallback_models: List[str] = [
            os.getenv("FALLBACK_LLM_PRIMARY", "openai/gpt-4o-mini"),
            "openai/gpt-4o-mini",  # Reliable fallback
            "anthropic/claude-3.5-sonnet"  # Secondary fallback
        ]
        # Track models already tried for a single request to avoid loops
        self._attempted_models: set[str] = set()

    def _next_fallback_model(self) -> Optional[str]:
        """Return the next fallback model not yet attempted.
        Resets attempts if all exhausted to prevent permanent lock-out (but avoids infinite recursion)."""
        # Mark current as attempted
        self._attempted_models.add(self.config.model)
        for candidate in self._fallback_models:
            if candidate and candidate not in self._attempted_models:
                return candidate
        # Exhausted: clear and stop further automatic fallback this cycle
        self._attempted_models.clear()
        return None

    @staticmethod
    def _normalize_model_slug(slug: str) -> str:
        """Normalize common alias typos - xAI uses 'x-ai/' prefix on OpenRouter."""
        # No normalization needed - return as-is
        # OpenRouter uses exact model IDs from their registry
        return slug
    
    async def initialize(self):
        """Initialize the OpenAI provider"""
        if not self.api_key:
            logger.error("OpenRouter API key not set. Set OPENROUTER_API_KEY in environment.")
            self.initialized = False
            return
        # Normalize model slug early
        normalized = self._normalize_model_slug(self.config.model)
        if normalized != self.config.model:
            logger.info(f"Normalizing model slug '{self.config.model}' -> '{normalized}'")
            self.config.model = normalized
        if not self._async_client:
            # Reuse a single async client with connection pooling (better connection reuse / latency)
            # Increased timeouts for better reliability with OpenRouter
            timeout = httpx.Timeout(120.0, connect=15.0, read=120.0, write=30.0)
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "User-Agent": "InterviewAI/1.0"
            }
            # OpenRouter requires additional attribution headers for some routing / rate-limit grouping
            if "openrouter.ai" in self.config.base_url:
                headers.update({
                    "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost"),
                    "X-Title": os.getenv("OPENROUTER_SITE_NAME", "Interview AI Assistant")
                })
            # Enable connection pooling for better performance
            limits = httpx.Limits(max_keepalive_connections=10, max_connections=20, keepalive_expiry=30.0)
            # Try to enable HTTP/2 if h2 package is available
            try:
                self._async_client = httpx.AsyncClient(
                    timeout=timeout, 
                    headers=headers,
                    limits=limits,
                    http2=True  # Enable HTTP/2 for multiplexing if available
                )
                logger.info("HTTP/2 enabled for better performance")
            except Exception as e:
                # Fallback to HTTP/1.1 if h2 is not installed
                logger.info("HTTP/2 not available, using HTTP/1.1 (install httpx[http2] for better performance)")
                self._async_client = httpx.AsyncClient(
                    timeout=timeout, 
                    headers=headers,
                    limits=limits,
                    http2=False
                )
        logger.info(f"OpenAI initialized with model: {self.config.model}")
        self.initialized = True
    
    def is_available(self) -> bool:
        """Check if OpenAI API key is available"""
        return bool(self.api_key)

    async def generate_image(self, prompt: str, size: str = "512x512") -> Optional[Dict[str, str]]:
        """Generate an image using OpenAI Images API (DALL-E style) if enabled.
        Returns dict with keys: b64, format, prompt. If not available returns None.
        """
        if not self.is_available():
            return None
        if not os.getenv("ENABLE_IMAGE_GEN", "1").lower() in ("1", "true", "yes", "on"):
            return None
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1"),
                "prompt": prompt[:2000],
                "size": size,
                "n": 1,
                "response_format": "b64_json"
            }
            resp = requests.post(f"{self.config.base_url}/images/generations", headers=headers, json=payload, timeout=90)
            if resp.status_code != 200:
                logger.warning("Image generation failed HTTP %s", resp.status_code)
                return None
            data = resp.json()
            if not data.get("data"):
                return None
            b64 = data["data"][0].get("b64_json")
            if not b64:
                return None
            return {"b64": b64, "format": "png", "prompt": prompt}
        except Exception as e:
            logger.warning("Image generation error: %s", e)
            return None

    def _get_cache_key(self, messages: List[Dict[str, str]]) -> str:
        """Generate cache key from messages"""
        import hashlib
        key_str = json.dumps(messages, sort_keys=True) + f"|{self.config.model}|{self.config.temperature}"
        return hashlib.md5(key_str.encode()).hexdigest()
    
    def _get_cached(self, cache_key: str) -> Optional[str]:
        """Get cached response if valid"""
        if cache_key in self._cache:
            response, timestamp = self._cache[cache_key]
            if time.time() - timestamp < self._cache_ttl:
                return response
            else:
                del self._cache[cache_key]
        return None
    
    def _set_cached(self, cache_key: str, response: str):
        """Cache response with LRU eviction"""
        if len(self._cache) >= self._cache_max_size:
            # Remove oldest entry
            oldest_key = min(self._cache.keys(), key=lambda k: self._cache[k][1])
            del self._cache[oldest_key]
        self._cache[cache_key] = (response, time.time())

    async def generate_complete_response(self, messages: List[Dict[str, str]]) -> str:
        """Generate a complete formatted response (non-streaming)"""
        if not self.initialized:
            await self.initialize()
        
        if not self.initialized:
            return "[ERROR: OpenAI not available - API key missing]"
        
        # Validate messages format
        if not messages or not isinstance(messages, list):
            return "[ERROR: Invalid messages format]"
        
        # Check cache first
        cache_key = self._get_cache_key(messages)
        cached = self._get_cached(cache_key)
        if cached:
            logger.debug("Returning cached response")
            return cached
        
        try:
            # Normalize before request in case caller changed it externally
            self.config.model = self._normalize_model_slug(self.config.model)
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "InterviewAI/1.0"
            }
            if "openrouter.ai" in self.config.base_url:
                headers.update({
                    "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost"),
                    "X-Title": os.getenv("OPENROUTER_SITE_NAME", "Interview AI Assistant")
                })
            
            # Build payload - omit max_tokens for unlimited, or set very high limit
            payload = {
                "model": self.config.model,
                "messages": messages,
                "temperature": self.config.temperature,
                "stream": False  # Non-streaming for complete response
            }
            # Allow model to generate complete responses - only limit if explicitly set and reasonable
            if self.config.max_new_tokens and self.config.max_new_tokens > 0:
                # Cap at reasonable maximum to allow complete responses (128k for models that support it)
                payload["max_tokens"] = min(self.config.max_new_tokens, 128000)
            # If max_new_tokens is 0 or not set, omit max_tokens - let model complete naturally
            
            response = requests.post(
                f"{self.config.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=120
            )
            
            if response.status_code != 200:
                try:
                    error_detail = response.json()
                    if "error" in error_detail and "message" in error_detail["error"]:
                        msg = error_detail['error']['message']
                        # Auto-switch on endpoint absence
                        if ("No endpoints found" in msg or "not found" in msg or "not a valid model" in msg.lower()):
                            new_model = self._next_fallback_model()
                            if new_model:
                                logger.warning(f"Model {self.config.model} unavailable. Falling back to {new_model} (non-streaming complete)")
                                self.config.model = new_model
                                return await self.generate_complete_response(messages)
                        return f"[ERROR: {msg}]"
                except:
                    pass
                return f"[ERROR: OpenAI API returned {response.status_code}]"
            
            result = response.json()
            
            if "choices" in result and result["choices"]:
                content = result["choices"][0]["message"]["content"]
                # Clean and format the response
                formatted_content = self.formatter.clean_response(content)
                # Cache the response
                self._set_cached(cache_key, formatted_content)
                return formatted_content
            else:
                return "[ERROR: No response content received]"
                
        except requests.exceptions.Timeout:
            return "[ERROR: Request timed out]"
        except requests.exceptions.ConnectionError:
            return "[ERROR: Connection failed]"
        except Exception as e:
            logger.error(f"OpenAI generation error: {e}")
            return f"[ERROR: {str(e)}]"

    
    async def generate_stream(self, messages: List[Dict[str, str]], retry_count: int = 0) -> AsyncGenerator[str, None]:
        """Generate streaming response from OpenAI with retry logic"""
        if not self.initialized:
            await self.initialize()
        
        if not self.initialized:
            yield "[ERROR: OpenAI not available - API key missing]"
            return
        
        # Validate messages format
        if not messages or not isinstance(messages, list):
            yield "[ERROR: Invalid messages format]"
            return
        
        max_retries = 2
        
        try:
            assert self._async_client is not None
            self.config.model = self._normalize_model_slug(self.config.model)
            headers = {"Content-Type": "application/json"}
            if "openrouter.ai" in self.config.base_url:
                headers.update({
                    "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost"),
                    "X-Title": os.getenv("OPENROUTER_SITE_NAME", "Interview AI Assistant")
                })
            payload = {
                "model": self.config.model,
                "messages": messages,
                "temperature": self.config.temperature,
                "stream": True,
                "presence_penalty": 0.0,
                "frequency_penalty": 0.0
            }
            if self.config.max_new_tokens and self.config.max_new_tokens > 0:
                # Allow very high token limits for complete responses (up to 100k)
                payload["max_tokens"] = min(self.config.max_new_tokens, 100000)
            # If max_new_tokens is 0, omit max_tokens entirely - let model decide completion length
            logger.info(f"Streaming from model: {self.config.model} (mode={self.stream_mode}, max_tokens={payload.get('max_tokens', 'unlimited')})")
            
            token_count = 0
            last_log_time = time.time()
            
            # Configurable timeouts from environment for aggressive flushing
            FORCE_YIELD_AFTER = float(os.getenv("STREAM_FORCE_YIELD_SECONDS", "0.01"))  # 10ms default - INSTANT
            BUFFER_THRESHOLD = int(os.getenv("STREAM_BUFFER_THRESHOLD", "1"))  # 1 char - INSTANT
            FORCE_FLUSH_THRESHOLD = max(5, BUFFER_THRESHOLD * 3)  # Minimum 5 chars
            
            logger.info(f"🚀 ULTRA-AGGRESSIVE Stream config: yield={FORCE_YIELD_AFTER}s, buffer={BUFFER_THRESHOLD}, flush={FORCE_FLUSH_THRESHOLD}")
            
            async with self._async_client.stream(
                "POST",
                f"{self.config.base_url}/chat/completions",
                headers=headers,
                json=payload,
            ) as resp:
                if resp.status_code != 200:
                    try:
                        detail = await resp.aread()
                        logger.error(f"API error {resp.status_code}: {detail.decode()[:200]}")
                        err_json = json.loads(detail)
                        err_msg = err_json.get("error", {}).get("message") if isinstance(err_json, dict) else None
                        if err_msg and ("No endpoints found" in err_msg or "not found" in err_msg or "not a valid model" in err_msg.lower()):
                            new_model = self._next_fallback_model()
                            if new_model:
                                logger.warning(f"Model {self.config.model} unavailable. Falling back to {new_model} (stream)")
                                self.config.model = new_model
                                # Recurse with new model
                                async for t in self.generate_stream(messages):
                                    yield t
                                return
                        yield f"[ERROR: {err_msg or 'HTTP ' + str(resp.status_code)}]"
                    except Exception:
                        yield f"[ERROR: HTTP {resp.status_code}]"
                    return
                buffer = ""
                sentence_endings = {'.', '!', '?', '\n'}
                finish_reason = None
                last_yield_time = time.time()
                
                async for raw_line in resp.aiter_lines():
                    if not raw_line:
                        continue
                    if not raw_line.startswith("data:"):
                        continue
                    datum = raw_line[5:].strip()
                    if datum == "[DONE]":
                        logger.info(f"✅ Stream DONE signal received")
                        if buffer.strip():
                            logger.info(f"📤 Flushing final buffer: '{buffer[:50]}'")
                            yield buffer
                        if finish_reason == 'length':
                            logger.warning("⚠️  Response truncated by length limit")
                            yield '[[TRUNCATED_BY_LENGTH]]'
                        logger.info(f"🏁 Stream completed: {token_count} total tokens")
                        break
                    try:
                        j = json.loads(datum)
                    except Exception:
                        continue
                    choices = j.get("choices", [])
                    if not choices:
                        continue
                    delta = choices[0].get("delta", {})
                    if 'finish_reason' in choices[0] and choices[0]['finish_reason']:
                        finish_reason = choices[0]['finish_reason']
                    content = delta.get('content')
                    if not content:
                        continue
                    
                    token_count += 1
                    
                    # CRITICAL: Log EVERY token in fast mode for debugging
                    if self.stream_mode == 'fast' and token_count <= 10:
                        logger.info(f"🔥 Token #{token_count}: '{content}'")
                    
                    # Log periodically (every 2 seconds)
                    current_time = time.time()
                    if (current_time - last_log_time) > 2.0:
                        logger.info(f"📊 Streaming progress: {token_count} tokens")
                        last_log_time = current_time
                    
                    # Fast mode: emit INSTANTLY - NO BUFFERING (default and recommended)
                    if self.stream_mode == 'fast':
                        logger.debug(f"⚡ Yielding immediately: '{content[:20]}'")
                        yield content
                        last_yield_time = time.time()
                        continue
                    
                    # Sentence mode with ULTRA-AGGRESSIVE timeouts
                    buffer += content
                    current_time = time.time()
                    
                    # CRITICAL: Force yield if buffer is getting old (prevents hanging)
                    # Reduced to env-configurable value (default 0.1s = 100ms) for instant response
                    if (current_time - last_yield_time) > FORCE_YIELD_AFTER:
                        if buffer.strip():
                            yield buffer
                            buffer = ""
                            last_yield_time = current_time
                        continue
                    
                    # Normal sentence-based yielding
                    while any(e in buffer for e in sentence_endings):
                        for ending in sentence_endings:
                            if ending in buffer:
                                parts = buffer.split(ending, 1)
                                if len(parts) > 1:
                                    yield parts[0] + ending
                                    buffer = parts[1]
                                    last_yield_time = current_time
                                break
                        else:
                            break
                    
                    # Yield on shorter buffers - use configurable threshold (default 20 chars)
                    if len(buffer) > BUFFER_THRESHOLD:
                        last_space = buffer.rfind(' ')
                        if last_space > (BUFFER_THRESHOLD // 2):
                            yield buffer[:last_space+1]
                            buffer = buffer[last_space+1:]
                            last_yield_time = current_time
                        elif len(buffer) > FORCE_FLUSH_THRESHOLD:
                            # Force yield even without space if buffer exceeds flush threshold
                            yield buffer
                            buffer = ""
                            last_yield_time = current_time
                
                # flush remaining
                if buffer.strip():
                    logger.info(f"📤 Final flush after loop: '{buffer[:50]}'")
                    yield buffer
                if finish_reason == 'length':
                    logger.warning("⚠️  Response ended with length limit")
                    yield '[[TRUNCATED_BY_LENGTH]]'
                
                logger.info(f"🏁 Streaming finished: {token_count} tokens total, finish_reason={finish_reason}")
                
        except (httpx.TimeoutException, httpx.ConnectTimeout, httpx.ReadTimeout) as e:
            logger.error(f"Request timed out (attempt {retry_count + 1}/{max_retries + 1}): {e}")
            if retry_count < max_retries:
                retry_delay = 2.0 * (retry_count + 1)  # Exponential backoff
                logger.info(f"Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                async for chunk in self.generate_stream(messages, retry_count + 1):
                    yield chunk
                return
            yield "[ERROR: Request timed out after retries. The AI may be overloaded or unavailable. Please try again later.]"
        except (httpx.TransportError, httpx.ConnectError) as e:
            logger.error(f"Connection failed (attempt {retry_count + 1}/{max_retries + 1}): {e}")
            if retry_count < max_retries:
                retry_delay = 2.0 * (retry_count + 1)
                logger.info(f"Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                async for chunk in self.generate_stream(messages, retry_count + 1):
                    yield chunk
                return
            yield "[ERROR: Connection failed after retries. Please check your internet connection and API configuration.]"
        except Exception as e:
            logger.error(f"OpenAI generation error: {e}", exc_info=True)
            yield f"[ERROR: {str(e)}. Please try again.]"


class AIManager:
    """Manages OpenAI provider with proper formatting"""
    
    def __init__(self):
        self.provider: Optional[OpenAIProvider] = None
        self.formatter = MessageFormatter()
        
    async def initialize(self):
        """Initialize OpenAI provider"""
        # NEW: support AI_MAX_TOKENS, AI_MAX_NEW_TOKENS (alias) and AI_AUTO_CONTINUE=0 to disable
        max_tokens_env = os.getenv("AI_MAX_TOKENS") or os.getenv("AI_MAX_NEW_TOKENS") or "0"
        try:
            max_tokens_val = int(max_tokens_env)
        except ValueError:
            max_tokens_val = 0
        # Hard ceiling safety - removed 32768 limit for unlimited mode
        if max_tokens_val < 0:
            # Interpret negative as "let model decide" (omit from payload)
            max_tokens_val = 0
        elif max_tokens_val > 100000:
            # Only cap at extreme values to prevent abuse
            max_tokens_val = 100000

        # Use OpenRouter with configurable model (default to GPT-4o-mini which is reliable)
        # Note: x.ai/grok models may have limited availability on OpenRouter
        config = AIConfig(
            model=os.getenv("DEFAULT_LLM", "openai/gpt-4o-mini"),
            base_url="https://openrouter.ai/api/v1",
            # Default to a low temperature for precise, on-question answers; can be overridden via env
            temperature=float(os.getenv("AI_TEMPERATURE", "0.2")),
            max_new_tokens=max_tokens_val,
            allow_auto_continue=os.getenv("AI_AUTO_CONTINUE", "1").lower() not in ("0", "false", "no", "off")
        )
        
        self.provider = OpenAIProvider(config)
        await self.provider.initialize()
    
    async def generate_stream(self, messages: List[Dict[str, str]]) -> AsyncGenerator[str, None]:
        """Generate streaming response using OpenAI"""
        if not self.provider or not self.provider.is_available():
            yield "[ERROR: OpenRouter not configured. Please set OPENROUTER_API_KEY in .env]"
            return
            
        async for token in self.provider.generate_stream(messages):
            yield token
    
    async def generate_complete_response(self, user_input: str, context: str = "") -> str:
        """Generate a complete, well-formatted response"""
        if not self.provider or not self.provider.is_available():
            return "[ERROR: OpenRouter not configured. Please set OPENROUTER_API_KEY in .env]"
        
        # Format the messages properly
        messages = self.formatter.format_user_message(user_input, context)
        
        # Get complete response
        response = await self.provider.generate_complete_response(messages)
        
        return response
    
    def get_status(self) -> Dict[str, Any]:
        """Get status of OpenAI provider"""
        status = {
            "provider": "OpenRouter" if "openrouter.ai" in os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1") else "OpenAI",
            "model": os.getenv("DEFAULT_LLM", "gpt-4o-mini"),
            "initialized": self.provider.initialized if self.provider else False,
            "available": self.provider.is_available() if self.provider else False,
            "base_url": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            "temperature": float(os.getenv("AI_TEMPERATURE", "0.2")),
            "max_tokens": self.provider.config.max_new_tokens
            if self.provider and self.provider.config.max_new_tokens else None,
            "auto_continue": self.provider.config.allow_auto_continue if self.provider else None
        }
        return status


# Global AI manager instance
ai_manager = AIManager()


async def initialize_ai():
    """Initialize the AI manager"""
    await ai_manager.initialize()


async def generate_ai_response(messages: List[Dict[str, str]]) -> AsyncGenerator[str, None]:
    """Generate AI response using OpenAI with proper formatting"""
    async for token in ai_manager.generate_stream(messages):
        yield token


async def generate_formatted_response(user_input: str, context: str = "") -> str:
    """Generate a complete, well-formatted AI response"""
    return await ai_manager.generate_complete_response(user_input, context)


async def generate_ai_response_for(llm_id: str, messages: List[Dict[str, str]]) -> AsyncGenerator[str, None]:
    """Generate using OpenAI (ignores llm_id parameter for compatibility)"""
    async for token in ai_manager.generate_stream(messages):
        yield token


def get_ai_status() -> Dict[str, Any]:
    """Get AI provider status"""
    return ai_manager.get_status()


def format_user_input(text: str, context: str = "") -> List[Dict[str, str]]:
    """Helper function to format user input into proper message format"""
    formatter = MessageFormatter()
    return formatter.format_user_message(text, context)

# -*- coding: utf-8 -*-
"""
OpenAI Provider Module
Supports OpenAI API with proper formatting and response handling.
"""

import asyncio
import json
import logging
import os
import re
import base64
import time
from typing import AsyncGenerator, Dict, List, Optional, Any
from dataclasses import dataclass
import httpx  # async HTTP client for non-blocking requests

logger = logging.getLogger(__name__)


@dataclass
class AIConfig:
    model: str = "gpt-4o-mini"
    base_url: str = "https://api.openai.com/v1"
    # LATENCY OPTIMIZATION: 1500 tokens = faster responses (30-45s)
    max_new_tokens: int = 1500
    # Lower temperature = faster, more deterministic responses
    temperature: float = 0.1
    allow_auto_continue: bool = False  # disabled for speed - single-pass only


@dataclass
class UserProviderConfig:
    """Runtime provider config from init_session (BYOK mode)"""
    provider: str = "openai"          # openai | anthropic | gemini | groq | openrouter | xai | ollama | custom
    api_key: str = ""
    model: str = ""
    base_url: str = ""


PROVIDER_BASE_URLS = {
    "openai":     "https://api.openai.com/v1",
    "anthropic":  "https://api.anthropic.com/v1",
    "gemini":     "https://generativelanguage.googleapis.com/v1beta/openai",
    "groq":       "https://api.groq.com/openai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "xai":        "https://api.x.ai/v1",
    "ollama":     "http://localhost:11434/v1",
    "custom":     "",
}

PROVIDER_DEFAULT_MODELS = {
    "openai":     "gpt-4o-mini",
    "anthropic":  "claude-3-5-haiku-latest",
    "gemini":     "gemini-1.5-flash",
    "groq":       "llama3-70b-8192",
    "openrouter": "openai/gpt-4o-mini",
    "xai":        "grok-beta",
    "ollama":     "llama3",
    "custom":     "",
}


class MessageFormatter:
    """Utility class for formatting messages and responses"""
    
    @staticmethod
    def format_user_message(content: str, context: str = "") -> List[Dict[str, str]]:
        """Format user input into proper message format with clear system instructions"""
        messages = []
        
        # OPTIMIZED SYSTEM PROMPT - Concise for lower latency while maintaining quality
        system_instruction = """You are an expert AI interview assistant. Provide clear, accurate, complete answers.

🎯 RESPONSE STANDARDS:
• Be thorough but concise - explain clearly without filler
• Provide working code with complexity analysis
• Use proper formatting: **bold**, `code`, LaTeX math
• Structure with headers and bullets for readability

📝 FOR CODE QUESTIONS:
• Give complete working solution with explanation
• Time/space complexity: $O(n)$, $O(1)$
• Multiple approaches if relevant
• Use proper syntax: ```python, ```javascript
• Include edge cases

📐 FOR MATH/TECHNICAL:
• LaTeX notation: $O(n \\log n)$, $$\\frac{a}{b}$$
• Step-by-step breakdown
• Worked examples

🏗️ FOR SYSTEM DESIGN:
• High-level overview → components → tradeoffs
• Scalability, consistency, latency considerations
• Specific technologies/tools

💼 FOR BEHAVIORAL:
• STAR framework (Situation, Task, Action, Result)
• Concrete examples with metrics
• Interview-length responses (1-2 min spoken)

🚫 AVOID:
• Generic filler phrases
• Meta-commentary about limitations
• Asking clarifying questions unless critical
• Incomplete or partial answers that require follow-up
• Overly verbose explanations - be comprehensive but concise

� ANSWER QUALITY CHECKLIST:
Before sending each response, ensure it:
✓ Directly answers the specific question asked
✓ Provides complete information (no "partial answers")
✓ Includes concrete examples or code when relevant
✓ Uses proper formatting (LaTeX, code blocks, structure)
✓ Is immediately useful without requiring follow-up
✓ Matches the depth and quality of ChatGPT responses

Remember: You're competing with ChatGPT. Every answer should be comprehensive, well-structured, technically accurate, and immediately actionable. Quality matters more than speed.
"""
        
        if context.strip():
            system_instruction += f"\n\n📌 **Additional Context:** {context.strip()}"
        
        messages.append({
            "role": "system", 
            "content": system_instruction
        })
        
        # Add user message
        messages.append({
            "role": "user",
            "content": content.strip()
        })
        
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
    def __init__(self, config: AIConfig, user_config: Optional["UserProviderConfig"] = None):
        self.config = config
        self._user_config = user_config
        self.api_key = None
        if user_config and user_config.api_key:
            # BYOK mode: use runtime-supplied key & endpoint
            self.api_key = user_config.api_key
            if user_config.base_url:
                self.config.base_url = user_config.base_url
            elif user_config.provider in PROVIDER_BASE_URLS:
                self.config.base_url = PROVIDER_BASE_URLS[user_config.provider]
            if user_config.model:
                self.config.model = user_config.model
            # Use provider default if model is empty or incompatible with the chosen provider
            provider_default = PROVIDER_DEFAULT_MODELS.get(user_config.provider, "")
            model = self.config.model or ""
            incompatible = (
                (user_config.provider == "groq" and ("/" in model and not model.startswith("llama") and not model.startswith("mixtral") and not model.startswith("gemma"))) or
                (user_config.provider == "gemini" and ("openai/" in model or "anthropic/" in model)) or
                (user_config.provider == "anthropic" and model and not model.startswith("claude")) or
                (user_config.provider == "openai" and model and "/" in model and not model.startswith("gpt") and not model.startswith("o1") and not model.startswith("o3")) or
                (not model and bool(provider_default))
            )
            if incompatible and provider_default:
                self.config.model = provider_default
                logger.info(f"Adjusted model to {provider_default} for provider {user_config.provider}")
            logger.info(f"✅ BYOK provider={user_config.provider} model={self.config.model}")
        else:
            self._resolve_api_key_and_base_url()
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

    def _resolve_api_key_and_base_url(self):
        """Resolve the best available API key and set the correct base URL.
        
        Priority order:
        1. OPENROUTER_API_KEY → base_url = openrouter.ai (can access ALL models)
        2. GROQ_API_KEY → base_url = api.groq.com (OpenAI-compatible, ultra-fast)
        3. OPENAI_API_KEY → base_url = api.openai.com (direct OpenAI)
        4. XAI_API_KEY → base_url = api.x.ai (OpenAI-compatible)
        """
        # Check OpenRouter first (gives access to all models)
        openrouter_key = os.getenv("OPENROUTER_API_KEY")
        if openrouter_key and openrouter_key.strip() and not openrouter_key.startswith("YOUR_"):
            self.api_key = openrouter_key
            self.config.base_url = "https://openrouter.ai/api/v1"
            logger.info("✅ Using OpenRouter API key (access to all models)")
            return
        
        # Check Groq (ultra-fast, free tier available)
        groq_key = os.getenv("GROQ_API_KEY")
        if groq_key and groq_key.strip() and not groq_key.startswith("YOUR_"):
            self.api_key = groq_key
            self.config.base_url = "https://api.groq.com/openai/v1"
            # Adjust model for Groq compatibility
            groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
            if "openai/" in self.config.model or "anthropic/" in self.config.model:
                self.config.model = groq_model
                logger.info(f"Adjusted model to {groq_model} for Groq")
            logger.info("✅ Using Groq API key (ultra-fast inference)")
            return
        
        # Check direct OpenAI
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key and openai_key.strip() and not openai_key.startswith("YOUR_"):
            self.api_key = openai_key
            self.config.base_url = "https://api.openai.com/v1"
            # Strip provider prefix for direct OpenAI (e.g., "openai/gpt-4o-mini" → "gpt-4o-mini")
            if self.config.model.startswith("openai/"):
                self.config.model = self.config.model.replace("openai/", "")
                logger.info(f"Adjusted model to {self.config.model} for direct OpenAI")
            elif "/" in self.config.model and not self.config.model.startswith("gpt"):
                # Non-OpenAI model requested but only OpenAI key available
                self.config.model = "gpt-4o-mini"
                logger.info(f"Adjusted model to gpt-4o-mini (non-OpenAI model not available with OpenAI key)")
            logger.info("✅ Using direct OpenAI API key")
            return
        
        # Check Anthropic (OpenAI-compatible endpoint)
        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        if anthropic_key and anthropic_key.strip() and not anthropic_key.startswith("YOUR_"):
            self.api_key = anthropic_key
            self.config.base_url = "https://api.anthropic.com/v1"
            if not self.config.model.startswith("claude"):
                self.config.model = PROVIDER_DEFAULT_MODELS["anthropic"]
                logger.info(f"Adjusted model to {self.config.model} for Anthropic")
            logger.info("✅ Using Anthropic API key")
            return

        # Check Gemini (OpenAI-compatible endpoint)
        gemini_key = os.getenv("GEMINI_API_KEY")
        if gemini_key and gemini_key.strip() and not gemini_key.startswith("YOUR_"):
            self.api_key = gemini_key
            self.config.base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
            if not self.config.model.startswith("gemini"):
                self.config.model = PROVIDER_DEFAULT_MODELS["gemini"]
                logger.info(f"Adjusted model to {self.config.model} for Gemini")
            logger.info("✅ Using Gemini API key")
            return

        # Check xAI
        xai_key = os.getenv("XAI_API_KEY")
        if xai_key and xai_key.strip() and not xai_key.startswith("YOUR_"):
            self.api_key = xai_key
            self.config.base_url = "https://api.x.ai/v1"
            if "openai/" in self.config.model or "anthropic/" in self.config.model:
                self.config.model = "grok-beta"
                logger.info(f"Adjusted model to grok-beta for xAI")
            logger.info("✅ Using xAI API key")
            return
        
        logger.warning("⚠️ No AI API key configured! Set one of: OPENROUTER_API_KEY, OPENAI_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or XAI_API_KEY")
        logger.warning("⚠️ Configure API keys in Settings or .env file")

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
        no_auth_local = (
            "localhost" in (self.config.base_url or "")
            or "127.0.0.1" in (self.config.base_url or "")
            or "::1" in (self.config.base_url or "")
        )

        if not self.api_key and not no_auth_local:
            logger.error("OpenRouter API key not set. Set OPENROUTER_API_KEY in environment.")
            self.initialized = False
            return
        # Normalize model slug early
        normalized = self._normalize_model_slug(self.config.model)
        if normalized != self.config.model:
            logger.info(f"Normalizing model slug '{self.config.model}' -> '{normalized}'")
            self.config.model = normalized
        if not self._async_client:
            # LATENCY OPTIMIZATION: Aggressive connection pooling + HTTP/2
            # Reduced timeouts for faster failure/retry
            timeout = httpx.Timeout(60.0, connect=5.0, read=60.0, write=15.0)
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
            # LATENCY OPTIMIZATION: More connections, longer keepalive
            limits = httpx.Limits(max_keepalive_connections=20, max_connections=50, keepalive_expiry=60.0)
            # Try to enable HTTP/2 if h2 package is available
            try:
                self._async_client = httpx.AsyncClient(
                    timeout=timeout, 
                    headers=headers,
                    limits=limits,
                    http2=True  # Enable HTTP/2 for multiplexing if available
                )
                logger.info("✅ HTTP/2 enabled for better performance")
            except Exception as e:
                # Fallback to HTTP/1.1 if h2 is not installed
                logger.info("⚠️  HTTP/2 not available, using HTTP/1.1 (run: pip install httpx[http2])")
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
            # Use async httpx instead of blocking requests
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(
                    f"{self.config.base_url}/images/generations",
                    headers=headers,
                    json=payload
                )
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
            
            # Build payload - set generous max_tokens for complete ChatGPT-quality responses
            payload = {
                "model": self.config.model,
                "messages": messages,
                "temperature": self.config.temperature,
                "stream": False  # Non-streaming for complete response
            }
            # Allow model to generate complete responses - use generous defaults
            if self.config.max_new_tokens and self.config.max_new_tokens > 0:
                # Use the configured value, capped at 128k
                payload["max_tokens"] = min(self.config.max_new_tokens, 128000)
            else:
                # Default to 4096 tokens for complete responses (ChatGPT standard)
                # This allows for comprehensive answers without truncation
                payload["max_tokens"] = 4096
            
            # Use async httpx instead of blocking requests
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.config.base_url}/chat/completions",
                    headers=headers,
                    json=payload
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
                
        except httpx.TimeoutException:
            return "[ERROR: Request timed out]"
        except httpx.ConnectError:
            return "[ERROR: Connection failed]"
        except Exception as e:
            logger.error(f"OpenAI generation error: {e}")
            return f"[ERROR: {str(e)}]"

    
    def _detect_repetition(self, text: str, threshold: float = 0.7) -> bool:
        """Detect if text contains excessive repetition"""
        if len(text) < 100:  # Too short to detect repetition
            return False
        
        words = text.lower().split()
        if len(words) < 20:
            return False
        
        # Check for repeated phrases
        word_count = {}
        for word in words:
            word_count[word] = word_count.get(word, 0) + 1
        
        # Calculate repetition ratio
        total_words = len(words)
        unique_words = len(word_count)
        repetition_ratio = 1 - (unique_words / total_words)
        
        return repetition_ratio > threshold

    def _validate_response_quality(self, text: str) -> Dict[str, Any]:
        """Validate response quality and return quality metrics"""
        metrics = {
            "is_valid": True,
            "issues": [],
            "word_count": len(text.split()),
            "char_count": len(text),
            "has_code": "```" in text,
            "has_math": "$" in text or "\\(" in text,
        }
        
        # Check for common issues
        if len(text.strip()) < 10:
            metrics["issues"].append("Response too short")
            metrics["is_valid"] = False
        
        if self._detect_repetition(text):
            metrics["issues"].append("Excessive repetition detected")
            metrics["is_valid"] = False
        
        # Check for incomplete responses
        if text.endswith("...") or text.endswith("…"):
            metrics["issues"].append("Response appears incomplete")
        
        # Check for error indicators
        error_indicators = ["I apologize", "I cannot", "I'm unable", "Error:", "ERROR:"]
        if any(indicator in text for indicator in error_indicators):
            metrics["issues"].append("Response contains error indicators")
        
        return metrics

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
            # Set generous token limits for complete ChatGPT-quality responses
            if self.config.max_new_tokens and self.config.max_new_tokens > 0:
                payload["max_tokens"] = min(self.config.max_new_tokens, 100000)
            else:
                # Default to 4096 for streaming to ensure complete answers
                payload["max_tokens"] = 4096
            logger.info(f"Streaming from model: {self.config.model} (mode={self.stream_mode}, max_tokens={payload.get('max_tokens', 'default:4096')})")
            
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


def create_provider_from_config(user_config: "UserProviderConfig") -> "OpenAIProvider":
    """Factory: create an OpenAIProvider from a runtime UserProviderConfig (BYOK)."""
    model = user_config.model or PROVIDER_DEFAULT_MODELS.get(user_config.provider, "gpt-4o-mini")
    base_url = user_config.base_url or PROVIDER_BASE_URLS.get(user_config.provider, "https://api.openai.com/v1")
    cfg = AIConfig(model=model, base_url=base_url)
    return OpenAIProvider(cfg, user_config=user_config)


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

        # Use the best available API key with auto-detected base URL
        # The OpenAIProvider._resolve_api_key_and_base_url() will pick the right key and URL
        config = AIConfig(
            model=os.getenv("DEFAULT_LLM", "openai/gpt-4o-mini"),
            base_url=os.getenv("OPENAI_BASE_URL", "https://openrouter.ai/api/v1"),
            # Default to low temperature for precise answers; can be overridden via env
            temperature=float(os.getenv("AI_TEMPERATURE", "0.3")),  # Increased from 0.2 for more natural responses
            max_new_tokens=max_tokens_val if max_tokens_val > 0 else 4096,  # Default 4096 for complete responses
            allow_auto_continue=os.getenv("AI_AUTO_CONTINUE", "1").lower() not in ("0", "false", "no", "off")
        )
        
        self.provider = OpenAIProvider(config)
        await self.provider.initialize()
    
    async def generate_stream(self, messages: List[Dict[str, str]]) -> AsyncGenerator[str, None]:
        """Generate streaming response using OpenAI"""
        if not self.provider or not self.provider.is_available():
            yield "[ERROR: No AI API key configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, GROQ_API_KEY, or XAI_API_KEY in .env]"
            return
            
        async for token in self.provider.generate_stream(messages):
            yield token
    
    async def generate_complete_response(self, user_input: str, context: str = "") -> str:
        """Generate a complete, well-formatted response"""
        if not self.provider or not self.provider.is_available():
            return "[ERROR: No AI API key configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, GROQ_API_KEY, or XAI_API_KEY in .env]"
        
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

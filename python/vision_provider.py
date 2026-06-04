"""
Vision Model Support for Interview AI
Enables image understanding using GPT-4 Vision and similar models
"""

import base64
import logging
import os
from typing import Optional, List, Dict, Any
import httpx

logger = logging.getLogger(__name__)


class VisionProvider:
    """
    Vision AI provider for understanding images and screenshots.
    Supports GPT-4 Vision, Claude Vision, and Gemini Vision.
    """
    
    def __init__(self):
        self.enabled = os.getenv("ENABLE_VISION", "false").lower() in ("true", "1", "yes", "on")
        self.model = os.getenv("VISION_MODEL", "openai/gpt-4o")
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        self.base_url = os.getenv("OPENAI_BASE_URL", "https://openrouter.ai/api/v1")
        
        if self.enabled and not self.api_key:
            logger.warning("Vision enabled but no API key found")
            self.enabled = False
        
        if self.enabled:
            logger.info(f"Vision provider initialized: model={self.model}")
    
    def is_available(self) -> bool:
        """Check if vision capabilities are available"""
        return self.enabled and bool(self.api_key)
    
    async def analyze_image(
        self,
        image_bytes: bytes,
        prompt: str = "Describe this image in detail",
        max_tokens: int = 1000
    ) -> Optional[str]:
        """
        Analyze an image using vision model.
        
        Args:
            image_bytes: Raw image data (PNG, JPG, etc.)
            prompt: Question or instruction about the image
            max_tokens: Maximum response length
            
        Returns:
            AI-generated description/analysis of the image
        """
        if not self.is_available():
            logger.warning("Vision analysis requested but vision is not available")
            return None
        
        try:
            # Convert image to base64
            image_b64 = base64.b64encode(image_bytes).decode('utf-8')
            
            # Detect image format
            image_format = "png"
            if image_bytes[:4] == b'\xff\xd8\xff\xe0' or image_bytes[:4] == b'\xff\xd8\xff\xe1':
                image_format = "jpeg"
            elif image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
                image_format = "png"
            
            # Build messages with image
            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/{image_format};base64,{image_b64}"
                            }
                        }
                    ]
                }
            ]
            
            # Call vision API
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            if "openrouter.ai" in self.base_url:
                headers.update({
                    "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost"),
                    "X-Title": os.getenv("OPENROUTER_SITE_NAME", "Interview AI Assistant")
                })
            
            payload = {
                "model": self.model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.2
            }
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload
                )
            
            if response.status_code != 200:
                logger.error(f"Vision API error: {response.status_code} - {response.text}")
                return None
            
            result = response.json()
            
            if "choices" in result and result["choices"]:
                content = result["choices"][0]["message"]["content"]
                logger.info(f"Vision analysis successful: {len(content)} chars")
                return content
            else:
                logger.warning("Vision API returned no content")
                return None
        
        except Exception as e:
            logger.error(f"Vision analysis error: {e}")
            return None
    
    async def analyze_screenshot(
        self,
        image_bytes: bytes,
        question: str = None
    ) -> Optional[str]:
        """
        Analyze a screenshot with context-aware prompting.
        
        Args:
            image_bytes: Screenshot data
            question: Optional question to answer about the screenshot
            
        Returns:
            Analysis of the screenshot
        """
        if question:
            prompt = f"""Analyze this screenshot and answer the following question:

{question}

Provide a detailed analysis of what's visible in the image that's relevant to answering this question."""
        else:
            prompt = """Analyze this screenshot in detail. Identify:
1. What type of content is shown (code, diagram, text, UI, etc.)
2. Key information visible
3. Any technical details, code snippets, or important text
4. Context that would be helpful for understanding

Provide a comprehensive description that would be useful for answering interview questions."""
        
        return await self.analyze_image(image_bytes, prompt, max_tokens=1500)
    
    async def extract_code_from_image(self, image_bytes: bytes) -> Optional[str]:
        """
        Extract code from an image using vision model.
        
        Args:
            image_bytes: Image containing code
            
        Returns:
            Extracted code with language detection
        """
        prompt = """Extract all code visible in this image. 

Instructions:
1. Identify the programming language
2. Transcribe the code exactly as shown
3. Preserve all formatting, indentation, and comments
4. Format the output as a code block with language tag

Example output:
```python
def example():
    return "code here"
```"""
        
        result = await self.analyze_image(image_bytes, prompt, max_tokens=2000)
        return result
    
    async def analyze_diagram(self, image_bytes: bytes) -> Optional[str]:
        """
        Analyze a technical diagram or flowchart.
        
        Args:
            image_bytes: Image containing diagram
            
        Returns:
            Detailed explanation of the diagram
        """
        prompt = """Analyze this technical diagram or flowchart in detail.

Provide:
1. Type of diagram (flowchart, architecture, sequence, UML, etc.)
2. Main components and their relationships
3. Data flow or process flow
4. Key technical insights
5. Any text, labels, or annotations visible

Explain it thoroughly as if teaching someone about this system or process."""
        
        return await self.analyze_image(image_bytes, prompt, max_tokens=2000)


# Global vision provider instance
_vision_provider: Optional[VisionProvider] = None


def get_vision_provider() -> VisionProvider:
    """Get or create global vision provider"""
    global _vision_provider
    if _vision_provider is None:
        _vision_provider = VisionProvider()
    return _vision_provider


async def analyze_image_with_vision(
    image_bytes: bytes,
    prompt: str = "Describe this image",
    question: str = None
) -> Optional[str]:
    """
    Convenience function to analyze image with vision AI.
    
    Args:
        image_bytes: Raw image data
        prompt: Analysis prompt
        question: Optional interview question for context
        
    Returns:
        Vision analysis result
    """
    provider = get_vision_provider()
    
    if not provider.is_available():
        return None
    
    if question:
        # Context-aware analysis
        return await provider.analyze_screenshot(image_bytes, question)
    else:
        return await provider.analyze_image(image_bytes, prompt)


async def extract_code_from_screenshot(image_bytes: bytes) -> Optional[str]:
    """Extract code from screenshot using vision AI"""
    provider = get_vision_provider()
    return await provider.extract_code_from_image(image_bytes)


async def analyze_technical_diagram(image_bytes: bytes) -> Optional[str]:
    """Analyze technical diagram using vision AI"""
    provider = get_vision_provider()
    return await provider.analyze_diagram(image_bytes)

"""
Error handling and recovery utilities for Interview AI Assistant
"""

import logging
import os
import sys
import traceback
from typing import Optional, Dict, Any, Callable

logger = logging.getLogger("error_handler")

class ErrorHandler:
    """
    Centralized error handling for Interview AI components.
    Includes tracking, reporting, and recovery strategies.
    """
    
    def __init__(self):
        self.error_counts = {}
        self.recovery_strategies = {
            "whisper": self._recover_whisper,
            "ocr": self._recover_ocr,
            "llm": self._recover_llm,
            "connection": self._recover_connection,
            "embedding": self._recover_embedding,
        }
    
    def track_error(self, component: str, error: Exception) -> Dict[str, Any]:
        """
        Track an error, log it appropriately, and return user-friendly message
        
        Args:
            component: Component where error occurred (whisper, ocr, llm, etc.)
            error: The exception that was raised
            
        Returns:
            Dict with error info and user-friendly message
        """
        # Increment error counter for this component
        self.error_counts[component] = self.error_counts.get(component, 0) + 1
        
        # Log the error with traceback
        logger.error(f"{component.upper()} ERROR: {str(error)}")
        logger.debug(traceback.format_exc())
        
        # Create user-friendly message
        user_message = self._get_user_message(component, error)
        
        # Try recovery if repeated errors
        recovery_attempted = False
        if self.error_counts[component] >= 2 and component in self.recovery_strategies:
            recovery_attempted = self.recovery_strategies[component](error)
        
        return {
            "component": component,
            "error": str(error),
            "count": self.error_counts[component],
            "user_message": user_message,
            "recovery_attempted": recovery_attempted
        }
    
    def _get_user_message(self, component: str, error: Exception) -> str:
        """Generate a user-friendly error message"""
        error_str = str(error).lower()
        
        if component == "whisper":
            if "cuda" in error_str or "gpu" in error_str:
                return "Speech recognition error: GPU issue detected. Try setting WHISPER_COMPUTE=int8"
            elif "model" in error_str and "not found" in error_str:
                return "Speech recognition error: Model not found. Check your internet connection."
            else:
                return "Speech recognition error. Please try again."
                
        elif component == "ocr":
            if "tesseract" in error_str and "not installed" in error_str:
                return "OCR requires Tesseract. Please install from https://github.com/UB-Mannheim/tesseract/wiki"
            elif "not found" in error_str:
                return "OCR error: Tesseract path not found. Check installation or set TESSERACT_CMD."
            else:
                return f"OCR processing error: {str(error)}"
                
        elif component == "llm":
            if "api key" in error_str:
                return "LLM error: API key missing or invalid. Check your .env file."
            elif "rate limit" in error_str or "quota" in error_str:
                return "LLM error: Rate limit exceeded. Please try again later."
            else:
                return f"LLM error: {str(error)}"
                
        elif component == "connection":
            return "Connection error. Please check your network and try again."
            
        elif component == "embedding":
            return "Resume indexing error. Please try uploading again."
            
        else:
            return f"Error in {component}: {str(error)}"
    
    def _recover_whisper(self, error: Exception) -> bool:
        """Attempt to recover from Whisper errors"""
        # Try fallback to a smaller model if that's the issue
        error_str = str(error).lower()
        if "memory" in error_str or "cuda" in error_str:
            os.environ["WHISPER_MODEL"] = "base.en"
            os.environ["WHISPER_COMPUTE"] = "int8"
            logger.info("Whisper recovery: Switched to base.en model with int8 compute")
            return True
        return False
    
    def _recover_ocr(self, error: Exception) -> bool:
        """Attempt to recover from OCR errors"""
        # For OCR, we mainly handle tesseract path issues
        error_str = str(error).lower()
        if "not found" in error_str and os.name == 'nt':
            # Try common Windows paths
            candidates = [
                r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
                r"C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
            ]
            
            for path in candidates:
                if os.path.exists(path):
                    os.environ["TESSERACT_CMD"] = path
                    logger.info(f"OCR recovery: Found Tesseract at {path}")
                    return True
        return False
    
    def _recover_llm(self, error: Exception) -> bool:
        """Attempt to recover from LLM errors"""
        # For LLM issues, try switching to a different provider if available
        error_str = str(error).lower()
        if "openai" in error_str and os.getenv("GROQ_API_KEY"):
            logger.info("LLM recovery: Switching from OpenAI to Groq")
            return True
        elif "groq" in error_str and os.getenv("ANTHROPIC_API_KEY"):
            logger.info("LLM recovery: Switching from Groq to Anthropic")
            return True
        elif "anthropic" in error_str and os.getenv("OPENAI_API_KEY"):
            logger.info("LLM recovery: Switching from Anthropic to OpenAI")
            return True
        return False
    
    def _recover_connection(self, error: Exception) -> bool:
        """Attempt to recover from connection errors"""
        # Not much we can do for connection issues
        return False
    
    def _recover_embedding(self, error: Exception) -> bool:
        """Attempt to recover from embedding errors"""
        # For embedding issues, we could try reinitializing the embedder
        return False

# Create a singleton instance
error_handler = ErrorHandler()

def safe_execute(component: str, func: Callable, *args, **kwargs) -> Any:
    """
    Execute a function with error handling
    
    Args:
        component: Component name for error tracking
        func: Function to execute
        *args, **kwargs: Arguments to pass to the function
        
    Returns:
        Result of the function or None on error
    """
    try:
        return func(*args, **kwargs)
    except Exception as e:
        error_info = error_handler.track_error(component, e)
        logger.error(f"Error in {component}: {error_info['error']}")
        return None

"""
Interview AI Assistant Production Launcher

This script handles more advanced initialization, validation, and launching
of the AI Assistant server with improved error handling and logging.

Usage: python launch_server.py [--port PORT] [--log-level {debug,info,warning,error}]
"""

import argparse
import asyncio
import logging
import os
import signal
import sys
import time
from pathlib import Path
from typing import List, Optional

# Set up basic logging before importing other modules
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('interview_ai_server.log', mode='a')
    ]
)

logger = logging.getLogger("launcher")

def check_python_version() -> bool:
    """Check if Python version is 3.10+ as required"""
    major, minor = sys.version_info.major, sys.version_info.minor
    if major < 3 or (major == 3 and minor < 10):
        logger.error(f"Python version {major}.{minor} is not supported. Please use Python 3.10+")
        return False
    return True

def check_dependencies() -> bool:
    """Check if all required packages are installed.
    Uses correct import module names for some packages whose pip name differs.
    """
    # Map pip package name -> list of acceptable import module names
    deps = {
        "fastapi": ["fastapi"],
        "uvicorn": ["uvicorn"],
        "websockets": ["websockets"],
        "pydantic": ["pydantic"],
        "python-dotenv": ["dotenv"],
        "numpy": ["numpy"],
        "scipy": ["scipy"],
        "pypdf": ["pypdf"],
        "python-docx": ["docx"],
        "pillow": ["PIL"],
        "pytesseract": ["pytesseract"],
    }

    missing = []
    for pip_name, import_names in deps.items():
        ok = False
        for mod in import_names:
            try:
                __import__(mod)
                ok = True
                break
            except ImportError:
                continue
        if not ok:
            missing.append(pip_name)

    if missing:
        logger.error(f"Missing required packages: {', '.join(missing)}")
        logger.error("Please install them with: pip install -r requirements.txt")
        return False

    return True

def setup_logging(log_level: str) -> None:
    """Configure detailed logging based on command line arguments"""
    numeric_level = getattr(logging, log_level.upper(), None)
    if not isinstance(numeric_level, int):
        logger.warning(f"Invalid log level: {log_level}, using INFO")
        numeric_level = logging.INFO
    
    # Update the root logger level
    logging.getLogger().setLevel(numeric_level)
    
    # Create a rotating file handler to avoid log files getting too big
    try:
        from logging.handlers import RotatingFileHandler
        
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        
        file_handler = RotatingFileHandler(
            log_dir / "interview_ai_server.log",
            maxBytes=10 * 1024 * 1024,  # 10 MB
            backupCount=5
        )
        file_handler.setLevel(numeric_level)
        file_handler.setFormatter(logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        ))
        
        # Add the handler to the root logger
        logging.getLogger().addHandler(file_handler)
        
    except Exception as e:
        logger.warning(f"Could not set up rotating file handler: {e}")

def create_env_file_if_missing() -> None:
    """Create a .env file with defaults if it doesn't exist"""
    env_path = Path(".env")
    if not env_path.exists():
        logger.info("Creating default .env file")
        
        with open(env_path, "w") as f:
            f.write("# Interview AI Assistant Environment Variables\n\n")
            f.write("# Whisper ASR settings\n")
            f.write("WHISPER_MODEL=small.en\n")
            f.write("WHISPER_COMPUTE=int8\n\n")
            f.write("# OCR settings\n")
            f.write("# TESSERACT_CMD=C:\\Program Files\\Tesseract-OCR\\tesseract.exe\n\n")
            f.write("# LLM API keys (optional)\n")
            f.write("# OPENAI_API_KEY=sk-...\n")
            f.write("# ANTHROPIC_API_KEY=sk-ant-...\n")
            f.write("# GROQ_API_KEY=gsk_...\n")

def handle_signals() -> None:
    """Set up signal handlers for graceful shutdown"""
    def signal_handler(sig, frame):
        logger.info(f"Received signal {sig}, shutting down...")
        sys.exit(0)
    
    # Handle termination signals
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # On Windows, SIGBREAK is sent when Ctrl+Break is pressed
    if sys.platform == 'win32':
        signal.signal(signal.SIGBREAK, signal_handler)

async def run_server(port: int) -> None:
    """Import and run the server module"""
    try:
        base_dir = Path(__file__).parent
        sys.path.insert(0, str(base_dir))

        import importlib

        server_module = None
        if (base_dir / "server_fixed.py").exists():
            logger.info("Using fixed server implementation")
            server_module = importlib.import_module("server_fixed")
        elif (base_dir / "server.py").exists():
            logger.info("Using standard server implementation")
            server_module = importlib.import_module("server")
        else:
            logger.error("No server implementation found")
            return

        # Override port if specified, if attribute exists
        try:
            if port != 8765 and hasattr(server_module, "PORT"):
                server_module.PORT = port
        except Exception:
            pass

        effective_port = getattr(server_module, "PORT", port)
        logger.info(f"Starting server on port {effective_port}...")
        await server_module.main()

    except Exception as e:
        logger.error(f"Error running server: {e}", exc_info=True)
        sys.exit(1)

def main():
    """Main entry point for the launcher"""
    parser = argparse.ArgumentParser(description="Interview AI Assistant Server")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    parser.add_argument("--log-level", choices=["debug", "info", "warning", "error"], 
                      default="info", help="Logging level")
    
    args = parser.parse_args()
    
    # Set up logging with specified level
    setup_logging(args.log_level)
    
    # Display banner
    logger.info("=" * 70)
    logger.info("Interview AI Assistant Server Starting")
    logger.info("=" * 70)
    
    # Perform startup checks
    if not check_python_version():
        sys.exit(1)
    
    if not check_dependencies():
        sys.exit(1)
    
    # Create .env file if missing
    create_env_file_if_missing()
    
    # Set up signal handlers
    handle_signals()
    
    # Start the server
    try:
        asyncio.run(run_server(args.port))
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Unhandled exception: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()

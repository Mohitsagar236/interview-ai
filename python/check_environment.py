# -*- coding: utf-8 -*-
"""
This script checks for common system prerequisites for the Interview AI Assistant
and provides helpful guidance on fixing any issues found.

Usage: python check_environment.py
"""

import os
import sys
import importlib
import platform
import subprocess
import shutil
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# Define colors for console output if supported
if sys.platform != "win32" or "ANSICON" in os.environ:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BLUE = "\033[94m"
    RESET = "\033[0m"
else:
    # No color on Windows unless ANSICON is installed
    GREEN = YELLOW = RED = BLUE = RESET = ""

def check_python_version() -> Tuple[bool, str]:
    """Check if Python version is compatible (3.10+)"""
    major, minor = sys.version_info.major, sys.version_info.minor
    if major >= 3 and minor >= 10:
        return True, f"Python {major}.{minor}.{sys.version_info.micro}"
    else:
        return False, f"Python {major}.{minor}.{sys.version_info.micro} (requires 3.10+)"

def check_package(package_name: str) -> Tuple[bool, str]:
    """Check if a Python package is installed and its version"""
    try:
        module = importlib.import_module(package_name)
        version = getattr(module, "__version__", "unknown")
        return True, version
    except ImportError:
        return False, "not installed"

def check_whisper_deps() -> List[Dict]:
    """Check Whisper/audio dependencies"""
    results = []
    
    # Check for faster-whisper
    faster_whisper_ok, version = check_package("faster_whisper")
    results.append({
        "name": "faster-whisper",
        "status": faster_whisper_ok,
        "version": version,
        "required": True,
        "help": "Install with: pip install faster-whisper"
    })
    
    # Check for onnxruntime
    onnx_ok, version = check_package("onnxruntime")
    results.append({
        "name": "onnxruntime",
        "status": onnx_ok,
        "version": version,
        "required": True,
        "help": "Install with: pip install onnxruntime"
    })
    
    # Check for GPU support via onnxruntime-gpu (optional)
    onnx_gpu_ok, version = check_package("onnxruntime_gpu")
    results.append({
        "name": "onnxruntime-gpu",
        "status": onnx_gpu_ok,
        "version": version,
        "required": False,
        "help": "For GPU acceleration: pip install onnxruntime-gpu"
    })
    
    return results

def check_ocr_deps() -> List[Dict]:
    """Check OCR dependencies, especially Tesseract"""
    results = []
    
    # Check for pytesseract
    tesseract_ok, version = check_package("pytesseract")
    results.append({
        "name": "pytesseract",
        "status": tesseract_ok,
        "version": version,
        "required": True,
        "help": "Install with: pip install pytesseract"
    })
    
    # Check for Pillow
    pillow_ok, version = check_package("PIL")
    results.append({
        "name": "Pillow",
        "status": pillow_ok,
        "version": version,
        "required": True,
        "help": "Install with: pip install Pillow"
    })
    
    # Check for Tesseract executable
    tesseract_exe = None
    tesseract_exists = False
    
    # Check environment variable first
    if os.getenv('TESSERACT_CMD'):
        tesseract_exe = os.getenv('TESSERACT_CMD')
        tesseract_exists = os.path.exists(tesseract_exe)
    
    # Try common locations if not found via env var
    if not tesseract_exists and platform.system() == 'Windows':
        candidates = [
            r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
            r"C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
            os.path.join(os.environ.get('USERPROFILE', ''), r"AppData\\Local\\Tesseract-OCR\\tesseract.exe"),
            os.path.join(os.environ.get('USERPROFILE', ''), r"AppData\\Local\\Programs\\Tesseract-OCR\\tesseract.exe"),
            r"C:\\Tesseract-OCR\\tesseract.exe",
            r"D:\\Tesseract-OCR\\tesseract.exe",
        ]
        
        for candidate in candidates:
            if os.path.exists(candidate):
                tesseract_exe = candidate
                tesseract_exists = True
                break
    else:
        # On Linux/Mac, check if it's in PATH
        tesseract_exe = shutil.which("tesseract")
        tesseract_exists = tesseract_exe is not None
    
    # Get version if found
    version = "unknown"
    if tesseract_exists and tesseract_exe:
        try:
            output = subprocess.check_output([tesseract_exe, "--version"], 
                                            stderr=subprocess.STDOUT, 
                                            universal_newlines=True)
            version = output.strip().split("\n")[0] if output else "unknown"
        except (subprocess.SubprocessError, OSError):
            pass
    
    results.append({
        "name": "Tesseract executable",
        "status": tesseract_exists,
        "version": version if tesseract_exists else "not found",
        "required": True,
        "help": "Download from: https://github.com/UB-Mannheim/tesseract/wiki" if platform.system() == 'Windows' 
               else "Install via package manager, e.g. 'apt install tesseract-ocr'"
    })
    
    return results

def check_llm_deps() -> List[Dict]:
    """Check LLM API dependencies and API keys"""
    results = []
    
    # Check OpenAI
    openai_ok, version = check_package("openai")
    openai_key = os.getenv("OPENAI_API_KEY") is not None
    results.append({
        "name": "OpenAI",
        "status": openai_ok,
        "version": version,
        "api_key": openai_key,
        "required": False,
        "help": "Install with: pip install openai"
    })
    
    # Check Anthropic
    anthropic_ok, version = check_package("anthropic")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY") is not None
    results.append({
        "name": "Anthropic",
        "status": anthropic_ok,
        "version": version,
        "api_key": anthropic_key,
        "required": False,
        "help": "Install with: pip install anthropic"
    })
    
    # Check Groq
    groq_ok, version = check_package("groq")
    groq_key = os.getenv("GROQ_API_KEY") is not None
    results.append({
        "name": "Groq",
        "status": groq_ok,
        "version": version,
        "api_key": groq_key,
        "required": False,
        "help": "Install with: pip install groq"
    })
    
    return results

def check_embedding_deps() -> List[Dict]:
    """Check embedding dependencies"""
    results = []
    
    # Check sentence-transformers
    st_ok, version = check_package("sentence_transformers")
    results.append({
        "name": "sentence-transformers",
        "status": st_ok,
        "version": version,
        "required": True,
        "help": "Install with: pip install sentence-transformers"
    })
    
    # Check FAISS
    faiss_ok, version = check_package("faiss")
    if not faiss_ok:
        # Try CPU-specific package
        faiss_ok, version = check_package("faiss_cpu")
    
    results.append({
        "name": "FAISS",
        "status": faiss_ok,
        "version": version,
        "required": False,  # Falls back to numpy
        "help": "Install with: pip install faiss-cpu"
    })
    
    return results

def check_document_deps() -> List[Dict]:
    """Check document parsing dependencies"""
    results = []
    
    # Check PyPDF
    pypdf_ok, version = check_package("pypdf")
    results.append({
        "name": "PyPDF",
        "status": pypdf_ok,
        "version": version,
        "required": True,
        "help": "Install with: pip install pypdf"
    })
    
    # Check python-docx
    docx_ok, version = check_package("docx")
    results.append({
        "name": "python-docx",
        "status": docx_ok,
        "version": version,
        "required": True,
        "help": "Install with: pip install python-docx"
    })
    
    return results

def print_section(title: str, results: List[Dict]) -> bool:
    """Print a section of checks and return overall status"""
    print(f"\n{BLUE}=== {title} ==={RESET}")
    all_good = True
    
    for item in results:
        required = item.get("required", True)
        if item["status"]:
            if "api_key" in item and not item["api_key"]:
                print(f" {YELLOW}⚠{RESET} {item['name']}: v{item['version']} (API key not configured)")
                # Only mark as bad if this is a required component
                if required:
                    all_good = False
            else:
                print(f" {GREEN}✓{RESET} {item['name']}: v{item['version']}")
        else:
            if required:
                print(f" {RED}✗{RESET} {item['name']}: {item['version']}")
                print(f"   {YELLOW}→{RESET} {item['help']}")
                all_good = False
            else:
                print(f" {YELLOW}⚠{RESET} {item['name']}: {item['version']} (optional)")
                print(f"   {YELLOW}→{RESET} {item['help']}")
    
    return all_good

def main():
    print(f"{BLUE}Interview AI Assistant Environment Check{RESET}")
    print(f"{BLUE}======================================={RESET}")
    
    # Check Python version
    python_ok, python_version = check_python_version()
    if python_ok:
        print(f"{GREEN}✓{RESET} {python_version}")
    else:
        print(f"{RED}✗{RESET} {python_version}")
        print(f"   {YELLOW}→{RESET} Please upgrade to Python 3.10 or newer")
    
    # Check each component category
    whisper_ok = print_section("Speech Recognition", check_whisper_deps())
    ocr_ok = print_section("OCR", check_ocr_deps())
    llm_ok = print_section("LLM APIs", check_llm_deps())
    embedding_ok = print_section("Embeddings", check_embedding_deps())
    document_ok = print_section("Document Parsing", check_document_deps())
    
    # Print summary
    print(f"\n{BLUE}=== Summary ==={RESET}")
    all_ok = python_ok and whisper_ok and ocr_ok and embedding_ok and document_ok
    # LLM is optional so we don't include it in the all_ok check
    
    if all_ok:
        print(f"{GREEN}All required components are installed and configured correctly.{RESET}")
        if not llm_ok:
            print(f"{YELLOW}Note: LLM API keys are not configured, but they are optional.{RESET}")
    else:
        print(f"{RED}Some required components are missing or misconfigured.{RESET}")
        print(f"{YELLOW}Please address the issues marked with ✗ above.{RESET}")
    
    # Env-specific tips
    if platform.system() == 'Windows':
        print(f"\n{BLUE}Windows-Specific Tips:{RESET}")
        print(f"• For Tesseract OCR: Install from https://github.com/UB-Mannheim/tesseract/wiki")
        print(f"• For GPU acceleration: Install CUDA and use 'pip install onnxruntime-gpu'")
    
    print(f"\n{BLUE}To start the server:{RESET}")
    print(f"• Run: {GREEN}python server.py{RESET}")
    print(f"• In the main project folder: {GREEN}npm run dev{RESET}")

if __name__ == "__main__":
    main()

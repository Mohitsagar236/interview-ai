# -*- coding: utf-8 -*-
#!/usr/bin/env python3
"""
Quick Setup Script for Real-Time Streaming Transcription
Checks environment and installs dependencies
"""

import os
import sys
import subprocess

def check_python_version():
    """Check if Python version is 3.8+"""
    if sys.version_info < (3, 8):
        print("❌ Python 3.8+ required")
        print(f"   Current: {sys.version}")
        return False
    print(f"✅ Python {sys.version_info.major}.{sys.version_info.minor}")
    return True

def check_venv():
    """Check if running in virtual environment"""
    in_venv = hasattr(sys, 'real_prefix') or (
        hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix
    )
    if in_venv:
        print(f"✅ Virtual environment: {sys.prefix}")
    else:
        print("⚠️  Not in virtual environment")
        print("   Run: .venv\\Scripts\\Activate.ps1")
    return in_venv

def check_dependency(package_name):
    """Check if a Python package is installed"""
    try:
        __import__(package_name.replace('-', '_'))
        return True
    except ImportError:
        return False

def install_streaming_deps():
    """Install streaming transcription dependencies"""
    print("\n📦 Installing streaming transcription dependencies...")
    
    try:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", 
            "deepgram-sdk==3.2.7", 
            "--quiet"
        ])
        print("✅ deepgram-sdk installed")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install dependencies: {e}")
        return False

def check_env_file():
    """Check if .env file exists and has required keys"""
    env_path = ".env"
    example_path = ".env.example"
    
    if not os.path.exists(env_path):
        print(f"⚠️  {env_path} not found")
        if os.path.exists(example_path):
            print(f"   Copy {example_path} to {env_path}")
            print(f"   Then add your DEEPGRAM_API_KEY")
        return False
    
    # Check for required keys
    with open(env_path, 'r') as f:
        content = f.read()
    
    required_keys = {
        'DEEPGRAM_API_KEY': False,
        'USE_STREAMING_TRANSCRIPTION': False,
    }
    
    for key in required_keys:
        if key in content and not content.split(key)[1].split('\n')[0].strip().startswith('=your_'):
            required_keys[key] = True
    
    if required_keys['DEEPGRAM_API_KEY']:
        print("✅ DEEPGRAM_API_KEY configured")
    else:
        print("⚠️  DEEPGRAM_API_KEY not set")
        print("   Get free key: https://console.deepgram.com/signup")
    
    if required_keys['USE_STREAMING_TRANSCRIPTION']:
        print("✅ USE_STREAMING_TRANSCRIPTION=true")
    else:
        print("⚠️  USE_STREAMING_TRANSCRIPTION not enabled")
    
    return all(required_keys.values())

def test_import():
    """Test if streaming_transcription module can be imported"""
    try:
        import streaming_transcription
        print("✅ streaming_transcription module importable")
        return True
    except ImportError as e:
        print(f"❌ Cannot import streaming_transcription: {e}")
        return False

def main():
    print("🚀 Real-Time Streaming Transcription Setup")
    print("=" * 50)
    
    # Check Python version
    if not check_python_version():
        sys.exit(1)
    
    # Check virtual environment
    in_venv = check_venv()
    
    # Check dependencies
    print("\n📋 Checking dependencies...")
    deps = {
        'websockets': check_dependency('websockets'),
        'deepgram': check_dependency('deepgram'),
        'numpy': check_dependency('numpy'),
    }
    
    for name, installed in deps.items():
        status = "✅" if installed else "❌"
        print(f"{status} {name}")
    
    # Install missing dependencies
    if not deps['deepgram']:
        print("\n⚠️  Missing dependencies detected")
        response = input("Install now? (y/n): ").lower()
        if response == 'y':
            if install_streaming_deps():
                print("✅ Dependencies installed successfully")
            else:
                print("❌ Installation failed")
                sys.exit(1)
        else:
            print("⚠️  Skipping installation")
    
    # Check .env configuration
    print("\n⚙️  Checking configuration...")
    env_ok = check_env_file()
    
    # Test module import
    print("\n🧪 Testing imports...")
    import_ok = test_import()
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Setup Summary")
    print("=" * 50)
    
    all_ok = in_venv and all(deps.values()) and env_ok and import_ok
    
    if all_ok:
        print("✅ All checks passed!")
        print("\n🎉 You're ready to use real-time streaming transcription")
        print("\nNext steps:")
        print("1. Start server: python python\\server.py")
        print("2. Launch app: npm start")
        print("3. Click 'Record Interviewer' and speak")
        print("4. Watch words appear in <200ms!")
    else:
        print("⚠️  Setup incomplete")
        print("\nRequired actions:")
        if not in_venv:
            print("- Activate virtual environment: .venv\\Scripts\\Activate.ps1")
        if not all(deps.values()):
            print("- Install dependencies: pip install deepgram-sdk==3.2.7")
        if not env_ok:
            print("- Configure .env file with DEEPGRAM_API_KEY")
            print("  Get key: https://console.deepgram.com/signup")
        if not import_ok:
            print("- Verify python/streaming_transcription.py exists")
    
    return 0 if all_ok else 1

if __name__ == "__main__":
    sys.exit(main())

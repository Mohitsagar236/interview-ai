# -*- coding: utf-8 -*-
"""
Simple script to start the Interview AI Assistant server.
This is used by the comprehensive test to ensure the server is running.
"""

import os
import sys
import time
import asyncio
from dotenv import load_dotenv

# Add the python directory to the path FIRST before any imports
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# Also add parent directory for compatibility
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

print(f"✅ Python path configured:")
print(f"   Current dir: {current_dir}")
print(f"   Parent dir: {parent_dir}")
print(f"   sys.path: {sys.path[:3]}")  # Show first 3 entries

# Load environment variables from parent directory's .env file
env_path = os.path.join(parent_dir, '.env')
load_dotenv(env_path)
print(f"✅ Loaded environment from: {env_path}")

# Import the server module
import server

if __name__ == "__main__":
    print("Starting Interview AI Assistant server...")
    print(f"Server will listen on {server.HOST}:{server.PORT}")
    
    try:
        asyncio.run(server.main())
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"\nServer error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

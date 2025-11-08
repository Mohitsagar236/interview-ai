"""
Simple script to start the Interview AI Assistant server.
This is used by the comprehensive test to ensure the server is running.
"""

import os
import sys
import time
import asyncio
from dotenv import load_dotenv

# Load environment variables from parent directory's .env file
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(parent_dir, '.env')
load_dotenv(env_path)
print(f"✅ Loaded environment from: {env_path}")

# Add the parent directory to the path so we can import the server module
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

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
        sys.exit(1)

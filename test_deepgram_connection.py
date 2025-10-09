"""
Quick Deepgram Connection Test
Run this to verify Deepgram API key and connection work
"""
import asyncio
import os
import sys
from dotenv import load_dotenv

# Load environment
load_dotenv()

async def test_deepgram():
    print("=" * 60)
    print("DEEPGRAM CONNECTION TEST")
    print("=" * 60)
    
    # Check API key
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        print("❌ DEEPGRAM_API_KEY is NOT set!")
        print("   Add it to your .env file:")
        print("   DEEPGRAM_API_KEY=your_key_here")
        return False
    
    print(f"✅ DEEPGRAM_API_KEY is set: {api_key[:12]}...{api_key[-4:]}")
    
    # Try to connect
    print("\n📡 Testing connection to Deepgram...")
    
    try:
        from streaming_transcription import StreamingTranscriptionEngine
        
        engine = StreamingTranscriptionEngine()
        print(f"   Provider: {engine.provider_name}")
        print(f"   Config: {engine.config}")
        
        print("\n🔗 Attempting to connect...")
        connected = await engine.connect()
        
        if connected:
            print("✅ Successfully connected to Deepgram!")
            print("   Connection is working properly.")
            
            # Close cleanly
            await engine.close()
            print("✅ Connection closed cleanly")
            return True
        else:
            print("❌ Failed to connect to Deepgram")
            print("   Check:")
            print("   - API key is valid")
            print("   - Internet connection")
            print("   - Firewall allows wss:// connections")
            return False
            
    except ImportError as e:
        print(f"❌ Failed to import streaming_transcription module: {e}")
        print("   Make sure you're in the correct directory")
        return False
    except Exception as e:
        print(f"❌ Connection test failed: {e}")
        print(f"   Error type: {type(e).__name__}")
        return False

if __name__ == "__main__":
    print("\nStarting Deepgram connection test...\n")
    
    result = asyncio.run(test_deepgram())
    
    print("\n" + "=" * 60)
    if result:
        print("✅ TEST PASSED - Deepgram connection is working!")
        print("   If transcription still doesn't work, check:")
        print("   - Audio capture (microphone)")
        print("   - Audio WebSocket connection")
        print("   - Server is running")
    else:
        print("❌ TEST FAILED - Fix the issues above and try again")
    print("=" * 60)
    
    sys.exit(0 if result else 1)

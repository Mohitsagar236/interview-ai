"""
Quick test script to verify Grok connection through OpenRouter
"""
import asyncio
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add python directory to path
sys.path.insert(0, os.path.dirname(__file__))

from ai_providers import AIManager

async def test_grok_connection():
    """Test basic connection to Grok via OpenRouter"""
    print("=" * 60)
    print("Testing Grok Connection via OpenRouter")
    print("=" * 60)
    
    # Check API key
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("❌ ERROR: OPENROUTER_API_KEY not found in environment")
        print("Please set it in your .env file")
        return False
    
    print(f"✓ API Key found: {api_key[:20]}...")
    
    # Initialize AI Manager
    print("\n📡 Initializing AI Manager...")
    manager = AIManager()
    await manager.initialize()
    
    # Test simple query
    print("\n🚀 Sending test query to Grok...")
    test_message = "Say 'Hello! Grok is working!' and nothing else."
    
    messages = [
        {"role": "user", "content": test_message}
    ]
    
    print(f"Query: {test_message}")
    print("\n📥 Response:")
    print("-" * 60)
    
    response_received = False
    full_response = []
    
    try:
        async for chunk in manager.generate_stream(messages):
            if chunk and not chunk.startswith("[ERROR"):
                response_received = True
                full_response.append(chunk)
                print(chunk, end='', flush=True)
            elif chunk.startswith("[ERROR"):
                print(f"\n❌ {chunk}")
                return False
        
        print("\n" + "-" * 60)
        
        if response_received and full_response:
            print("\n✅ SUCCESS: Connection to Grok is working!")
            print(f"📊 Response length: {len(''.join(full_response))} characters")
            return True
        else:
            print("\n❌ FAILED: No response received")
            return False
            
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("Grok Connection Test")
    print("=" * 60 + "\n")
    
    success = asyncio.run(test_grok_connection())
    
    print("\n" + "=" * 60)
    if success:
        print("✅ Test PASSED - Grok is ready to use!")
    else:
        print("❌ Test FAILED - Please check the errors above")
    print("=" * 60 + "\n")
    
    sys.exit(0 if success else 1)

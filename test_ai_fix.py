"""
Test script to verify AI provider is working correctly after fixes
"""
import asyncio
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add python directory to path
sys.path.insert(0, str(Path(__file__).parent / "python"))

from ai_providers import AIManager, MessageFormatter

async def test_ai_response():
    """Test AI response quality"""
    print("🧪 Testing AI Provider Fixes...\n")
    
    # Initialize AI manager
    manager = AIManager()
    await manager.initialize()
    
    # Check status
    status = manager.get_status()
    print(f"✅ AI Status:")
    print(f"   Provider: {status['provider']}")
    print(f"   Model: {status['model']}")
    print(f"   Temperature: {status['temperature']}")
    print(f"   Max Tokens: {status['max_tokens'] or 'Unlimited'}")
    print(f"   Initialized: {status['initialized']}")
    print(f"   Available: {status['available']}\n")
    
    if not status['available']:
        print("❌ AI not available - check your API key")
        return
    
    # Test 1: Simple code request
    print("=" * 60)
    print("TEST 1: Binary Heap Height (Python)")
    print("=" * 60)
    
    test_query_1 = """Write a Python function to calculate the height of a binary heap given the number of elements n. 
    
Requirements:
- Height = floor(log2(n)) 
- If n is 1, return 0
- Include time and space complexity

Provide ONLY the code without comments unless necessary."""
    
    formatter = MessageFormatter()
    messages_1 = formatter.format_user_message(test_query_1)
    
    print("\n📤 Sending request...\n")
    response_1 = await manager.provider.generate_complete_response(messages_1)
    print("📥 Response:")
    print(response_1)
    print("\n")
    
    # Test 2: Code conversion
    print("=" * 60)
    print("TEST 2: Find Extra Character (C++)")
    print("=" * 60)
    
    test_query_2 = """Convert this Python code to C++:

def find_extra_character(s1, s2):
    count = {}
    for char in s1:
        count[char] = count.get(char, 0) + 1
    for char in s2:
        if char in count:
            count[char] -= 1
        else:
            return char
    for char, cnt in count.items():
        if cnt == -1:
            return char

Provide clean, working C++ code WITHOUT unnecessary comments."""
    
    messages_2 = formatter.format_user_message(test_query_2)
    
    print("\n📤 Sending request...\n")
    response_2 = await manager.provider.generate_complete_response(messages_2)
    print("📥 Response:")
    print(response_2)
    print("\n")
    
    # Test 3: Streaming response
    print("=" * 60)
    print("TEST 3: Streaming Response Test")
    print("=" * 60)
    
    test_query_3 = "Explain the difference between a binary heap and a binary search tree in 3-4 sentences."
    messages_3 = formatter.format_user_message(test_query_3)
    
    print("\n📤 Streaming response...\n")
    print("📥 Response: ", end="", flush=True)
    async for chunk in manager.generate_stream(messages_3):
        print(chunk, end="", flush=True)
    print("\n")
    
    print("\n" + "=" * 60)
    print("✅ All tests completed!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_ai_response())

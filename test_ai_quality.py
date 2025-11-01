"""
Test script to verify AI response quality improvements.
Run this after restarting the server to confirm ChatGPT-quality responses.
"""

import asyncio
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from python.ai_providers import initialize_ai, generate_ai_response, MessageFormatter

async def test_quality():
    """Test AI response quality with various question types"""
    
    print("🔧 Initializing AI providers...")
    await initialize_ai()
    print("✅ AI initialized\n")
    
    test_questions = [
        {
            "type": "Coding - Basic",
            "question": "Write a function to reverse a linked list in Python"
        },
        {
            "type": "Algorithm - Complexity",
            "question": "What is the time complexity of merge sort? Explain with LaTeX notation."
        },
        {
            "type": "System Design",
            "question": "Design a URL shortener service"
        },
        {
            "type": "Behavioral",
            "question": "Tell me about a time you resolved a conflict with a teammate"
        }
    ]
    
    for i, test in enumerate(test_questions, 1):
        print(f"\n{'='*80}")
        print(f"TEST {i}/{len(test_questions)}: {test['type']}")
        print(f"{'='*80}")
        print(f"📝 Question: {test['question']}\n")
        print("🤖 AI Response:")
        print("-" * 80)
        
        # Format the message
        formatter = MessageFormatter()
        messages = formatter.format_user_message(test['question'])
        
        # Stream the response
        response_parts = []
        async for chunk in generate_ai_response(messages):
            print(chunk, end='', flush=True)
            response_parts.append(chunk)
        
        full_response = ''.join(response_parts)
        
        print("\n" + "-" * 80)
        print(f"\n📊 Response Stats:")
        print(f"   - Length: {len(full_response)} characters")
        print(f"   - Words: {len(full_response.split())} words")
        print(f"   - Has code blocks: {'✅' if '```' in full_response else '❌'}")
        print(f"   - Has LaTeX: {'✅' if '$' in full_response else '❌'}")
        print(f"   - Has structure (headers): {'✅' if '#' in full_response else '❌'}")
        
        # Quality checks
        print(f"\n✅ Quality Checks:")
        if len(full_response) > 200:
            print("   ✓ Response is comprehensive (>200 chars)")
        else:
            print("   ⚠ Response might be too brief (<200 chars)")
        
        if test['type'].startswith('Coding') and '```' in full_response:
            print("   ✓ Includes code example")
        elif test['type'].startswith('Coding'):
            print("   ⚠ Missing code block for coding question")
        
        if 'complexity' in test['question'].lower() and '$' in full_response:
            print("   ✓ Uses LaTeX for complexity notation")
        elif 'complexity' in test['question'].lower():
            print("   ⚠ Missing LaTeX notation for complexity")
        
        await asyncio.sleep(2)  # Brief pause between tests
    
    print(f"\n{'='*80}")
    print("🎉 All tests completed!")
    print("='*80}")
    print("\n📋 Summary:")
    print("If you see:")
    print("  ✅ Comprehensive responses (>200 chars)")
    print("  ✅ Code blocks for coding questions")
    print("  ✅ LaTeX notation for complexity")
    print("  ✅ Structured formatting with headers")
    print("\nThen the ChatGPT-quality improvements are working correctly! 🚀")

if __name__ == "__main__":
    print("🧪 AI Response Quality Test")
    print("=" * 80)
    print("This script tests the improved AI response system.")
    print("Responses should match ChatGPT quality standards.")
    print("=" * 80 + "\n")
    
    try:
        asyncio.run(test_quality())
    except KeyboardInterrupt:
        print("\n\n⚠ Test interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Error during testing: {e}")
        import traceback
        traceback.print_exc()

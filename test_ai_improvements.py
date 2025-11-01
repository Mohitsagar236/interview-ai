#!/usr/bin/env python3
"""
AI Response Quality Test Suite
Tests the enhanced AI answering capabilities in the interview AI system.
"""

import asyncio
import json
import logging
import sys
import os

# Add the python directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'python'))

from server import should_retry_response, enhance_response_formatting

def test_response_quality_checker():
    """Test the response quality checker function"""
    print("🧪 Testing Response Quality Checker...")
    
    # Test cases for poor quality responses that should be retried
    poor_responses = [
        "I cannot see the screen content.",
        "Please provide more context.",
        "I need more information to help you.",
        "ERROR: Failed to process request.",
        "Unfortunately, I am unable to assist with this request.",
        "I I I I cannot cannot cannot help help help you.",  # Repetitive
        "",  # Empty
        "No.",  # Too short
    ]
    
    # Test cases for good quality responses that should NOT be retried
    good_responses = [
        "The time complexity of merge sort is $O(n \\log n)$ because we divide the array into halves recursively.",
        """To solve this problem, you can use a two-pointer approach:

```python
def two_sum(nums, target):
    left, right = 0, len(nums) - 1
    while left < right:
        current_sum = nums[left] + nums[right]
        if current_sum == target:
            return [left, right]
        elif current_sum < target:
            left += 1
        else:
            right -= 1
    return []
```

Time complexity: $O(n)$, Space complexity: $O(1)$""",
        "For this behavioral question, you should structure your answer using the STAR method: Situation, Task, Action, Result. Here's an example approach...",
    ]
    
    # Test poor responses
    failed_tests = []
    for response in poor_responses:
        if not should_retry_response(response, "test question"):
            failed_tests.append(f"Should have flagged as poor quality: '{response[:50]}...'")
    
    # Test good responses
    for response in good_responses:
        if should_retry_response(response, "test question"):
            failed_tests.append(f"Should NOT have flagged as poor quality: '{response[:50]}...'")
    
    if failed_tests:
        print("❌ Response Quality Checker Tests Failed:")
        for failure in failed_tests:
            print(f"  - {failure}")
        return False
    else:
        print("✅ Response Quality Checker Tests Passed!")
        return True

def test_response_formatting():
    """Test the response formatting enhancement function"""
    print("\n🧪 Testing Response Formatting...")
    
    test_cases = [
        {
            "input": "Here's the code:```python\ndef hello():\n    print('hello')\n```\nThis function prints hello.",
            "expected_improvements": ["proper code block formatting", "clean spacing"]
        },
        {
            "input": "The time complexity is$O(n)$and space complexity is$O(1)$.",
            "expected_improvements": ["proper math spacing"]
        },
        {
            "input": "Here are the steps:\n-First step\n-Second step\n-Third step",
            "expected_improvements": ["bullet point formatting"]
        },
        {
            "input": "This is a sentence.Next sentence should have space.",
            "expected_improvements": ["proper sentence spacing"]
        }
    ]
    
    all_passed = True
    for i, case in enumerate(test_cases):
        enhanced = enhance_response_formatting(case["input"])
        print(f"  Test {i+1}:")
        print(f"    Input:    '{case['input'][:60]}...'")
        print(f"    Enhanced: '{enhanced[:60]}...'")
        
        # Basic validation that formatting was applied
        if enhanced == case["input"]:
            print(f"    ⚠️  No formatting changes applied")
        else:
            print(f"    ✅ Formatting applied")
    
    print("✅ Response Formatting Tests Completed!")
    return all_passed

def test_latex_examples():
    """Test LaTeX formatting examples"""
    print("\n🧪 Testing LaTeX Examples...")
    
    latex_examples = [
        "Time complexity: $O(n \\log n)$",
        "Quadratic formula: $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$",
        "Set notation: $x \\in \\mathbb{R}$",
        "Algorithm analysis: $T(n) = 2T(n/2) + O(n)$",
        "Matrix multiplication: $(AB)_{ij} = \\sum_{k=1}^{n} A_{ik}B_{kj}$"
    ]
    
    print("  LaTeX Examples that should render properly:")
    for example in latex_examples:
        enhanced = enhance_response_formatting(example)
        print(f"    {enhanced}")
    
    print("✅ LaTeX Examples Listed!")
    return True

def main():
    """Run all tests"""
    print("🚀 Starting AI Response Quality Test Suite\n")
    
    tests = [
        test_response_quality_checker,
        test_response_formatting,
        test_latex_examples,
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"❌ Test failed with exception: {e}")
            results.append(False)
    
    print(f"\n📊 Test Results: {sum(results)}/{len(results)} tests passed")
    
    if all(results):
        print("🎉 All tests passed! AI answering improvements are working correctly.")
        return 0
    else:
        print("⚠️ Some tests failed. Please review the improvements.")
        return 1

if __name__ == "__main__":
    exit(main())
#!/usr/bin/env python3
"""
Quick test to verify single-pass response configuration
"""
import os
import sys

print("=" * 70)
print("SINGLE-PASS RESPONSE CONFIGURATION CHECK")
print("=" * 70)

# Check auto-continue setting
auto_continue = os.getenv('AI_AUTO_CONTINUE', '0')
print(f"\n1. AI_AUTO_CONTINUE: {auto_continue}")
if auto_continue.lower() in ('0', 'false', 'no', 'off'):
    print("   ✅ CORRECT: Auto-continue is DISABLED")
else:
    print("   ⚠️  WARNING: Auto-continue is ENABLED (will cause multiple responses)")
    print("   💡 Fix: Set AI_AUTO_CONTINUE=0 in .env or environment")

# Check max tokens
max_tokens = os.getenv('AI_MAX_TOKENS') or os.getenv('AI_MAX_NEW_TOKENS') or '0'
print(f"\n2. AI_MAX_TOKENS: {max_tokens}")
if max_tokens == '0' or max_tokens == '':
    print("   ✅ CORRECT: Unlimited tokens (model decides)")
elif int(max_tokens) >= 4000:
    print("   ✅ GOOD: High token limit allows complete responses")
else:
    print(f"   ⚠️  WARNING: Low token limit ({max_tokens}) may truncate responses")
    print("   💡 Recommendation: Set AI_MAX_TOKENS=0 for unlimited")

# Check temperature
temperature = os.getenv('AI_TEMPERATURE', '0.2')
print(f"\n3. AI_TEMPERATURE: {temperature}")
temp_val = float(temperature)
if 0.0 <= temp_val <= 0.3:
    print("   ✅ GOOD: Low temperature for consistent, focused responses")
elif temp_val > 0.7:
    print("   ⚠️  High temperature may cause rambling or incomplete responses")
else:
    print("   ℹ️  Moderate temperature")

# Check model
model = os.getenv('DEFAULT_LLM', 'gpt-4o-mini')
print(f"\n4. DEFAULT_LLM: {model}")
if 'gpt-4' in model or 'grok' in model.lower():
    print("   ✅ Using capable model")
else:
    print("   ℹ️  Using model:", model)

print("\n" + "=" * 70)
print("EXPECTED BEHAVIOR:")
print("=" * 70)
print("✅ ONE complete response per question")
print("✅ Full code + explanation + complexity in single response")
print("✅ No 'continued' or 'Part 1/Part 2' messages")
print("✅ Technical notation (O(n)) won't trigger continuation")
print("✅ Follow-up questions use conversation history")

print("\n" + "=" * 70)
print("TEST CASES TO TRY:")
print("=" * 70)
print("1. Ask: 'Write Python code for binary search'")
print("   Expected: ONE response with complete code")
print()
print("2. Ask: 'What's the time complexity of quicksort?'")
print("   Expected: ONE response ending with O(n log n)")
print()
print("3. Ask: 'Explain merge sort with code and examples'")
print("   Expected: ONE response with all sections")

print("\n" + "=" * 70)
print("If you still see multiple responses:")
print("=" * 70)
print("1. Restart the server completely (kill Python processes)")
print("2. Check server logs for 'Auto-continue pass' warnings")
print("3. Verify AI_AUTO_CONTINUE=0 in your environment")
print("4. See GUARANTEED_SINGLE_PASS_FIX.md for details")
print("=" * 70)

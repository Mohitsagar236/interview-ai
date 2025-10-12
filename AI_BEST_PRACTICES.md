# AI Interview Assistant - Best Practices Guide

## How to Get the Best Responses

### 1. Be Specific in Your Requests

✅ **GOOD:**
```
Write a Python function to calculate binary heap height using floor(log2(n)).
Provide clean code without comments.
```

❌ **BAD:**
```
Write code for heap
```

### 2. Specify Code Style Preferences

If you want clean code:
```
Provide the code WITHOUT comments or explanations.
```

If you want detailed explanations:
```
Provide the code with detailed comments explaining each step.
```

### 3. Request Structure You Want

For interview prep, specify format:
```
Provide:
1. Clean working code
2. Explanation of approach (after code)
3. Time and space complexity
```

### 4. Language Conversion

When converting code between languages:
```
Convert this Python code to C++.
Provide clean, idiomatic C++ without unnecessary comments.
```

## Common Request Patterns

### Pattern 1: Algorithm Problem
```
Problem: [describe problem]

Requirements:
- [specific requirements]
- [constraints]

Provide:
1. Working code in [language]
2. Explanation
3. Complexity analysis
```

### Pattern 2: Code Review/Fix
```
This code has issues: [paste code]

Fix the bugs and provide:
1. Corrected code
2. Explanation of what was wrong
```

### Pattern 3: Concept Explanation
```
Explain [concept] in the context of [specific scenario].
Include code examples if helpful.
```

## Troubleshooting

### AI Adds Too Many Comments
**Solution:** Explicitly state in your prompt:
```
Provide code WITHOUT comments unless absolutely necessary
```

### Response Too Short
**Solution:** 
1. Check `.env`: `AI_MAX_TOKENS=0` (unlimited)
2. Request: "Provide a complete, thorough explanation"

### Response Too Long
**Solution:**
1. Set token limit in `.env`: `AI_MAX_TOKENS=1000`
2. Request: "Provide a concise answer"

### Code Has Syntax Errors
**Solution:** Request:
```
Provide syntactically correct, runnable [language] code.
Include a main function to demonstrate usage.
```

## Configuration Tips

### For Interview Practice (Recommended)
```properties
AI_TEMPERATURE=0.7
AI_MAX_TOKENS=0
DEFAULT_LLM=openai/gpt-4o-mini
```

### For Quick Answers
```properties
AI_TEMPERATURE=0.5
AI_MAX_TOKENS=500
```

### For Creative Solutions
```properties
AI_TEMPERATURE=0.9
AI_MAX_TOKENS=0
```

## Example Prompts

### Data Structures
```
Implement a [structure] in Python with these operations:
- [operation 1]
- [operation 2]

Provide clean code and complexity analysis.
```

### Algorithm Implementation
```
Implement [algorithm] to solve [problem].
Input: [format]
Output: [format]
Constraints: [list]

Provide working code without comments.
```

### Debugging
```
This code fails for [case]: [paste code]

Debug and provide:
1. Fixed code
2. What was wrong
3. Test cases
```

### Concept Comparison
```
Compare [concept A] vs [concept B].
Focus on:
- Use cases
- Performance
- Trade-offs
```

## Remember

1. **Be explicit** - The AI follows your instructions literally
2. **Specify format** - Code style, comments, structure
3. **State requirements** - Language, complexity, constraints
4. **Request examples** - If you want test cases or usage examples
5. **Iterative refinement** - Ask follow-up questions to improve response

---

💡 **Pro Tip:** Save commonly used prompt patterns for consistent results!

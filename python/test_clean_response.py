from python.ai_providers import MessageFormatter

examples = [
    r'def foo():\\n    print("hello")\\n',
    r'Here is code: ```python\ndef add(a,b):\\n    return a+b\\n```',
    'Line1<br>Line2<br/>Line3',
    '```pythonprint(1)```',
    'No changes here\nAlready fine',
]

for i, t in enumerate(examples, 1):
    print(f"--- Example {i} ---")
    print("INPUT (repr):", repr(t))
    out = MessageFormatter.clean_response(t)
    print("OUTPUT:")
    print(out)
    print()

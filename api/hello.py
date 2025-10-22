# Minimal Vercel Python Serverless Example
# Place this file under `api/hello.py` and deploy to Vercel to expose
# a serverless endpoint at /api/hello

from http.server import BaseHTTPRequestHandler


def handler(request, context):
    # Vercel's Python runtime expects a handler function named `handler`.
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": "{\"message\": \"Hello from Vercel Python function!\"}"
    }

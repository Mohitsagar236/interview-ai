# Docker Deployment Guide

Build and run the Interview AI backend using Docker.

## Quick Start

### Build the Image

```bash
docker build -t interview-ai-backend .
```

### Run the Container

```bash
docker run -d \
  --name interview-ai \
  -p 8765:8765 \
  -e CLOUD_MODE=true \
  -e OPENROUTER_API_KEY=your_key \
  -e DEEPGRAM_API_KEY=your_key \
  interview-ai-backend
```

---

## Dockerfile

The project includes a production-ready Dockerfile:

```dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY python/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY python/ ./python/

# Expose port
EXPOSE 8765

# Health check
HEALTHCHECK --interval=30s --timeout=10s \
  CMD curl -f http://localhost:8765/health || exit 1

# Start server
CMD ["python", "python/server.py"]
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUD_MODE` | Yes | Set to `true` for production |
| `PORT` | No | Server port (default: 8765) |
| `HOST` | No | Bind address (default: 0.0.0.0) |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `DEEPGRAM_API_KEY` | Yes | Deepgram API key |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |

---

## Docker Compose

For local development with all services:

```yaml
version: '3.8'

services:
  backend:
    build: .
    ports:
      - "8765:8765"
    environment:
      - CLOUD_MODE=true
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8765/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Run with:
```bash
docker-compose up -d
```

---

## Optimizations

### Multi-Stage Build

For smaller images:

```dockerfile
# Build stage
FROM python:3.10 as builder
WORKDIR /app
COPY python/requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# Production stage
FROM python:3.10-slim
WORKDIR /app
COPY --from=builder /wheels /wheels
RUN pip install --no-cache /wheels/*
COPY python/ ./python/
CMD ["python", "python/server.py"]
```

### .dockerignore

Ensure these are excluded:

```
.git
.venv
node_modules
dist
build
*.md
.env
```

---

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker logs interview-ai

# Interactive shell
docker run -it interview-ai-backend /bin/bash
```

### Port Already in Use
```bash
# Find process using port
netstat -tulpn | grep 8765

# Use different port
docker run -p 8766:8765 interview-ai-backend
```

### Memory Issues
```bash
# Increase memory limit
docker run -m 1g interview-ai-backend
```

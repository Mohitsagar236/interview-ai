# Use Python 3.11
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements first (for better caching)
# Use lite version for faster deployment (no PaddleOCR)
COPY python/requirements-cloud-lite.txt .

# Install minimal system dependencies (Tesseract only)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Install Python dependencies (lighter, faster install)
RUN pip install --no-cache-dir -r requirements-cloud-lite.txt

# Copy the entire python directory
COPY python/ ./python/

# Expose port (Koyeb uses 8000 for HTTP, will proxy to WebSocket)
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV CLOUD_MODE=true
ENV PORT=8000
ENV HOST=0.0.0.0
ENV WS_PING_INTERVAL=30
ENV WS_PING_TIMEOUT=60
# Disable PaddleOCR since not installed (uses Tesseract fallback)
ENV USE_PADDLEOCR=0
ENV OCR_ENGINE=tesseract

# Health check for cloud platforms
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the server using start_server.py
CMD ["python", "python/start_server.py"]

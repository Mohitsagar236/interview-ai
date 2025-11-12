# Use Python 3.11
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements first (for better caching)
COPY python/requirements-cloud.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements-cloud.txt

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

# Run the server using start_server.py
CMD ["python", "python/start_server.py"]

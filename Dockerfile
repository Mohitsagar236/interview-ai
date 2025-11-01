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

# Expose port
EXPOSE 8765

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV CLOUD_MODE=true
ENV PORT=8765
ENV HOST=0.0.0.0

# Run the server
CMD ["python", "python/server.py"]

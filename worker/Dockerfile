FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

WORKDIR /app

# Install worker Python dependencies
COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared modules from backend and worker code
COPY backend/database.py ./database.py
COPY backend/models.py ./models.py
COPY backend/crud.py ./crud.py
COPY backend/schemas.py ./schemas.py
COPY worker/worker.py ./worker.py

# Env variables for Playwright
ENV PYTHONUNBUFFERED=1

# Expose ports for CDP debugging dynamic range (if needed, but Docker network allows exposing all internally)
# Expose port range 9000-9999 for CDP proxies
EXPOSE 9000-9999

# Run celery worker daemon
CMD ["celery", "-A", "worker.celery_app", "worker", "--loglevel=info", "-c", "8"]

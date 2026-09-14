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

# Env variables for Playwright & Celery
ENV PYTHONUNBUFFERED=1 \
    CELERY_CONCURRENCY=4

# Expose port range 9000-9999 for CDP proxies
EXPOSE 9000-9999

# Celery Worker Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD celery -A worker.celery_app inspect ping || exit 1

# Run celery worker daemon with configurable concurrency
CMD ["sh", "-c", "celery -A worker.celery_app worker --loglevel=info -c ${CELERY_CONCURRENCY}"]

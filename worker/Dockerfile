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

# Celery Worker Healthcheck: Fast and reliable Redis ping and process check
HEALTHCHECK --interval=20s --timeout=5s --retries=5 --start-period=15s \
    CMD python3 -c "import os, redis; r=redis.from_url(os.getenv('REDIS_URL', 'redis://redis:6379/0')); r.ping()" && pgrep -f 'celery -A worker.celery_app worker' || exit 1

# Run celery worker daemon with configurable concurrency and task recycling
CMD ["sh", "-c", "celery -A worker.celery_app worker --loglevel=info -c ${CELERY_CONCURRENCY:-40} --max-tasks-per-child=50"]


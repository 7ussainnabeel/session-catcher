import os

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:sessionsecretpassword123@postgres/session_reserve")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "supercomplexsessionjwtsecretkey987654321")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    PROFILES_DIR: str = os.getenv("PROFILES_DIR", "/app/shared/browser-profiles")
    SCREENSHOTS_DIR: str = os.getenv("SCREENSHOTS_DIR", "/app/shared/screenshots")
    MAX_WORKERS: int = int(os.getenv("MAX_WORKERS", "5"))
    WORKER_HOST: str = os.getenv("WORKER_HOST", "worker")

settings = Settings()

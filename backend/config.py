import os
from typing import List

class Settings:
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:sessionsecretpassword123@postgres:5432/session_reserve")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "supercomplexsessionjwtsecretkey987654321")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24)))  # 24 hours
    REFRESH_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7)))  # 7 days
    PROFILES_DIR: str = os.getenv("PROFILES_DIR", "/app/shared/browser-profiles")
    SCREENSHOTS_DIR: str = os.getenv("SCREENSHOTS_DIR", "/app/shared/screenshots")
    MAX_WORKERS: int = int(os.getenv("MAX_WORKERS", "40"))
    WORKER_HOST: str = os.getenv("WORKER_HOST", "worker")
    CORS_ORIGINS_RAW: str = os.getenv("CORS_ORIGINS", "*")

    @property
    def cors_origins(self) -> List[str]:
        if self.CORS_ORIGINS_RAW.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS_RAW.split(",") if origin.strip()]

settings = Settings()

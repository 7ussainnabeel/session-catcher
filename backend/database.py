import os
import time
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger("session_reserve.database")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:sessionsecretpassword123@postgres:5432/session_reserve")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=40,
    pool_pre_ping=True,
    pool_recycle=300
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db_with_retry(max_retries: int = 10, delay: int = 2):
    """Wait for database to be ready and create tables with retry backoff."""
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Connecting to database (attempt {attempt}/{max_retries})...")
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database connection established successfully.")
            Base.metadata.create_all(bind=engine)
            logger.info("Database schemas verified.")
            return True
        except Exception as e:
            logger.warning(f"Database connection attempt {attempt} failed: {e}")
            if attempt == max_retries:
                logger.error("Exhausted database connection retries. Raising error.")
                raise
            time.sleep(delay)


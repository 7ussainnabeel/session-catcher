from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user")  # admin, user
    is_suspended = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    jobs = relationship("MonitoringJob", back_populates="user", cascade="all, delete-orphan")
    profile = relationship("BrowserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    notification_settings = relationship("NotificationSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    logs = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")

class BrowserProfile(Base):
    __tablename__ = "browser_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    name = Column(String, nullable=False)
    profile_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="profile")

class MonitoringJob(Base):
    __tablename__ = "monitoring_jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    name = Column(String, nullable=False)
    target_url = Column(String, nullable=False)
    refresh_interval = Column(Integer, default=30)  # seconds
    expected_text = Column(String, nullable=True)
    expected_element = Column(String, nullable=True)
    expected_button = Column(String, nullable=True)
    expected_url = Column(String, nullable=True)
    expected_http_response = Column(Integer, nullable=True)
    expected_title = Column(String, nullable=True)
    max_retries = Column(Integer, default=10)
    timeout = Column(Integer, default=30)  # seconds
    status = Column(String, default="paused")  # active, paused, success, failed, finished
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="jobs")
    sessions = relationship("Session", back_populates="job", cascade="all, delete-orphan")
    logs = relationship("AuditLog", back_populates="job", cascade="all, delete-orphan")

class Worker(Base):
    __tablename__ = "workers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, default="available")  # available, assigned, monitoring, reserved, disconnected, finished
    current_job_id = Column(Integer, ForeignKey("monitoring_jobs.id", ondelete="SET NULL"), nullable=True)
    browser_ws_url = Column(String, nullable=True)  # CDP WebSocket debugger URL
    host = Column(String, nullable=True)
    port = Column(Integer, nullable=True)
    last_ping = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    job_id = Column(Integer, ForeignKey("monitoring_jobs.id", ondelete="CASCADE"))
    worker_id = Column(Integer, ForeignKey("workers.id", ondelete="SET NULL"), nullable=True)
    status = Column(String, default="active")  # active, closed
    screenshot_path = Column(String, nullable=True)
    cdp_ws_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="sessions")
    job = relationship("MonitoringJob", back_populates="sessions")

class NotificationSettings(Base):
    __tablename__ = "notification_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    
    email_enabled = Column(Boolean, default=False)
    email_address = Column(String, nullable=True)
    
    telegram_enabled = Column(Boolean, default=False)
    telegram_bot_token = Column(String, nullable=True)
    telegram_chat_id = Column(String, nullable=True)
    
    discord_enabled = Column(Boolean, default=False)
    discord_webhook_url = Column(String, nullable=True)
    
    slack_enabled = Column(Boolean, default=False)
    slack_webhook_url = Column(String, nullable=True)
    
    webhook_enabled = Column(Boolean, default=False)
    webhook_url = Column(String, nullable=True)

    user = relationship("User", back_populates="notification_settings")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    job_id = Column(Integer, ForeignKey("monitoring_jobs.id", ondelete="SET NULL"), nullable=True)
    message = Column(Text, nullable=False)
    level = Column(String, default="info")  # info, warning, error
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="logs")
    job = relationship("MonitoringJob", back_populates="logs")

class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    value = Column(String, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

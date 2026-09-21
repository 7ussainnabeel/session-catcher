from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
import models
import schemas
import bcrypt
from datetime import datetime
import os

# --- Password Helpers ---
def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        pwd_bytes = plain_password.encode('utf-8')[:72]
        hash_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False

# --- Audit Logging Helper ---
def log_activity(db: Session, message: str, level: str = "info", user_id: int = None, job_id: int = None):
    db_log = models.AuditLog(
        user_id=user_id,
        job_id=job_id,
        message=message,
        level=level,
        created_at=datetime.utcnow()
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

# --- User CRUD ---
def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.User).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate):
    # Determine role (first user is admin, otherwise user)
    users_count = db.query(models.User).count()
    role = "admin" if users_count == 0 else "user"
    
    hashed_pwd = get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        hashed_password=hashed_pwd,
        role=role,
        is_suspended=False
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # Initialize notification settings
    db_notif = models.NotificationSettings(
        user_id=db_user.id,
        email_enabled=False,
        email_address=db_user.email
    )
    db.add(db_notif)
    
    # Initialize default browser profile path
    profile_dir = os.path.join(os.getenv("PROFILES_DIR", "/app/shared/browser-profiles"), f"user_{db_user.id}")
    db_profile = models.BrowserProfile(
        user_id=db_user.id,
        name="Default Profile",
        profile_path=profile_dir
    )
    db.add(db_profile)
    
    db.commit()
    log_activity(db, f"User registered successfully: {user.email}", "info", user_id=db_user.id)
    return db_user

def update_user(db: Session, user_id: int, user_update: schemas.UserUpdate):
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    if user_update.password is not None:
        db_user.hashed_password = get_password_hash(user_update.password)
    if user_update.role is not None:
        db_user.role = user_update.role
    if user_update.is_suspended is not None:
        db_user.is_suspended = user_update.is_suspended
    db.commit()
    db.refresh(db_user)
    log_activity(db, f"User details updated for user_id={user_id}", "info", user_id=user_id)
    return db_user

def delete_user(db: Session, user_id: int):
    db_user = get_user(db, user_id)
    if db_user:
        db.delete(db_user)
        db.commit()
        return True
    return False

# --- Browser Profile CRUD ---
def get_browser_profile(db: Session, user_id: int):
    return db.query(models.BrowserProfile).filter(models.BrowserProfile.user_id == user_id).first()

# --- Notification Settings CRUD ---
def get_notification_settings(db: Session, user_id: int):
    return db.query(models.NotificationSettings).filter(models.NotificationSettings.user_id == user_id).first()

def update_notification_settings(db: Session, user_id: int, settings: schemas.NotificationSettingsUpdate):
    db_settings = get_notification_settings(db, user_id)
    if not db_settings:
        db_settings = models.NotificationSettings(user_id=user_id)
        db.add(db_settings)
    for var, val in vars(settings).items():
        setattr(db_settings, var, val)
    db.commit()
    db.refresh(db_settings)
    log_activity(db, "Notification settings updated", "info", user_id=user_id)
    return db_settings

# --- Monitoring Jobs CRUD ---
def get_job(db: Session, job_id: int):
    return db.query(models.MonitoringJob).filter(models.MonitoringJob.id == job_id).first()

def get_jobs_by_user(db: Session, user_id: int):
    return db.query(models.MonitoringJob).filter(models.MonitoringJob.user_id == user_id).all()

def get_all_jobs(db: Session):
    return db.query(models.MonitoringJob).all()

def create_monitoring_job(db: Session, user_id: int, job: schemas.MonitoringJobCreate):
    db_job = models.MonitoringJob(
        user_id=user_id,
        **job.dict(),
        status="paused"
    )
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    log_activity(db, f"Monitoring job created: {job.name}", "info", user_id=user_id, job_id=db_job.id)
    return db_job

def update_monitoring_job(db: Session, job_id: int, job_update: schemas.MonitoringJobUpdate):
    db_job = get_job(db, job_id)
    if not db_job:
        return None
    update_data = job_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_job, key, value)
    db.commit()
    db.refresh(db_job)
    log_activity(db, f"Monitoring job updated: status={db_job.status}", "info", user_id=db_job.user_id, job_id=db_job.id)
    return db_job

def delete_monitoring_job(db: Session, job_id: int):
    db_job = get_job(db, job_id)
    if db_job:
        db.delete(db_job)
        db.commit()
        return True
    return False

# --- Worker CRUD ---
def register_worker(db: Session, name: str, host: str, port: int):
    db_worker = db.query(models.Worker).filter(models.Worker.name == name).first()
    if not db_worker:
        db_worker = models.Worker(name=name, status="available", host=host, port=port)
        db.add(db_worker)
    else:
        db_worker.host = host
        db_worker.port = port
        db_worker.last_ping = datetime.utcnow()
    db.commit()
    db.refresh(db_worker)
    return db_worker

def get_workers(db: Session):
    return db.query(models.Worker).all()

def get_worker(db: Session, worker_id: int):
    return db.query(models.Worker).filter(models.Worker.id == worker_id).first()

# --- Sessions CRUD ---
def create_session(db: Session, user_id: int, job_id: int, worker_id: int, cdp_ws_url: str):
    # Close any existing active sessions for this job to prevent stale accumulation
    db.query(models.Session).filter(
        models.Session.job_id == job_id,
        models.Session.status == "active"
    ).update({"status": "closed", "closed_at": datetime.utcnow()})
    
    db_session = models.Session(
        user_id=user_id,
        job_id=job_id,
        worker_id=worker_id,
        cdp_ws_url=cdp_ws_url,
        status="active",
        created_at=datetime.utcnow()
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session

def close_session(db: Session, session_id: int):
    db_session = db.query(models.Session).filter(models.Session.id == session_id).first()
    if db_session:
        db_session.status = "closed"
        db_session.closed_at = datetime.utcnow()
        db.commit()
    return db_session

def get_active_session_by_job(db: Session, job_id: int):
    return db.query(models.Session).filter(
        models.Session.job_id == job_id,
        models.Session.status == "active"
    ).order_by(desc(models.Session.id)).first()

def get_sessions_by_user(db: Session, user_id: int):
    return db.query(models.Session).filter(models.Session.user_id == user_id).order_by(desc(models.Session.created_at)).all()

# --- Audit Logs ---
def get_logs(db: Session, user_id: int = None, skip: int = 0, limit: int = 100):
    query = db.query(models.AuditLog)
    if user_id:
        query = query.filter(models.AuditLog.user_id == user_id)
    return query.order_by(desc(models.AuditLog.created_at)).offset(skip).limit(limit).all()

# --- System Settings ---
def get_system_setting(db: Session, key: str) -> Optional[str]:
    setting = db.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
    return setting.value if setting else None

def set_system_setting(db: Session, key: str, value: str):
    setting = db.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
    if not setting:
        setting = models.SystemSettings(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
    db.commit()
    db.refresh(setting)
    return setting

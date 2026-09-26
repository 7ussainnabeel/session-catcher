from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import timedelta, datetime
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
from urllib.parse import urlparse, urlunparse
import asyncio
import socket
import urllib.request
import os
import psutil
import json
import logging
import redis
import io
import zipfile

import models
import schemas
import crud
from database import engine, get_db, init_db_with_retry
from auth import (
    create_access_token,
    create_refresh_token,
    verify_token,
    get_current_user,
    get_current_admin_user,
    get_ws_user
)
from ws_manager import dashboard_ws_manager, CDPProxyManager
from celery_app import celery_app
from config import settings

# Setup structured logging
log_level = getattr(logging, settings.LOG_LEVEL, logging.INFO)
logging.basicConfig(
    level=log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("session_reserve.api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup tasks
    logger.info(f"Starting Session Reserve in {settings.ENVIRONMENT} mode...")
    os.makedirs(settings.SCREENSHOTS_DIR, exist_ok=True)
    os.makedirs(settings.PROFILES_DIR, exist_ok=True)
    init_db_with_retry(max_retries=15, delay=2)
    
    # Auto-seed initial users if table is empty
    try:
        db = next(get_db())
        admin_user = crud.get_user_by_email(db, email="hnabeel3@gmail.com")
        if not admin_user:
            admin_user = crud.create_user(db, schemas.UserCreate(email="hnabeel3@gmail.com", password="AdminPassword123!"))
            logger.info("Seeded admin account: hnabeel3@gmail.com")
            
        if not crud.get_user_by_email(db, email="admin@sessionreserve.com"):
            crud.create_user(db, schemas.UserCreate(email="admin@sessionreserve.com", password="AdminPassword123!"))
            logger.info("Seeded secondary admin: admin@sessionreserve.com")
            
        # Create default job for https://haj.gov.bh/home if none exist
        if db.query(models.MonitoringJob).filter(models.MonitoringJob.user_id == admin_user.id).count() == 0:
            default_job = crud.create_monitoring_job(db, admin_user.id, schemas.MonitoringJobCreate(
                name="Hajj Platform Registration",
                target_url="https://haj.gov.bh/home",
                refresh_interval=30,
                expected_title="منصة الحج",
                expected_button="تسجيل جديد",
                max_retries=100,
                timeout=30
            ))
            crud.update_monitoring_job(db, default_job.id, schemas.MonitoringJobUpdate(status="active"))
            logger.info(f"Seeded default job ID {default_job.id} for {admin_user.email}")
    except Exception as e:
        logger.warning(f"Error checking/seeding initial database state: {e}")

    logger.info("Application startup sequence completed successfully.")
    yield
    # Shutdown tasks
    logger.info("Application shutting down...")

app = FastAPI(
    title="Session Reserve API",
    description="Backend API for managing browser authentication sessions and monitoring jobs.",
    version="1.0.0",
    docs_url="/api/docs" if settings.ENVIRONMENT != "production_strict" else None,
    openapi_url="/api/openapi.json" if settings.ENVIRONMENT != "production_strict" else None,
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Production Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please contact administrator."}
    )

# Ensure directories exist before mounting static files
os.makedirs(settings.SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(settings.PROFILES_DIR, exist_ok=True)
app.mount("/api/screenshots", StaticFiles(directory=settings.SCREENSHOTS_DIR), name="screenshots")

# --- HEALTH CHECK ENDPOINT ---

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    """Production health check for Docker, load balancers, and uptime monitors."""
    health = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "environment": settings.ENVIRONMENT,
        "services": {
            "database": "unknown",
            "redis": "unknown"
        }
    }
    status_code = status.HTTP_200_OK

    # Check Database
    try:
        db.execute(text("SELECT 1"))
        health["services"]["database"] = "up"
    except Exception as e:
        health["services"]["database"] = f"down: {str(e)}"
        health["status"] = "unhealthy"
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    # Check Redis
    try:
        r = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=3)
        if r.ping():
            health["services"]["redis"] = "up"
        else:
            health["services"]["redis"] = "down"
            health["status"] = "unhealthy"
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    except Exception as e:
        health["services"]["redis"] = f"down: {str(e)}"
        health["status"] = "unhealthy"
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    # System load
    health["system"] = {
        "cpu_percent": psutil.cpu_percent(),
        "memory_percent": psutil.virtual_memory().percent
    }

    return Response(
        content=json.dumps(health),
        status_code=status_code,
        media_type="application/json"
    )

# --- AUTH ENDPOINTS ---

@app.post("/api/auth/register", response_model=schemas.UserOut)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_user(db=db, user=user)

@app.post("/api/auth/login", response_model=schemas.Token)
def login(user_credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    user = crud.get_user_by_email(db, email=user_credentials.email)
    if not user or not crud.verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.is_suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is suspended")

    access_token = create_access_token(data={"sub": user.email, "role": user.role})
    refresh_token = create_refresh_token(data={"sub": user.email})
    
    crud.log_activity(db, f"User logged in successfully", "info", user_id=user.id)
    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}

@app.post("/api/auth/refresh", response_model=schemas.Token)
def refresh_token(payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    # verify_token is used as dependency but we require refresh token type
    # payload is extracted from verify_token
    email = payload.get("sub")
    if not email or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
        
    user = crud.get_user_by_email(db, email=email)
    if not user or user.is_suspended:
        raise HTTPException(status_code=401, detail="Invalid user session")

    access_token = create_access_token(data={"sub": user.email, "role": user.role})
    new_refresh_token = create_refresh_token(data={"sub": user.email})
    return {"access_token": access_token, "refresh_token": new_refresh_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


# --- MONITORING JOBS ENDPOINTS ---

@app.get("/api/jobs", response_model=list[schemas.MonitoringJobOut])
def list_jobs(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return crud.get_jobs_by_user(db, user_id=current_user.id)

@app.post("/api/jobs", response_model=schemas.MonitoringJobOut)
def create_job(job: schemas.MonitoringJobCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_job = crud.create_monitoring_job(db=db, user_id=current_user.id, job=job)
    # Directly activate and dispatch dedicated checker worker to begin monitoring immediately
    db_job.status = "active"
    db.commit()
    db.refresh(db_job)
    celery_app.send_task("worker.run_monitoring_job", args=[db_job.id])
    crud.log_activity(db, f"Checker spawned automatically for new monitoring job: {db_job.name} (ID {db_job.id})", "info", user_id=current_user.id, job_id=db_job.id)
    return db_job

@app.get("/api/jobs/{job_id}", response_model=schemas.MonitoringJobOut)
def get_job(job_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job or db_job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return db_job

@app.put("/api/jobs/{job_id}", response_model=schemas.MonitoringJobOut)
def update_job(job_id: int, job_update: schemas.MonitoringJobUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job or db_job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return crud.update_monitoring_job(db, job_id, job_update)

@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job or db_job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # If job is active/monitoring, stop browser first
    if db_job.status in ["active", "success"]:
        # Set status to finished or paused
        crud.update_monitoring_job(db, job_id, schemas.MonitoringJobUpdate(status="finished"))
    
    crud.delete_monitoring_job(db, job_id)
    crud.log_activity(db, f"Job deleted: {db_job.name}", "warning", user_id=current_user.id)
    return {"message": "Job deleted successfully"}


# --- JOB CONTROLS ---

@app.post("/api/jobs/{job_id}/start")
def start_job(job_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job or db_job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Check max workers
    running_jobs = db.query(models.MonitoringJob).filter(models.MonitoringJob.status == "active").count()
    if running_jobs >= settings.MAX_WORKERS:
        raise HTTPException(status_code=400, detail="Worker pool is full. Please pause another job first.")

    # Update state
    crud.update_monitoring_job(db, job_id, schemas.MonitoringJobUpdate(status="active"))
    
    # Trigger Celery Task
    celery_app.send_task("worker.run_monitoring_job", args=[job_id])
    
    crud.log_activity(db, f"Job started monitoring: {db_job.name}", "info", user_id=current_user.id, job_id=job_id)
    return {"message": "Monitoring job started successfully"}

@app.post("/api/jobs/{job_id}/pause")
def pause_job(job_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job or db_job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    
    crud.update_monitoring_job(db, job_id, schemas.MonitoringJobUpdate(status="paused"))
    crud.log_activity(db, f"Job paused: {db_job.name}", "info", user_id=current_user.id, job_id=job_id)
    return {"message": "Monitoring job paused successfully"}

@app.post("/api/jobs/{job_id}/resume")
def resume_job(job_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return start_job(job_id, current_user, db)

@app.post("/api/jobs/{job_id}/stop")
def stop_job(job_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job or db_job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    
    crud.update_monitoring_job(db, job_id, schemas.MonitoringJobUpdate(status="paused"))
    
    # Close all active sessions for this job
    db.query(models.Session).filter(
        models.Session.job_id == job_id,
        models.Session.status == "active"
    ).update({"status": "closed", "closed_at": datetime.utcnow()})
    
    # Release any worker allocated to this job
    db.query(models.Worker).filter(
        models.Worker.current_job_id == job_id
    ).update({"status": "available", "current_job_id": None, "browser_ws_url": None})
    db.commit()
        
    crud.log_activity(db, f"Job session stopped and closed: {db_job.name}", "info", user_id=current_user.id, job_id=job_id)
    return {"message": "Monitoring job stopped and browser closed"}


# --- SESSIONS AND RECONNECTION ---

@app.get("/api/sessions", response_model=list[schemas.SessionOut])
def list_sessions(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return crud.get_sessions_by_user(db, user_id=current_user.id)

@app.get("/api/jobs/{job_id}/session", response_model=Optional[schemas.SessionOut])
def get_job_session(job_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_job = crud.get_job(db, job_id)
    if not db_job or db_job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return crud.get_active_session_by_job(db, job_id)


# --- NOTIFICATIONS ENDPOINTS ---

@app.get("/api/notifications/settings", response_model=schemas.NotificationSettingsOut)
def get_notification_settings(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return crud.get_notification_settings(db, user_id=current_user.id)

@app.put("/api/notifications/settings", response_model=schemas.NotificationSettingsOut)
def update_notification_settings(
    settings_update: schemas.NotificationSettingsUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return crud.update_notification_settings(db, user_id=current_user.id, settings=settings_update)

@app.post("/api/notifications/test-telegram")
def test_telegram_notification(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_settings = crud.get_notification_settings(db, user_id=current_user.id)
    if not user_settings or not user_settings.telegram_bot_token or not user_settings.telegram_chat_id:
        raise HTTPException(status_code=400, detail="Please enter and save your Telegram Bot Token and Chat ID first.")
    
    import urllib.request
    import urllib.error
    
    test_msg = (
        "🤖 <b>Session Reserve — Telegram Bot Connected!</b> 🤖\n\n"
        "✅ Your Telegram bot is active and ready.\n\n"
        "Whenever an authenticated session is caught (e.g., from Oracle APEX), "
        "the full session link, session ID, cookies, and page screenshot will be posted here automatically."
    )
    url = f"https://api.telegram.org/bot{user_settings.telegram_bot_token}/sendMessage"
    payload = json.dumps({
        "chat_id": user_settings.telegram_chat_id,
        "text": test_msg,
        "parse_mode": "HTML"
    }).encode("utf-8")
    
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("ok"):
                crud.log_activity(db, "Telegram test notification sent successfully", "info", user_id=current_user.id)
                return {"message": "Test notification sent successfully to your Telegram chatbot!"}
            else:
                desc = data.get("description", "Unknown Telegram error")
                raise HTTPException(status_code=400, detail=f"Telegram API Error: {desc}")
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        try:
            parsed_err = json.loads(err_msg)
            err_desc = parsed_err.get("description", err_msg)
        except Exception:
            err_desc = err_msg
        logger.error(f"Telegram API HTTP error: {err_desc}")
        raise HTTPException(status_code=400, detail=f"Telegram API error: {err_desc}")
    except Exception as e:
        logger.error(f"Telegram test error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to connect to Telegram: {str(e)}")


# --- EXTENSION COMPANION ENDPOINTS ---

@app.get("/api/extension/download")
def download_extension_bundle():
    """Package the Chrome/Edge extension into a downloadable ZIP archive."""
    ext_dir = os.getenv("EXTENSION_DIR", "/app/hajj-session-queue-assistant")
    if not os.path.isdir(ext_dir):
        ext_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "hajj-session-queue-assistant"))
    
    if not os.path.isdir(ext_dir):
        raise HTTPException(status_code=404, detail="Extension directory not found")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for root, dirs, files in os.walk(ext_dir):
            for file in files:
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, ext_dir)
                zip_file.write(file_path, rel_path)

    buffer.seek(0)
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="hajj-session-queue-assistant.zip"'
        }
    )

@app.post("/api/extension/sync")
async def sync_extension_telemetry(payload: dict, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Receives telemetry sync from the browser extension and broadcasts to real-time dashboard."""
    session_status = payload.get("session_status", "UNKNOWN")
    queue_status = payload.get("queue_status", "UNKNOWN")
    queue_pos = payload.get("queue_position")
    
    msg = f"Browser Extension Synced: Session={session_status}, Queue={queue_status}"
    if queue_pos is not None:
        msg += f" (Position #{queue_pos})"
        
    db_log = crud.log_activity(db, msg, "info", user_id=current_user.id)
    
    await dashboard_ws_manager.broadcast({
        "type": "log",
        "data": {
            "id": db_log.id,
            "user_id": db_log.user_id,
            "message": db_log.message,
            "level": db_log.level,
            "created_at": db_log.created_at.isoformat()
        }
    })
    
    return {"status": "synced"}


# --- AUDIT LOGS ENDPOINTS ---

@app.get("/api/logs", response_model=list[schemas.AuditLogOut])
def get_logs(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Users can only view their own logs
    return crud.get_logs(db, user_id=current_user.id)


# --- ADMIN PANEL ENDPOINTS ---

@app.get("/api/admin/stats")
def admin_stats(current_admin: models.User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    # Gather CPU/RAM/Disk stats of container host
    cpu_usage = psutil.cpu_percent()
    ram = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    total_users = db.query(models.User).count()
    active_jobs = db.query(models.MonitoringJob).filter(models.MonitoringJob.status == "active").count()
    active_sessions = db.query(models.Session).filter(models.Session.status == "active").count()
    total_workers = db.query(models.Worker).count()
    
    return {
        "system": {
            "cpu": cpu_usage,
            "ram": ram.percent,
            "disk": disk.percent,
        },
        "app": {
            "users": total_users,
            "running_browsers": active_sessions + active_jobs,
            "active_jobs": active_jobs,
            "reserved_sessions": active_sessions,
            "total_workers": total_workers
        }
    }

@app.get("/api/admin/users", response_model=list[schemas.UserOut])
def admin_list_users(current_admin: models.User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    return crud.get_users(db)

@app.put("/api/admin/users/{user_id}/status")
def admin_toggle_user_status(user_id: int, suspend: bool, current_admin: models.User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    db_user = crud.get_user(db, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot suspend an admin user")
    
    db_user.is_suspended = suspend
    db.commit()
    
    status_str = "suspended" if suspend else "unsuspended"
    crud.log_activity(db, f"Admin updated user_id={user_id} status to {status_str}", "warning", user_id=current_admin.id)
    return {"message": f"User successfully {status_str}"}

@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: int, current_admin: models.User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    db_user = crud.get_user(db, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete an admin user")
    
    crud.delete_user(db, user_id)
    crud.log_activity(db, f"Admin deleted user_id={user_id}", "danger", user_id=current_admin.id)
    return {"message": "User deleted successfully"}

@app.get("/api/admin/logs", response_model=list[schemas.AuditLogOut])
def admin_get_all_logs(current_admin: models.User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    return crud.get_logs(db, user_id=None, limit=200)

@app.get("/api/admin/workers", response_model=list[schemas.WorkerOut])
def admin_list_workers(current_admin: models.User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    return crud.get_workers(db)


# --- WEBSOCKET CHANNELS ---

@app.websocket("/api/ws/dashboard")
async def ws_dashboard(websocket: WebSocket, token: str = None, db: Session = Depends(get_db)):
    # Authenticate socket
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    user = get_ws_user(token, db)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await dashboard_ws_manager.connect(websocket)
    try:
        while True:
            # We keep the connection open and listen for user messages if any
            # Heartbeat checks can happen here
            data = await websocket.receive_text()
            # Simple heartbeat ping
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        dashboard_ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"Dashboard WS Exception: {e}")
        dashboard_ws_manager.disconnect(websocket)


@app.websocket("/api/ws/browser/{job_id}")
async def ws_browser(websocket: WebSocket, job_id: int, token: str = None, db: Session = Depends(get_db)):
    # Authenticate socket
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    user = get_ws_user(token, db)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    # Fetch job and check permissions
    db_job = crud.get_job(db, job_id)
    if not db_job or (db_job.user_id != user.id and user.role != "admin"):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    # Accept the client websocket connection first so connection is established
    await websocket.accept()
    
    # If job is active or setup requested, but no worker is currently running, auto-dispatch Celery task
    worker = db.query(models.Worker).filter(models.Worker.current_job_id == job_id, models.Worker.status.in_(["assigned", "monitoring", "reserved"])).first()
    if not worker and db_job.status in ["active", "paused"]:
        if db_job.status == "paused":
            crud.update_monitoring_job(db, job_id, schemas.MonitoringJobUpdate(status="active"))
        celery_app.send_task("worker.run_monitoring_job", args=[job_id])
    
    # Retrieve browser WS debug URL
    cdp_url = None
    active_session = None
    worker = None
    task_dispatched = False
    
    for attempt in range(25): # Wait up to 12.5s for browser to initialize
        db.expire_all()
        worker = db.query(models.Worker).filter(models.Worker.current_job_id == job_id, models.Worker.status.in_(["assigned", "monitoring", "reserved"])).first()
        if not worker:
            worker = db.query(models.Worker).filter(models.Worker.current_job_id == job_id).first()

        if worker and worker.port:
            try:
                query_host = worker.host or settings.WORKER_HOST or "worker"
                url = f"http://{query_host}:{worker.port}/json"
                req = urllib.request.Request(url, headers={"Host": "localhost"})
                with urllib.request.urlopen(req, timeout=1.5) as resp:
                    targets = json.loads(resp.read().decode())
                    for t in targets:
                        if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                            cdp_url = t.get("webSocketDebuggerUrl")
                            break
                        elif t.get("webSocketDebuggerUrl"):
                            cdp_url = t.get("webSocketDebuggerUrl")
                if cdp_url:
                    worker.browser_ws_url = cdp_url
                    db.commit()
                    break
            except Exception as e:
                # If worker port is dead and not already dispatched, clear stale URL and dispatch job
                logger.debug(f"Worker {worker.id} on port {worker.port} not responding to /json ({e}).")
                if not task_dispatched:
                    celery_app.send_task("worker.run_monitoring_job", args=[job_id])
                    task_dispatched = True

        active_session = crud.get_active_session_by_job(db, job_id)
        if active_session and active_session.cdp_ws_url:
            cdp_url = active_session.cdp_ws_url
            break
                
        await asyncio.sleep(0.5)

    if not cdp_url:
        logger.error(f"No active CDP debug session found for job {job_id}")
        await websocket.send_json({"error": "Browser is starting up. Please click Live View again in a few seconds."})
        await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)
        return
    
    # Tunnel to Chromium browser CDP
    # Resolve to IP address to satisfy Chromium's DevTools Host header security check
    target_host = worker.host if worker and worker.host else settings.WORKER_HOST
    try:
        worker_target = socket.gethostbyname(target_host)
    except Exception:
        worker_target = target_host

    try:
        parsed = urlparse(cdp_url)
        port = (worker.port if worker and worker.port else None) or parsed.port or 9222
        netloc = f"{worker_target}:{port}"
        cdp_url = urlunparse((parsed.scheme or "ws", netloc, parsed.path, parsed.params, parsed.query, parsed.fragment))
    except Exception as e:
        logger.warning(f"Error parsing CDP URL {cdp_url}: {e}")
        
    try:
        await CDPProxyManager.proxy_cdp(websocket, cdp_url)
    except Exception as e:
        logger.error(f"CDP connection ended for job {job_id}: {e}")
        if active_session:
            active_session.status = "closed"
            active_session.closed_at = datetime.utcnow()
            db.commit()
            crud.log_activity(db, f"CDP session {active_session.id} for job {job_id} closed: {e}", "warning", user_id=user.id, job_id=job_id)

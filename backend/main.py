from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from datetime import timedelta
import os
import psutil
import json
import logging

import models
import schemas
import crud
from database import engine, get_db
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

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("session_reserve.api")

# Create database tables
models.Base.metadata.create_all(bind=engine)

# Create system screenshots directory if not exist
os.makedirs(settings.SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(settings.PROFILES_DIR, exist_ok=True)

app = FastAPI(
    title="Session Reserve API",
    description="Backend API for managing browser authentication sessions and monitoring jobs.",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve screenshots static files
app.mount("/api/screenshots", StaticFiles(directory=settings.SCREENSHOTS_DIR), name="screenshots")

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
    return crud.create_monitoring_job(db=db, user_id=current_user.id, job=job)

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
    
    crud.update_monitoring_job(db, job_id, schemas.MonitoringJobUpdate(status="finished"))
    
    # Close any active session
    active_session = crud.get_active_session_by_job(db, job_id)
    if active_session:
        active_session.status = "closed"
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
async def ws_browser(websocket: WebSocket, token: str = None, db: Session = Depends(get_db)):
    # Authenticate socket
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    user = get_ws_user(token, db)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    # Fetch active session and check permissions
    db_job = crud.get_job(db, job_id)
    if not db_job or (db_job.user_id != user.id and user.role != "admin"):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    # Retrieve browser WS debug URL
    active_session = crud.get_active_session_by_job(db, job_id)
    if not active_session or not active_session.cdp_ws_url:
        # Check if worker is active and has a debugging URL directly
        # Sometimes worker registers browser WS url directly on the job/worker
        # Try to fallback
        logger.error(f"No active session found for job {job_id}")
        await websocket.accept()
        await websocket.send_json({"error": "No active remote session available. Verify that the job is RESERVED."})
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        return
        
    # Accept the client websocket connection first
    await websocket.accept()
    
    # Tunnel to Chromium browser CDP
    # The active_session.cdp_ws_url is inside the worker container
    # Since they run on the same network, worker is accessible by 'worker' host.
    # The URL looks like ws://127.0.0.1:PORT/devtools/browser/... or similar.
    # Replace 127.0.0.1/localhost inside cdp_ws_url with worker service host name
    cdp_url = active_session.cdp_ws_url
    if "127.0.0.1" in cdp_url:
        cdp_url = cdp_url.replace("127.0.0.1", settings.WORKER_HOST)
    elif "localhost" in cdp_url:
        cdp_url = cdp_url.replace("localhost", settings.WORKER_HOST)
        
    await CDPProxyManager.proxy_cdp(websocket, cdp_url)

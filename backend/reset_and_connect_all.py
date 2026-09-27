import os
import sys
import redis
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import schemas
from celery_app import celery_app
from config import settings

def reset_and_connect_all():
    print("[*] Connecting to database and Redis...")
    db: Session = SessionLocal()
    
    # 1. Identify jobs that already have a captured active session
    captured_sessions = db.query(models.Session).filter(models.Session.status == "active").all()
    preserved_job_ids = set()
    preserved_worker_ids = set()
    for s in captured_sessions:
        job = db.query(models.MonitoringJob).filter(models.MonitoringJob.id == s.job_id).first()
        if job and (job.status == "success" or s.cdp_ws_url):
            preserved_job_ids.add(job.id)
            if s.worker_id:
                preserved_worker_ids.add(s.worker_id)
            print(f"[✔] PRESERVING CAPTURED SESSION: Job #{job.id} ('{job.name}') - Session #{s.id} (CDP: {s.cdp_ws_url}). NOT resetting!")

    # Also preserve any job marked as 'success'
    success_jobs = db.query(models.MonitoringJob).filter(models.MonitoringJob.status == "success").all()
    for sj in success_jobs:
        preserved_job_ids.add(sj.id)
        print(f"[✔] PRESERVING SUCCESS JOB #{sj.id} ('{sj.name}'). Session is captured and reserved.")

    # 2. Clear stale celery queues in Redis only if there are no preserved sessions, or keep active tasks safe
    try:
        r = redis.from_url(settings.REDIS_URL)
        if not preserved_job_ids:
            r.flushdb()
            print("[+] Redis queues purged (no captured sessions active).")
        else:
            print(f"[*] Preserving Redis state ({len(preserved_job_ids)} captured session(s) active).")
    except Exception as e:
        print(f"[-] Redis warning: {e}")

    # 3. Clean up only orphaned workers (do NOT delete workers holding captured sessions)
    try:
        if preserved_worker_ids:
            db.query(models.Worker).filter(~models.Worker.id.in_(preserved_worker_ids)).delete(synchronize_session=False)
        elif not preserved_job_ids:
            db.query(models.Worker).delete()
        db.commit()
        print("[+] Stale worker records cleaned up (captured session workers preserved).")
    except Exception as e:
        db.rollback()
        print(f"[-] Worker cleanup warning: {e}")

    # 4. Find or create jobs
    jobs = db.query(models.MonitoringJob).all()
    if not jobs:
        admin_user = db.query(models.User).filter(models.User.role == "admin").first()
        if not admin_user:
            admin_user = db.query(models.User).first()
        user_id = admin_user.id if admin_user else 1
        new_job = models.MonitoringJob(
            user_id=user_id,
            name="Hajj Platform Registration",
            target_url="https://haj.gov.bh/register/bahraini",
            refresh_interval=86400,
            expected_text="بدء التسجيل or تقديم طلب التسجيل",
            expected_element='a[href*="/register"]',
            expected_title="نظام تسجيل الحج",
            expected_url="",
            expected_http_response=200,
            max_retries=100,
            timeout=30,
            status="active"
        )
        db.add(new_job)
        db.commit()
        db.refresh(new_job)
        jobs = [new_job]

    print(f"[*] Processing {len(jobs)} monitoring engine(s)...")
    for j in jobs:
        if j.id in preserved_job_ids:
            print(f"[✔] Job #{j.id} has a CAPTURED SESSION. Skipping reset to keep session reserved!")
            continue

        j.target_url = "https://haj.gov.bh/register/bahraini"
        j.name = "Hajj Platform Registration"
        j.refresh_interval = 86400
        j.expected_text = "بدء التسجيل or تقديم طلب التسجيل"
        j.expected_element = 'a[href*="/register"]'
        j.expected_title = "نظام تسجيل الحج"
        j.expected_url = ""
        j.expected_http_response = 200
        j.max_retries = 100
        j.timeout = 30
        j.status = "active"
        db.commit()
        
        # Dispatch Celery worker for uncaptured jobs
        celery_app.send_task("worker.run_monitoring_job", args=[j.id])
        print(f"[+] Engine #{j.id} configured and dispatched to capture session at https://haj.gov.bh/register/bahraini")

    print("[✔] Monitoring engines updated. All captured sessions preserved, pending engines actively hunting!")

if __name__ == "__main__":
    reset_and_connect_all()

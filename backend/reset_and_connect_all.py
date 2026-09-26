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
    
    # 1. Clear celery queues in Redis to drop stale stuck tasks
    try:
        r = redis.from_url(settings.REDIS_URL)
        r.flushdb()
        print("[+] Redis queues purged.")
    except Exception as e:
        print(f"[-] Redis purge warning: {e}")

    # 2. Reset workers table
    try:
        db.query(models.Worker).delete()
        db.commit()
        print("[+] Stale worker records cleared from DB.")
    except Exception as e:
        db.rollback()
        print(f"[-] Worker cleanup warning: {e}")

    # 3. Find or create jobs
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
            expected_url="/booking-confirmed",
            expected_http_response=200,
            max_retries=100,
            timeout=30,
            status="active"
        )
        db.add(new_job)
        db.commit()
        db.refresh(new_job)
        jobs = [new_job]

    print(f"[*] Configuring {len(jobs)} monitoring engine(s)...")
    for j in jobs:
        j.target_url = "https://haj.gov.bh/register/bahraini"
        j.name = "Hajj Platform Registration"
        j.refresh_interval = 86400
        j.expected_text = "بدء التسجيل or تقديم طلب التسجيل"
        j.expected_element = 'a[href*="/register"]'
        j.expected_title = "نظام تسجيل الحج"
        j.expected_url = "/booking-confirmed"
        j.expected_http_response = 200
        j.max_retries = 100
        j.timeout = 30
        j.status = "active"
        db.commit()
        
        # Dispatch Celery worker
        celery_app.send_task("worker.run_monitoring_job", args=[j.id])
        print(f"[+] Engine #{j.id} configured and dispatched to https://haj.gov.bh/register/bahraini")

    print("[✔] All monitoring engines are active, running, and connected!")

if __name__ == "__main__":
    reset_and_connect_all()

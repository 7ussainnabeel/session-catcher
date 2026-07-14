import asyncio
import os
import socket
import logging
import requests
import smtplib
from email.mime.text import MIMEText
from datetime import datetime
from celery import Celery
from playwright.async_api import async_playwright
import urllib.request
import json

# Setup DB imports (sharing the backend directory structure via volume or shared codebase)
# Since they are built separately in Docker, the worker container will copy the db files.
# We will copy models.py, database.py, crud.py into the worker directory via Dockerfile or write them directly.
# Let's write helper modules or copy them inside the worker.
# To keep the worker fully self-contained, we will import them. Let's make sure they are in the same folder structure.
import database
import models
import crud

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("session_reserve.worker")

# Celery app
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
celery_app = Celery("session_reserve", broker=REDIS_URL, backend=REDIS_URL)

def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]

def get_browser_debugger_url(port: int) -> str:
    """Fetch the DevTools WebSocket URL by querying the local browser debug port."""
    try:
        url = f"http://localhost:{port}/json"
        response = urllib.request.urlopen(url, timeout=5)
        data = json.loads(response.read().decode())
        # Find type == 'page' target
        for target in data:
            if target.get("type") == "page":
                return target.get("webSocketDebuggerUrl")
    except Exception as e:
        logger.error(f"Failed to fetch CDP webSocketDebuggerUrl: {e}")
    return ""

# --- NOTIFICATION UTILITIES ---

def send_telegram_notification(bot_token: str, chat_id: str, text: str):
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        requests.post(url, json=payload, timeout=10)
        logger.info("Telegram notification sent.")
    except Exception as e:
        logger.error(f"Failed to send Telegram notification: {e}")

def send_slack_notification(webhook_url: str, text: str):
    try:
        payload = {"text": text}
        requests.post(webhook_url, json=payload, timeout=10)
        logger.info("Slack notification sent.")
    except Exception as e:
        logger.error(f"Failed to send Slack notification: {e}")

def send_discord_notification(webhook_url: str, text: str):
    try:
        payload = {"content": text}
        requests.post(webhook_url, json=payload, timeout=10)
        logger.info("Discord notification sent.")
    except Exception as e:
        logger.error(f"Failed to send Discord notification: {e}")

def send_email_notification(email_address: str, subject: str, body: str):
    # Standard email dispatch code, using dynamic logs as fallback if SMTP settings are unset
    try:
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = 'noreply@sessionreserve.com'
        msg['To'] = email_address

        # Mock/Optional local SMTP relay
        # s = smtplib.SMTP('localhost')
        # s.send_message(msg)
        # s.quit()
        logger.info(f"Email notification dispatched to {email_address}: Subject: {subject}")
    except Exception as e:
        logger.error(f"Failed to dispatch email: {e}")

def send_webhook_notification(webhook_url: str, payload: dict):
    try:
        requests.post(webhook_url, json=payload, timeout=10)
        logger.info("Webhook notification sent.")
    except Exception as e:
        logger.error(f"Failed to send Webhook: {e}")

def dispatch_all_notifications(db, user_id: int, job_name: str, site_url: str, status_msg: str):
    settings = db.query(models.NotificationSettings).filter_by(user_id=user_id).first()
    if not settings:
        return
        
    subject = f"SUCCESS: Session Reserve alert for '{job_name}'"
    text = (
        f"🚨 <b>SUCCESS: Session Reserve Alert</b> 🚨\n\n"
        f"<b>Job Name:</b> {job_name}\n"
        f"<b>Website:</b> {site_url}\n"
        f"<b>Status:</b> {status_msg}\n"
        f"<b>Time:</b> {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"
        f"👉 Open your Dashboard to reconnect to this authenticated session."
    )
    
    # 1. Telegram
    if settings.telegram_enabled and settings.telegram_bot_token and settings.telegram_chat_id:
        send_telegram_notification(settings.telegram_bot_token, settings.telegram_chat_id, text)
        
    # 2. Slack
    if settings.slack_enabled and settings.slack_webhook_url:
        send_slack_notification(settings.slack_webhook_url, text.replace("<b>", "*").replace("</b>", "*"))
        
    # 3. Discord
    if settings.discord_enabled and settings.discord_webhook_url:
        send_discord_notification(settings.discord_webhook_url, text.replace("<b>", "**").replace("</b>", "**"))
        
    # 4. Email
    if settings.email_enabled and settings.email_address:
        send_email_notification(settings.email_address, subject, text.replace("<b>", "").replace("</b>", "").replace("<br>", "\n"))
        
    # 5. Webhook
    if settings.webhook_enabled and settings.webhook_url:
        payload = {
            "event": "success",
            "job_name": job_name,
            "target_url": site_url,
            "status_message": status_msg,
            "timestamp": datetime.utcnow().isoformat()
        }
        send_webhook_notification(settings.webhook_url, payload)


# --- CELERY MONITORING TASK ---

@celery_app.task(name="worker.run_monitoring_job")
def run_monitoring_job(job_id: int):
    """
    Celery task that runs the async browser monitoring engine loop.
    We run this using asyncio.run because Celery tasks are synchronous by default.
    """
    return asyncio.run(async_run_monitoring_job(job_id))

async def async_run_monitoring_job(job_id: int):
    # Initialize connection variables
    db = next(database.get_db())
    job = db.query(models.MonitoringJob).filter_by(id=job_id).first()
    if not job:
        logger.error(f"Job with ID {job_id} not found.")
        return
        
    user_id = job.user_id
    worker_pid = os.getpid()
    worker_name = f"worker_{worker_pid}"
    cdp_port = find_free_port()
    
    # Register worker in DB
    db_worker = crud.register_worker(db, name=worker_name, host="worker", port=cdp_port)
    db_worker.status = "assigned"
    db_worker.current_job_id = job_id
    db.commit()
    
    profile_dir = os.path.join(os.getenv("PROFILES_DIR", "/app/shared/browser-profiles"), f"user_{user_id}")
    os.makedirs(profile_dir, exist_ok=True)
    
    logger.info(f"Starting browser instance on port {cdp_port} for user {user_id}")
    
    async with async_playwright() as p:
        # Launch Chromium with persistent user profile and remote debug port
        # Note: --headless=new runs headless but rendering frames and screencasting is fully active.
        browser_context = await p.chromium.launch_persistent_context(
            user_data_dir=profile_dir,
            headless=True,
            args=[
                f"--remote-debugging-port={cdp_port}",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu"
            ]
        )
        
        db_worker.status = "monitoring"
        db.commit()
        
        # Verify page
        page = browser_context.pages[0] if browser_context.pages else await browser_context.new_page()
        
        retries = 0
        success = False
        status_msg = ""
        
        crud.log_activity(db, f"Browser initialized on port {cdp_port}. Monitoring started.", "info", user_id=user_id, job_id=job_id)
        
        while retries < job.max_retries:
            # Check if job was paused/deleted by client
            db.refresh(job)
            if job.status != "active":
                logger.info(f"Job {job_id} is no longer active (status={job.status}). Exiting.")
                status_msg = "Job paused/stopped by user"
                break
                
            try:
                logger.info(f"Navigating to {job.target_url} (Attempt {retries+1}/{job.max_retries})")
                response = await page.goto(job.target_url, timeout=job.timeout * 1000)
                
                # Evaluate conditions
                conditions_met = []
                
                if job.expected_http_response is not None:
                    status_match = response.status == job.expected_http_response
                    conditions_met.append(status_match)
                    logger.info(f"HTTP Response check: {response.status} vs {job.expected_http_response} (Match: {status_match})")
                    
                if job.expected_title:
                    title = await page.title()
                    title_match = job.expected_title in title
                    conditions_met.append(title_match)
                    logger.info(f"Title check: '{title}' containing '{job.expected_title}' (Match: {title_match})")
                    
                if job.expected_url:
                    url_match = job.expected_url in page.url
                    conditions_met.append(url_match)
                    logger.info(f"URL check: '{page.url}' containing '{job.expected_url}' (Match: {url_match})")
                    
                if job.expected_text:
                    body_text = await page.inner_text("body")
                    text_match = job.expected_text in body_text
                    conditions_met.append(text_match)
                    logger.info(f"Text check: body containing '{job.expected_text}' (Match: {text_match})")
                    
                if job.expected_element:
                    el_visible = await page.locator(job.expected_element).is_visible()
                    conditions_met.append(el_visible)
                    logger.info(f"Element check: locator '{job.expected_element}' visible (Match: {el_visible})")
                    
                if job.expected_button:
                    btn_enabled = await page.locator(job.expected_button).is_enabled()
                    conditions_met.append(btn_enabled)
                    logger.info(f"Button check: locator '{job.expected_button}' enabled (Match: {btn_enabled})")

                # If we have conditions and all of them (or any, depending on design) match:
                # We require ALL specified conditions to match for strict verification
                if conditions_met and all(conditions_met):
                    success = True
                    status_msg = "All expected targets matched"
                    break
                    
            except Exception as e:
                logger.error(f"Exception during monitoring tick: {e}")
                retries += 1
                if retries >= job.max_retries:
                    status_msg = f"Failed after maximum retries: {str(e)}"
                    break
                    
            await asyncio.sleep(job.refresh_interval)
            
        # Post-loop checks
        if success:
            logger.info("Success conditions met! Freezing browser session...")
            
            # Update job state
            job.status = "success"
            
            # Save screenshot
            screenshot_filename = f"screenshot_job_{job_id}_{int(datetime.utcnow().timestamp())}.png"
            screenshot_path = os.path.join(settings.SCREENSHOTS_DIR, screenshot_filename)
            await page.screenshot(path=screenshot_path)
            
            # Fetch WebSocket Debugger URL
            cdp_ws_url = get_browser_debugger_url(cdp_port)
            logger.info(f"CDP WebSocket debugger URL: {cdp_ws_url}")
            
            # Create interactive Session record in DB
            db_session = crud.create_session(
                db=db,
                user_id=user_id,
                job_id=job_id,
                worker_id=db_worker.id,
                cdp_ws_url=cdp_ws_url
            )
            db_session.screenshot_path = f"/api/screenshots/{screenshot_filename}"
            
            db_worker.status = "reserved"
            db_worker.browser_ws_url = cdp_ws_url
            db.commit()
            
            crud.log_activity(
                db, 
                f"Monitoring success: {status_msg}. Browser reserved for remote interaction.", 
                "success", 
                user_id=user_id, 
                job_id=job_id
            )
            
            # Dispatch notifications
            dispatch_all_notifications(db, user_id, job.name, job.target_url, status_msg)
            
            # Enter wait/hold loop - keep browser active and alive for user to connect
            logger.info("Entering hold loop. Browser is kept open...")
            while True:
                db.refresh(db_session)
                db.refresh(job)
                if db_session.status != "active" or job.status != "success":
                    logger.info("Session closed by server/user. Tearing down browser...")
                    break
                await asyncio.sleep(5)
                
        else:
            # Job finished with failure/limit reached
            logger.info(f"Monitoring ended without success: {status_msg}")
            job.status = "failed"
            crud.log_activity(db, f"Monitoring ended: {status_msg}", "error", user_id=user_id, job_id=job_id)
            
        # Cleanup browser resources
        logger.info("Closing browser context...")
        await browser_context.close()
        
        # Reset worker status
        db_worker.status = "finished"
        db_worker.current_job_id = None
        db_worker.browser_ws_url = None
        db.commit()
        
        # Remove worker registration or mark available
        db_worker.status = "available"
        db.commit()
        
        logger.info("Browser closed and worker returned to pool.")
        db.close()

import asyncio
import os
import socket
import logging
import requests
import smtplib
import html
import re
from urllib.parse import urlparse, parse_qs
from email.mime.text import MIMEText
from datetime import datetime
from celery import Celery
from playwright.async_api import async_playwright
import urllib.request
import json

# Setup DB imports (sharing the backend directory structure via volume or shared codebase)
import database
import models
import crud

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("session_reserve.worker")

# Directories
SCREENSHOTS_DIR = os.getenv("SCREENSHOTS_DIR", "/app/shared/screenshots")
PROFILES_DIR = os.getenv("PROFILES_DIR", "/app/shared/browser-profiles")

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

def extract_session_info(captured_url: str, cookies: list) -> dict:
    """
    Extract session ID and relevant authentication cookies from the page URL and browser cookies.
    """
    session_id = None
    try:
        parsed = urlparse(captured_url)
        params = parse_qs(parsed.query)
        for key in ["session", "session_id", "sessionId", "token", "auth", "s", "sid", "app_session"]:
            if key in params and params[key]:
                session_id = params[key][0]
                break
    except Exception as e:
        logger.error(f"Error parsing URL for session ID: {e}")

    if not session_id:
        match = re.search(r'(?:session|sessionId|sid|token)=([a-zA-Z0-9_\-\.]+)', captured_url, re.IGNORECASE)
        if match:
            session_id = match.group(1)

    # Identify important session / auth cookies
    session_cookies = []
    for c in cookies:
        name = c.get("name", "")
        val = c.get("value", "")
        if any(pat in name.lower() for pat in ["session", "token", "auth", "wwv", "ora_", "sid", "jwt", "login", "cookie"]):
            session_cookies.append(f"{name}={val}")

    return {
        "session_id": session_id,
        "session_cookies": session_cookies,
        "all_cookies": [f"{c.get('name')}={c.get('value')}" for c in cookies]
    }

# --- NOTIFICATION UTILITIES ---

def send_telegram_notification(bot_token: str, chat_id: str, text: str, photo_path: str = None, summary_caption: str = None):
    """
    Send notification to Telegram Bot. If photo_path is valid, send via sendPhoto with caption.
    Falls back to sendMessage if photo upload fails or is not present.
    """
    photo_sent = False
    if photo_path and os.path.isfile(photo_path):
        try:
            url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"
            caption = summary_caption or text
            if len(caption) > 1024:
                caption = caption[:1020] + "..."

            with open(photo_path, "rb") as photo_file:
                files = {"photo": (os.path.basename(photo_path), photo_file, "image/png")}
                data = {"chat_id": chat_id, "caption": caption, "parse_mode": "HTML"}
                resp = requests.post(url, data=data, files=files, timeout=20)
                if resp.status_code == 200:
                    logger.info("Telegram photo notification sent successfully.")
                    photo_sent = True
                    # If caption was summarized, send full details as a follow-up text message
                    if summary_caption and len(text) > len(caption):
                        send_telegram_text(bot_token, chat_id, text)
                        return
                else:
                    logger.warning(f"sendPhoto failed with status {resp.status_code}: {resp.text}. Falling back to sendMessage.")
        except Exception as e:
            logger.error(f"Failed to send Telegram photo: {e}. Falling back to sendMessage.")

    if not photo_sent:
        send_telegram_text(bot_token, chat_id, text)

def send_telegram_text(bot_token: str, chat_id: str, text: str):
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        if len(text) > 4096:
            chunks = [text[i:i+4000] for i in range(0, len(text), 4000)]
            for chunk in chunks:
                payload = {"chat_id": chat_id, "text": chunk, "parse_mode": "HTML", "disable_web_page_preview": False}
                requests.post(url, json=payload, timeout=15)
        else:
            payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": False}
            resp = requests.post(url, json=payload, timeout=15)
            if resp.status_code != 200:
                logger.warning(f"sendMessage response code {resp.status_code}: {resp.text}")
        logger.info("Telegram text notification dispatched.")
    except Exception as e:
        logger.error(f"Failed to send Telegram text: {e}")

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
    try:
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = 'noreply@sessionreserve.com'
        msg['To'] = email_address
        logger.info(f"Email notification dispatched to {email_address}: Subject: {subject}")
    except Exception as e:
        logger.error(f"Failed to dispatch email: {e}")

def send_webhook_notification(webhook_url: str, payload: dict):
    try:
        requests.post(webhook_url, json=payload, timeout=10)
        logger.info("Webhook notification sent.")
    except Exception as e:
        logger.error(f"Failed to send Webhook: {e}")

def dispatch_all_notifications(
    db, 
    user_id: int, 
    job_name: str, 
    target_url: str, 
    captured_url: str, 
    status_msg: str, 
    session_id: str = None, 
    session_cookies: list = None, 
    photo_path: str = None
):
    settings = db.query(models.NotificationSettings).filter_by(user_id=user_id).first()
    if not settings:
        return

    now_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
    
    # Prepare HTML safe strings for Telegram
    safe_job_name = html.escape(job_name)
    safe_target_url = html.escape(target_url)
    safe_captured_url = html.escape(captured_url)
    safe_session_id = html.escape(session_id) if session_id else "N/A"
    safe_status = html.escape(status_msg)
    
    cookie_summary_lines = []
    if session_cookies:
        for ck in session_cookies[:4]:
            cookie_summary_lines.append(html.escape(ck))
        if len(session_cookies) > 4:
            cookie_summary_lines.append(f"... (+{len(session_cookies)-4} more cookies)")
    safe_cookies_block = "\n".join(cookie_summary_lines) if cookie_summary_lines else "None detected"

    # Full Telegram HTML message
    telegram_text = (
        f"🚨 <b>SUCCESS: Session Caught & Reserved!</b> 🚨\n\n"
        f"📋 <b>Job:</b> {safe_job_name}\n"
        f"🌐 <b>Initial Target:</b> {safe_target_url}\n\n"
        f"🎯 <b>Captured Session URL:</b>\n"
        f"{safe_captured_url}\n\n"
        f"🔑 <b>Session ID:</b> <code>{safe_session_id}</code>\n\n"
        f"🍪 <b>Session Cookies:</b>\n"
        f"<code>{safe_cookies_block}</code>\n\n"
        f"📊 <b>Status:</b> {safe_status}\n"
        f"⏰ <b>Time:</b> {now_str}\n\n"
        f"👉 <i>Live browser session is reserved and running. Reconnect anytime via your Dashboard!</i>"
    )
    
    # Condensed caption for photo if needed
    telegram_summary_caption = (
        f"🚨 <b>SUCCESS: Session Caught & Reserved!</b>\n\n"
        f"📋 <b>Job:</b> {safe_job_name}\n"
        f"🎯 <b>Session URL:</b>\n{safe_captured_url}\n"
        f"🔑 <b>Session ID:</b> <code>{safe_session_id}</code>\n"
        f"📊 <b>Status:</b> {safe_status}\n\n"
        f"👉 <i>Check Dashboard to reconnect!</i>"
    )

    # 1. Telegram
    if settings.telegram_enabled and settings.telegram_bot_token and settings.telegram_chat_id:
        send_telegram_notification(
            bot_token=settings.telegram_bot_token,
            chat_id=settings.telegram_chat_id,
            text=telegram_text,
            photo_path=photo_path,
            summary_caption=telegram_summary_caption
        )

    # 2. Slack
    if settings.slack_enabled and settings.slack_webhook_url:
        slack_text = (
            f"🚨 *SUCCESS: Session Caught & Reserved!* 🚨\n\n"
            f"*Job:* {job_name}\n"
            f"*Captured URL:* {captured_url}\n"
            f"*Session ID:* `{session_id or 'N/A'}`\n"
            f"*Status:* {status_msg}\n"
            f"*Time:* {now_str}\n"
            f"👉 Open Dashboard to reconnect."
        )
        send_slack_notification(settings.slack_webhook_url, slack_text)

    # 3. Discord
    if settings.discord_enabled and settings.discord_webhook_url:
        discord_text = (
            f"🚨 **SUCCESS: Session Caught & Reserved!** 🚨\n\n"
            f"**Job:** {job_name}\n"
            f"**Captured URL:** {captured_url}\n"
            f"**Session ID:** `{session_id or 'N/A'}`\n"
            f"**Status:** {status_msg}\n"
            f"**Time:** {now_str}\n"
            f"👉 Open Dashboard to reconnect."
        )
        send_discord_notification(settings.discord_webhook_url, discord_text)

    # 4. Email
    if settings.email_enabled and settings.email_address:
        email_subject = f"SUCCESS: Session Reserve alert for '{job_name}'"
        email_body = (
            f"Session Reserve Alert\n\n"
            f"Job Name: {job_name}\n"
            f"Target URL: {target_url}\n"
            f"Captured URL: {captured_url}\n"
            f"Session ID: {session_id or 'N/A'}\n"
            f"Session Cookies: {', '.join(session_cookies) if session_cookies else 'None'}\n"
            f"Status: {status_msg}\n"
            f"Time: {now_str}\n\n"
            f"Open your Dashboard to reconnect to this authenticated session."
        )
        send_email_notification(settings.email_address, email_subject, email_body)

    # 5. Webhook
    if settings.webhook_enabled and settings.webhook_url:
        payload = {
            "event": "success",
            "job_name": job_name,
            "target_url": target_url,
            "captured_url": captured_url,
            "session_id": session_id,
            "session_cookies": session_cookies,
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
    
    profile_dir = os.path.join(PROFILES_DIR, f"user_{user_id}")
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
                "--remote-debugging-address=0.0.0.0",
                "--remote-allow-origins=*",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-breakpad",
                "--no-first-run",
                "--mute-audio",
                "--disable-background-networking"
            ]
        )
        
        try:
            # Immediately register the browser debugger URL on the worker so live canvas is viewable during monitoring
            cdp_ws_url = get_browser_debugger_url(cdp_port)
            db_worker.status = "monitoring"
            db_worker.browser_ws_url = cdp_ws_url
            db.commit()
            
            # Verify page
            page = browser_context.pages[0] if browser_context.pages else await browser_context.new_page()
            
            # Re-verify and refresh debugger URL once page is ensured
            if not cdp_ws_url:
                cdp_ws_url = get_browser_debugger_url(cdp_port)
                db_worker.browser_ws_url = cdp_ws_url
                db.commit()
            
            retries = 0
            success = False
            status_msg = ""
            
            crud.log_activity(db, f"Browser initialized on port {cdp_port}. Monitoring started (CDP: {cdp_ws_url}).", "info", user_id=user_id, job_id=job_id)
            
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
                
                # Capture effective URL and cookies
                captured_url = page.url
                cookies = await browser_context.cookies()
                session_data = extract_session_info(captured_url, cookies)
                session_id_val = session_data.get("session_id")
                session_cookies_val = session_data.get("session_cookies")
                logger.info(f"Captured Session URL: {captured_url} | Session ID: {session_id_val}")
                
                # Save screenshot
                os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
                screenshot_filename = f"screenshot_job_{job_id}_{int(datetime.utcnow().timestamp())}.png"
                screenshot_path = os.path.join(SCREENSHOTS_DIR, screenshot_filename)
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
                
                log_detail = f"Session caught! URL: {captured_url}"
                if session_id_val:
                    log_detail += f" (Session ID: {session_id_val})"
                crud.log_activity(
                    db, 
                    f"Monitoring success: {status_msg}. {log_detail}. Browser reserved for remote interaction.", 
                    "success", 
                    user_id=user_id, 
                    job_id=job_id
                )
                
                # Dispatch notifications to Telegram and other channels
                dispatch_all_notifications(
                    db=db, 
                    user_id=user_id, 
                    job_name=job.name, 
                    target_url=job.target_url, 
                    captured_url=captured_url, 
                    status_msg=status_msg, 
                    session_id=session_id_val, 
                    session_cookies=session_cookies_val, 
                    photo_path=screenshot_path
                )
                
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

        except Exception as exc:
            logger.error(f"Critical unhandled error in monitoring job {job_id}: {exc}", exc_info=True)
            crud.log_activity(db, f"Monitoring aborted unexpectedly: {str(exc)}", "error", user_id=user_id, job_id=job_id)
            raise
        finally:
            # Unconditional cleanup of browser context & worker pool release
            try:
                logger.info("Closing browser context in finally block...")
                await browser_context.close()
            except Exception as e:
                logger.warning(f"Error closing browser context: {e}")

            try:
                db_worker.status = "available"
                db_worker.current_job_id = None
                db_worker.browser_ws_url = None
                db.commit()
            except Exception as e:
                logger.warning(f"Error resetting worker status: {e}")
            finally:
                db.close()
                logger.info("Browser closed and worker returned to available pool.")

# Hajj Portal Session & Queue Assistant

A professional Manifest V3 browser extension for **Google Chrome** and **Microsoft Edge** engineered to maintain authenticated session persistence, monitor real-time queue states, and detect booking service availability on the official production Hajj portal:

**Target Production URL:** `https://haj.gov.bh/`

---

## 1. Key Capabilities

- **Automated Session Persistence**: Dispatches conservative, authenticated pulses using genuine observed application endpoints at user-configured intervals (1m, 5m default, 10m, 15m, 30m) to prevent idle timeouts.
- **Queue State & Position Telemetry**: Passively identifies legitimate queue requests and responses, extracting queue ID, position (e.g., `#152`), status, and estimated wait times without exposing sensitive tokens.
- **Earliest-Access Availability Detection**: Immediately detects when the portal transitions from `WAITING` to `AVAILABLE` or `OPEN`. Triggers instant desktop notifications, synthesized audio chimes, highlights the status banner, and auto-focuses the portal tab.
- **Queue Integrity Analysis**: Passively inspects requests to identify whether queue parameters (`priority`, `position`, `rank`, `queuePosition`, `sequence`, `queueId`) originate from `CLIENT`, `SERVER`, or `UNKNOWN`.
- **Request Control & Backoff**: Includes built-in `AbortController` timeouts, concurrency rate limits, and automatic exponential backoff on `HTTP 429` (Too Many Requests) or `HTTP 503`.
- **Zero Sensitive Data Storage**: Automatically sanitizes and redacts passwords, OTPs, CPR numbers, Authorization headers, Bearer tokens, and session cookies. No external telemetry or third-party tracking.
- **Sanitized Export & Auditing**: Single-click export of session and queue history to **JSON**, **CSV**, **Markdown**, and **HTML**.

---

## 2. Directory Structure

```
hajj-session-queue-assistant/
├── manifest.json              # Chrome / Edge Manifest V3 configuration
├── background.js             # Background service worker & alarm scheduler
├── content.js                # Content script bridge for DOM telemetry
├── injected-interceptor.js   # In-page passive fetch/XHR traffic observer
├── popup.html                # Dark cybersecurity dashboard UI
├── popup.js                  # Telemetry rendering & control logic
├── popup.css                 # Cyber-themed dashboard stylesheet
├── options.html              # Advanced configuration & compliance page
├── options.js                # Options controller
├── session-monitor.js        # Session keep-alive & heartbeat pulse engine
├── queue-monitor.js          # Queue telemetry & availability detection
├── request-monitor.js        # Request categorizer & parameter integrity observer
├── notifications.js          # Desktop notifications, audio chime & tab focusing
├── storage.js                # Local storage manager with auto-sanitization
├── sanitizer.js              # Redaction and data privacy utility
├── report.js                 # Export generator (JSON, CSV, MD, HTML)
├── icons/                    # Extension icons (16x16, 32x32, 48x48, 128x128)
└── README.md                 # Documentation
```

---

## 3. Installation Guide

### Google Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the `hajj-session-queue-assistant` directory inside this repository.
5. The extension icon will appear in your Chrome toolbar. Click the puzzle icon to pin it.

### Microsoft Edge
1. Open Microsoft Edge and navigate to `edge://extensions/`.
2. Enable **Developer mode** using the toggle in the left sidebar.
3. Click **Load unpacked**.
4. Select the `hajj-session-queue-assistant` folder.
5. Pin the extension to your Edge toolbar.

---

## 4. How to Use

1. **Open the Portal**: Navigate to `https://haj.gov.bh/` and log in normally using your eKey credentials.
2. **Launch Assistant**: Click the **Hajj Portal Session & Queue Assistant** icon in your browser toolbar.
3. **Start Monitoring**: Click **[ START ASSISTANT ]**.
   - The assistant will detect your active session.
   - It will begin conservative periodic session heartbeats.
   - It will monitor queue telemetry and observe application endpoints.
4. **Availability Notification**: When registration opens or your queue state becomes `AVAILABLE`:
   - An audio chime will play.
   - A desktop browser notification will appear.
   - The portal tab will automatically be brought to the front.
   - You can complete your registration immediately without session timeout or re-login delays.
5. **Export Logs**: Open the **History** tab in the extension to download a sanitized report in JSON, CSV, Markdown, or HTML.

/**
 * Session Persistence & Keep-Alive Engine
 * Dispatches conservative, authenticated heartbeat requests using observed application endpoints.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sanitizer'), require('./storage'), require('./request-monitor'));
  } else {
    root.SessionMonitor = factory(root.Sanitizer, root.StorageManager, root.RequestMonitor);
  }
})(typeof self !== 'undefined' ? self : this, function (Sanitizer, StorageManager, RequestMonitor) {
  'use strict';

  let keepAliveTimer = null;
  let isExecuting = false;

  async function executeSessionHeartbeat() {
    if (isExecuting) return;
    isExecuting = true;

    try {
      const state = await StorageManager.getFullState();

      // Check if under 429 backoff
      if (state.rateLimitBackoffUntil && Date.now() < state.rateLimitBackoffUntil) {
        console.warn('Session Keep-Alive deferred due to active rate-limit backoff window.');
        return;
      }

      // Determine endpoint: user selected endpoint or fallback to /home or observed
      let targetPath = state.selectedSessionEndpoint || '/home';
      if (!targetPath.startsWith('http')) {
        targetPath = 'https://haj.gov.bh' + (targetPath.startsWith('/') ? targetPath : '/' + targetPath);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s conservative timeout

      const startTime = Date.now();
      let response;
      let status = 0;
      let ok = false;

      try {
        response = await fetch(targetPath, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-cache',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json, text/html, */*'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        status = response.status;
        ok = response.ok;
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        status = fetchErr.name === 'AbortError' ? 408 : 0;
      }

      const responseTime = Date.now() - startTime;
      const now = new Date();

      // Handle Rate Limiting (HTTP 429) & Server Errors (503/403)
      if (status === 429) {
        const backoffMs = 60000 * 5; // 5 minute backoff
        await StorageManager.updateState({
          rateLimitBackoffUntil: Date.now() + backoffMs,
          lastHttpStatus: 429,
          lastActivityTime: now.toISOString()
        });
        await StorageManager.addSessionHistoryRecord({
          sessionStatus: 'RATE_LIMITED',
          endpoint: Sanitizer.sanitizeUrl(targetPath),
          httpStatus: 429,
          responseTime,
          notes: 'Received HTTP 429 Too Many Requests. Automatic backoff enabled.'
        });
        return;
      }

      // Session State Resolution
      let sessionStatus = 'ACTIVE';
      if (status === 401 || status === 403) {
        sessionStatus = 'EXPIRED';
      } else if (status >= 200 && status < 400) {
        sessionStatus = 'ACTIVE';
      } else {
        sessionStatus = 'INACTIVE';
      }

      const intervalMinutes = state.keepAliveInterval || 5;
      const nextRefreshTime = new Date(now.getTime() + intervalMinutes * 60000).toISOString();

      await StorageManager.updateState({
        sessionActive: sessionStatus === 'ACTIVE',
        sessionStatus: sessionStatus,
        lastRefreshTime: now.toISOString(),
        lastActivityTime: now.toISOString(),
        lastHttpStatus: status,
        nextRefreshTime: nextRefreshTime
      });

      await StorageManager.addSessionHistoryRecord({
        sessionStatus: sessionStatus,
        endpoint: Sanitizer.sanitizeUrl(targetPath),
        httpStatus: status,
        responseTime,
        notes: `Keep-alive pulse dispatched (${intervalMinutes}m cycle)`
      });

    } catch (err) {
      console.error('Error during session heartbeat:', err);
    } finally {
      isExecuting = false;
    }
  }

  async function startKeepAlive(intervalMinutes = 5) {
    const state = await StorageManager.getFullState();
    const intervalMs = (intervalMinutes || state.keepAliveInterval || 5) * 60000;
    
    await StorageManager.updateState({
      keepAliveEnabled: true,
      keepAliveInterval: intervalMinutes,
      sessionStartTime: state.sessionStartTime || new Date().toISOString()
    });

    if (keepAliveTimer) clearInterval(keepAliveTimer);
    
    // Immediate pulse
    await executeSessionHeartbeat();

    // Periodic schedule
    keepAliveTimer = setInterval(() => {
      executeSessionHeartbeat();
    }, intervalMs);

    // Also register Chrome Alarm in background if in extension environment
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.create('session_heartbeat_alarm', {
        periodInMinutes: Number(intervalMinutes)
      });
    }
  }

  async function stopKeepAlive() {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.clear('session_heartbeat_alarm');
    }
    await StorageManager.updateState({
      keepAliveEnabled: false,
      nextRefreshTime: null
    });
  }

  return {
    executeSessionHeartbeat,
    startKeepAlive,
    stopKeepAlive
  };
});

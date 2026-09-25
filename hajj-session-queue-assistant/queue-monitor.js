/**
 * Queue & Availability Monitoring Engine
 * Continuously monitors user's queue position, waiting time, and triggers immediate alerts on service availability.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sanitizer'), require('./storage'), require('./notifications'));
  } else {
    root.QueueMonitor = factory(root.Sanitizer, root.StorageManager, root.NotificationManager);
  }
})(typeof self !== 'undefined' ? self : this, function (Sanitizer, StorageManager, NotificationManager) {
  'use strict';

  let queuePollTimer = null;
  let isQueueExecuting = false;

  const KNOWN_AVAILABLE_STATES = ['ACTIVE', 'AVAILABLE', 'OPEN', 'READY', 'COMPLETED'];
  const KNOWN_WAITING_STATES = ['WAITING', 'IN_QUEUE', 'QUEUED', 'PENDING', 'HOLD'];

  function parseQueuePayload(data) {
    if (!data || typeof data !== 'object') return null;

    let position = null;
    let status = 'WAITING';
    let queueId = null;
    let waitTime = null;
    let createdAt = null;

    // Search common fields
    const posKeys = ['position', 'queuePosition', 'rank', 'pos', 'ticketNumber', 'userPosition'];
    for (const k of posKeys) {
      if (data[k] !== undefined && data[k] !== null) {
        const parsed = parseInt(data[k], 10);
        if (!isNaN(parsed)) {
          position = parsed;
          break;
        }
      }
    }

    const statusKeys = ['status', 'queueStatus', 'state', 'serviceStatus', 'phase'];
    for (const k of statusKeys) {
      if (typeof data[k] === 'string' && data[k].trim()) {
        status = data[k].toUpperCase().trim();
        break;
      }
    }

    const idKeys = ['queueId', 'ticketId', 'qid', 'sessionQueueId'];
    for (const k of idKeys) {
      if (data[k]) {
        queueId = String(data[k]);
        break;
      }
    }

    const waitKeys = ['estimatedWaitTime', 'waitTime', 'eta', 'remainingTime', 'estimatedTime'];
    for (const k of waitKeys) {
      if (data[k]) {
        waitTime = String(data[k]);
        break;
      }
    }

    const timeKeys = ['createdAt', 'queueTime', 'timestamp', 'joinedAt'];
    for (const k of timeKeys) {
      if (data[k]) {
        createdAt = String(data[k]);
        break;
      }
    }

    return {
      position,
      status,
      queueId,
      waitTime,
      createdAt
    };
  }

  async function updateFromInterceptedResponse(url, responseData, status) {
    if (!responseData || typeof responseData !== 'object') return;
    
    const parsed = parseQueuePayload(responseData);
    if (!parsed && !url.toLowerCase().includes('queue') && !url.toLowerCase().includes('wait')) {
      return;
    }

    const state = await StorageManager.getFullState();
    const prevStatus = state.queueStatus;
    const now = new Date();

    const updates = {
      lastQueueUpdate: now.toISOString()
    };

    if (parsed) {
      if (parsed.position !== null) updates.queuePosition = parsed.position;
      if (parsed.status) updates.queueStatus = parsed.status;
      if (parsed.queueId) updates.queueId = parsed.queueId;
      if (parsed.waitTime) updates.estimatedWaitTime = parsed.waitTime;
      if (parsed.createdAt) updates.queueCreatedAt = parsed.createdAt;
    }

    // Check availability state transition (e.g. WAITING -> AVAILABLE / ACTIVE)
    const newStatus = updates.queueStatus || prevStatus;
    const isNowAvailable = KNOWN_AVAILABLE_STATES.includes(newStatus);
    const wasWaiting = KNOWN_WAITING_STATES.includes(prevStatus) || prevStatus === 'IDLE';

    if (isNowAvailable && wasWaiting && !state.availabilityDetectedAt) {
      updates.availabilityDetectedAt = now.toISOString();
      updates.serviceStatus = 'AVAILABLE';
      
      if (NotificationManager) {
        await NotificationManager.triggerAvailabilityAlert({
          message: `Queue status changed to ${newStatus}. Your session is ready on the portal!`,
          tabId: state.activePortalTabId
        });
      }
    }

    await StorageManager.updateState(updates);

    if (parsed && (parsed.position !== null || parsed.status)) {
      await StorageManager.addSessionHistoryRecord({
        queueStatus: updates.queueStatus || state.queueStatus,
        queuePosition: updates.queuePosition !== undefined ? updates.queuePosition : state.queuePosition,
        notes: `Queue state updated: ${newStatus} (Position: ${updates.queuePosition ?? 'N/A'})`
      });
    }
  }

  async function checkQueueStatusOnce() {
    if (isQueueExecuting) return;
    isQueueExecuting = true;

    try {
      const state = await StorageManager.getFullState();
      if (!state.selectedQueueEndpoint && !state.observedQueueEndpoints.length) {
        // No explicit queue endpoint discovered yet, passive monitoring mode
        return;
      }

      let endpoint = state.selectedQueueEndpoint || state.observedQueueEndpoints[0];
      if (!endpoint.startsWith('http')) {
        endpoint = 'https://haj.gov.bh' + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const resp = await fetch(endpoint, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-cache',
          headers: { 'Accept': 'application/json, text/html, */*' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (resp.status === 429) {
          console.warn('Queue monitoring received HTTP 429. Backing off.');
          return;
        }

        if (resp.ok) {
          const contentType = resp.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await resp.json();
            await updateFromInterceptedResponse(endpoint, data, resp.status);
          }
        }
      } catch (err) {
        clearTimeout(timeoutId);
      }
    } catch (e) {
      console.error('Error during queue poll:', e);
    } finally {
      isQueueExecuting = false;
    }
  }

  async function startQueueMonitoring(pollIntervalSeconds = 30) {
    await StorageManager.updateState({
      queueMonitorEnabled: true
    });

    if (queuePollTimer) clearInterval(queuePollTimer);
    
    // Initial check
    await checkQueueStatusOnce();

    queuePollTimer = setInterval(() => {
      checkQueueStatusOnce();
    }, pollIntervalSeconds * 1000);
  }

  async function stopQueueMonitoring() {
    if (queuePollTimer) {
      clearInterval(queuePollTimer);
      queuePollTimer = null;
    }
    await StorageManager.updateState({
      queueMonitorEnabled: false
    });
  }

  return {
    parseQueuePayload,
    updateFromInterceptedResponse,
    checkQueueStatusOnce,
    startQueueMonitoring,
    stopQueueMonitoring
  };
});

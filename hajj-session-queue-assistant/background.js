/**
 * Background Service Worker (Manifest V3)
 * Central coordinator for alarms, network telemetry processing, keep-alive, and queue monitoring.
 */

importScripts(
  'sanitizer.js',
  'storage.js',
  'notifications.js',
  'request-monitor.js',
  'session-monitor.js',
  'queue-monitor.js'
);

// 1. Extension Lifecycle
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Hajj Assistant] Service worker installed:', details.reason);
  const state = await StorageManager.getFullState();
  await StorageManager.updateState(state);
});

// 2. Tab Tracking for Auto-focusing
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.startsWith('https://haj.gov.bh')) {
    StorageManager.updateState({ activePortalTabId: tabId });
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url && tab.url.startsWith('https://haj.gov.bh')) {
      StorageManager.updateState({ activePortalTabId: tab.id });
    }
  } catch (e) {}
});

// 3. Alarms Dispatcher
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'session_heartbeat_alarm') {
    const state = await StorageManager.getFullState();
    if (state.keepAliveEnabled) {
      await SessionMonitor.executeSessionHeartbeat();
    }
  } else if (alarm.name === 'queue_poll_alarm') {
    const state = await StorageManager.getFullState();
    if (state.queueMonitorEnabled) {
      await QueueMonitor.checkQueueStatusOnce();
    }
  }
});

// 4. Message Broker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data } = message;

  (async () => {
    try {
      if (type === 'INTERCEPTED_TRANSACTION') {
        if (sender && sender.tab) {
          StorageManager.updateState({ activePortalTabId: sender.tab.id });
        }
        await RequestMonitor.processInterceptedTransaction(data);
        if (data.responseBody) {
          await QueueMonitor.updateFromInterceptedResponse(data.url, data.responseBody, data.status);
        }
        sendResponse({ success: true });
      }

      else if (type === 'DOM_TELEMETRY') {
        if (sender && sender.tab) {
          StorageManager.updateState({ activePortalTabId: sender.tab.id });
        }
        const updates = {};
        if (data.isAuthenticated) {
          updates.sessionActive = true;
          updates.sessionStatus = 'ACTIVE';
        }
        if (data.serviceStatus) {
          updates.serviceStatus = data.serviceStatus;
          if (data.serviceStatus === 'AVAILABLE') {
            const state = await StorageManager.getFullState();
            if (!state.availabilityDetectedAt) {
              updates.availabilityDetectedAt = new Date().toISOString();
              await NotificationManager.triggerAvailabilityAlert({
                message: 'Hajj registration is now AVAILABLE on the live portal!',
                tabId: sender?.tab?.id
              });
            }
          }
        }
        await StorageManager.updateState(updates);
        sendResponse({ success: true });
      }

      else if (type === 'START_ASSISTANT') {
        const interval = data?.interval || 5;
        await SessionMonitor.startKeepAlive(interval);
        await QueueMonitor.startQueueMonitoring(30);
        sendResponse({ success: true, message: 'Assistant active' });
      }

      else if (type === 'START_KEEP_ALIVE') {
        const interval = data?.interval || 5;
        await SessionMonitor.startKeepAlive(interval);
        sendResponse({ success: true });
      }

      else if (type === 'STOP_KEEP_ALIVE') {
        await SessionMonitor.stopKeepAlive();
        sendResponse({ success: true });
      }

      else if (type === 'START_QUEUE_MONITOR') {
        await QueueMonitor.startQueueMonitoring(30);
        sendResponse({ success: true });
      }

      else if (type === 'STOP_QUEUE_MONITOR') {
        await QueueMonitor.stopQueueMonitoring();
        sendResponse({ success: true });
      }

      else if (type === 'STOP_ALL') {
        await SessionMonitor.stopKeepAlive();
        await QueueMonitor.stopQueueMonitoring();
        sendResponse({ success: true });
      }

      else if (type === 'EXECUTE_HEARTBEAT_NOW') {
        await SessionMonitor.executeSessionHeartbeat();
        sendResponse({ success: true });
      }

      else if (type === 'FOCUS_TAB') {
        const state = await StorageManager.getFullState();
        await NotificationManager.focusHajjPortalTab(state.activePortalTabId);
        sendResponse({ success: true });
      }

      else {
        sendResponse({ error: 'Unknown action type' });
      }
    } catch (err) {
      console.error('[Background] Error processing message:', err);
      sendResponse({ error: err.message });
    }
  })();

  return true; // Keep response channel open for async response
});

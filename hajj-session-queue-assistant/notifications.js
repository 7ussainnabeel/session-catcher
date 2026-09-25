/**
 * Notification & Audio Alert Dispatcher
 * Manages desktop notifications, synthesized audio chimes, and automatic tab focusing.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NotificationManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Synthesize notification chime using Web Audio API (supported in window/tab contexts)
  function playAlertChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const playTone = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.01, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };

      // High-alert sequence (C5 -> E5 -> G5 -> C6)
      playTone(523.25, 0.0, 0.2);
      playTone(659.25, 0.18, 0.2);
      playTone(783.99, 0.36, 0.25);
      playTone(1046.50, 0.55, 0.6);
    } catch (e) {
      console.warn('Audio chime playback omitted or unsupported in current context:', e);
    }
  }

  async function showDesktopNotification(title, message, isUrgent = false) {
    return new Promise((resolve) => {
      if (!chrome.notifications) {
        resolve(null);
        return;
      }
      
      const notifId = 'hajj_portal_' + Date.now();
      chrome.notifications.create(
        notifId,
        {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
          title: title || 'Hajj Portal Notification',
          message: message || 'Update from Hajj Portal Assistant',
          priority: isUrgent ? 2 : 1,
          requireInteraction: isUrgent
        },
        (createdId) => {
          resolve(createdId);
        }
      );
    });
  }

  async function focusHajjPortalTab(targetTabId) {
    try {
      let tabId = targetTabId;
      if (!tabId) {
        const tabs = await chrome.tabs.query({ url: 'https://haj.gov.bh/*' });
        if (tabs && tabs.length > 0) {
          tabId = tabs[0].id;
        }
      }

      if (tabId) {
        const tab = await chrome.tabs.get(tabId);
        if (tab) {
          await chrome.tabs.update(tabId, { active: true });
          if (tab.windowId) {
            await chrome.windows.update(tab.windowId, { focused: true });
          }
        }
      }
    } catch (e) {
      console.warn('Unable to auto-focus tab:', e);
    }
  }

  async function triggerAvailabilityAlert(details) {
    const timestamp = new Date().toLocaleTimeString();
    const title = '🚨 SERVICE AVAILABLE: HAJJ PORTAL OPEN!';
    const message = details?.message || `Your queue state changed to AVAILABLE at ${timestamp}. Click to access immediately.`;

    // 1. Desktop Notification
    await showDesktopNotification(title, message, true);

    // 2. Play Audio Chime
    playAlertChime();

    // 3. Focus the active Hajj Portal tab
    await focusHajjPortalTab(details?.tabId);

    return {
      timestamp: new Date().toISOString(),
      displayTime: timestamp
    };
  }

  return {
    playAlertChime,
    showDesktopNotification,
    focusHajjPortalTab,
    triggerAvailabilityAlert
  };
});

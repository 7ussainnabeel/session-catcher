/**
 * Storage Management Layer
 * Centralized local storage provider with validation and auto-sanitization.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sanitizer'));
  } else {
    root.StorageManager = factory(root.Sanitizer);
  }
})(typeof self !== 'undefined' ? self : this, function (Sanitizer) {
  'use strict';

  const DEFAULT_STATE = {
    sessionActive: false,
    sessionStatus: 'DISCONNECTED', // DISCONNECTED, ACTIVE, INACTIVE, EXPIRED
    sessionStartTime: null,
    lastActivityTime: null,
    lastRefreshTime: null,
    nextRefreshTime: null,
    lastHttpStatus: null,
    sessionAge: 0,
    keepAliveInterval: 5, // minutes (1, 5, 10, 15, 30)
    keepAliveEnabled: false,
    queueMonitorEnabled: false,
    queueStatus: 'IDLE', // IDLE, WAITING, ACTIVE, AVAILABLE, OPEN, CLOSED, EXPIRED, COMPLETED
    queuePosition: null,
    queueId: null,
    estimatedWaitTime: null,
    queueCreatedAt: null,
    lastQueueUpdate: null,
    nextQueueUpdate: null,
    serviceStatus: 'WAITING',
    availabilityDetectedAt: null,
    observedSessionEndpoints: [],
    selectedSessionEndpoint: '',
    observedQueueEndpoints: [],
    selectedQueueEndpoint: '',
    soundEnabled: true,
    desktopNotifEnabled: true,
    autoFocusTab: true,
    activePortalTabId: null,
    requestHistory: [],
    sessionHistory: [],
    queueFieldIntegrity: [], // { parameter, source, serverValidation, endpoint, lastObserved }
    rateLimitBackoffUntil: null
  };

  const MAX_HISTORY = 100;

  async function getFullState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        resolve({ ...DEFAULT_STATE, ...items });
      });
    });
  }

  async function updateState(partialUpdates) {
    return new Promise((resolve) => {
      const sanitized = Sanitizer ? Sanitizer.sanitizeObject(partialUpdates) : partialUpdates;
      chrome.storage.local.set(sanitized, () => {
        resolve(sanitized);
      });
    });
  }

  async function addRequestLog(entry) {
    const state = await getFullState();
    const history = state.requestHistory || [];
    const sanitizedEntry = {
      id: Date.now() + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      method: entry.method || 'GET',
      path: Sanitizer ? Sanitizer.sanitizeUrl(entry.url || entry.path) : (entry.url || entry.path),
      status: entry.status || 0,
      responseTime: entry.responseTime || 0,
      category: entry.category || 'NORMAL', // 'SESSION', 'QUEUE', 'NORMAL'
      details: entry.details ? (Sanitizer ? Sanitizer.sanitizeObject(entry.details) : entry.details) : null
    };

    history.unshift(sanitizedEntry);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    await updateState({ requestHistory: history });
    return sanitizedEntry;
  }

  async function addSessionHistoryRecord(record) {
    const state = await getFullState();
    const history = state.sessionHistory || [];
    const formatted = {
      id: Date.now() + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toLocaleTimeString(),
      fullTime: new Date().toISOString(),
      sessionStatus: record.sessionStatus || state.sessionStatus,
      endpoint: record.endpoint || state.selectedSessionEndpoint || '/home',
      httpStatus: record.httpStatus || state.lastHttpStatus || 200,
      responseTime: record.responseTime || 0,
      queueStatus: record.queueStatus || state.queueStatus,
      queuePosition: record.queuePosition !== undefined ? record.queuePosition : state.queuePosition,
      notes: record.notes || ''
    };

    history.unshift(formatted);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    await updateState({ sessionHistory: history });
    return formatted;
  }

  async function registerObservedEndpoint(type, url) {
    const state = await getFullState();
    const cleanUrl = Sanitizer ? Sanitizer.sanitizeUrl(url) : url;
    if (!cleanUrl) return;

    if (type === 'session') {
      const endpoints = Array.from(new Set([...(state.observedSessionEndpoints || []), cleanUrl]));
      const selected = state.selectedSessionEndpoint || cleanUrl;
      await updateState({ observedSessionEndpoints: endpoints, selectedSessionEndpoint: selected });
    } else if (type === 'queue') {
      const endpoints = Array.from(new Set([...(state.observedQueueEndpoints || []), cleanUrl]));
      const selected = state.selectedQueueEndpoint || cleanUrl;
      await updateState({ observedQueueEndpoints: endpoints, selectedQueueEndpoint: selected });
    }
  }

  async function recordFieldIntegrity(fieldObj) {
    const state = await getFullState();
    const list = state.queueFieldIntegrity || [];
    const existingIdx = list.findIndex(item => item.parameter === fieldObj.parameter);
    
    const entry = {
      parameter: fieldObj.parameter,
      source: fieldObj.source || 'UNKNOWN', // 'CLIENT', 'SERVER', 'UNKNOWN'
      serverValidation: fieldObj.serverValidation || 'UNKNOWN',
      endpoint: Sanitizer ? Sanitizer.sanitizeUrl(fieldObj.endpoint) : fieldObj.endpoint,
      lastObserved: new Date().toLocaleTimeString()
    };

    if (existingIdx >= 0) {
      list[existingIdx] = entry;
    } else {
      list.push(entry);
    }

    await updateState({ queueFieldIntegrity: list });
  }

  async function clearLogs() {
    await updateState({
      requestHistory: [],
      sessionHistory: [],
      queueFieldIntegrity: []
    });
  }

  return {
    DEFAULT_STATE,
    getFullState,
    updateState,
    addRequestLog,
    addSessionHistoryRecord,
    registerObservedEndpoint,
    recordFieldIntegrity,
    clearLogs
  };
});

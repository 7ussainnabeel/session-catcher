/**
 * Request Inspector & Passive Integrity Analysis
 * Categorizes intercepted requests and performs passive queue & priority field origin analysis.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sanitizer'), require('./storage'));
  } else {
    root.RequestMonitor = factory(root.Sanitizer, root.StorageManager);
  }
})(typeof self !== 'undefined' ? self : this, function (Sanitizer, StorageManager) {
  'use strict';

  const SESSION_KEYWORDS = ['session', 'auth', 'heartbeat', 'ping', 'user', 'profile', 'keepalive', 'token', 'alive', 'check', 'login', 'me'];
  const QUEUE_KEYWORDS = ['queue', 'waiting', 'wait', 'position', 'ticket', 'status', 'poll', 'capacity', 'gate', 'token', 'entry'];

  const QUEUE_INTEGRITY_FIELDS = [
    'priority',
    'position',
    'rank',
    'queuePosition',
    'queueTime',
    'timestamp',
    'createdAt',
    'sequence',
    'priorityLevel',
    'queueId'
  ];

  function categorizeRequest(url, method, body) {
    if (!url) return 'NORMAL';
    const lower = url.toLowerCase();
    
    // Check Queue patterns
    if (QUEUE_KEYWORDS.some(kw => lower.includes(kw))) {
      return 'QUEUE';
    }

    // Check Session patterns
    if (SESSION_KEYWORDS.some(kw => lower.includes(kw))) {
      return 'SESSION';
    }

    // Check Next.js server actions / API routes
    if (lower.includes('/api/') || lower.includes('/_next/data/')) {
      return 'SESSION';
    }

    return 'NORMAL';
  }

  function analyzePayloadFields(data, source, endpoint) {
    if (!data || typeof data !== 'object') return [];
    const observations = [];

    function searchFields(obj) {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        const matchingField = QUEUE_INTEGRITY_FIELDS.find(f => f.toLowerCase() === key.toLowerCase());
        if (matchingField) {
          observations.push({
            parameter: matchingField,
            source: source, // 'CLIENT' or 'SERVER'
            serverValidation: source === 'CLIENT' ? 'Observed / Unknown' : 'Authoritative',
            endpoint: Sanitizer ? Sanitizer.sanitizeUrl(endpoint) : endpoint
          });
        }
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          searchFields(obj[key]);
        }
      }
    }

    searchFields(data);
    return observations;
  }

  async function processInterceptedTransaction(tx) {
    const { url, method, status, responseTime, requestBody, responseBody, requestHeaders } = tx;

    const category = categorizeRequest(url, method, requestBody);
    const sanitizedUrl = Sanitizer ? Sanitizer.sanitizeUrl(url) : url;

    // Log the request
    if (StorageManager) {
      await StorageManager.addRequestLog({
        method: method || 'GET',
        url: sanitizedUrl,
        status: status || 200,
        responseTime: responseTime || 0,
        category: category,
        details: {
          statusText: status === 200 ? 'OK' : status === 429 ? 'Too Many Requests' : `HTTP ${status}`
        }
      });

      // Register as observed session or queue endpoint if applicable
      if (category === 'SESSION' && status >= 200 && status < 400) {
        await StorageManager.registerObservedEndpoint('session', sanitizedUrl);
      }
      if (category === 'QUEUE' && status >= 200 && status < 400) {
        await StorageManager.registerObservedEndpoint('queue', sanitizedUrl);
      }

      // Analyze Client-Supplied parameters
      if (requestBody && typeof requestBody === 'object') {
        const clientObs = analyzePayloadFields(requestBody, 'CLIENT', sanitizedUrl);
        for (const obs of clientObs) {
          await StorageManager.recordFieldIntegrity(obs);
        }
      }

      // Analyze Server-Supplied parameters
      if (responseBody && typeof responseBody === 'object') {
        const serverObs = analyzePayloadFields(responseBody, 'SERVER', sanitizedUrl);
        for (const obs of serverObs) {
          await StorageManager.recordFieldIntegrity(obs);
        }
      }
    }

    return {
      category,
      sanitizedUrl
    };
  }

  return {
    categorizeRequest,
    analyzePayloadFields,
    processInterceptedTransaction
  };
});

/**
 * Injected In-Page Request Interceptor (MAIN World)
 * Passively observes legitimate application fetch/XHR traffic without altering requests or payloads.
 */

(function () {
  'use strict';

  if (window.__HAJJ_ASSISTANT_INTERCEPTOR_ACTIVE__) return;
  window.__HAJJ_ASSISTANT_INTERCEPTOR_ACTIVE__ = true;

  const MESSAGE_SOURCE = 'HAJJ_SESSION_ASSISTANT_RELAY';

  function dispatchTransaction(data) {
    try {
      window.postMessage({
        source: MESSAGE_SOURCE,
        payload: data
      }, '*');
    } catch (e) {
      // Ignore serialization errors for non-cloneable objects
    }
  }

  // --- 1. Hook window.fetch ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const startTime = performance.now();
    let url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
    let method = 'GET';
    let requestBody = null;

    if (args[1]) {
      if (args[1].method) method = args[1].method.toUpperCase();
      if (args[1].body && typeof args[1].body === 'string') {
        try { requestBody = JSON.parse(args[1].body); } catch (e) { requestBody = args[1].body; }
      }
    } else if (args[0] && typeof args[0] === 'object' && args[0].method) {
      method = args[0].method.toUpperCase();
    }

    try {
      const response = await originalFetch.apply(this, args);
      const responseTime = Math.round(performance.now() - startTime);

      // Clone response to inspect body without consuming the stream for the app
      const clone = response.clone();
      let responseBody = null;
      const contentType = clone.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        clone.json().then(json => {
          dispatchTransaction({
            type: 'FETCH',
            url,
            method,
            status: response.status,
            responseTime,
            requestBody,
            responseBody: json
          });
        }).catch(() => {
          dispatchTransaction({
            type: 'FETCH',
            url,
            method,
            status: response.status,
            responseTime,
            requestBody,
            responseBody: null
          });
        });
      } else {
        dispatchTransaction({
          type: 'FETCH',
          url,
          method,
          status: response.status,
          responseTime,
          requestBody,
          responseBody: null
        });
      }

      return response;
    } catch (error) {
      const responseTime = Math.round(performance.now() - startTime);
      dispatchTransaction({
        type: 'FETCH',
        url,
        method,
        status: 0,
        responseTime,
        requestBody,
        error: error.message
      });
      throw error;
    }
  };

  // --- 2. Hook XMLHttpRequest ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._hajjMethod = (method || 'GET').toUpperCase();
    this._hajjUrl = url;
    this._hajjStartTime = 0;
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    this._hajjStartTime = performance.now();
    let requestBody = null;
    if (typeof body === 'string') {
      try { requestBody = JSON.parse(body); } catch (e) { requestBody = body; }
    }

    this.addEventListener('loadend', () => {
      const responseTime = Math.round(performance.now() - this._hajjStartTime);
      let responseBody = null;
      try {
        if (this.responseType === '' || this.responseType === 'text' || this.responseType === 'json') {
          if (typeof this.response === 'object') {
            responseBody = this.response;
          } else if (typeof this.responseText === 'string') {
            try { responseBody = JSON.parse(this.responseText); } catch (e) {}
          }
        }
      } catch (e) {}

      dispatchTransaction({
        type: 'XHR',
        url: this._hajjUrl,
        method: this._hajjMethod,
        status: this.status,
        responseTime,
        requestBody,
        responseBody
      });
    });

    return originalSend.apply(this, [body]);
  };

  console.log('[Hajj Assistant] In-page passive traffic observer initialized.');
})();

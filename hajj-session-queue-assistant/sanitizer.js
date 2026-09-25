/**
 * Sanitizer & Privacy Protection Module
 * Redacts sensitive credentials, tokens, session cookies, OTPs, and personal identity data.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Sanitizer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SENSITIVE_KEY_PATTERNS = [
    /authorization/i,
    /cookie/i,
    /set-cookie/i,
    /token/i,
    /jwt/i,
    /bearer/i,
    /password/i,
    /passwd/i,
    /pwd/i,
    /otp/i,
    /secret/i,
    /cpr/i,
    /identity/i,
    /national_id/i,
    /civil_id/i,
    /card_number/i,
    /cvv/i,
    /session_secret/i,
    /apikey/i,
    /api_key/i
  ];

  const CPR_PATTERN = /\b\d{9}\b/g; // 9-digit CPR Bahrain ID
  const BEARER_PATTERN = /Bearer\s+[a-zA-Z0-9_\-\.]+/gi;
  const JWT_PATTERN = /eyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]+/g;

  function isSensitiveKey(key) {
    if (!key || typeof key !== 'string') return false;
    return SENSITIVE_KEY_PATTERNS.some(pat => pat.test(key));
  }

  function redactString(val) {
    if (typeof val !== 'string') return val;
    let sanitized = val;
    sanitized = sanitized.replace(BEARER_PATTERN, 'Bearer [REDACTED_TOKEN]');
    sanitized = sanitized.replace(JWT_PATTERN, '[REDACTED_JWT]');
    sanitized = sanitized.replace(CPR_PATTERN, '[REDACTED_CPR]');
    return sanitized;
  }

  function sanitizeHeaders(headers) {
    if (!headers) return {};
    const clean = {};
    if (typeof headers === 'object') {
      for (const [k, v] of Object.entries(headers)) {
        if (isSensitiveKey(k)) {
          clean[k] = '[REDACTED_HEADER]';
        } else {
          clean[k] = typeof v === 'string' ? redactString(v) : v;
        }
      }
    }
    return clean;
  }

  function sanitizeObject(obj, maxDepth = 4, currentDepth = 0) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') {
      return typeof obj === 'string' ? redactString(obj) : obj;
    }
    if (currentDepth >= maxDepth) return '[TRUNCATED_OBJECT]';

    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item, maxDepth, currentDepth + 1));
    }

    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      if (isSensitiveKey(k)) {
        clean[k] = '[REDACTED_SENSITIVE_VALUE]';
      } else if (typeof v === 'object' && v !== null) {
        clean[k] = sanitizeObject(v, maxDepth, currentDepth + 1);
      } else if (typeof v === 'string') {
        clean[k] = redactString(v);
      } else {
        clean[k] = v;
      }
    }
    return clean;
  }

  function sanitizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    try {
      const url = new URL(rawUrl, 'https://haj.gov.bh');
      const params = new URLSearchParams(url.search);
      for (const key of Array.from(params.keys())) {
        if (isSensitiveKey(key)) {
          params.set(key, '[REDACTED]');
        }
      }
      url.search = params.toString();
      return url.pathname + (url.search ? url.search : '');
    } catch (e) {
      return rawUrl.replace(/(token|session|auth|key|password)=[^&]+/gi, '$1=[REDACTED]');
    }
  }

  return {
    isSensitiveKey,
    redactString,
    sanitizeHeaders,
    sanitizeObject,
    sanitizeUrl
  };
});

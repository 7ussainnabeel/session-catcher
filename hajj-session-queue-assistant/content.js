/**
 * Content Script (Isolated Extension World)
 * Bridges in-page observed network traffic and DOM telemetry with extension service worker.
 */

(function () {
  'use strict';

  const MESSAGE_SOURCE = 'HAJJ_SESSION_ASSISTANT_RELAY';

  // 1. Inject the in-page interceptor script into MAIN execution world
  function injectMainWorldInterceptor() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected-interceptor.js');
      script.onload = function () {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn('[Hajj Assistant] Failed to inject interceptor:', e);
    }
  }

  injectMainWorldInterceptor();

  // 2. Relay in-page network events to extension background service worker
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== MESSAGE_SOURCE) {
      return;
    }

    const payload = event.data.payload;
    if (payload && chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage({
        type: 'INTERCEPTED_TRANSACTION',
        data: payload
      }).catch(() => {
        // Service worker might be inactive, ignore
      });
    }
  });

  // 3. Passive DOM Session & Availability Observer
  function checkDomState() {
    try {
      const bodyText = document.body ? document.body.innerText : '';
      const htmlContent = document.documentElement ? document.documentElement.innerHTML : '';

      // Check authentication markers
      const hasLogout = /تسجيل الخروج|خروج|logout|signout/i.test(bodyText);
      const hasUserGreeting = /مرحباً|أهلاً|عزيزي|welcome/i.test(bodyText);
      const isAuthenticated = hasLogout || hasUserGreeting;

      // Check registration availability markers
      const hasRegisterBtn = !!document.querySelector('a[href*="/register"], button[class*="register"], #btn_register, .registration-item');
      const isClosedNotice = /يفتح باب التسجيل|مغلق|التسجيل مغلق/i.test(bodyText);
      const isOpenNotice = /التسجيل متاح|بدء التسجيل|تقديم طلب/i.test(bodyText);

      let serviceStatus = 'WAITING';
      if (isOpenNotice || (hasRegisterBtn && !isClosedNotice)) {
        serviceStatus = 'AVAILABLE';
      }

      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          type: 'DOM_TELEMETRY',
          data: {
            url: window.location.href,
            title: document.title,
            isAuthenticated,
            serviceStatus
          }
        }).catch(() => {});
      }
    } catch (e) {}
  }

  // Periodic DOM check
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      checkDomState();
      setInterval(checkDomState, 5000);
    });
  } else {
    checkDomState();
    setInterval(checkDomState, 5000);
  }

  // Handle messages from background/popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ status: 'PONG', url: window.location.href });
    } else if (message.type === 'TRIGGER_DOM_CHECK') {
      checkDomState();
      sendResponse({ status: 'CHECKED' });
    }
    return true;
  });

})();

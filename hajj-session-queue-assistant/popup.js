/**
 * Popup Dashboard Controller
 * Connects telemetry data, real-time counters, user controls, and reporting.
 */

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // --- Element Selectors ---
  const globalStatusDot = document.getElementById('globalStatusDot');
  const availabilityBanner = document.getElementById('availabilityBanner');
  const availabilityDesc = document.getElementById('availabilityDesc');
  const btnFocusTab = document.getElementById('btnFocusTab');

  const metricSessionStatus = document.getElementById('metricSessionStatus');
  const metricHttpStatus = document.getElementById('metricHttpStatus');
  const metricSessionAge = document.getElementById('metricSessionAge');
  const metricLastActivity = document.getElementById('metricLastActivity');
  const metricKeepAliveStatus = document.getElementById('metricKeepAliveStatus');
  const metricNextRefresh = document.getElementById('metricNextRefresh');
  const metricQueueActive = document.getElementById('metricQueueActive');
  const metricQueueId = document.getElementById('metricQueueId');
  const metricQueuePos = document.getElementById('metricQueuePos');
  const metricWaitTime = document.getElementById('metricWaitTime');
  const metricServiceStatus = document.getElementById('metricServiceStatus');
  const metricLastUpdate = document.getElementById('metricLastUpdate');

  const selectSessionEndpoint = document.getElementById('selectSessionEndpoint');
  const selectKeepAliveInterval = document.getElementById('selectKeepAliveInterval');
  const chkSound = document.getElementById('chkSound');
  const chkDesktopNotif = document.getElementById('chkDesktopNotif');
  const chkAutoFocus = document.getElementById('chkAutoFocus');

  const btnStartAssistant = document.getElementById('btnStartAssistant');
  const btnToggleKeepAlive = document.getElementById('btnToggleKeepAlive');
  const btnToggleQueue = document.getElementById('btnToggleQueue');
  const btnTriggerNotification = document.getElementById('btnTriggerNotification');
  const btnStopAll = document.getElementById('btnStopAll');

  const qDetailStatus = document.getElementById('qDetailStatus');
  const qDetailPos = document.getElementById('qDetailPos');
  const qDetailEta = document.getElementById('qDetailEta');
  const qDetailLastUpdate = document.getElementById('qDetailLastUpdate');

  const queueIntegrityTableBody = document.getElementById('queueIntegrityTableBody');
  const requestInspectorTableBody = document.getElementById('requestInspectorTableBody');
  const sessionHistoryTableBody = document.getElementById('sessionHistoryTableBody');

  const btnExportJSON = document.getElementById('btnExportJSON');
  const btnExportCSV = document.getElementById('btnExportCSV');
  const btnExportMD = document.getElementById('btnExportMD');
  const btnExportHTML = document.getElementById('btnExportHTML');
  const btnClearLogs = document.getElementById('btnClearLogs');

  const footerClock = document.getElementById('footerClock');

  let currentState = null;

  // --- 1. Tab Navigation ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // --- 2. Live Session Age Counter ---
  function updateTimers() {
    footerClock.textContent = new Date().toLocaleTimeString();

    if (currentState && currentState.sessionStartTime) {
      const start = new Date(currentState.sessionStartTime).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - start) / 1000));
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      metricSessionAge.textContent = `${h}:${m}:${s}`;
    } else {
      metricSessionAge.textContent = '00:00:00';
    }
  }
  setInterval(updateTimers, 1000);

  // --- 3. Telemetry Render Loop ---
  async function refreshDashboard() {
    currentState = await StorageManager.getFullState();

    // Session Status
    metricSessionStatus.textContent = currentState.sessionStatus;
    metricSessionStatus.className = 'card-value status-badge ' + (
      currentState.sessionStatus === 'ACTIVE' ? 'badge-active' :
      currentState.sessionStatus === 'RATE_LIMITED' ? 'badge-waiting' : 'badge-inactive'
    );
    globalStatusDot.className = 'status-pulse-dot ' + (
      currentState.sessionStatus === 'ACTIVE' ? 'online' :
      currentState.sessionStatus === 'RATE_LIMITED' ? 'warning' : ''
    );

    metricHttpStatus.textContent = currentState.lastHttpStatus ? `HTTP: ${currentState.lastHttpStatus}` : 'HTTP: --';
    metricLastActivity.textContent = currentState.lastActivityTime ? `Last: ${new Date(currentState.lastActivityTime).toLocaleTimeString()}` : 'Last: --';

    // Keep Alive Status
    if (currentState.keepAliveEnabled) {
      metricKeepAliveStatus.textContent = 'ENABLED';
      metricKeepAliveStatus.className = 'card-value status-badge badge-active';
      btnToggleKeepAlive.innerHTML = '<span class="btn-icon">⏹</span> STOP SESSION MONITOR';
      btnToggleKeepAlive.classList.add('btn-danger');
      btnToggleKeepAlive.classList.remove('btn-secondary');
    } else {
      metricKeepAliveStatus.textContent = 'DISABLED';
      metricKeepAliveStatus.className = 'card-value status-badge badge-neutral';
      btnToggleKeepAlive.innerHTML = '<span class="btn-icon">🔄</span> KEEP SESSION ACTIVE';
      btnToggleKeepAlive.classList.remove('btn-danger');
      btnToggleKeepAlive.classList.add('btn-secondary');
    }

    if (currentState.nextRefreshTime) {
      metricNextRefresh.textContent = `Next: ${new Date(currentState.nextRefreshTime).toLocaleTimeString()}`;
    } else {
      metricNextRefresh.textContent = 'Next: --';
    }

    // Queue Status
    metricQueueActive.textContent = currentState.queueStatus;
    metricQueueActive.className = 'card-value status-badge ' + (
      currentState.queueStatus === 'AVAILABLE' || currentState.queueStatus === 'OPEN' ? 'badge-active' :
      currentState.queueStatus === 'WAITING' ? 'badge-waiting' : 'badge-neutral'
    );

    metricQueueId.textContent = currentState.queueId ? `ID: ${currentState.queueId.substring(0, 10)}...` : 'ID: None';
    metricQueuePos.textContent = currentState.queuePosition !== null ? `#${currentState.queuePosition}` : '--';
    metricWaitTime.textContent = currentState.estimatedWaitTime ? `ETA: ${currentState.estimatedWaitTime}` : 'ETA: --';

    // Queue Monitor Button
    if (currentState.queueMonitorEnabled) {
      btnToggleQueue.innerHTML = '<span class="btn-icon">⏹</span> STOP QUEUE';
      btnToggleQueue.classList.add('btn-danger');
      btnToggleQueue.classList.remove('btn-secondary');
    } else {
      btnToggleQueue.innerHTML = '<span class="btn-icon">📊</span> MONITOR QUEUE';
      btnToggleQueue.classList.remove('btn-danger');
      btnToggleQueue.classList.add('btn-secondary');
    }

    // Service Status
    metricServiceStatus.textContent = currentState.serviceStatus;
    metricServiceStatus.className = 'card-value status-badge ' + (
      currentState.serviceStatus === 'AVAILABLE' ? 'badge-active' : 'badge-waiting'
    );
    metricLastUpdate.textContent = currentState.lastQueueUpdate ? `Updated: ${new Date(currentState.lastQueueUpdate).toLocaleTimeString()}` : 'Updated: --';

    // Availability Banner
    if (currentState.availabilityDetectedAt || currentState.serviceStatus === 'AVAILABLE' || currentState.queueStatus === 'AVAILABLE') {
      availabilityBanner.classList.remove('hidden');
      if (currentState.availabilityDetectedAt) {
        availabilityDesc.textContent = `Service confirmed AVAILABLE at ${new Date(currentState.availabilityDetectedAt).toLocaleTimeString()}`;
      }
    } else {
      availabilityBanner.classList.add('hidden');
    }

    // Observed Endpoints Dropdown
    const observed = currentState.observedSessionEndpoints || [];
    const currentVal = currentState.selectedSessionEndpoint || '/home';
    const allOptions = Array.from(new Set(['/home', ...observed]));

    selectSessionEndpoint.innerHTML = allOptions.map(ep => `
      <option value="${ep}" ${ep === currentVal ? 'selected' : ''}>${ep}</option>
    `).join('');

    // Queue Details Tab
    qDetailStatus.textContent = currentState.queueStatus;
    qDetailPos.textContent = currentState.queuePosition !== null ? `#${currentState.queuePosition}` : '--';
    qDetailEta.textContent = currentState.estimatedWaitTime || '--';
    qDetailLastUpdate.textContent = currentState.lastQueueUpdate ? new Date(currentState.lastQueueUpdate).toLocaleTimeString() : '--';

    // Queue Integrity Table
    renderQueueIntegrityTable(currentState.queueFieldIntegrity || []);

    // Request Inspector Table
    renderRequestInspectorTable(currentState.requestHistory || []);

    // Session History Table
    renderSessionHistoryTable(currentState.sessionHistory || []);

    // Settings
    selectKeepAliveInterval.value = String(currentState.keepAliveInterval || 5);
    chkSound.checked = currentState.soundEnabled !== false;
    chkDesktopNotif.checked = currentState.desktopNotifEnabled !== false;
    chkAutoFocus.checked = currentState.autoFocusTab !== false;
  }

  function renderQueueIntegrityTable(fields) {
    if (!fields || !fields.length) {
      queueIntegrityTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">No queue parameters observed yet.</td></tr>';
      return;
    }
    queueIntegrityTableBody.innerHTML = fields.map(f => `
      <tr>
        <td><code>${f.parameter}</code></td>
        <td><strong style="color: ${f.source === 'CLIENT' ? '#38bdf8' : '#34d399'}">${f.source}</strong></td>
        <td>${f.serverValidation}</td>
        <td>${f.lastObserved}</td>
      </tr>
    `).join('');
  }

  function renderRequestInspectorTable(requests) {
    if (!requests || !requests.length) {
      requestInspectorTableBody.innerHTML = '<tr><td colspan="5" class="empty-cell">Waiting for application network requests...</td></tr>';
      return;
    }
    requestInspectorTableBody.innerHTML = requests.slice(0, 30).map(r => `
      <tr>
        <td><strong>${r.method}</strong></td>
        <td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.path}">${r.path}</td>
        <td style="color: ${r.status >= 200 && r.status < 400 ? '#34d399' : '#f43f5e'}">${r.status}</td>
        <td>${r.responseTime}ms</td>
        <td><span class="status-badge ${r.category === 'QUEUE' ? 'badge-waiting' : r.category === 'SESSION' ? 'badge-active' : 'badge-neutral'}">${r.category}</span></td>
      </tr>
    `).join('');
  }

  function renderSessionHistoryTable(history) {
    if (!history || !history.length) {
      sessionHistoryTableBody.innerHTML = '<tr><td colspan="6" class="empty-cell">No session history records yet.</td></tr>';
      return;
    }
    sessionHistoryTableBody.innerHTML = history.slice(0, 30).map(h => `
      <tr>
        <td>${h.timestamp}</td>
        <td><span class="status-badge ${h.sessionStatus === 'ACTIVE' ? 'badge-active' : 'badge-neutral'}">${h.sessionStatus}</span></td>
        <td style="color: ${h.httpStatus >= 200 && h.httpStatus < 400 ? '#34d399' : '#f43f5e'}">${h.httpStatus}</td>
        <td>${h.responseTime}ms</td>
        <td>${h.queueStatus || '--'}</td>
        <td>${h.queuePosition !== null && h.queuePosition !== undefined ? '#' + h.queuePosition : '-'}</td>
      </tr>
    `).join('');
  }

  // --- 4. User Interaction Event Handlers ---

  // Start Assistant (One-click launch for session keep-alive + queue monitoring)
  btnStartAssistant.addEventListener('click', async () => {
    const interval = parseInt(selectKeepAliveInterval.value, 10) || 5;
    await chrome.runtime.sendMessage({
      type: 'START_ASSISTANT',
      data: { interval }
    });
    await refreshDashboard();
  });

  // Toggle Keep Alive
  btnToggleKeepAlive.addEventListener('click', async () => {
    if (currentState && currentState.keepAliveEnabled) {
      await chrome.runtime.sendMessage({ type: 'STOP_KEEP_ALIVE' });
    } else {
      const interval = parseInt(selectKeepAliveInterval.value, 10) || 5;
      await chrome.runtime.sendMessage({
        type: 'START_KEEP_ALIVE',
        data: { interval }
      });
    }
    await refreshDashboard();
  });

  // Toggle Queue Monitor
  btnToggleQueue.addEventListener('click', async () => {
    if (currentState && currentState.queueMonitorEnabled) {
      await chrome.runtime.sendMessage({ type: 'STOP_QUEUE_MONITOR' });
    } else {
      await chrome.runtime.sendMessage({ type: 'START_QUEUE_MONITOR' });
    }
    await refreshDashboard();
  });

  // Notifications Dispatch
  btnTriggerNotification.addEventListener('click', async () => {
    if (NotificationManager) {
      NotificationManager.playAlertChime();
      await NotificationManager.showDesktopNotification(
        'Hajj Portal Notification Alert',
        'Notification system operational and linked to active session monitor.'
      );
    }
  });

  // Stop All
  btnStopAll.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'STOP_ALL' });
    await refreshDashboard();
  });

  // Focus Tab
  btnFocusTab.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'FOCUS_TAB' });
  });

  // Endpoint selector change
  selectSessionEndpoint.addEventListener('change', async (e) => {
    await StorageManager.updateState({
      selectedSessionEndpoint: e.target.value
    });
  });

  // Settings changes
  selectKeepAliveInterval.addEventListener('change', async (e) => {
    const val = parseInt(e.target.value, 10);
    await StorageManager.updateState({ keepAliveInterval: val });
    if (currentState && currentState.keepAliveEnabled) {
      await chrome.runtime.sendMessage({
        type: 'START_KEEP_ALIVE',
        data: { interval: val }
      });
    }
  });

  chkSound.addEventListener('change', async (e) => {
    await StorageManager.updateState({ soundEnabled: e.target.checked });
  });

  chkDesktopNotif.addEventListener('change', async (e) => {
    await StorageManager.updateState({ desktopNotifEnabled: e.target.checked });
  });

  chkAutoFocus.addEventListener('change', async (e) => {
    await StorageManager.updateState({ autoFocusTab: e.target.checked });
  });

  // Export handlers
  btnExportJSON.addEventListener('click', async () => {
    const jsonStr = await ReportGenerator.exportAsJSON();
    ReportGenerator.downloadFile(jsonStr, `hajj_portal_report_${Date.now()}.json`, 'application/json');
  });

  btnExportCSV.addEventListener('click', async () => {
    const csvStr = await ReportGenerator.exportAsCSV();
    ReportGenerator.downloadFile(csvStr, `hajj_portal_history_${Date.now()}.csv`, 'text/csv');
  });

  btnExportMD.addEventListener('click', async () => {
    const mdStr = await ReportGenerator.exportAsMarkdown();
    ReportGenerator.downloadFile(mdStr, `hajj_portal_report_${Date.now()}.md`, 'text/markdown');
  });

  btnExportHTML.addEventListener('click', async () => {
    const htmlStr = await ReportGenerator.exportAsHTML();
    ReportGenerator.downloadFile(htmlStr, `hajj_portal_report_${Date.now()}.html`, 'text/html');
  });

  btnClearLogs.addEventListener('click', async () => {
    if (confirm('Clear local telemetry and request history?')) {
      await StorageManager.clearLogs();
      await refreshDashboard();
    }
  });

  // Initial Load and live polling
  await refreshDashboard();
  setInterval(refreshDashboard, 2000);
});

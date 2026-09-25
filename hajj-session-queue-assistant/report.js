/**
 * Sanitized Reporting & Export Generator
 * Produces structured audit reports in JSON, CSV, HTML, and Markdown formats.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sanitizer'), require('./storage'));
  } else {
    root.ReportGenerator = factory(root.Sanitizer, root.StorageManager);
  }
})(typeof self !== 'undefined' ? self : this, function (Sanitizer, StorageManager) {
  'use strict';

  function formatDuration(startTime) {
    if (!startTime) return '00:00:00';
    const start = new Date(startTime).getTime();
    const now = Date.now();
    const diff = Math.max(0, Math.floor((now - start) / 1000));
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  async function generateReportData() {
    const state = await StorageManager.getFullState();
    return {
      generatedAt: new Date().toISOString(),
      targetDomain: 'haj.gov.bh',
      sessionSummary: {
        sessionStatus: state.sessionStatus,
        sessionActive: state.sessionActive,
        sessionStartTime: state.sessionStartTime,
        sessionAge: formatDuration(state.sessionStartTime),
        lastActivityTime: state.lastActivityTime,
        lastRefreshTime: state.lastRefreshTime,
        keepAliveIntervalMinutes: state.keepAliveInterval,
        keepAliveEnabled: state.keepAliveEnabled,
        selectedSessionEndpoint: state.selectedSessionEndpoint || '/home',
        observedSessionEndpoints: state.observedSessionEndpoints
      },
      queueSummary: {
        queueStatus: state.queueStatus,
        queuePosition: state.queuePosition,
        queueId: state.queueId ? '[REDACTED_QUEUE_ID]' : null,
        estimatedWaitTime: state.estimatedWaitTime,
        lastQueueUpdate: state.lastQueueUpdate,
        serviceStatus: state.serviceStatus,
        availabilityDetectedAt: state.availabilityDetectedAt
      },
      queueFieldIntegrity: state.queueFieldIntegrity || [],
      sessionHistory: state.sessionHistory || [],
      requestHistorySample: (state.requestHistory || []).slice(0, 50)
    };
  }

  async function exportAsJSON() {
    const data = await generateReportData();
    return JSON.stringify(data, null, 2);
  }

  async function exportAsCSV() {
    const state = await StorageManager.getFullState();
    const history = state.sessionHistory || [];
    
    const headers = ['Timestamp', 'Session Status', 'Endpoint', 'HTTP Status', 'Response Time (ms)', 'Queue Status', 'Queue Position', 'Notes'];
    const rows = history.map(h => [
      `"${h.timestamp || ''}"`,
      `"${h.sessionStatus || ''}"`,
      `"${h.endpoint || ''}"`,
      h.httpStatus || '',
      h.responseTime || '',
      `"${h.queueStatus || ''}"`,
      h.queuePosition !== null && h.queuePosition !== undefined ? h.queuePosition : '',
      `"${(h.notes || '').replace(/"/g, '""')}"`
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  async function exportAsMarkdown() {
    const data = await generateReportData();
    const s = data.sessionSummary;
    const q = data.queueSummary;

    return `# Hajj Portal Session & Queue Assistant — Activity Report

**Generated:** ${data.generatedAt}  
**Target:** ${data.targetDomain}  

---

## 1. Session Status
- **Status:** \`${s.sessionStatus}\`
- **Session Duration:** \`${s.sessionAge}\`
- **Keep-Alive:** \`${s.keepAliveEnabled ? 'ENABLED (' + s.keepAliveIntervalMinutes + 'm interval)' : 'DISABLED'}\`
- **Selected Endpoint:** \`${s.selectedSessionEndpoint}\`
- **Last Heartbeat:** \`${s.lastRefreshTime || 'N/A'}\`

---

## 2. Queue & Availability Telemetry
- **Queue Status:** \`${q.queueStatus}\`
- **Position:** \`${q.queuePosition !== null ? '#' + q.queuePosition : 'N/A'}\`
- **Estimated Wait:** \`${q.estimatedWaitTime || 'N/A'}\`
- **Service Status:** \`${q.serviceStatus}\`
- **Availability Detected:** \`${q.availabilityDetectedAt || 'Pending / In Progress'}\`

---

## 3. Queue Parameter & Field Integrity Analysis
| Parameter | Source | Server Validation | Endpoint | Last Observed |
| :--- | :--- | :--- | :--- | :--- |
${data.queueFieldIntegrity.length ? data.queueFieldIntegrity.map(f => `| \`${f.parameter}\` | **${f.source}** | ${f.serverValidation} | \`${f.endpoint}\` | ${f.lastObserved} |`).join('\n') : '| None detected yet | - | - | - | - |'}

---

## 4. Session & Queue History (Last ${data.sessionHistory.length} Events)
| Time | Session | Endpoint | HTTP | Latency | Queue Status | Position |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${data.sessionHistory.map(h => `| ${h.timestamp} | \`${h.sessionStatus}\` | \`${h.endpoint}\` | ${h.httpStatus} | ${h.responseTime}ms | \`${h.queueStatus}\` | ${h.queuePosition !== null ? '#' + h.queuePosition : '-'} |`).join('\n')}

---
*Note: All sensitive authentication tokens, authorization headers, CPR numbers, and cookies have been automatically redacted.*
`;
  }

  async function exportAsHTML() {
    const data = await generateReportData();
    const s = data.sessionSummary;
    const q = data.queueSummary;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hajj Portal Session & Queue Assistant Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; background: #090a0f; color: #e2e8f0; margin: 0; padding: 30px; line-height: 1.5; }
    h1, h2 { color: #38bdf8; border-bottom: 1px solid #1e293b; padding-bottom: 8px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: #1e293b; color: #94a3b8; }
    .badge.active { background: #065f46; color: #34d399; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin: 20px 0; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 15px; }
    .card-title { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 5px; }
    .card-val { font-size: 18px; font-weight: 700; color: #f8fafc; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #1e293b; }
    th { background: #0f172a; color: #94a3b8; }
    tr:hover { background: #1e293b22; }
    .footer { margin-top: 40px; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <h1>HAJJ PORTAL SESSION & QUEUE ASSISTANT</h1>
  <p><strong>Target:</strong> ${data.targetDomain} | <strong>Generated:</strong> ${data.generatedAt}</p>

  <div class="grid">
    <div class="card">
      <div class="card-title">Session State</div>
      <div class="card-val">${s.sessionStatus}</div>
    </div>
    <div class="card">
      <div class="card-title">Session Age</div>
      <div class="card-val">${s.sessionAge}</div>
    </div>
    <div class="card">
      <div class="card-title">Queue Status</div>
      <div class="card-val">${q.queueStatus}</div>
    </div>
    <div class="card">
      <div class="card-title">Queue Position</div>
      <div class="card-val">${q.queuePosition !== null ? '#' + q.queuePosition : 'N/A'}</div>
    </div>
  </div>

  <h2>Queue Parameter Integrity</h2>
  <table>
    <thead>
      <tr>
        <th>Parameter</th><th>Source</th><th>Validation Status</th><th>Endpoint</th><th>Observed Time</th>
      </tr>
    </thead>
    <tbody>
      ${data.queueFieldIntegrity.map(f => `<tr><td><code>${f.parameter}</code></td><td><strong>${f.source}</strong></td><td>${f.serverValidation}</td><td>${f.endpoint}</td><td>${f.lastObserved}</td></tr>`).join('') || '<tr><td colspan="5">No parameter fields observed yet.</td></tr>'}
    </tbody>
  </table>

  <h2>Activity Log</h2>
  <table>
    <thead>
      <tr>
        <th>Time</th><th>Session</th><th>Endpoint</th><th>HTTP</th><th>Latency</th><th>Queue</th><th>Position</th>
      </tr>
    </thead>
    <tbody>
      ${data.sessionHistory.map(h => `<tr><td>${h.timestamp}</td><td><span class="badge ${h.sessionStatus === 'ACTIVE' ? 'active' : ''}">${h.sessionStatus}</span></td><td><code>${h.endpoint}</code></td><td>${h.httpStatus}</td><td>${h.responseTime}ms</td><td>${h.queueStatus}</td><td>${h.queuePosition !== null ? '#' + h.queuePosition : '-'}</td></tr>`).join('')}
    </tbody>
  </table>

  <div class="footer">Confidential Telemetry Report — Sensitive credentials and cookies sanitized.</div>
</body>
</html>`;
  }

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    generateReportData,
    exportAsJSON,
    exportAsCSV,
    exportAsMarkdown,
    exportAsHTML,
    downloadFile
  };
});

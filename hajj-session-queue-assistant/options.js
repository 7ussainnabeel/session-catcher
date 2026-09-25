/**
 * Options Page Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  const optKeepAliveInterval = document.getElementById('optKeepAliveInterval');
  const optSessionEndpoint = document.getElementById('optSessionEndpoint');
  const optQueueEndpoint = document.getElementById('optQueueEndpoint');
  const optSound = document.getElementById('optSound');
  const optDesktopNotif = document.getElementById('optDesktopNotif');
  const optAutoFocus = document.getElementById('optAutoFocus');
  const btnSaveOptions = document.getElementById('btnSaveOptions');
  const saveStatus = document.getElementById('saveStatus');

  const state = await StorageManager.getFullState();

  // Load current values
  optKeepAliveInterval.value = String(state.keepAliveInterval || 5);
  optSound.checked = state.soundEnabled !== false;
  optDesktopNotif.checked = state.desktopNotifEnabled !== false;
  optAutoFocus.checked = state.autoFocusTab !== false;

  // Session endpoints
  const sessionEndpoints = Array.from(new Set(['/home', ...(state.observedSessionEndpoints || [])]));
  optSessionEndpoint.innerHTML = sessionEndpoints.map(ep => `
    <option value="${ep}" ${ep === state.selectedSessionEndpoint ? 'selected' : ''}>${ep}</option>
  `).join('');

  // Queue endpoints
  const queueEndpoints = Array.from(new Set(['', ...(state.observedQueueEndpoints || [])]));
  optQueueEndpoint.innerHTML = queueEndpoints.map(ep => `
    <option value="${ep}" ${ep === state.selectedQueueEndpoint ? 'selected' : ''}>${ep || 'Passive Observation Mode (Learned from page)'}</option>
  `).join('');

  btnSaveOptions.addEventListener('click', async () => {
    const updates = {
      keepAliveInterval: parseInt(optKeepAliveInterval.value, 10) || 5,
      selectedSessionEndpoint: optSessionEndpoint.value,
      selectedQueueEndpoint: optQueueEndpoint.value,
      soundEnabled: optSound.checked,
      desktopNotifEnabled: optDesktopNotif.checked,
      autoFocusTab: optAutoFocus.checked
    };

    await StorageManager.updateState(updates);

    if (state.keepAliveEnabled) {
      await chrome.runtime.sendMessage({
        type: 'START_KEEP_ALIVE',
        data: { interval: updates.keepAliveInterval }
      });
    }

    saveStatus.textContent = '✔ Settings saved successfully!';
    setTimeout(() => {
      saveStatus.textContent = '';
    }, 3000);
  });
});

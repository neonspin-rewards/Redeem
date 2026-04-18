/* ================================================================
   js/ui/loader.js — Loading screen controller
================================================================ */
'use strict';

export function showLoader(msg = 'Initialising…') {
  const screen = document.getElementById('loading-screen');
  const status = document.getElementById('loading-status');
  if (screen) screen.style.display = '';
  if (status) status.textContent = msg;
}

export function hideLoader() {
  const screen = document.getElementById('loading-screen');
  if (!screen) return;
  // FIX: Remove instantly — no setTimeout delays that could leave
  // the loader visible if JS is slow or modules take time to resolve.
  screen.style.display = 'none';
}

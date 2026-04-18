/* ================================================================
   js/ui/theme.js — Dark / Light mode toggle
================================================================ */
'use strict';

import { lsGet, lsSet } from './utils.js';

const LS_KEY = 'ns_theme';

export function loadTheme() {
  const saved = lsGet(LS_KEY, 'dark');
  _apply(saved);
}

export function initThemeToggle() {
  document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
    const current = lsGet(LS_KEY, 'dark');
    const next    = current === 'dark' ? 'light' : 'dark';
    lsSet(LS_KEY, next);
    _apply(next);
    window.__ns_playSound?.('click');
  });
}

function _apply(theme) {
  const icon = document.getElementById('theme-icon');
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    if (icon) icon.textContent = '☀️';
  } else {
    document.body.classList.remove('light-theme');
    if (icon) icon.textContent = '🌙';
  }
}

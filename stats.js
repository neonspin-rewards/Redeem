/* ================================================================
   js/features/stats.js — Player stats rendering (coins/EXP/level).
   Listens to state changes and updates the DOM automatically.
================================================================ */
'use strict';

import { onStateChange, getState } from './state.js';
import { expRequired, expInCurrentLevel } from './config.js';
import { showLevelUp } from './popup.js';
import { playSound } from './sound.js';
import { copyToClipboard } from './utils.js';

export function initStats() {
  // Initial render
  renderStats(getState());

  // Re-render on every state change
  onStateChange((next, prev) => {
    renderStats(next);
    // Level-up detection
    if (next.level > prev.level && next.level > 1) {
      playSound('levelup');
      showLevelUp(next.level);
    }
  });

  // Referral chip copy
  document.getElementById('referral-chip')?.addEventListener('click', async () => {
    const code = getState().referralCode;
    if (!code) return;
    const ok = await copyToClipboard(code);
    if (ok) window.__ns_showPopup?.('🔗', 'Copied!', `Your referral code "${code}" has been copied to clipboard!`);
  });
}

export function renderStats(s) {
  // Numbers
  _setText('stat-coins', s.coins ?? 0);
  _setText('stat-exp',   s.exp   ?? 0);
  _setText('stat-level', s.level ?? 1);
  _setText('streak-count', s.streak ?? 0);
  _setText('referral-code-display', s.referralCode || '—');

  // EXP bar
  const level    = s.level ?? 1;
  const needed   = expRequired(level);
  const current  = expInCurrentLevel(s.exp ?? 0);
  const pct      = Math.min(100, Math.round((current / needed) * 100));

  const fill = document.getElementById('exp-bar-fill');
  const pctEl = document.getElementById('exp-pct');
  const track = document.querySelector('.exp-bar-track');

  if (fill) fill.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${current} / ${needed} EXP`;
  if (track) {
    track.setAttribute('aria-valuenow', String(pct));
    track.setAttribute('aria-valuemax', '100');
  }

  // Spin badge
  _setText('spin-count', s.spins ?? 0);
}

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

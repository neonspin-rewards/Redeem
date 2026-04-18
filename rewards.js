/* ================================================================
   js/features/rewards.js — Reward tab: eligibility + milestones.
================================================================ */
'use strict';

import { getState, onStateChange } from './state.js';
import { MILESTONES, REWARD_MIN_LEVEL, REWARD_MIN_STREAK } from './config.js';
import { escapeHtml } from './utils.js';

export function initRewards() {
  // Redeem button
  document.getElementById('btn-redeem')?.addEventListener('click', () => {
    import('./auth.js').then(({ submitRedeemRequest }) => submitRedeemRequest());
  });

  // Re-render on state changes
  onStateChange((s) => {
    updateRewardEligibility(s);
  });
}

export function updateRewardEligibility(s = getState()) {
  const levelOk  = s.level >= REWARD_MIN_LEVEL;
  const streakOk = s.streak >= REWARD_MIN_STREAK;
  const eligible  = levelOk && streakOk;

  _setText('req-level-badge',   `Lv. ${s.level}`);
  _setText('req-level-status',  levelOk  ? '✅' : '❌');
  _setText('req-streak-badge',  `${s.streak} days`);
  _setText('req-streak-status', streakOk ? '✅' : '❌');
  _setText('elig-icon',     eligible ? '🎁' : '🔒');
  _setText('elig-title',    eligible ? 'You\'re Eligible!' : 'Not Yet Eligible');
  _setText('elig-subtitle', eligible
    ? 'Tap below to request your reward!'
    : `Reach Level ${REWARD_MIN_LEVEL} with a 7-day streak to unlock.`);

  const btn = document.getElementById('btn-redeem');
  if (btn) {
    btn.disabled = !eligible;
    btn.setAttribute('aria-disabled', String(!eligible));
  }
}

export function renderMilestones(achieved = []) {
  const listEl = document.getElementById('milestone-list');
  if (!listEl) return;

  listEl.innerHTML = MILESTONES.map((m) => {
    const done  = achieved.includes(m.id);
    const coins = m.coins ? `+${m.coins}💰` : '';
    const exp   = m.exp   ? `+${m.exp}⭐`   : '';
    return `
      <div class="milestone-item ${done ? 'achieved' : ''}">
        <div class="milestone-icon">${m.icon}</div>
        <div class="milestone-name">
          ${escapeHtml(m.name)}
          <span class="milestone-req">${escapeHtml(m.req)}</span>
        </div>
        <div class="milestone-reward">${[coins, exp].filter(Boolean).join(' ')}</div>
        <div class="milestone-done">${done ? '✅' : '⬜'}</div>
      </div>`;
  }).join('');
}

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

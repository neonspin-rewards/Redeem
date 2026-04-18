/* ================================================================
   js/app-profile.js — PROFILE PAGE entry point.
   Boots NeonSpin for profile.html only.

   Shows: player name, level, coins, EXP, streak, referral code,
   milestones achieved, and sign-out.
   Does NOT init: spin wheel, games, feed (not on this page).
================================================================ */

'use strict';

// ── UI modules ───────────────────────────────────────────────
import { loadTheme, initThemeToggle } from './theme.js';
import { initParticles }              from './particles.js';
import { initSoundToggle }            from './sound.js';
import { initPopup }                  from './popup.js';
import { hideLoader }                 from './loader.js';

// ── Auth ─────────────────────────────────────────────────────
import {
  initTermsGate,
  initAuthButtons,
  initAuthObserver,
  getCurrentUser,
} from './auth.js';

// ── State ─────────────────────────────────────────────────────
import { mergeProfile, getState, onStateChange } from './state.js';
import { expRequired, expInCurrentLevel }        from './config.js';
import { copyToClipboard }                       from './utils.js';

/* ================================================================
   BOOT
================================================================ */

const _hardFallback = setTimeout(hideLoader, 4000);

async function boot() {
  try {
    loadTheme();

    initParticles();
    initPopup();
    initSoundToggle();
    initThemeToggle();

    // Render profile from local state immediately (no blank flash)
    _renderProfile(getState(), null);

    // Re-render whenever state changes
    onStateChange((next) => _renderProfile(next, getCurrentUser()));

    // Referral copy button
    document.getElementById('profile-referral-btn')?.addEventListener('click', async () => {
      const code = getState().referralCode;
      if (!code) return;
      const ok = await copyToClipboard(code);
      if (ok) window.__ns_showPopup?.('🔗', 'Copied!', `Your referral code "${code}" has been copied!`);
    });

    initTermsGate();
    initAuthButtons();

    clearTimeout(_hardFallback);
    hideLoader();

    // Auth in background — enriches with real Firebase data
    initAuthObserver(_onUserReady, _onUserGone);

  } catch (err) {
    console.error('[NeonSpin Profile] Boot error:', err);
    clearTimeout(_hardFallback);
    hideLoader();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* ================================================================
   AUTH CALLBACKS
================================================================ */

function _onUserReady(profile) {
  if (!profile) return;
  mergeProfile(profile);
  _renderProfile(getState(), getCurrentUser());
}

function _onUserGone() {
  _renderProfile(getState(), null);
}

/* ================================================================
   PROFILE RENDER
================================================================ */

function _renderProfile(s, user) {
  // Avatar / name
  const name = user?.displayName || 'Guest Player';
  const email = user?.email || '';
  const initial = name[0]?.toUpperCase() || '?';

  _setText('profile-avatar-text', initial);
  _setText('profile-name',  name);
  _setText('profile-email', email || 'Not signed in');

  // Stats
  _setText('profile-coins',  s.coins  ?? 0);
  _setText('profile-exp',    s.exp    ?? 0);
  _setText('profile-level',  s.level  ?? 1);
  _setText('profile-streak', s.streak ?? 0);
  _setText('profile-spins',  s.spinCount ?? 0);

  // Referral code
  const code = s.referralCode || '—';
  _setText('profile-referral-code', code);
  const refBtn = document.getElementById('profile-referral-btn');
  if (refBtn) refBtn.style.opacity = code === '—' ? '0.4' : '1';

  // EXP bar
  const level   = s.level ?? 1;
  const needed  = expRequired(level);
  const current = expInCurrentLevel(s.exp ?? 0);
  const pct     = Math.min(100, Math.round((current / needed) * 100));

  const fill  = document.getElementById('profile-exp-fill');
  const pctEl = document.getElementById('profile-exp-pct');
  if (fill)  fill.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${current} / ${needed} EXP`;

  // Guest vs signed-in UI
  const guestBanner = document.getElementById('profile-guest-banner');
  const signedInfo  = document.getElementById('profile-signed-info');
  if (user) {
    guestBanner?.classList.add('hidden');
    signedInfo?.classList.remove('hidden');
  } else {
    guestBanner?.classList.remove('hidden');
    signedInfo?.classList.add('hidden');
  }
}

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

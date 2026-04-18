/* ================================================================
   js/app.js — HOME PAGE entry point.
   Boots NeonSpin for index.html only.

   Multi-page version: tab switching removed.
   Each page has its own entry point. State (coins/EXP/level)
   persists via localStorage + Firebase across all pages.
================================================================ */

'use strict';

// ── UI modules ───────────────────────────────────────────────
import { loadTheme, initThemeToggle } from './theme.js';
import { initParticles }              from './particles.js';
import { initSoundToggle }            from './sound.js';
import { initPopup }                  from './popup.js';
import { hideLoader }                 from './loader.js';

// ── Feature modules (home page only) ─────────────────────────
import { initStats, renderStats }     from './stats.js';
import { initSpin, renderTasks }      from './spin.js';
import { initFeed }                   from './feed.js';
import { initFeedback }               from './feedback.js';

// ── Auth ─────────────────────────────────────────────────────
import {
  initTermsGate,
  initAuthButtons,
  initAuthObserver,
  loadFeedbackList,
} from './auth.js';

// ── State ─────────────────────────────────────────────────────
import { mergeProfile, getState } from './state.js';

/* ================================================================
   BOOT
================================================================ */

const _hardFallback = setTimeout(hideLoader, 4000);

async function boot() {
  try {
    // STEP 1: Theme — sync, prevents flash
    loadTheme();

    // STEP 2: UI setup
    initParticles();
    initPopup();
    initSoundToggle();
    initThemeToggle();
    initStats();
    initSpin();
    initFeed();
    initFeedback();
    initTermsGate();
    initAuthButtons();

    // STEP 3: Hide loader — app is usable NOW
    clearTimeout(_hardFallback);
    hideLoader();

    // STEP 4: Firebase auth in background (non-blocking)
    initAuthObserver(_onUserReady, _onUserGone);

    // STEP 5: Load feedback list (non-critical)
    loadFeedbackList().catch(() => {});

  } catch (err) {
    console.error('[NeonSpin Home] Boot error:', err);
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

  // Merge Firebase data into local state
  mergeProfile(profile);

  // Update referral code display
  const codeEl = document.getElementById('referral-code-display');
  if (codeEl && profile.referralCode) codeEl.textContent = profile.referralCode;

  // Re-render stats with fresh data
  renderStats(getState());
  renderTasks();
}

function _onUserGone() {
  // Nothing critical to clear on home page
}

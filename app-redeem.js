/* ================================================================
   js/app-redeem.js — REDEEM / REWARDS PAGE entry point.
   Boots NeonSpin for redeem.html only.

   Inits: UI base, auth, reward eligibility, milestones.
   Does NOT init: spin wheel, games, feed (not on this page).
================================================================ */

'use strict';

// ── UI modules ───────────────────────────────────────────────
import { loadTheme, initThemeToggle } from './theme.js';
import { initParticles }              from './particles.js';
import { initSoundToggle }            from './sound.js';
import { initPopup }                  from './popup.js';
import { hideLoader }                 from './loader.js';

// ── Reward features ───────────────────────────────────────────
import {
  initRewards,
  updateRewardEligibility,
  renderMilestones,
} from './rewards.js';

// ── Auth ─────────────────────────────────────────────────────
import {
  initTermsGate,
  initAuthButtons,
  initAuthObserver,
} from './auth.js';

// ── State ─────────────────────────────────────────────────────
import { mergeProfile, getState } from './state.js';

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

    // Rewards init: wires the redeem button + listens for state changes
    initRewards();

    // Show current eligibility from local state immediately
    // (so the page doesn't look empty before Firebase responds)
    updateRewardEligibility(getState());
    renderMilestones([]);

    initTermsGate();
    initAuthButtons();

    clearTimeout(_hardFallback);
    hideLoader();

    // Auth in background — enriches with real Firebase data when ready
    initAuthObserver(_onUserReady, _onUserGone);

  } catch (err) {
    console.error('[NeonSpin Redeem] Boot error:', err);
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

  // Merge cloud data into local state
  mergeProfile(profile);

  // Re-render with accurate server data
  updateRewardEligibility(getState());
  renderMilestones(profile.milestonesAchieved || []);
}

function _onUserGone() {
  // Reset to guest view — no milestones, locked eligibility
  updateRewardEligibility(getState());
  renderMilestones([]);
}

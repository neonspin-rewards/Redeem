/* ═══════════════════════════════════════════════════════════════
   NEONSPIN — app.js
   Master entry point. The ONLY file loaded by index.html.
   Everything else is imported here.

   LOAD ORDER (automatic with ES modules):
   1. firebase.js  — Firebase app + DB init
   2. utils.js     — Pure helper functions
   3. auth.js      — Google Sign-In + user profile
   4. spin.js      — Wheel + game state + UI
   5. game.js      — Tap Frenzy + 2048
   6. app.js       — Wires them all together (this file)

   WHAT THIS FILE DOES:
   • Hides the loading screen once Firebase is ready
   • Initialises every module in the correct order
   • Passes callbacks between modules (no circular imports)
   • Wires tab navigation
   • Connects the leaderboard, rewards, and feedback buttons
   • Provides the onStateChange bridge so spin.js can trigger
     a Firebase sync without importing auth.js directly
═══════════════════════════════════════════════════════════════ */

'use strict';

// ── Module imports (order matters) ──────────────────────────
import {
  handleRedirectResult,
  initTermsGate,
  initAuthButtons,
  initAuthObserver,
  syncUserStats,
  loadLeaderboard,
  updateRewardEligibility,
  renderMilestones,
  submitRedeemRequest,
  submitFeedback,
  loadFeedbackList,
  getUserProfile,
} from './auth.js';

import {
  initSpin,
  applyProfileToState,
  bindUIEvents,
  loadTheme,
} from './spin.js';

import { initGames } from './game.js';

import { lsGet } from './utils.js';


/* ═══════════════════════════════════════════════════════════════
   BOOT
   Wait for the DOM to be fully parsed before running anything.
   (ES modules are deferred by default, so this is a safety net.)
═══════════════════════════════════════════════════════════════ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

async function boot() {
  /* ── Step 1: Apply saved theme immediately ───────────────
     Do this before anything renders to prevent a flash of
     the wrong theme on page load.                          */
  loadTheme();

  /* ── Step 2: Handle Google redirect return ───────────────
     Must be called FIRST on every page load.
     If the user just returned from Google sign-in,
     this picks up the auth result and hides the auth modal. */
  handleRedirectResult().catch((e) => {
  console.error("Redirect error:", e);
});

  /* ── Step 3: Initialise the spin wheel & game state ─────
     Pass a callback (onStateChange) so spin.js can sync
     to Firebase whenever coins/EXP change — without
     importing auth.js (avoids circular dependency).

     FIX: drawWheel is called inside initSpin via requestAnimationFrame
     so the canvas has time to be laid out by CSS before we measure it. */
  initSpin({
    onStateChange: (state) => syncUserStats(state),
  });

  /* ── Step 4: Bind all UI events ──────────────────────────
     Popup close, level-up close, sound/theme toggles,
     feedback image preview, referral chip copy.           */
  bindUIEvents();

  /* ── Step 5: Init mini games ─────────────────────────────
     Tap Frenzy + 2048 — previously MISSING from the project */
  initGames();

  /* ── Step 6: Wire tab navigation ─────────────────────────
     Bottom nav bar switches between Home/Games/Leaderboard/Rewards */
  initTabNav();

  /* ── Step 7: Wire extra buttons ──────────────────────────
     Redeem button, feedback submit, leaderboard filters    */
  initExtraButtons();

  /* ── Step 8: Terms gate ──────────────────────────────────
     Shows terms modal on first visit; handles accept button */
  initTermsGate();

  /* ── Step 9: Auth buttons ──────────────────────────────── */
  initAuthButtons();

  /* ── Step 10: Auth observer ─────────────────────────────
     onUserReady → merge Firebase profile into local state
     onUserGone  → show auth modal
     FIX: We hide the loading screen BEFORE the observer fires
     because onAuthStateChanged can take 1-3s on slow networks.
     The local state (from localStorage) is already displayed,
     so the user sees a usable UI immediately.               */
  initAuthObserver(onUserReady, onUserGone);

  /* ── Step 11: Load initial data ─────────────────────────
     Feedback list loads without requiring sign-in.        */
  loadFeedbackList();

  /* ── Step 12: Hide loading screen ───────────────────────
     Local state is ready — show the app now.
     Firebase will update values in the background.        */
 console.log("App fully initialized");
   hideLoadingScreen();
}


/* ═══════════════════════════════════════════════════════════════
   AUTH CALLBACKS
   These are passed to initAuthObserver() in auth.js.
═══════════════════════════════════════════════════════════════ */

/**
 * Called by auth.js when a user signs in successfully.
 * Merges their Firebase profile into the local spin state.
 * @param {Object} profile — the user's data from Realtime DB
 */
function onUserReady(profile) {
  if (!profile) return;

  // Merge Firebase profile → local state
  applyProfileToState(profile);

  // Update referral chip
  const codeEl = document.getElementById('referral-code-display');
  if (codeEl) codeEl.textContent = profile.referralCode || '—';

  // If the leaderboard tab is currently open, refresh it
  const lbSection = document.getElementById('tab-leaderboard');
  if (lbSection?.classList.contains('active')) {
    loadLeaderboard('level');
  }

  // Update rewards tab eligibility
  const state = window.__ns_state;
  if (state) {
    updateRewardEligibility(state);
    renderMilestones(profile.milestonesAchieved || []);
  }
}

/**
 * Called by auth.js when the user signs out.
 * The local game state remains (guest can still spin),
 * but Firebase-dependent features are disabled.
 */
function onUserGone() {
  const lbEl = document.getElementById('leaderboard-list');
  if (lbEl) lbEl.innerHTML = '<div class="lb-empty">Sign in to see the leaderboard</div>';

  const rankCard = document.getElementById('my-rank-card');
  rankCard?.classList.add('hidden');
}


/* ═══════════════════════════════════════════════════════════════
   TAB NAVIGATION
   Wires the bottom nav buttons to show/hide tab sections.
═══════════════════════════════════════════════════════════════ */
function initTabNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      /* Update nav button active states */
      document.querySelectorAll('.nav-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === targetTab);
        b.setAttribute('aria-selected', String(b.dataset.tab === targetTab));
      });

      /* Show the matching tab section */
      document.querySelectorAll('.tab-section').forEach((section) => {
        section.classList.toggle('active', section.id === `tab-${targetTab}`);
      });

      /* Scroll to top when switching tabs */
      window.scrollTo({ top: 0, behavior: 'smooth' });

      /* Tab-specific actions on switch ─────────────────── */
      if (targetTab === 'leaderboard') {
        // Only load if user is signed in
        if (getUserProfile()) {
          loadLeaderboard(_currentLeaderSort);
        }
      }

      if (targetTab === 'rewards') {
        const state = window.__ns_state;
        const profile = getUserProfile();
        if (state) updateRewardEligibility(state);
        if (profile) renderMilestones(profile.milestonesAchieved || []);
      }

      window.__ns_playSound?.('click');
    });
  });
}

/* Track current sort key for the leaderboard */
let _currentLeaderSort = 'level';


/* ═══════════════════════════════════════════════════════════════
   EXTRA BUTTON WIRING
   Buttons not handled by individual modules.
═══════════════════════════════════════════════════════════════ */
function initExtraButtons() {

  /* ── Leaderboard sort filters ───────────────────────────── */
  document.querySelectorAll('.lb-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      _currentLeaderSort = btn.dataset.sort;

      document.querySelectorAll('.lb-filter-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });

      if (getUserProfile()) {
        loadLeaderboard(_currentLeaderSort);
      }
      window.__ns_playSound?.('click');
    });
  });

  /* ── Redeem / reward request button ────────────────────── */
  document.getElementById('btn-redeem')?.addEventListener('click', () => {
    const state = window.__ns_state;
    if (state) submitRedeemRequest(state);
  });

  /* ── Feedback submit button ─────────────────────────────── */
  document.getElementById('btn-submit-feedback')?.addEventListener('click', submitFeedback);
}


/* ═══════════════════════════════════════════════════════════════
   LOADING SCREEN
   Hide after a short minimum display time so it doesn't
   flash too quickly on fast connections.
═══════════════════════════════════════════════════════════════ */
function hideLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  if (!screen) return;

  // FIX: Was 600ms minimum — caused the "Initialising..." screen
  // to stay on screen even after everything was ready.
  // Now: 50ms grace period so layout settles, then fade out.
  // The natural delay is Firebase auth initialisation (~800-1200ms),
  // so users already see the spinner long enough without extra delay.
  setTimeout(() => {
    screen.classList.add('fade-out');
    // Remove from layout after CSS fade completes (300ms)
    setTimeout(() => screen.remove(), 320);
  }, 50);
}

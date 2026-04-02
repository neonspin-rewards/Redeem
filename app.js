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
═══════════════════════════════════════════════════════════════ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

async function boot() {
  console.log('[NeonSpin] Step 1: Boot started');

  // ── HARD FALLBACK ─────────────────────────────────────────
  // If ANYTHING in boot() stalls or throws and the loading
  // screen is still visible after 5 seconds, force-hide it.
  // This is the ultimate safety net — app is always usable.
  const hardFallback = setTimeout(() => {
    console.warn('[NeonSpin] Hard fallback: force-hiding loading screen after 5s');
    hideLoadingScreen();
  }, 5000);

  try {
    // Step 1: Theme (synchronous — cannot fail)
    loadTheme();
    console.log('[NeonSpin] Step 2: Theme loaded');

    // Step 2: Google redirect result ──────────────────────────
    // FIX: Was plain `await handleRedirectResult()`.
    // getRedirectResult(auth) can hang FOREVER on GitHub Pages
    // when the authDomain isn't in Firebase's authorised list,
    // or when the Firebase SDK is slow to initialise.
    // Because boot() awaits it, hideLoadingScreen() was NEVER
    // reached — causing the eternal "Initialising..." spinner.
    //
    // Fix: race handleRedirectResult() against a 3-second timer.
    // If Firebase doesn't respond in 3s, we skip it and continue.
    // The user can still sign in manually via the Sign In button.
    
    console.log('[NeonSpin] Step 3: Redirect result handled');

    // Step 3–9: All synchronous init — these cannot block ─────
    initSpin({ onStateChange: (state) => syncUserStats(state) });
    console.log('[NeonSpin] Step 4: Spin wheel initialised');

    bindUIEvents();
    initGames();
    initTabNav();
    initExtraButtons();
    initTermsGate();
    initAuthButtons();
    console.log('[NeonSpin] Step 5: UI + games wired');

    // Step 10: Auth observer — non-blocking ───────────────────
    // onAuthStateChanged fires asynchronously in the background.
    // We do NOT await it — it calls onUserReady/onUserGone when
    // Firebase responds, without blocking the boot sequence.
    initAuthObserver(onUserReady, onUserGone);
    console.log('[NeonSpin] Step 6: Auth observer registered');

    // Step 11: Feedback list ──────────────────────────────────
    // FIX: DB rules require auth !== null, so this throws
    // PERMISSION_DENIED for unauthenticated users.
    // Wrapped in try/catch so it never bubbles up and kills boot.
    try {
      loadFeedbackList();
    } catch (e) {
      console.warn('[NeonSpin] Feedback list skipped (auth required):', e.message);
    }

    console.log('[NeonSpin] Step 7: App fully initialised');

  } catch (err) {
    // Any unexpected error during boot — log it but ALWAYS continue
    console.error('[NeonSpin] Boot error (non-fatal):', err);
  } finally {
    // ── GUARANTEED HIDE ────────────────────────────────────
    // finally runs whether boot() succeeded OR threw.
    // The loading screen is ALWAYS hidden here.
    clearTimeout(hardFallback); // Cancel the 5s hard fallback
    hideLoadingScreen();
    console.log('[NeonSpin] Step 8: Loading screen hidden');
  }
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

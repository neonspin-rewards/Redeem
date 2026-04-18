/* ================================================================
   js/app-leaderboard.js — LEADERBOARD PAGE entry point.
   Boots NeonSpin for leaderboard.html only.

   Inits: UI base, auth, leaderboard load + sort filters.
   Does NOT init: spin wheel, games, feed (not on this page).
================================================================ */

'use strict';

// ── UI modules ───────────────────────────────────────────────
import { loadTheme, initThemeToggle } from './theme.js';
import { initParticles }              from './particles.js';
import { initSoundToggle }            from './sound.js';
import { initPopup }                  from './popup.js';
import { hideLoader }                 from './loader.js';

// ── Auth + leaderboard ────────────────────────────────────────
import {
  initTermsGate,
  initAuthButtons,
  initAuthObserver,
  loadLeaderboard,
} from './auth.js';

/* ================================================================
   BOOT
================================================================ */

const _hardFallback = setTimeout(hideLoader, 4000);

// Track current sort so filter buttons can refresh correctly
let _currentSort = 'level';

async function boot() {
  try {
    loadTheme();

    initParticles();
    initPopup();
    initSoundToggle();
    initThemeToggle();
    initTermsGate();
    initAuthButtons();

    // Wire leaderboard sort filter buttons
    _initLbSort();

    // Load leaderboard immediately (works for guests too — shows fake data)
    loadLeaderboard(_currentSort);

    clearTimeout(_hardFallback);
    hideLoader();

    // Auth in background — updates "Your Rank" card when user is known
    initAuthObserver(_onUserReady, _onUserGone);

  } catch (err) {
    console.error('[NeonSpin Leaderboard] Boot error:', err);
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

function _onUserReady(_profile) {
  // Re-load leaderboard once we know who the user is,
  // so the "You" highlight and rank card appear correctly.
  loadLeaderboard(_currentSort);
}

function _onUserGone() {
  const lbEl = document.getElementById('leaderboard-list');
  if (lbEl) lbEl.innerHTML = '<div class="lb-empty">Sign in to see your rank</div>';
  document.getElementById('my-rank-card')?.classList.add('hidden');
  // Reload with guest view after sign out
  loadLeaderboard(_currentSort);
}

/* ================================================================
   LEADERBOARD SORT FILTERS
================================================================ */

function _initLbSort() {
  document.querySelectorAll('.lb-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sort = btn.dataset.sort;
      _currentSort = sort;

      // Update active state on filter buttons
      document.querySelectorAll('.lb-filter-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });

      loadLeaderboard(sort);
      window.__ns_playSound?.('click');
    });
  });
}

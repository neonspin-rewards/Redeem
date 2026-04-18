/* ================================================================
   game-bridge.js — Shared reward engine for all standalone game pages.

   PROBLEM IT SOLVES:
   memory, 2048, tile, reaction, lucky, scratch are standalone
   HTML pages with inline scripts. They calculate coins at the end
   of each game but never persist them — coins are simply lost.

   HOW IT WORKS:
   1. On page load: silently start Firebase auth and merge the
      user's cloud profile into localStorage (ns_state_v2).
      By the time a game ends (takes seconds), Firebase data is
      already loaded — so rewards are always added to the correct
      up-to-date base values.

   2. window.__ns_giveReward(type, value, icon, label):
      Each game's endGame() calls this to award coins/EXP.
      Step A — localStorage: setState() writes instantly (zero lag).
      Step B — Firebase: syncUserStats() writes in background.

   3. Dashboard (index.html / app.js) already:
      - Reads localStorage on boot  → instant display ✅
      - Reads Firebase on auth load → authoritative sync ✅
      No changes needed there — it "just works" once games write.

   USED BY: memory.html, 2048.html, tile.html,
            reaction.html, lucky.html, scratch.html

   DO NOT USE ON: index.html (app.js handles it), spin.html
                  (spin.js handles it), games.html (app-games.js)
================================================================ */

'use strict';

import { getState, setState, mergeProfile } from './state.js';
import { levelFromExp }                     from './config.js';
import { syncUserStats, initAuthObserver }  from './auth.js';

/* ── Global reward function ────────────────────────────────────────
   Called by each game page's endGame() function.

   @param {'coins'|'exp'|'spin'} type  — what to award
   @param {number}               value — how much to add
   @param {string}               [icon]  — emoji for future popups
   @param {string}               [label] — title for future popups
   ------------------------------------------------------------------ */
window.__ns_giveReward = function giveReward(type, value, icon, label) {
  const s = getState();
  let patch = {};

  switch (type) {
    case 'coins':
      patch = { coins: s.coins + Number(value) };
      break;

    case 'exp': {
      const newExp = s.exp + Number(value);
      patch = { exp: newExp, level: levelFromExp(newExp) };
      break;
    }

    case 'spin':
      patch = { spins: (s.spins || 0) + Number(value) };
      break;

    default:
      console.warn('[game-bridge] Unknown reward type:', type);
      return;
  }

  // STEP 1 — Write to localStorage immediately (zero UI delay)
  setState(patch);

  const next = getState();
  console.info(
    `[game-bridge] +${value} ${type} saved.`,
    `coins=${next.coins}  exp=${next.exp}  level=${next.level}`
  );

  // STEP 2 — Sync to Firebase (non-blocking, best-effort)
  // If Firebase is unavailable the value is still safe in localStorage
  // and will sync the next time the user visits index.html.
  syncUserStats(next).catch((err) => {
    console.warn('[game-bridge] Firebase sync failed (safe — localStorage is up to date):', err);
  });
};

/* ── Silent auth init on page load ────────────────────────────────
   Merges the Firebase profile into localStorage before the user
   finishes playing. This guarantees that when __ns_giveReward
   is called, getState() already reflects the authoritative cloud
   values — so we add the reward to the correct base, not stale data.
   ------------------------------------------------------------------ */
initAuthObserver(
  function onUserReady(profile) {
    if (profile) {
      mergeProfile(profile);
      console.info('[game-bridge] Firebase profile merged into localStorage state.');
    }
  },
  function onUserGone() {
    // Guest play — localStorage state is still used and updated. Fine.
  }
);

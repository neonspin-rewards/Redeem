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
      Now uses the centralized reward-system.js with validation,
      limits, and anti-cheat protection.

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

import { mergeProfile } from './state.js';
import { initAuthObserver }  from './auth.js';
import { giveReward } from './reward-system.js';

/* ── Global reward function ────────────────────────────────────────
   Called by each game page's endGame() function.
   
   NOW USES CENTRALIZED REWARD SYSTEM with:
   ✅ Validation (max limits per game)
   ✅ Anti-cheat detection
   ✅ Comprehensive logging
   ✅ Rate limiting

   @param {'coins'|'exp'|'spin'} type  — what to award
   @param {number}               value — how much to add
   @param {string}               [icon]  — emoji for future popups
   @param {string}               [label] — title for future popups
   ------------------------------------------------------------------ */
window.__ns_giveReward = function giveRewardLegacy(type, value, icon, label) {
  const source = _inferGameSource();
  
  console.info(`[game-bridge] Giving reward: ${value} ${type} from ${source}`);
  
  const success = giveReward(type, value, source, { 
    icon: icon || '🎮', 
    label: label || 'Game Reward' 
  });
  
  if (!success) {
    console.error('[game-bridge] Reward failed validation!');
  }
  
  return success;
};

/* ── Infer game source from URL ────────────────────────────────────
   Maps the current page to a reward source identifier.
   This is used for applying correct reward limits.
   ------------------------------------------------------------------ */
function _inferGameSource() {
  const path = window.location.pathname.toLowerCase();
  
  if (path.includes('2048'))     return 'game_2048';
  if (path.includes('memory'))   return 'game_memory';
  if (path.includes('tile'))     return 'game_tile';
  if (path.includes('reaction')) return 'game_reaction';
  if (path.includes('lucky'))    return 'game_lucky';
  if (path.includes('scratch'))  return 'game_scratch';
  
  console.warn('[game-bridge] Unknown game page:', path);
  return 'game_unknown';
}

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
      console.info('[game-bridge] ✅ Firebase profile merged into localStorage state.');
    }
  },
  function onUserGone() {
    // Guest play — localStorage state is still used and updated. Fine.
    console.info('[game-bridge] Guest mode active — rewards saved locally only.');
  }
);

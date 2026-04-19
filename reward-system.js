/* ================================================================
   reward-system.js — Centralized, Secure Reward Distribution
   
   WHY THIS EXISTS:
   Before: Rewards scattered across 5+ files, no validation, easy to exploit.
   After: ONE function controls all rewards with limits, logging, anti-cheat.
   
   USAGE:
   import { giveReward } from './reward-system.js';
   giveReward('coins', 50, 'spin_wheel');
   
   FEATURES:
   ✅ Centralized validation (max limits per source)
   ✅ Anti-cheat detection (suspicious patterns flagged)
   ✅ Comprehensive logging (who, what, when, where)
   ✅ Rate limiting (prevent spam rewards)
   ✅ Safe state updates (controlled, validated)
================================================================ */

'use strict';

import { getState, setState } from './state.js';
import { levelFromExp } from './config.js';
import { syncUserStats, getCurrentUid } from './auth.js';

/* ── Reward Limits & Rules ────────────────────────────────────────
   These limits prevent exploitation and maintain game balance.
   Adjust these values to match your game's economy.
   ------------------------------------------------------------------ */
const REWARD_LIMITS = {
  // Per-source max rewards (prevents single action giving too much)
  coins: {
    spin_wheel:    100,  // Max 100 coins per spin
    game_2048:     200,  // Max 200 coins per game
    game_memory:   150,
    game_tile:     150,
    game_reaction: 100,
    game_lucky:    500,  // Lucky box can give more (it's rare)
    game_scratch:  300,
    daily_reward:  100,
    task_complete: 50,
    milestone:     200,
    referral:      100,
    admin_grant:   1000, // Admin can grant more
    default:       100,  // Fallback for unlisted sources
  },
  
  exp: {
    daily_reward:  50,
    task_complete: 30,
    milestone:     100,
    streak_bonus:  100,
    admin_grant:   500,
    default:       50,
  },
  
  spins: {
    spin_reward:   5,   // Max 5 extra spins from wheel
    daily_reward:  3,
    task_complete: 2,
    admin_grant:   10,
    default:       3,
  },
};

/* ── Rate Limiting ────────────────────────────────────────────────
   Prevents rapid-fire reward spam (e.g., button mashing exploits)
   ------------------------------------------------------------------ */
const RATE_LIMIT = {
  windowMs: 1000,      // 1 second window
  maxRewards: 10,      // Max 10 rewards per second (generous for legit gameplay)
};

let _rewardHistory = []; // Stores recent rewards for rate limiting

/* ── Reward Log Storage ───────────────────────────────────────────
   Logs are stored in memory and can be synced to Firebase later.
   Useful for admin dashboard and anti-cheat analysis.
   ------------------------------------------------------------------ */
let _rewardLog = [];

const MAX_LOG_SIZE = 100; // Keep last 100 rewards in memory

/* ================================================================
   CORE REWARD FUNCTION
   
   This is the ONLY function that should modify coins/exp/spins.
   All other code must call this function instead of setState directly.
   
   @param {string} type   - 'coins' | 'exp' | 'spins'
   @param {number} amount - How much to give (will be validated)
   @param {string} source - Where reward came from (e.g., 'spin_wheel', 'game_2048')
   @param {object} metadata - Optional extra info (e.g., score, level, etc.)
   @returns {boolean} Success or failure
================================================================ */
export function giveReward(type, amount, source = 'unknown', metadata = {}) {
  // ── Input Validation ────────────────────────────────────────────
  if (!['coins', 'exp', 'spins'].includes(type)) {
    console.error('[reward-system] Invalid reward type:', type);
    return false;
  }
  
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    console.error('[reward-system] Invalid amount:', amount);
    return false;
  }
  
  // ── Rate Limiting ───────────────────────────────────────────────
  const now = Date.now();
  _rewardHistory = _rewardHistory.filter(t => t > now - RATE_LIMIT.windowMs);
  
  if (_rewardHistory.length >= RATE_LIMIT.maxRewards) {
    console.warn('[reward-system] ⚠️ Rate limit exceeded! Possible exploit attempt.');
    _flagSuspiciousActivity('rate_limit_exceeded', { type, amount, source });
    return false;
  }
  
  _rewardHistory.push(now);
  
  // ── Limit Validation ────────────────────────────────────────────
  const limits = REWARD_LIMITS[type] || {};
  const maxAllowed = limits[source] || limits.default || 100;
  
  if (numAmount > maxAllowed) {
    console.warn(
      `[reward-system] ⚠️ Amount ${numAmount} exceeds limit ${maxAllowed} for ${source}.`,
      'Capping to max allowed.'
    );
    _flagSuspiciousActivity('reward_limit_exceeded', { type, amount, source, maxAllowed });
    // Don't reject — just cap to max (prevents breaking legit gameplay)
    amount = maxAllowed;
  }
  
  // ── Apply Reward ────────────────────────────────────────────────
  const s = getState();
  let patch = {};
  
  switch (type) {
    case 'coins':
      patch = { coins: s.coins + amount };
      break;
      
    case 'exp': {
      const newExp = s.exp + amount;
      const newLevel = levelFromExp(newExp);
      patch = { exp: newExp, level: newLevel };
      break;
    }
    
    case 'spins':
      patch = { spins: (s.spins || 0) + amount };
      break;
  }
  
  // Update state immediately (local storage)
  setState(patch);
  
  const newState = getState();
  
  // ── Logging ─────────────────────────────────────────────────────
  const logEntry = {
    timestamp: now,
    type,
    amount,
    source,
    metadata,
    userId: getCurrentUid() || 'guest',
    resultState: {
      coins: newState.coins,
      exp: newState.exp,
      level: newState.level,
      spins: newState.spins,
    },
  };
  
  _rewardLog.push(logEntry);
  if (_rewardLog.length > MAX_LOG_SIZE) {
    _rewardLog.shift(); // Remove oldest
  }
  
  console.info(
    `[reward-system] ✅ +${amount} ${type} from ${source}`,
    `→ Total: ${type === 'coins' ? newState.coins : type === 'exp' ? newState.exp : newState.spins}`
  );
  
  // ── Firebase Sync (Background) ──────────────────────────────────
  // Non-blocking sync to Firebase
  syncUserStats(newState).catch((err) => {
    console.warn('[reward-system] Firebase sync failed (local state is safe):', err);
  });
  
  return true;
}

/* ================================================================
   ANTI-CHEAT DETECTION
   
   Flags suspicious patterns for admin review.
   In production, this would write to Firebase for admin dashboard.
================================================================ */
function _flagSuspiciousActivity(reason, details) {
  const flag = {
    timestamp: Date.now(),
    userId: getCurrentUid() || 'guest',
    reason,
    details,
  };
  
  console.warn('[reward-system] 🚨 SUSPICIOUS ACTIVITY:', flag);
  
  // TODO: In production, write to Firebase:
  // push(ref(db, 'suspiciousActivity'), flag);
  
  // For now, store in memory
  if (!window.__ns_suspiciousFlags) {
    window.__ns_suspiciousFlags = [];
  }
  window.__ns_suspiciousFlags.push(flag);
}

/* ================================================================
   UTILITY FUNCTIONS
================================================================ */

/** Get recent reward history (for debugging/admin) */
export function getRewardLog() {
  return [..._rewardLog]; // Return copy
}

/** Clear reward log (admin only) */
export function clearRewardLog() {
  _rewardLog = [];
  console.info('[reward-system] Reward log cleared');
}

/** Get suspicious activity flags (admin only) */
export function getSuspiciousFlags() {
  return window.__ns_suspiciousFlags || [];
}

/** Check if reward is within limits (dry-run, doesn't give reward) */
export function validateReward(type, amount, source) {
  const limits = REWARD_LIMITS[type] || {};
  const maxAllowed = limits[source] || limits.default || 100;
  return amount <= maxAllowed;
}

/* ================================================================
   MIGRATION HELPER
   
   This function wraps the old window.__ns_giveReward for backwards
   compatibility. Gradually replace all calls with direct imports.
================================================================ */
window.__ns_giveReward = function(type, value, icon, label) {
  const source = _inferSource(); // Try to guess source from call context
  return giveReward(type, value, source, { icon, label });
};

function _inferSource() {
  // Try to infer source from URL or other context
  const path = window.location.pathname;
  if (path.includes('2048'))    return 'game_2048';
  if (path.includes('memory'))  return 'game_memory';
  if (path.includes('tile'))    return 'game_tile';
  if (path.includes('reaction'))return 'game_reaction';
  if (path.includes('lucky'))   return 'game_lucky';
  if (path.includes('scratch')) return 'game_scratch';
  if (path.includes('spin'))    return 'spin_wheel';
  return 'unknown';
}

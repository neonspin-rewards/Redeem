/* ================================================================
   js/state.js — Centralized reactive state.
   Single source of truth for all game data.
   No more window.__ns_state scattered across files.

   Usage:
     import { state, setState, onStateChange } from './state.js';
     onStateChange((next, prev) => renderStats(next));
     setState({ coins: state.coins + 10 });
================================================================ */

'use strict';

import { lsGetJSON, lsSetJSON } from './utils.js';

const LS_KEY = 'ns_state_v2';

// ── Default state ────────────────────────────────────────────
const DEFAULTS = {
  coins:           0,
  exp:             0,
  level:           1,
  spins:           3,
  spinCount:       0,
  lastDailyReward: 0,
  lastDailyReset:  0,
  tasks:           {},
  streak:          0,
  lastLoginDay:    '',
  referralCode:    '',
  firstLoginDone:  false,
};

// Load persisted state (merge with defaults so new fields always exist)
let _state = { ...DEFAULTS, ...lsGetJSON(LS_KEY, {}) };

// Listener registry
const _listeners = new Set();

// ── Public API ───────────────────────────────────────────────

/** Read current state (immutable snapshot) */
export function getState() {
  return { ..._state };
}

/** Shorthand alias */
export const state = new Proxy({}, {
  get(_, key) { return _state[key]; },
});

/**
 * Merge partial updates into state, persist to localStorage,
 * and notify all listeners.
 * @param {Partial<typeof DEFAULTS>} patch
 */
export function setState(patch) {
  const prev = { ..._state };
  _state = { ..._state, ...patch };
  lsSetJSON(LS_KEY, _state);
  for (const fn of _listeners) {
    try { fn({ ..._state }, prev); }
    catch (e) { console.error('[state] listener error:', e); }
  }
}

/**
 * Replace state entirely from a Firebase profile object.
 * Called when user signs in and their cloud data is loaded.
 */
export function mergeProfile(profile) {
  if (!profile) return;
  setState({
    coins:          profile.coins          ?? _state.coins,
    exp:            profile.exp            ?? _state.exp,
    level:          profile.level          ?? _state.level,
    spins:          profile.spinCount      ?? _state.spins,
    spinCount:      profile.spinCount      ?? _state.spinCount,
    streak:         profile.streak         ?? _state.streak,
    lastLoginDay:   profile.lastLoginDay   ?? _state.lastLoginDay,
    lastDailyReward:profile.lastDailyReward?? _state.lastDailyReward,
    referralCode:   profile.referralCode   ?? _state.referralCode,
    firstLoginDone: profile.firstLoginDone ?? _state.firstLoginDone,
    tasks:          profile.tasks          ?? _state.tasks,
  });
}

/**
 * Subscribe to state changes.
 * @param {Function} fn — called with (nextState, prevState)
 * @returns {Function} unsubscribe function
 */
export function onStateChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Reset to guest defaults (called on sign out) */
export function resetState() {
  _state = { ...DEFAULTS };
  lsSetJSON(LS_KEY, _state);
  for (const fn of _listeners) {
    try { fn({ ..._state }, DEFAULTS); }
    catch {}
  }
}

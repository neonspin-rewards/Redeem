/* ═══════════════════════════════════════════════════════════════
   NEONSPIN — utils.js
   Pure helper functions with NO side effects.
   Imported by: auth.js, spin.js, ui.js, app.js

   WHY A SEPARATE FILE?
   These functions are needed by multiple modules. Putting them
   here prevents code duplication and circular imports.
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────
   DOM HELPERS
   Tiny wrappers so we don't repeat document.getElementById
   everywhere. These are the ONLY place we do DOM lookups
   by ID — keeps all other files cleaner.
───────────────────────────────────────────────────────────────  */

/** Get element by ID. Returns null safely if not found. */
export const $id = (id) => document.getElementById(id);

/** Show an element by removing the 'hidden' class. */
export function showEl(id) {
  const el = $id(id);
  if (el) el.classList.remove('hidden');
}

/** Hide an element by adding the 'hidden' class. */
export function hideEl(id) {
  const el = $id(id);
  if (el) el.classList.add('hidden');
}

/** Set the text content of an element safely. */
export function setText(id, text) {
  const el = $id(id);
  if (el) el.textContent = text;
}

/** Toggle a class on an element. */
export function toggleClass(id, cls, force) {
  const el = $id(id);
  if (el) el.classList.toggle(cls, force);
}


/* ─────────────────────────────────────────────────────────────
   LEVEL / EXP CALCULATIONS
   Both auth.js and spin.js need these — defined once here.

   Formula: EXP needed for level N = floor(50 × N^1.3)
   This gives a gentle curve — early levels are quick,
   later levels take progressively more effort.
───────────────────────────────────────────────────────────────  */

/**
 * How much EXP is needed to complete a given level.
 * Example: level 1 = 50 EXP, level 5 = 180 EXP, level 10 = 398 EXP
 */
export function expRequired(level) {
  return Math.floor(50 * Math.pow(level, 1.3));
}

/**
 * Calculate which level a player is at given their total EXP.
 * Walks through levels accumulating EXP until it would exceed totalExp.
 */
export function levelFromExp(totalExp) {
  let level = 1;
  let accumulated = 0;
  while (true) {
    const needed = expRequired(level);
    if (accumulated + needed > totalExp) break;
    accumulated += needed;
    level++;
    if (level > 1000) break; // Safety cap — prevents infinite loop
  }
  return level;
}

/**
 * How much EXP the player has earned within their CURRENT level.
 * Used to fill the progress bar correctly.
 * Example: If player has 130 total EXP and level 1 needs 50, level 2 needs 63:
 *   → accumulated after level 1 = 50, accumulated after level 2 = 113
 *   → currentLevelExp = 130 - 113 = 17 EXP into level 3
 */
export function expInCurrentLevel(totalExp) {
  let accumulated = 0;
  let level = 1;
  while (true) {
    const needed = expRequired(level);
    if (accumulated + needed > totalExp) {
      return totalExp - accumulated; // EXP earned within current level
    }
    accumulated += needed;
    level++;
    if (level > 1000) break;
  }
  return 0;
}


/* ─────────────────────────────────────────────────────────────
   DATE HELPERS
   Used by streak tracking and daily reward cooldown.
───────────────────────────────────────────────────────────────  */

/** Returns today's date as "YYYY-MM-DD" string (UTC). */
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Returns yesterday's date as "YYYY-MM-DD" string (UTC). */
export function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Format milliseconds remaining into "HH:MM:SS" string.
 * Used by the daily reward countdown timer.
 */
export function formatCountdown(ms) {
  if (ms <= 0) return 'Ready!';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}


/* ─────────────────────────────────────────────────────────────
   STRING HELPERS
───────────────────────────────────────────────────────────────  */

/**
 * Escape HTML special characters to prevent XSS when injecting
 * user-provided text into innerHTML.
 * Always use this before inserting any untrusted string into the DOM.
 */
export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate a random 6-character referral code.
 * Uses unambiguous characters only (no 0/O, 1/I/L).
 */
export function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

/**
 * Copy text to clipboard using the modern Clipboard API.
 * Falls back gracefully if the API is unavailable.
 * @returns {Promise<boolean>} true if successful
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback: create a temporary textarea and execCommand
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}


/* ─────────────────────────────────────────────────────────────
   DEBOUNCE
   Prevents a function from firing too many times in a row.
   Used on the spin button to block double-clicks / spam.

   Usage:
     const safeSpin = debounce(spinWheel, 500);
     btn.addEventListener('click', safeSpin);
───────────────────────────────────────────────────────────────  */

/**
 * Returns a debounced version of `fn` that fires at most once
 * per `delay` milliseconds.
 */
export function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) return; // Ignore calls while timer is active
    fn.apply(this, args);
    timer = setTimeout(() => { timer = null; }, delay);
  };
}


/* ─────────────────────────────────────────────────────────────
   RANDOM HELPERS
───────────────────────────────────────────────────────────────  */

/** Random integer between min and max (inclusive). */
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pick a random element from an array. */
export function randItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}


/* ─────────────────────────────────────────────────────────────
   LOCAL STORAGE HELPERS
   Wraps localStorage with try/catch because it can throw in
   private browsing mode or when storage quota is exceeded.
───────────────────────────────────────────────────────────────  */

/** Safely read from localStorage. Returns defaultVal on failure. */
export function lsGet(key, defaultVal = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? defaultVal : v;
  } catch {
    return defaultVal;
  }
}

/** Safely write to localStorage. Returns true on success. */
export function lsSet(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

/** Safely read a JSON object from localStorage. */
export function lsGetJSON(key, defaultVal = null) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : defaultVal;
  } catch {
    return defaultVal;
  }
}

/** Safely write a JSON object to localStorage. */
export function lsSetJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* ================================================================
   js/utils.js — Pure helper functions, no side effects.
================================================================ */

'use strict';

// ── DOM helpers ──────────────────────────────────────────────
export const $id = (id) => document.getElementById(id);

export function showEl(id) {
  const el = $id(id);
  if (el) el.classList.remove('hidden');
}

export function hideEl(id) {
  const el = $id(id);
  if (el) el.classList.add('hidden');
}

export function setText(id, text) {
  const el = $id(id);
  if (el) el.textContent = text;
}

export function setHTML(id, html) {
  const el = $id(id);
  if (el) el.innerHTML = html;
}

// ── Date helpers ─────────────────────────────────────────────
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function formatCountdown(ms) {
  if (ms <= 0) return 'Ready!';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// ── Random helpers ───────────────────────────────────────────
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── String helpers ───────────────────────────────────────────
export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch { return false; }
  }
}

// ── localStorage helpers ─────────────────────────────────────
export function lsGet(key, def = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v;
  } catch { return def; }
}

export function lsSet(key, value) {
  try { localStorage.setItem(key, String(value)); return true; }
  catch { return false; }
}

export function lsGetJSON(key, def = null) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  } catch { return def; }
}

export function lsSetJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

// ── Debounce ─────────────────────────────────────────────────
export function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) return;
    fn.apply(this, args);
    timer = setTimeout(() => { timer = null; }, delay);
  };
}

// ── Number formatting ────────────────────────────────────────
export function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

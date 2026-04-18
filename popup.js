/* ================================================================
   js/ui/popup.js — Unified popup / modal system.
   Exposes window.__ns_showPopup for cross-module usage.
================================================================ */
'use strict';

export function initPopup() {
  document.getElementById('popup-close')?.addEventListener('click', closePopup);
  document.getElementById('levelup-close')?.addEventListener('click', closeLevelUp);

  // Close popup on overlay click
  document.getElementById('popup-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'popup-overlay') closePopup();
  });

  // Expose globally
  window.__ns_showPopup  = showPopup;
  window.__ns_showLevelUp = showLevelUp;
}

export function showPopup(icon, title, msg) {
  const overlay = document.getElementById('popup-overlay');
  const iconEl  = document.getElementById('popup-icon');
  const titleEl = document.getElementById('popup-title');
  const msgEl   = document.getElementById('popup-msg');

  if (iconEl)  iconEl.textContent  = icon;
  if (titleEl) titleEl.textContent = title;
  if (msgEl)   msgEl.textContent   = msg;
  if (overlay) overlay.classList.remove('hidden');
}

export function closePopup() {
  document.getElementById('popup-overlay')?.classList.add('hidden');
}

export function showLevelUp(level) {
  const overlay = document.getElementById('levelup-overlay');
  const numEl   = document.getElementById('levelup-num');
  if (numEl)   numEl.textContent  = `Level ${level}!`;
  if (overlay) overlay.classList.remove('hidden');

  _spawnConfetti();
}

export function closeLevelUp() {
  document.getElementById('levelup-overlay')?.classList.add('hidden');
}

function _spawnConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  container.innerHTML = '';

  const colors = ['#00d4ff','#a855f7','#fbbf24','#39ff14','#ff6b35','#f0abfc'];
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';

    const color = colors[Math.floor(Math.random() * colors.length)];
    const delay = Math.random() * 1.2;
    const dur   = Math.random() * 1.5 + 1.2;
    const left  = Math.random() * 100;
    const size  = Math.random() * 8 + 4;

    Object.assign(p.style, {
      left:             `${left}%`,
      width:            `${size}px`,
      height:           `${size}px`,
      background:       color,
      animationDuration:`${dur}s`,
      animationDelay:   `${delay}s`,
    });

    fragment.appendChild(p);
  }

  container.appendChild(fragment);
}

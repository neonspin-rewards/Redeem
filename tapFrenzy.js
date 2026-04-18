/* ================================================================
   js/games/tapFrenzy.js — Tap Frenzy mini-game.
   10-second tap challenge. Coins awarded by score.
================================================================ */
'use strict';

import { lsGet, lsSet } from './utils.js';
import { playSound } from './sound.js';

const GAME_DURATION = 10; // seconds

const _tap = {
  score:      0,
  best:       parseInt(lsGet('ns_tap_best') || '0', 10),
  timeLeft:   GAME_DURATION,
  running:    false,
  intervalId: null,
};

export function initTapFrenzy() {
  _updateBest();
  document.getElementById('btn-tap-start')?.addEventListener('click', _startGame);
  document.getElementById('btn-tap-retry')?.addEventListener('click', _resetGame);
  document.getElementById('tap-target')?.addEventListener('click',     _onTap);
  document.getElementById('tap-target')?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    _onTap();
  }, { passive: false });
}

function _startGame() {
  const overlay = document.getElementById('tap-start-overlay');
  const resultEl = document.getElementById('tap-result');

  if (overlay) overlay.style.display = 'none';
  if (resultEl) resultEl.classList.add('hidden');

  _tap.score   = 0;
  _tap.timeLeft = GAME_DURATION;
  _tap.running  = true;

  _setText('tap-score', 0);
  _setText('tap-timer', GAME_DURATION);

  _moveTarget();

  _tap.intervalId = setInterval(() => {
    _tap.timeLeft--;
    _setText('tap-timer', _tap.timeLeft);
    if (_tap.timeLeft <= 0) _endGame();
  }, 1000);
}

function _onTap() {
  if (!_tap.running) return;
  _tap.score++;
  _setText('tap-score', _tap.score);
  playSound('click');
  _moveTarget();

  const target = document.getElementById('tap-target');
  if (target) {
    target.style.transform = 'scale(.75)';
    setTimeout(() => { target.style.transform = ''; }, 80);
  }
}

function _moveTarget() {
  const arena  = document.getElementById('tap-arena');
  const target = document.getElementById('tap-target');
  if (!arena || !target) return;

  const aW = arena.clientWidth  - 70;
  const aH = arena.clientHeight - 70;
  const x  = Math.random() * aW;
  const y  = Math.random() * aH;

  target.style.left = `${x}px`;
  target.style.top  = `${y}px`;
}

function _endGame() {
  clearInterval(_tap.intervalId);
  _tap.running = false;

  const score = _tap.score;
  if (score > _tap.best) {
    _tap.best = score;
    lsSet('ns_tap_best', String(score));
    _updateBest();
  }

  const coins = score >= 40 ? 25 : score >= 25 ? 15 : score >= 15 ? 8 : score >= 5 ? 4 : 1;
  const msg   = `+${coins} Coins earned!`;

  _setText('tap-final-score', score);
  _setText('tap-reward-msg', msg);

  const resultEl = document.getElementById('tap-result');
  const target   = document.getElementById('tap-target');
  if (resultEl) resultEl.classList.remove('hidden');
  if (target)   target.style.display = 'none';

  window.__ns_giveReward?.('coins', coins, '🏆', 'Tap Frenzy!');
}

function _resetGame() {
  const overlay = document.getElementById('tap-start-overlay');
  const resultEl = document.getElementById('tap-result');
  const target   = document.getElementById('tap-target');

  if (overlay)  { overlay.style.display = ''; }
  if (resultEl) resultEl.classList.add('hidden');
  if (target)   target.style.display = '';

  _tap.score   = 0;
  _tap.timeLeft = GAME_DURATION;
  _tap.running  = false;
  clearInterval(_tap.intervalId);

  _setText('tap-score', 0);
  _setText('tap-timer', GAME_DURATION);
  _moveTarget();
}

function _updateBest() {
  _setText('tap-best', _tap.best);
}

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

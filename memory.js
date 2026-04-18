/* ================================================================
   js/games/memory.js — Memory Match mini-game.
   16-card grid (8 pairs). Fewer moves = more coins.
================================================================ */
'use strict';

import { lsGet, lsSet } from './utils.js';
import { playSound } from './sound.js';

const EMOJIS = ['🔥','⚡','💫','🎯','🚀','🦋','🐉','🌙'];

let _cards      = [];
let _flipped    = [];
let _matched    = 0;
let _moves      = 0;
let _best       = parseInt(lsGet('ns_mem_best') || '999', 10);
let _lockBoard  = false;

export function initMemoryGame() {
  _setText('mem-best', _best === 999 ? '—' : _best);
  _newGame();

  document.getElementById('btn-mem-new')?.addEventListener('click', _newGame);
  document.getElementById('btn-mem-retry')?.addEventListener('click', _newGame);
}

function _newGame() {
  _cards   = [];
  _flipped = [];
  _matched = 0;
  _moves   = 0;
  _lockBoard = false;

  _setText('mem-moves', 0);
  _setText('mem-pairs', '0/8');
  document.getElementById('mem-result')?.classList.add('hidden');

  const deck = [...EMOJIS, ...EMOJIS]
    .sort(() => Math.random() - .5)
    .map((emoji, i) => ({ id: i, emoji, matched: false }));

  _cards = deck;
  _renderGrid();
}

function _renderGrid() {
  const gridEl = document.getElementById('mem-grid');
  if (!gridEl) return;

  gridEl.innerHTML = _cards.map((card) => `
    <div class="mem-card" data-id="${card.id}">
      <div class="card-back">❓</div>
      <div class="card-front">${card.emoji}</div>
    </div>
  `).join('');

  gridEl.querySelectorAll('.mem-card').forEach((el) => {
    el.addEventListener('click', () => _flipCard(el));
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      _flipCard(el);
    }, { passive: false });
  });
}

function _flipCard(el) {
  if (_lockBoard) return;
  const id = parseInt(el.dataset.id, 10);
  const card = _cards[id];
  if (card.matched || _flipped.some((f) => f.id === id)) return;

  el.classList.add('flipped');
  _flipped.push({ id, el });
  playSound('flip');

  if (_flipped.length === 2) {
    _moves++;
    _setText('mem-moves', _moves);
    _checkMatch();
  }
}

function _checkMatch() {
  const [a, b] = _flipped;
  const cardA  = _cards[a.id];
  const cardB  = _cards[b.id];

  if (cardA.emoji === cardB.emoji) {
    cardA.matched = true;
    cardB.matched = true;
    a.el.classList.add('matched');
    b.el.classList.add('matched');
    _matched++;
    _setText('mem-pairs', `${_matched}/8`);
    _flipped = [];
    playSound('match');

    if (_matched === 8) _endGame();
  } else {
    _lockBoard = true;
    setTimeout(() => {
      a.el.classList.remove('flipped');
      b.el.classList.remove('flipped');
      _flipped = [];
      _lockBoard = false;
    }, 900);
  }
}

function _endGame() {
  if (_moves < _best) {
    _best = _moves;
    lsSet('ns_mem_best', String(_best));
    _setText('mem-best', _best);
  }

  const coins = _moves <= 12 ? 30 : _moves <= 20 ? 20 : _moves <= 30 ? 12 : 5;
  _setText('mem-final-moves', _moves);
  _setText('mem-reward-msg', `+${coins} Coins earned!`);
  document.getElementById('mem-result')?.classList.remove('hidden');

  window.__ns_giveReward?.('coins', coins, '🃏', 'Memory Match!');
}

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

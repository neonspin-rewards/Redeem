/* ================================================================
   js/games/g2048.js — 2048 mini-game.
   Full 4×4 grid with swipe + keyboard support.
================================================================ */
'use strict';

import { lsGet, lsSet } from './utils.js';
import { playSound } from './sound.js';

let _grid    = [];
let _score   = 0;
let _best    = parseInt(lsGet('ns_2048_best') || '0', 10);
let _won     = false;
let _over    = false;

// Swipe tracking
let _touchStartX = 0, _touchStartY = 0;

export function init2048() {
  _setText('g2048-best', _best);
  _newGame();

  document.getElementById('btn-2048-new')?.addEventListener('click', _newGame);
  document.getElementById('btn-2048-retry')?.addEventListener('click', _newGame);

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('tab-games')?.classList.contains('active')) return;
    const map = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right' };
    if (map[e.key]) { e.preventDefault(); _move(map[e.key]); }
  });

  // Touch swipe
  const grid = document.getElementById('grid-2048');
  grid?.addEventListener('touchstart', (e) => {
    _touchStartX = e.touches[0].clientX;
    _touchStartY = e.touches[0].clientY;
  }, { passive: true });

  grid?.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - _touchStartX;
    const dy = e.changedTouches[0].clientY - _touchStartY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < 20) return;

    if (absDx > absDy) {
      _move(dx > 0 ? 'right' : 'left');
    } else {
      _move(dy > 0 ? 'down' : 'up');
    }
  }, { passive: true });
}

function _newGame() {
  _grid  = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  _score = 0;
  _won   = false;
  _over  = false;
  _addTile(); _addTile();
  _render();
  _setText('g2048-score', 0);
  document.getElementById('g2048-result')?.classList.add('hidden');
}

function _addTile() {
  const empty = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (_grid[r][c] === 0) empty.push([r, c]);
  if (!empty.length) return;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  _grid[r][c] = Math.random() < .9 ? 2 : 4;
}

function _move(dir) {
  if (_over) return;

  const prev = _grid.map((row) => [...row]);
  let moved  = false;

  const rotateRight = (g) => g[0].map((_, c) => g.map((row) => row[c]).reverse());
  const rotateLeft  = (g) => g[0].map((_, c) => g.map((row) => row[row.length - 1 - c]));

  let g = _grid;
  if (dir === 'right')  g = rotateLeft(rotateLeft(g));
  if (dir === 'up')     g = rotateLeft(g);
  if (dir === 'down')   g = rotateRight(g);

  g = g.map((row) => _mergeRow(row));

  if (dir === 'right')  g = rotateRight(rotateRight(g));
  if (dir === 'up')     g = rotateRight(g);
  if (dir === 'down')   g = rotateLeft(g);

  _grid = g;

  moved = _grid.some((row, r) => row.some((val, c) => val !== prev[r][c]));

  if (moved) {
    _addTile();
    _render();
    _setText('g2048-score', _score);
    playSound('click');

    if (_score > _best) {
      _best = _score;
      lsSet('ns_2048_best', String(_best));
      _setText('g2048-best', _best);
    }

    if (!_won && _grid.flat().includes(2048)) {
      _won = true;
      _endGame(true);
    } else if (!_canMove()) {
      _over = true;
      _endGame(false);
    }
  }
}

function _mergeRow(row) {
  let arr = row.filter((v) => v !== 0);
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] === arr[i + 1]) {
      arr[i] *= 2;
      _score += arr[i];
      arr.splice(i + 1, 1);
    }
  }
  while (arr.length < 4) arr.push(0);
  return arr;
}

function _canMove() {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      if (_grid[r][c] === 0) return true;
      if (c < 3 && _grid[r][c] === _grid[r][c + 1]) return true;
      if (r < 3 && _grid[r][c] === _grid[r + 1][c]) return true;
    }
  return false;
}

function _render() {
  const gridEl = document.getElementById('grid-2048');
  if (!gridEl) return;
  gridEl.innerHTML = _grid.flat().map((val) =>
    `<div class="cell-2048" data-val="${val}">${val > 0 ? val : ''}</div>`
  ).join('');
}

function _endGame(won) {
  const coins = won ? 50 : _score >= 1000 ? 20 : _score >= 500 ? 10 : _score >= 100 ? 4 : 1;

  _setText('g2048-final-score', _score);
  _setText('g2048-result-label', won ? 'You reached 2048! 🎉' : 'Game Over!');
  _setText('g2048-reward-msg', `+${coins} Coins earned!`);
  const iconEl = document.getElementById('g2048-result-icon');
  if (iconEl) iconEl.textContent = won ? '🎉' : '🎮';
  document.getElementById('g2048-result')?.classList.remove('hidden');

  window.__ns_giveReward?.('coins', coins, won ? '🎉' : '🎮', won ? 'YOU WIN!' : 'Good Game!');
}

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

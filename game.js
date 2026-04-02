/* ═══════════════════════════════════════════════════════════════
   NEONSPIN — game.js
   Mini Games: Tap Frenzy + 2048
   Imported by: app.js

   WHY THIS FILE EXISTS:
   The old project was MISSING game.js entirely — the 2048 grid
   never rendered and Tap Frenzy had no logic. This file builds
   both games from scratch, bug-free.

   REWARDS FLOW:
   Both games call window.__ns_giveReward() (defined in spin.js)
   to award coins/EXP. They also call window.__ns_showPopup()
   (also in spin.js) to display results.
   This keeps game.js decoupled — it doesn't import spin.js.
═══════════════════════════════════════════════════════════════ */

'use strict';

import { lsGet, lsSet, escapeHtml } from './utils.js';


/* ═══════════════════════════════════════════════════════════════
   INIT — called once by app.js
═══════════════════════════════════════════════════════════════ */
export function initGames() {
  initGameTabs();
  initTapFrenzy();
  init2048();
}


/* ═══════════════════════════════════════════════════════════════
   GAME TAB SWITCHER
   Switches between Tap Frenzy and 2048 panels.
═══════════════════════════════════════════════════════════════ */
function initGameTabs() {
  document.querySelectorAll('.game-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.game;

      // Update tab button states
      document.querySelectorAll('.game-tab-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });

      // Show the matching game panel
      document.querySelectorAll('.mini-game-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `game-${target}`);
      });

      window.__ns_playSound?.('click');
    });
  });
}


/* ═══════════════════════════════════════════════════════════════
   ████████╗ █████╗ ██████╗     ███████╗██████╗ ███████╗███╗   ██╗███████╗██╗   ██╗
      ██╔══╝██╔══██╗██╔══██╗    ██╔════╝██╔══██╗██╔════╝████╗  ██║╚════██║╚██╗ ██╔╝
      ██║   ███████║██████╔╝    █████╗  ██████╔╝█████╗  ██╔██╗ ██║    ██╔╝ ╚████╔╝
      ██║   ██╔══██║██╔═══╝     ██╔══╝  ██╔══██╗██╔══╝  ██║╚██╗██║   ██╔╝   ╚██╔╝
      ██║   ██║  ██║██║         ██║     ██║  ██║███████╗██║ ╚████║   ██║     ██║
      ╚═╝   ╚═╝  ╚═╝╚═╝         ╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝     ╚═╝

   10-second tap challenge. Tap the moving target as many
   times as possible. Coins awarded based on final score.
═══════════════════════════════════════════════════════════════ */

/* ── Tap Frenzy state ──────────────────────────────────────── */
const tap = {
  score:     0,
  best:      parseInt(lsGet('ns_tap_best') || '0', 10),
  timeLeft:  10,
  running:   false,
  intervalId: null,
};

function initTapFrenzy() {
  // Restore best score from localStorage
  const bestEl = document.getElementById('tap-best');
  if (bestEl) bestEl.textContent = tap.best;

  document.getElementById('btn-tap-start')?.addEventListener('click', startTapGame);
  document.getElementById('btn-tap-retry')?.addEventListener('click', retryTapGame);

  // The moving target
  const target = document.getElementById('tap-target');
  if (target) {
    // Both click and touchstart for maximum responsiveness on mobile
    target.addEventListener('click',      onTapTarget);
    target.addEventListener('touchstart', onTapTarget, { passive: true });
  }
}

function startTapGame() {
  tap.score   = 0;
  tap.timeLeft = 10;
  tap.running  = true;

  // Hide the start overlay, show the target
  const startOverlay = document.getElementById('tap-start-overlay');
  const target       = document.getElementById('tap-target');
  const result       = document.getElementById('tap-result');

  if (startOverlay) startOverlay.style.display = 'none';
  if (result)       result.classList.add('hidden');
  if (target)       target.style.display = 'flex';

  updateTapUI();
  moveTarget();

  // Countdown timer
  tap.intervalId = setInterval(() => {
    tap.timeLeft--;
    const timerEl = document.getElementById('tap-timer');
    if (timerEl) timerEl.textContent = tap.timeLeft;

    if (tap.timeLeft <= 0) {
      endTapGame();
    }
  }, 1000);
}

function onTapTarget(e) {
  if (!tap.running) return;
  e.preventDefault?.();

  tap.score++;
  updateTapUI();
  moveTarget();

  // Visual feedback — quick scale pulse
  const target = document.getElementById('tap-target');
  if (target) {
    target.style.transform = 'scale(0.8)';
    setTimeout(() => { target.style.transform = ''; }, 80);
  }

  window.__ns_playSound?.('click');
}

function moveTarget() {
  const arena  = document.getElementById('tap-arena');
  const target = document.getElementById('tap-target');
  if (!arena || !target) return;

  const arenaW = arena.offsetWidth  - 64; // 64 = target width
  const arenaH = arena.offsetHeight - 64;

  const newX = Math.floor(Math.random() * arenaW);
  const newY = Math.floor(Math.random() * arenaH);

  target.style.left = newX + 'px';
  target.style.top  = newY + 'px';
}

function updateTapUI() {
  const scoreEl = document.getElementById('tap-score');
  if (scoreEl) scoreEl.textContent = tap.score;
}

function endTapGame() {
  clearInterval(tap.intervalId);
  tap.running = false;

  // Hide target
  const target = document.getElementById('tap-target');
  if (target) target.style.display = 'none';

  // Update best score
  if (tap.score > tap.best) {
    tap.best = tap.score;
    lsSet('ns_tap_best', tap.best);
    const bestEl = document.getElementById('tap-best');
    if (bestEl) bestEl.textContent = tap.best;
  }

  // Calculate coin reward: 1 coin per 2 taps, max 25
  const coinsWon = Math.min(25, Math.floor(tap.score / 2));

  // Show result panel
  const result    = document.getElementById('tap-result');
  const finalScore = document.getElementById('tap-final-score');
  const rewardMsg  = document.getElementById('tap-reward-msg');

  if (result)     result.classList.remove('hidden');
  if (finalScore) finalScore.textContent = tap.score;
  if (rewardMsg)  rewardMsg.textContent  = coinsWon > 0
    ? `🏆 +${coinsWon} Coins earned!`
    : 'Keep practicing!';

  // Award coins
  if (coinsWon > 0) {
    window.__ns_giveReward?.('coins', coinsWon);
    window.__ns_showPopup?.(
      '⚡', 'Tap Frenzy Complete!',
      `You tapped ${tap.score} times! +${coinsWon} Coins awarded!`
    );
  } else {
    window.__ns_showPopup?.(
      '🎮', 'Game Over!',
      `You tapped ${tap.score} times. Tap faster to earn coins!`
    );
  }

  window.__ns_playSound?.('coins');
}

function retryTapGame() {
  // Reset result panel and show start overlay again
  const result       = document.getElementById('tap-result');
  const startOverlay = document.getElementById('tap-start-overlay');

  if (result)       result.classList.add('hidden');
  if (startOverlay) startOverlay.style.display = '';

  // Reset timer display
  const timerEl = document.getElementById('tap-timer');
  if (timerEl) timerEl.textContent = '10';

  const scoreEl = document.getElementById('tap-score');
  if (scoreEl) scoreEl.textContent = '0';
}


/* ═══════════════════════════════════════════════════════════════
   ██████╗  ██████╗ ██╗  ██╗ █████╗
   ╚════██╗██╔═████╗██║  ██║██╔══██╗
    █████╔╝██║██╔██║███████║╚█████╔╝
   ██╔═══╝ ████╔╝██║╚════██║██╔══██╗
   ███████╗╚██████╔╝     ██║╚█████╔╝
   ╚══════╝ ╚═════╝      ╚═╝ ╚════╝

   Classic 2048 — merge tiles to reach 2048.
   Supports keyboard arrows + touch swipe on mobile.
   Coins awarded for high scores and reaching 2048.
═══════════════════════════════════════════════════════════════ */

/* ── 2048 constants ────────────────────────────────────────── */
const GRID_SIZE = 4;  // 4×4 grid

/* ── 2048 state ─────────────────────────────────────────────── */
const g = {
  board:    [],      // 4×4 array of numbers (0 = empty)
  score:    0,
  best:     parseInt(lsGet('ns_2048_best') || '0', 10),
  over:     false,
  won:      false,
  rewarded: false,   // True after 2048 bonus is awarded (one time)
};

/* Touch tracking for swipe detection */
let touchStartX = 0;
let touchStartY = 0;

function init2048() {
  newGame2048();

  document.getElementById('btn-2048-new')?.addEventListener('click', newGame2048);
  document.getElementById('btn-2048-retry')?.addEventListener('click', newGame2048);

  // Keyboard controls
  document.addEventListener('keydown', handleKeyDown2048);

  // Touch / swipe controls
  const grid = document.getElementById('grid-2048');
  if (grid) {
    grid.addEventListener('touchstart', onTouchStart2048, { passive: true });
    grid.addEventListener('touchend',   onTouchEnd2048,   { passive: true });
  }
}

/* ── New game ─────────────────────────────────────────────── */
function newGame2048() {
  // Create empty 4×4 board
  g.board    = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
  g.score    = 0;
  g.over     = false;
  g.won      = false;
  g.rewarded = false;

  // Spawn two starting tiles
  spawnTile();
  spawnTile();

  updateScore2048();
  renderBoard2048();

  // Hide result panel if visible
  document.getElementById('g2048-result')?.classList.add('hidden');
}

/* ── Spawn a random tile (90% → 2, 10% → 4) ─────────────── */
function spawnTile() {
  const empty = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (g.board[r][c] === 0) empty.push({ r, c });
    }
  }
  if (empty.length === 0) return;

  const { r, c } = empty[Math.floor(Math.random() * empty.length)];
  g.board[r][c]  = Math.random() < 0.9 ? 2 : 4;
  return { r, c }; // Return position so we can animate it
}

/* ── Render the full board ────────────────────────────────── */
function renderBoard2048(newTilePos = null) {
  const grid = document.getElementById('grid-2048');
  if (!grid) return;

  grid.innerHTML = '';

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const val  = g.board[r][c];
      const cell = document.createElement('div');
      cell.className = 'cell-2048';
      cell.setAttribute('data-val', val);

      if (val !== 0) {
        cell.textContent = val;
        // Animate newly spawned tile
        if (newTilePos && newTilePos.r === r && newTilePos.c === c) {
          cell.classList.add('new-tile');
        }
      }

      grid.appendChild(cell);
    }
  }
}

/* ── Score display ─────────────────────────────────────────── */
function updateScore2048() {
  document.getElementById('g2048-score').textContent = g.score;

  if (g.score > g.best) {
    g.best = g.score;
    lsSet('ns_2048_best', g.best);
  }
  document.getElementById('g2048-best').textContent = g.best;
}

/* ── Move logic ────────────────────────────────────────────── */

/**
 * Slide and merge a single row to the LEFT.
 * Returns { newRow, points } where points = sum of all merges.
 * We always slide left — rotating the board handles other directions.
 */
function slideRow(row) {
  // Step 1: filter out zeros
  const tiles = row.filter((v) => v !== 0);
  let points = 0;

  // Step 2: merge adjacent equal tiles
  for (let i = 0; i < tiles.length - 1; i++) {
    if (tiles[i] === tiles[i + 1]) {
      tiles[i]    *= 2;
      points      += tiles[i];
      tiles[i + 1] = 0;
    }
  }

  // Step 3: filter zeros again (merged tiles become 0)
  const merged = tiles.filter((v) => v !== 0);

  // Step 4: pad with zeros to restore length
  while (merged.length < GRID_SIZE) merged.push(0);

  return { newRow: merged, points };
}

/** Rotate the board 90° clockwise. Used to reuse slideRow for all directions. */
function rotateClockwise(board) {
  return board[0].map((_, c) =>
    board.map((row) => row[c]).reverse()
  );
}

/** Rotate 90° counter-clockwise. */
function rotateCounterClockwise(board) {
  return board[0].map((_, c) =>
    board.map((row) => row[GRID_SIZE - 1 - c])
  );
}

/** Flip board horizontally (to handle right vs left). */
function flipHorizontal(board) {
  return board.map((row) => [...row].reverse());
}

/** Move all tiles in a direction. Returns true if anything moved. */
function move(direction) {
  if (g.over) return false;

  let board = g.board.map((row) => [...row]); // Deep copy
  let totalPoints = 0;
  let rotations   = 0;

  // Transform board so we always slide LEFT
  if (direction === 'right') {
    board = flipHorizontal(board);
  } else if (direction === 'up') {
    board = rotateCounterClockwise(board);
    rotations = -1;
  } else if (direction === 'down') {
    board = rotateClockwise(board);
    rotations = 1;
  }

  // Slide every row left
  const newBoard = board.map((row) => {
    const { newRow, points } = slideRow(row);
    totalPoints += points;
    return newRow;
  });

  // Reverse the transformation
  let finalBoard = newBoard;
  if (direction === 'right') {
    finalBoard = flipHorizontal(newBoard);
  } else if (direction === 'up') {
    finalBoard = rotateClockwise(newBoard);
  } else if (direction === 'down') {
    finalBoard = rotateCounterClockwise(newBoard);
  }

  // Check if anything actually changed
  const changed = finalBoard.some((row, r) =>
    row.some((val, c) => val !== g.board[r][c])
  );

  if (!changed) return false;

  g.board  = finalBoard;
  g.score += totalPoints;

  updateScore2048();

  // Spawn a new tile and get its position for animation
  const newPos = spawnTile();
  renderBoard2048(newPos);

  // Check win / game over
  checkWin2048();
  if (!g.won && !g.over) checkGameOver2048();

  return true;
}

/* ── Win check ─────────────────────────────────────────────── */
function checkWin2048() {
  if (g.won || g.rewarded) return;

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (g.board[r][c] === 2048) {
        g.won      = true;
        g.rewarded = true;

        // Award 100 coins for reaching 2048
        window.__ns_giveReward?.('coins', 100);
        window.__ns_showPopup?.(
          '🏆', 'You reached 2048!',
          '🎉 Incredible! +100 Coins awarded! Keep going for an even higher score!'
        );
        window.__ns_playSound?.('levelup');
        return;
      }
    }
  }
}

/* ── Game over check ───────────────────────────────────────── */
function checkGameOver2048() {
  // Still has empty cells → not over
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (g.board[r][c] === 0) return;
    }
  }

  // Check if any adjacent merge is possible
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const val = g.board[r][c];
      if (r < GRID_SIZE - 1 && g.board[r + 1][c] === val) return;
      if (c < GRID_SIZE - 1 && g.board[r][c + 1] === val) return;
    }
  }

  // No moves left → game over
  g.over = true;

  // Coins for score milestones
  let coinsWon = 0;
  if (g.score >= 10000) coinsWon = 50;
  else if (g.score >= 5000) coinsWon = 25;
  else if (g.score >= 1000) coinsWon = 10;

  // Show result panel
  const resultEl  = document.getElementById('g2048-result');
  const iconEl    = document.getElementById('g2048-result-icon');
  const scoreEl   = document.getElementById('g2048-final-score');
  const labelEl   = document.getElementById('g2048-result-label');
  const rewardEl  = document.getElementById('g2048-reward-msg');

  if (resultEl) resultEl.classList.remove('hidden');
  if (iconEl)   iconEl.textContent   = coinsWon > 0 ? '🏆' : '😞';
  if (scoreEl)  scoreEl.textContent  = g.score;
  if (labelEl)  labelEl.textContent  = 'Game Over!';
  if (rewardEl) rewardEl.textContent = coinsWon > 0
    ? `+${coinsWon} Coins earned!`
    : 'Reach 1,000+ score for coins!';

  if (coinsWon > 0) {
    window.__ns_giveReward?.('coins', coinsWon);
  }

  window.__ns_playSound?.('error');
}

/* ── Keyboard controls ─────────────────────────────────────── */
function handleKeyDown2048(e) {
  // Only handle arrow keys when 2048 tab is active
  const gamePanel = document.getElementById('game-2048');
  if (!gamePanel?.classList.contains('active')) return;
  if (!document.getElementById('tab-games')?.classList.contains('active')) return;

  const dirMap = {
    ArrowLeft:  'left',
    ArrowRight: 'right',
    ArrowUp:    'up',
    ArrowDown:  'down',
  };

  const dir = dirMap[e.key];
  if (!dir) return;

  e.preventDefault(); // Stop page scrolling with arrow keys
  move(dir);
  window.__ns_playSound?.('click');
}

/* ── Touch / swipe controls ───────────────────────────────── */
function onTouchStart2048(e) {
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}

function onTouchEnd2048(e) {
  const touch = e.changedTouches[0];
  const dx    = touch.clientX - touchStartX;
  const dy    = touch.clientY - touchStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Minimum swipe distance to register (prevents accidental triggers)
  const MIN_SWIPE = 30;
  if (Math.max(absDx, absDy) < MIN_SWIPE) return;

  const dir = absDx > absDy
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down'  : 'up');

  move(dir);
  window.__ns_playSound?.('click');
}

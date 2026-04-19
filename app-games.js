/* ================================================================
   js/app-games.js — GAMES PAGE entry point.
   Boots NeonSpin for games.html hub only.

   Inits: UI base, auth, game manager (hub card grid + unlock system).
   Individual games now live on their own pages (MPA).

   NOTE: Game manager code is inlined here (no separate import needed).
================================================================ */

'use strict';

// ── UI modules ───────────────────────────────────────────────
import { loadTheme, initThemeToggle } from './theme.js';
import { initParticles }              from './particles.js';
import { initSoundToggle }            from './sound.js';
import { initPopup }                  from './popup.js';
import { hideLoader }                 from './loader.js';

// ── Auth ─────────────────────────────────────────────────────
import {
  initTermsGate,
  initAuthButtons,
  initAuthObserver,
} from './auth.js';

// ── State ─────────────────────────────────────────────────────
import { mergeProfile } from './state.js';

/* ================================================================
   GAME MANAGER — inlined from manager.js
   (eliminates external import path dependency)
================================================================ */

const LS_UNLOCK_KEY = 'ns_unlocked_games';

const GAME_CONFIG = [
  {
    id: 1,
    name: 'Spin Wheel',
    icon: '🎡',
    reward: 'Win 10–500 coins',
    page: 'spin.html',
    color: '#00d4ff',
    desc: 'Spin & win big!',
  },
  {
    id: 2,
    name: 'Scratch Card',
    icon: '🎴',
    reward: 'Reveal hidden prizes',
    page: 'scratch.html',
    color: '#a855f7',
    desc: 'Scratch to reveal!',
  },
  {
    id: 3,
    name: 'Quiz Game',
    icon: '🧠',
    reward: 'Earn 10–50 coins',
    page: 'quiz.html',
    color: '#fbbf24',
    desc: 'Test your knowledge!',
  },
  {
    id: 4,
    name: 'Lucky Box',
    icon: '📦',
    reward: 'Random rewards',
    page: 'lucky.html',
    color: '#39ff14',
    desc: 'Pick a mystery box!',
  },
  {
    id: 5,
    name: '2048',
    icon: '🔢',
    reward: 'Score big for coins',
    page: '2048.html',
    color: '#ff6b35',
    desc: 'Merge to 2048!',
  },
  {
    id: 6,
    name: 'Tile Tap',
    icon: '🎯',
    reward: 'Streak = more coins',
    page: 'tile.html',
    color: '#ff4488',
    desc: 'Tap the right tile!',
  },
  {
    id: 7,
    name: 'Memory Match',
    icon: '🃏',
    reward: 'Fast pairs = bonus',
    page: 'memory.html',
    color: '#00ffaa',
    desc: 'Match all pairs!',
  },
  {
    id: 8,
    name: 'Reaction',
    icon: '⚡',
    reward: 'Faster tap = more!',
    page: 'reaction.html',
    color: '#ffdd00',
    desc: 'Test your reflexes!',
  },
];

function _getUnlockedCount() {
  return 8; // All games unlocked
}

function initGameManager() {
  const count = _getUnlockedCount();
  _renderCards(count);
  _updateProgress(count);

  window.addEventListener('storage', (e) => {
    if (e.key === LS_UNLOCK_KEY) {
      const newCount = _getUnlockedCount();
      _renderCards(newCount);
      _updateProgress(newCount);
    }
  });
}

function _renderCards(unlockedCount) {
  const grid = document.getElementById('games-grid');
  if (!grid) return;

  grid.innerHTML = GAME_CONFIG.map((g) => _buildCard(g, g.id <= unlockedCount)).join('');

  grid.querySelectorAll('.game-hub-card').forEach((card) => {
    // Desktop: regular click
    card.addEventListener('click', _onCardClick);
    
    // Mobile: touch with scroll detection
    let touchStartY = 0;
    let touchStartX = 0;
    let touchMoved = false;
    
    card.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      touchStartY = touch.clientY;
      touchStartX = touch.clientX;
      touchMoved = false;
    }, { passive: true });
    
    card.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      const deltaY = Math.abs(touch.clientY - touchStartY);
      const deltaX = Math.abs(touch.clientX - touchStartX);
      
      // If moved more than 10px in any direction, it's a scroll/swipe
      if (deltaY > 10 || deltaX > 10) {
        touchMoved = true;
      }
    }, { passive: true });
    
    card.addEventListener('touchend', (e) => {
      // Only trigger click if there was minimal movement (not a scroll)
      if (!touchMoved) {
        e.preventDefault();
        _onCardClick({ currentTarget: card });
      }
    }, { passive: false });
  });
}

function _buildCard(game, unlocked) {
  const colorStyle = `--card-color:${game.color}`;

  if (unlocked) {
    return `
      <div class="game-hub-card unlocked"
           data-game-id="${game.id}"
           data-page="${game.page}"
           style="${colorStyle}"
           role="button"
           tabindex="0"
           aria-label="Play ${game.name}">
        <div class="ghc-glow-bg"></div>
        <div class="ghc-number">#${game.id}</div>
        <div class="ghc-icon-ring">
          <span class="ghc-icon">${game.icon}</span>
        </div>
        <div class="ghc-name">${game.name}</div>
        <div class="ghc-desc">${game.desc}</div>
        <div class="ghc-reward-tag">${game.reward}</div>
        <button class="ghc-play-btn" tabindex="-1" aria-hidden="true">PLAY ▶</button>
      </div>`;
  }

  return `
    <div class="game-hub-card locked"
         data-game-id="${game.id}"
         style="${colorStyle}"
         role="button"
         tabindex="0"
         aria-label="${game.name} — Locked">
      <div class="ghc-number">#${game.id}</div>
      <div class="ghc-icon-ring ghc-icon-ring--locked">
        <span class="ghc-icon">${game.icon}</span>
      </div>
      <div class="ghc-name">${game.name}</div>
      <div class="ghc-lock-overlay">
        <div class="ghc-lock-icon">🔒</div>
        <div class="ghc-lock-label">Locked</div>
        <div class="ghc-lock-sub">Complete previous game</div>
      </div>
    </div>`;
}

function _onCardClick(e) {
  const card = e.currentTarget;
  if (!card) return;

  if (card.classList.contains('locked')) {
    _showLockFeedback(card);
    return;
  }

  const page = card.dataset.page;
  if (page) {
    card.style.transform = 'scale(0.96)';
    setTimeout(() => { window.location.href = page; }, 120);
  }
}

function _showLockFeedback(card) {
  if (card.classList.contains('shake')) return;
  card.classList.add('shake');
  setTimeout(() => card.classList.remove('shake'), 500);

  card.querySelector('.ghc-lock-tip')?.remove();

  const tip = document.createElement('div');
  tip.className = 'ghc-lock-tip';
  tip.textContent = '🔒 Play previous game to unlock!';
  card.appendChild(tip);
  setTimeout(() => tip.remove(), 2200);
}

function _updateProgress(count) {
  const countEl = document.getElementById('unlock-count');
  const fill    = document.getElementById('unlock-fill');
  const hint    = document.getElementById('hub-progress-hint');

  if (countEl) countEl.textContent = count;
  if (fill)    fill.style.width = `${(count / 8) * 100}%`;

  if (hint) {
    if (count >= 8) {
      hint.textContent = '🎉 All games unlocked! You\'re a champion!';
    } else {
      const next = GAME_CONFIG[count];
      hint.textContent = next
        ? `Next up: ${next.icon} ${next.name} — complete Game ${count} to unlock!`
        : 'Keep playing to unlock more!';
    }
  }
}

/* ================================================================
   BOOT
================================================================ */

const _hardFallback = setTimeout(hideLoader, 4000);

async function boot() {
  try {
    loadTheme();

    initParticles();
    initPopup();
    initSoundToggle();
    initThemeToggle();

    // Init hub: renders 8 game cards with unlock state from localStorage
    initGameManager();

    initTermsGate();
    initAuthButtons();

    clearTimeout(_hardFallback);
    hideLoader();

    // Auth runs in background — hub is fully functional for guests too
    initAuthObserver(_onUserReady, _onUserGone);

  } catch (err) {
    console.error('[NeonSpin Games] Boot error:', err);
    clearTimeout(_hardFallback);
    hideLoader();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* ================================================================
   AUTH CALLBACKS
================================================================ */

function _onUserReady(profile) {
  if (!profile) return;
  mergeProfile(profile);
}

function _onUserGone() {
  // Hub still usable as guest — nothing to clear
}
 

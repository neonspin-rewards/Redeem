/* ================================================================
   js/games/manager.js — Games Hub: 8-game unlock system.

   HOW IT WORKS:
   - 8 games total, first 2 unlocked by default.
   - localStorage key "ns_unlocked_games" stores number of unlocked games.
   - When a game page completes, it writes the new unlock count.
   - Hub reads count and renders cards accordingly.
   - Locked cards show overlay + shake on tap with message.
   - Unlocked cards navigate to their respective pages.
================================================================ */
'use strict';

const LS_UNLOCK_KEY = 'ns_unlocked_games';

/* ── Game Configuration ────────────────────────────────────────── */
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

/* ── Storage helpers ───────────────────────────────────────────── */
function _getUnlockedCount() {
  return 8; // All games unlocked
}

/* ── Public API ────────────────────────────────────────────────── */
export function initGameManager() {
  const count = _getUnlockedCount();
  _renderCards(count);
  _updateProgress(count);

  // Listen for storage changes (cross-tab unlock sync)
  window.addEventListener('storage', (e) => {
    if (e.key === LS_UNLOCK_KEY) {
      const newCount = _getUnlockedCount();
      _renderCards(newCount);
      _updateProgress(newCount);
    }
  });
}

/* ── Card Rendering ────────────────────────────────────────────── */
function _renderCards(unlockedCount) {
  const grid = document.getElementById('games-grid');
  if (!grid) return;

  grid.innerHTML = GAME_CONFIG.map((g) => _buildCard(g, g.id <= unlockedCount)).join('');

  // Attach click handlers
  grid.querySelectorAll('.game-hub-card').forEach((card) => {
    card.addEventListener('click', _onCardClick);
    card.addEventListener('touchend', (e) => {
      e.preventDefault();
      _onCardClick({ currentTarget: card });
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

/* ── Click Handler ─────────────────────────────────────────────── */
function _onCardClick(e) {
  const card = e.currentTarget;
  if (!card) return;

  if (card.classList.contains('locked')) {
    _showLockFeedback(card);
    return;
  }

  const page = card.dataset.page;
  if (page) {
    // Brief press animation before navigating
    card.style.transform = 'scale(0.96)';
    setTimeout(() => { window.location.href = page; }, 120);
  }
}

/* ── Lock Feedback ─────────────────────────────────────────────── */
function _showLockFeedback(card) {
  if (card.classList.contains('shake')) return;
  card.classList.add('shake');
  setTimeout(() => card.classList.remove('shake'), 500);

  // Remove existing tooltip first
  card.querySelector('.ghc-lock-tip')?.remove();

  const tip = document.createElement('div');
  tip.className = 'ghc-lock-tip';
  tip.textContent = '🔒 Play previous game to unlock!';
  card.appendChild(tip);
  setTimeout(() => tip.remove(), 2200);
}

/* ── Progress Bar ──────────────────────────────────────────────── */
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
      const next = GAME_CONFIG[count]; // 0-indexed = next locked game
      hint.textContent = next
        ? `Next up: ${next.icon} ${next.name} — complete Game ${count} to unlock!`
        : 'Keep playing to unlock more!';
    }
  }
}

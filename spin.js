/* ═══════════════════════════════════════════════════════════════
   NEONSPIN — spin.js
   Spin Wheel Engine: canvas drawing, spin animation, rewards,
   daily reward, tasks, sound system, particles, theme toggle.
   Imported by: app.js

   HOW THE WHEEL WORKS:
   1. drawWheel(angle) → paints 8 coloured segments on <canvas>
   2. spinWheel()      → picks a winner, animates the rotation,
                         then calls applyReward() when it lands
   3. applyReward()    → updates state, syncs to Firebase,
                         shows popup, checks tasks/milestones

   ANTI-EXPLOIT MEASURES:
   • isSpinning flag   — blocks second click while spinning
   • debounce on button — 500ms cooldown after spin ends
   • spins counter     — can't spin with 0 free spins
   • Server sync       — rewards saved immediately to Firebase
═══════════════════════════════════════════════════════════════ */

'use strict';

import {
  levelFromExp, expRequired, expInCurrentLevel,
  todayStr, formatCountdown,
  randInt, randItem,
  lsGet, lsSet, lsGetJSON, lsSetJSON,
  debounce, escapeHtml,
} from './utils.js';


/* ═══════════════════════════════════════════════════════════════
   WHEEL SEGMENTS
   Each segment defines a reward type & value, plus colours.
   The JACKPOT_INDEX (index 4) is the big 50-coin prize.
═══════════════════════════════════════════════════════════════ */
const SEGMENTS = [
  { label: '10 Coins', icon: '💰', type: 'coins', value: 10,  color: '#c8960a', glow: '#ffd700' },
  { label: '5 EXP',   icon: '⭐', type: 'exp',   value: 5,   color: '#7c3aed', glow: '#a855f7' },
  { label: '20 Coins', icon: '💰', type: 'coins', value: 20,  color: '#0096b3', glow: '#00d4ff' },
  { label: '+1 Spin',  icon: '🎰', type: 'spin',  value: 1,   color: '#28b80e', glow: '#39ff14' },
  { label: '50 Coins', icon: '💰', type: 'coins', value: 50,  color: '#9333ea', glow: '#f0abfc' },
  { label: '10 EXP',  icon: '⭐', type: 'exp',   value: 10,  color: '#cc4a1a', glow: '#ff6b35' },
  { label: '15 Coins', icon: '💰', type: 'coins', value: 15,  color: '#0096b3', glow: '#00d4ff' },
  { label: '25 EXP',  icon: '⭐', type: 'exp',   value: 25,  color: '#6d28d9', glow: '#a855f7' },
];

const SEG_COUNT    = SEGMENTS.length;        // 8
const SEG_ANGLE    = (Math.PI * 2) / SEG_COUNT; // radians per segment
const JACKPOT_IDX  = 4;  // Index of "50 Coins" — near-miss targets this

/* Weighted spin odds — each index repeated = higher chance */
const SPIN_WEIGHTS = [
  0, 0, 0, 0,    // 10 Coins × 4
  1, 1, 1,       // 5 EXP × 3
  2, 2, 2,       // 20 Coins × 3
  3,             // +1 Spin × 1 (rare)
  4,             // 50 Coins × 1 (jackpot — rare)
  5, 5, 5,       // 10 EXP × 3
  6, 6, 6,       // 15 Coins × 3
  7, 7, 7,       // 25 EXP × 3
];


/* ═══════════════════════════════════════════════════════════════
   FAKE LIVE FEED DATA
═══════════════════════════════════════════════════════════════ */
const FEED_NAMES = [
  'Rahul_G','Priya_22','ZeroX','NightOwl','AcePlayer','Kira99','DarkStar',
  'Pixel_K','ShadowRun','LunaX','ViperZ','Rocketeer','Blaze77','StormX',
  'PhoenixK','AaravX','Devil_99','GamerRaj','TechGuru','NoobMaster',
  'ProKiller','SilentX','MysticBoy','Alpha_01','CodeNinja','GhostRider',
  'FireFury','IceDragon','ThunderX','AnkitPro','RohitX','Yash_007',
  'OmGamer','RudraKing','AryanX','HarshOP','NikhilX','AyaanLive',
  'QueenBee','MissPriya','AngelX','LadyBoss','DivaX','PinkStorm',
  'AlexX','JordanPro','TaylorX','NoahX','LiamPro','MasonX',
  'ZaynX','ArhamPro','FaizanX','CyberX','NeonBoy','GlitchX',
  'DataKing','CryptoX','BitMaster','PixelHero','AI_Genius','MatrixBoy',
];

const FEED_TEMPLATES = [
  (n, v) => `<strong>${n}</strong> spun <span class="highlight">+${v} Coins!</span>`,
  (n, v) => `<strong>${n}</strong> levelled up to <span class="highlight">Level ${v}!</span>`,
  (n)    => `<strong>${n}</strong> claimed their <span class="highlight">Daily Reward!</span>`,
  (n, v) => `<strong>${n}</strong> earned <span class="highlight">+${v} EXP!</span>`,
  (n)    => `<strong>${n}</strong> completed a <span class="highlight">Daily Task!</span>`,
  (n, v) => `<strong>${n}</strong> scored <span class="highlight">${v} Coins</span> on a spin!`,
  (n)    => `<strong>${n}</strong> is on a <span class="highlight">3-day streak!</span>`,
  (n, v) => `<strong>${n}</strong> earned <span class="highlight">+${v} EXP</span> today!`,
];
const FEED_AVATARS = ['🦊','🐉','🌙','⚡','🔥','💫','🎯','🚀','🦋','🐺'];


/* ═══════════════════════════════════════════════════════════════
   DAILY TASKS CONFIG
═══════════════════════════════════════════════════════════════ */
const TASKS_CONFIG = [
  { id: 'task_login',  icon: '👋', name: 'Log in today',           reward: '+5 EXP',    type: 'exp',   value: 5  },
  { id: 'task_spin',   icon: '🎰', name: 'Spin the wheel once',    reward: '+10 Coins', type: 'coins', value: 10 },
  { id: 'task_daily',  icon: '🎁', name: 'Claim your daily reward',reward: '+15 EXP',   type: 'exp',   value: 15 },
  { id: 'task_3spins', icon: '🔄', name: 'Spin the wheel 3 times', reward: '+20 Coins', type: 'coins', value: 20 },
  { id: 'task_level',  icon: '🔥', name: 'Reach Level 2',          reward: '+30 Coins', type: 'coins', value: 30 },
];


/* ═══════════════════════════════════════════════════════════════
   STATE
   The single source of truth for the player's local game state.
   Loaded from localStorage on startup.
   Synced to Firebase via the onStateChange callback.
═══════════════════════════════════════════════════════════════ */
const state = {
  coins:           0,
  exp:             0,
  level:           1,
  spins:           3,      // Free spins available
  lastDailyReward: 0,      // Timestamp of last daily claim
  lastDailyReset:  0,      // Timestamp of last tasks reset
  tasks:           {},     // { taskId: true } for completed tasks
  spinCount:       0,      // Total spins ever (for milestones)
  streak:          0,
  referralCode:    '',
};

/* Expose state so auth.js callbacks can read/write it */
window.__ns_state = state;

/* Flags */
let isSpinning   = false;
let currentAngle = -Math.PI / 2; // Start pointing up (top = first segment)
let feedInterval = null;
let dailyInterval = null;

/* Sound toggle */
let soundEnabled = lsGet('ns_sound') !== '0';


/* ═══════════════════════════════════════════════════════════════
   CALLBACK REFERENCE
   app.js passes this in via initSpin({ onStateChange })
   so spin.js can trigger a Firebase sync without importing auth.js
   (avoids circular imports).
═══════════════════════════════════════════════════════════════ */
let _onStateChange = null;


/* ═══════════════════════════════════════════════════════════════
   INIT — called by app.js
═══════════════════════════════════════════════════════════════ */
export function initSpin({ onStateChange }) {
  _onStateChange = onStateChange;

  loadState();
  updateStats(false); // false = no pop animation on first paint
  updateSoundIcon();
  spawnParticles();
  startFakeFeed();
  startDailyTimer();
  renderTasks();
  bindSpinEvents();

  // Auto-complete the "log in today" task
  checkTaskProgress();

  // FIX: Defer first drawWheel to next animation frame.
  // If we draw synchronously here, getBoundingClientRect() may return
  // 0 because CSS layout hasn't computed the canvas size yet.
  // One rAF gives the browser time to finish layout first.
  requestAnimationFrame(() => {
    drawWheel(currentAngle);
  });

  // Welcome feed item (slight delay so feed is visible)
  setTimeout(() => {
    addFeedItem(
      `<strong>Welcome back!</strong> You have <span class="highlight">${state.spins} free spin${state.spins !== 1 ? 's' : ''}</span> ready!`,
      '⚡'
    );
  }, 700);
}

/**
 * Called by app.js when Firebase returns the user's profile.
 * Merges Firebase data into local state (Firebase wins).
 */
export function applyProfileToState(profile) {
  if (!profile) return;
  state.coins        = profile.coins        ?? state.coins;
  state.exp          = profile.exp          ?? state.exp;
  state.level        = profile.level        ?? state.level;
  state.streak       = profile.streak       ?? state.streak;
  state.spinCount    = profile.spinCount     ?? state.spinCount;
  state.referralCode = profile.referralCode  ?? state.referralCode;
  state.lastDailyReward = profile.lastDailyReward ?? state.lastDailyReward;

  saveState();
  updateStats();
  updateStreakChip(state.streak);
  updateReferralChip(state.referralCode);
}

/**
 * Give the player coins or EXP directly.
 * Used by auth.js milestone callbacks.
 */
export function giveReward(type, value) {
  if (type === 'coins') {
    state.coins += value;
  } else if (type === 'exp') {
    addExp(value);
  }
  saveState();
  updateStats();
  _onStateChange?.(state);
}

/* Expose for auth.js milestone callbacks */
window.__ns_giveReward = giveReward;


/* ═══════════════════════════════════════════════════════════════
   PERSIST STATE  ↔  localStorage
   All game state is saved locally AND synced to Firebase.
   This means the game works offline, and Firebase is the backup.
═══════════════════════════════════════════════════════════════ */
const STATE_KEY = 'ns_game_state';

function saveState() {
  lsSetJSON(STATE_KEY, {
    coins:           state.coins,
    exp:             state.exp,
    level:           state.level,
    spins:           state.spins,
    lastDailyReward: state.lastDailyReward,
    lastDailyReset:  state.lastDailyReset,
    tasks:           state.tasks,
    spinCount:       state.spinCount,
    streak:          state.streak,
    referralCode:    state.referralCode,
  });
}

function loadState() {
  const saved = lsGetJSON(STATE_KEY);
  if (!saved) return;

  state.coins           = saved.coins           ?? 0;
  state.exp             = saved.exp             ?? 0;
  state.level           = saved.level           ?? 1;
  state.spins           = saved.spins           ?? 3;
  state.lastDailyReward = saved.lastDailyReward ?? 0;
  state.lastDailyReset  = saved.lastDailyReset  ?? 0;
  state.tasks           = saved.tasks           ?? {};
  state.spinCount       = saved.spinCount       ?? 0;
  state.streak          = saved.streak          ?? 0;
  state.referralCode    = saved.referralCode    ?? '';

  // Reset tasks if it's a new calendar day
  const todayKey = todayStr();
  if (state.lastDailyReset !== todayKey) {
    state.tasks = {};
    state.lastDailyReset = todayKey;
    saveState();
  }

  // Clamp spins to safe range
  if (state.spins < 0) state.spins = 0;
  if (state.spins > 99) state.spins = 3;
}

/* Expose for auth.js callbacks */
window.__ns_saveState = saveState;


/* ═══════════════════════════════════════════════════════════════
   CANVAS — DRAW WHEEL
   Draws 8 coloured pie slices on the <canvas>.
   Called once at init, then on every animation frame during spin.

   PERFORMANCE FIXES vs old version:
   1. _cachedWheelSize — measure canvas ONCE, not every frame.
      getBoundingClientRect() triggers layout; calling it at 60fps
      during a 4-second spin = ~240 forced layouts. Very expensive.
   2. Only reset canvas.width/height when size actually changes.
      Resetting width/height clears the canvas AND resets context
      state — an expensive GPU operation on every frame.
   3. ctx.save/restore wraps all drawing — no state leakage.

   TEXT OVERLAP FIX:
   Old code used `midAngle + Math.PI/2` (TANGENTIAL rotation).
   At 42% radius with 45° segments, the chord is ~48px.
   "10 Coins" at 13.5px font ≈ 64px wide → overflows by 16px!

   New code uses RADIAL rotation: text runs from center → edge.
   - Label at 50% radius, rotated along the radius
   - Icon at 74% radius (further out, clearly separate from label)
   - Font: system `sans-serif` — guaranteed available immediately
     (Orbitron from Google Fonts may not load before first draw)
   - Flip text for the left half (cos < 0) so it's not upside-down
═══════════════════════════════════════════════════════════════ */

/** Cached wheel size — measured once, reset on window resize */
let _cachedWheelSize = 0;

function getWheelSize() {
  if (_cachedWheelSize > 0) return _cachedWheelSize;
  const canvas = document.getElementById('spin-canvas');
  if (!canvas) return 280;
  const rect = canvas.getBoundingClientRect();
  // Fallback to 280 if layout hasn't run yet (rect returns 0)
  _cachedWheelSize = Math.round(Math.min(rect.width || 280, rect.height || 280));
  return _cachedWheelSize;
}

// Invalidate size cache on resize so wheel redraws at new size
window.addEventListener('resize', () => {
  _cachedWheelSize = 0;
  drawWheel(currentAngle); // Redraw at new size
}, { passive: true });

function drawWheel(angle) {
  const canvas = document.getElementById('spin-canvas');
  if (!canvas) return;

  const dpr  = window.devicePixelRatio || 1;
  const size = getWheelSize();

  // ── Only reset canvas buffer when physical size changes ────
  // Resetting canvas.width clears the bitmap + resets context state
  // — avoid doing this every frame (60fps × 4s = 240 resets!)
  const physSize = Math.round(size * dpr);
  if (canvas.width !== physSize || canvas.height !== physSize) {
    canvas.width  = physSize;
    canvas.height = physSize;
    // NOTE: canvas.style.width/height intentionally NOT set here.
    // Setting inline px styles on the canvas triggers a layout reflow.
    // On mobile Chrome, a reflow can change the viewport height
    // (address bar show/hide), which fires the resize event again,
    // which calls drawWheel() again, which sets the style again → loop.
    // The CSS rule `#spin-canvas { width:100%; height:100% }` correctly
    // fills the .wheel-wrapper container — no inline style needed.
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, physSize, physSize);

  // Save context state — everything below draws in LOGICAL pixels
  ctx.save();
  ctx.scale(dpr, dpr);

  // Wheel geometry (all in logical CSS pixels)
  const cx = size / 2;   // Center X
  const cy = size / 2;   // Center Y
  const R  = cx - 5;     // Wheel radius (5px inset from edge)

  SEGMENTS.forEach((seg, i) => {
    const startAngle = angle + i * SEG_ANGLE;
    const endAngle   = startAngle + SEG_ANGLE;
    const midAngle   = startAngle + SEG_ANGLE / 2; // Middle of segment

    /* ── Segment slice ─────────────────────────────────────── */
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, startAngle, endAngle);
    ctx.closePath();

    // Radial gradient: lighter at center, solid colour outward
    const grad = ctx.createRadialGradient(cx, cy, R * 0.08, cx, cy, R);
    grad.addColorStop(0,    seg.color + 'aa');
    grad.addColorStop(0.55, seg.color);
    grad.addColorStop(1,    seg.color + 'cc');
    ctx.fillStyle = grad;
    ctx.fill();

    // Segment divider lines
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    /* ── Icon emoji — outer ring (no rotation needed) ──────── */
    const iconDist = R * 0.74;
    const iconX    = cx + Math.cos(midAngle) * iconDist;
    const iconY    = cy + Math.sin(midAngle) * iconDist;
    const iconSize = Math.max(13, R * 0.135);

    ctx.save();
    ctx.font         = `${iconSize}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(seg.icon, iconX, iconY);
    ctx.restore();

    /* ── Label — inner ring — RADIAL orientation ────────────
       Text runs along the radius (center → edge direction).
       This means text LENGTH goes outward — no arc overflow.
       The constraint is only text HEIGHT vs segment arc width,
       which is always satisfied (font ~9px << arc ~48px).       */
    const labelDist = R * 0.50;
    const labelX    = cx + Math.cos(midAngle) * labelDist;
    const labelY    = cy + Math.sin(midAngle) * labelDist;
    const fontSize  = Math.max(7, Math.min(10, R * 0.082));

    ctx.save();
    ctx.translate(labelX, labelY);

    // Radial rotation: align text along the radius
    // Flip for the left half so text is never upside-down
    let rot = midAngle;
    if (Math.cos(midAngle) < 0) rot += Math.PI; // flip left-half segments
    ctx.rotate(rot);

    ctx.font         = `bold ${fontSize}px sans-serif`; // System font — always available
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#ffffff';
    ctx.shadowColor  = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur   = 4;
    ctx.fillText(seg.label, 0, 0);
    ctx.restore();
  });

  /* ── Centre hub circle ─────────────────────────────────── */
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.12, 0, Math.PI * 2);
  ctx.fillStyle   = '#0d1117';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,212,255,0.65)';
  ctx.lineWidth   = 2;
  ctx.stroke();

  ctx.restore(); // Restore from ctx.save() / ctx.scale()
}

/* Expose for app.js if it ever needs to force a redraw */
window.__ns_updateStats      = updateStats;
window.__ns_updateStreakChip = updateStreakChip;


/* ═══════════════════════════════════════════════════════════════
   SPIN LOGIC
═══════════════════════════════════════════════════════════════ */

/** The debounced spin handler — prevents spam clicking */
const debouncedSpin = debounce(_spinWheel, 500);

function bindSpinEvents() {
  document.getElementById('btn-spin')?.addEventListener('click', debouncedSpin);
}

function _spinWheel() {
  // Guard: already spinning
  if (isSpinning) return;

  // Guard: no spins left
  if (state.spins <= 0) {
    showPopup('😢', 'No Spins Left', 'Claim your daily reward or come back tomorrow for more free spins!');
    playSound('error');
    return;
  }

  isSpinning = true;
  state.spins--;
  state.spinCount++;
  updateSpinCount();
  saveState();

  // Disable spin button during animation
  const btn = document.getElementById('btn-spin');
  if (btn) {
    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Spinning…';
  }

  /* ── Pick the winning segment ──────────────────────────── */
  let winningIndex = SPIN_WEIGHTS[Math.floor(Math.random() * SPIN_WEIGHTS.length)];

  /* Near-miss mechanic: 20% chance to land just next to jackpot */
  const nearMissRoll = Math.random();
  if (winningIndex !== JACKPOT_IDX && nearMissRoll < 0.20) {
    winningIndex = (JACKPOT_IDX + 1) % SEG_COUNT; // One past jackpot
  }

  /* ── Calculate target angle ────────────────────────────── */
  // We want the pointer (at top = -π/2) to land in the middle
  // of the winning segment.
  const targetMidAngle  = -(winningIndex * SEG_ANGLE + SEG_ANGLE / 2);
  const extraRotations  = (5 + Math.floor(Math.random() * 4)) * Math.PI * 2; // 5–8 full turns
  const targetAngle     = targetMidAngle - extraRotations;

  /* ── Animate ───────────────────────────────────────────── */
  const startAngle  = currentAngle;
  const totalDelta  = targetAngle - startAngle;
  const duration    = 4000 + Math.random() * 1000; // 4–5 seconds
  const startTime   = performance.now();

  // Add glowing ring spin class
  const ring   = document.querySelector('.wheel-ring');
  const canvas = document.getElementById('spin-canvas');
  ring?.classList.add('spinning');

  // Pause the CSS counter-rotation during JS spin so they don't fight
  if (canvas) canvas.style.animationPlayState = 'paused';

  playSound('spin');

  function animate(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease-out cubic: fast start, smooth landing
    const eased = 1 - Math.pow(1 - progress, 3);

    currentAngle = startAngle + totalDelta * eased;
    drawWheel(currentAngle);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      // ── Spin complete ──────────────────────────────────────
      currentAngle = targetAngle;
      // Normalise angle to keep values small
      currentAngle = currentAngle % (Math.PI * 2);

      ring?.classList.remove('spinning');
      // Resume CSS counter-rotation after spin finishes
      if (canvas) canvas.style.animationPlayState = '';
      isSpinning = false;

      // Re-enable spin button
      if (btn) {
        btn.disabled = false;
        btn.querySelector('.btn-text').textContent = 'SPIN NOW';
      }

      applyReward(winningIndex);
    }
  }

  requestAnimationFrame(animate);
}


/* ═══════════════════════════════════════════════════════════════
   APPLY REWARD
   Called when the wheel stops. Applies coins/EXP/spins,
   saves state, syncs to Firebase, shows popup.
═══════════════════════════════════════════════════════════════ */
function applyReward(segIndex) {
  const seg = SEGMENTS[segIndex];
  let popupMsg = '';

  switch (seg.type) {
    case 'coins':
      state.coins += seg.value;
      popupMsg = `+${seg.value} Coins added to your wallet! 💰`;
      playSound('coins');
      break;

    case 'exp':
      addExp(seg.value);
      popupMsg = `+${seg.value} EXP earned! Keep spinning! ⭐`;
      playSound('exp');
      break;

    case 'spin':
      state.spins += seg.value;
      popupMsg = `+${seg.value} Free Spin added! 🎰`;
      playSound('spin');
      break;
  }

  /* ── Check for jackpot ─────────────────────────────────── */
  const isJackpot = segIndex === JACKPOT_IDX;
  if (isJackpot) {
    // Small bonus on jackpot
    state.coins += 10;
    popupMsg += ' 🎉 JACKPOT BONUS +10 Coins!';
    playSound('levelup');
  }

  saveState();
  updateStats();
  updateSpinCount();
  checkTaskProgress();

  // Sync to Firebase
  _onStateChange?.(state);

  // Add to live feed
  addFeedItem(
    `<strong>You</strong> just spun <span class="highlight">${seg.label}${isJackpot ? ' 🎉' : ''}!</span>`,
    seg.icon
  );

  // Show result popup
  showPopup(
    isJackpot ? '🎊' : seg.icon,
    isJackpot ? '🎰 JACKPOT!' : `You won ${seg.label}!`,
    popupMsg
  );
}


/* ═══════════════════════════════════════════════════════════════
   EXP & LEVEL UP
═══════════════════════════════════════════════════════════════ */
function addExp(amount) {
  const oldLevel = state.level;
  state.exp += amount;
  state.level = levelFromExp(state.exp);

  // Did we level up?
  if (state.level > oldLevel) {
    showLevelUp(state.level);
    playSound('levelup');
  }
}


/* ═══════════════════════════════════════════════════════════════
   DAILY REWARD
   24-hour cooldown. Gives random coins + EXP.
═══════════════════════════════════════════════════════════════ */
function claimDailyReward() {
  const now      = Date.now();
  const cooldown = 24 * 60 * 60 * 1000; // 24 hours in ms

  if (now - state.lastDailyReward < cooldown) {
    const remaining = cooldown - (now - state.lastDailyReward);
    showPopup('⏳', 'Already Claimed', `Come back in ${formatCountdown(remaining)}!`);
    return;
  }

  // Random daily reward: 10–40 coins + 10–30 EXP
  const coinsWon = randInt(10, 40);
  const expWon   = randInt(10, 30);

  state.coins          += coinsWon;
  state.lastDailyReward = now;
  addExp(expWon);
  saveState();
  updateStats();
  checkTaskProgress();
  _onStateChange?.(state);

  addFeedItem(
    `<strong>You</strong> claimed your <span class="highlight">Daily Reward!</span> +${coinsWon} Coins, +${expWon} EXP`,
    '🎁'
  );

  showPopup('🎁', 'Daily Reward Claimed!',
    `You got +${coinsWon} Coins and +${expWon} EXP! Come back tomorrow for more! 🎉`
  );

  playSound('coins');
  updateDailyButton();
}

function updateDailyButton() {
  const btn   = document.getElementById('btn-daily');
  const timer = document.getElementById('daily-timer');
  const now   = Date.now();
  const cooldown = 24 * 60 * 60 * 1000;
  const elapsed  = now - (state.lastDailyReward || 0);
  const ready    = elapsed >= cooldown;

  if (timer) {
    timer.textContent = ready ? 'Ready!' : formatCountdown(cooldown - elapsed);
  }

  if (btn) {
    btn.disabled = !ready;
    btn.querySelector('.btn-text').textContent = ready ? 'Claim' : 'Claimed';
  }
}


/* ═══════════════════════════════════════════════════════════════
   DAILY TASKS
═══════════════════════════════════════════════════════════════ */
function checkTaskProgress() {
  // task_login — auto-complete on load
  if (!state.tasks['task_login']) completeTask('task_login', false);

  // task_spin — after first spin
  if (state.spinCount >= 1 && !state.tasks['task_spin']) completeTask('task_spin');

  // task_3spins — after third spin
  if (state.spinCount >= 3 && !state.tasks['task_3spins']) completeTask('task_3spins');

  // task_daily — after claiming daily reward
  if (state.lastDailyReward > 0 && !state.tasks['task_daily']) completeTask('task_daily');

  // task_level — after reaching level 2
  if (state.level >= 2 && !state.tasks['task_level']) completeTask('task_level');

  renderTasks();
}

function completeTask(taskId, giveReward = true) {
  if (state.tasks[taskId]) return; // Already done
  state.tasks[taskId] = true;

  if (giveReward) {
    const task = TASKS_CONFIG.find((t) => t.id === taskId);
    if (task) {
      if (task.type === 'coins') state.coins += task.value;
      if (task.type === 'exp')   addExp(task.value);
      saveState();
      updateStats();
      _onStateChange?.(state);
    }
  }
}

function renderTasks() {
  const listEl = document.getElementById('tasks-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  TASKS_CONFIG.forEach((task) => {
    const done = !!state.tasks[task.id];
    const item = document.createElement('div');
    item.className = `task-item${done ? ' done' : ''}`;
    item.innerHTML = `
      <div class="task-icon">${task.icon}</div>
      <div class="task-info">
        <div class="task-name">${escapeHtml(task.name)}</div>
        <div class="task-reward">${escapeHtml(task.reward)}</div>
      </div>
      <div class="task-status">${done ? '✅' : '⬜'}</div>
    `;
    listEl.appendChild(item);
  });
}


/* ═══════════════════════════════════════════════════════════════
   UPDATE STATS UI
   Called whenever coins / EXP / level change.
═══════════════════════════════════════════════════════════════ */
function updateStats(animate = true) {
  const coinsEl = document.getElementById('stat-coins');
  const expEl   = document.getElementById('stat-exp');
  const levelEl = document.getElementById('stat-level');
  const barFill = document.getElementById('exp-bar-fill');
  const pctEl   = document.getElementById('exp-pct');

  if (coinsEl) {
    coinsEl.textContent = state.coins;
    if (animate) popEl(coinsEl);
  }
  if (expEl) {
    expEl.textContent = state.exp;
    if (animate) popEl(expEl);
  }
  if (levelEl) {
    levelEl.textContent = state.level;
  }

  // EXP progress bar
  const curExp    = expInCurrentLevel(state.exp);
  const neededExp = expRequired(state.level);
  const pct       = Math.min(100, Math.round((curExp / neededExp) * 100));

  if (barFill) barFill.style.width = pct + '%';
  if (pctEl)   pctEl.textContent   = `${curExp} / ${neededExp} EXP`;

  // Update ARIA progressbar value
  document.querySelector('.exp-bar-track')?.setAttribute('aria-valuenow', String(pct));

  // FIX: Always refresh streak + spin count + referral here so they
  // never show stale values. Previously these were only updated by
  // separate functions, so they showed "0" until explicitly called.
  updateStreakChip(state.streak);
  updateSpinCount();
  if (state.referralCode) updateReferralChip(state.referralCode);
}

function updateSpinCount() {
  const el = document.getElementById('spin-count');
  if (el) el.textContent = state.spins;
}

function updateStreakChip(streak) {
  const el = document.getElementById('streak-count');
  if (el) el.textContent = streak;
}

function updateReferralChip(code) {
  const el = document.getElementById('referral-code-display');
  if (el) el.textContent = code || '—';
}

/** Trigger the "pop" CSS animation on a stat value */
function popEl(el) {
  el.classList.remove('pop');
  void el.offsetWidth; // Force reflow to restart animation
  el.classList.add('pop');
}


/* ═══════════════════════════════════════════════════════════════
   POPUP SYSTEM
   Generic popup used for rewards, errors, and notifications.
   Replaces window.alert() with a beautiful in-app modal.
═══════════════════════════════════════════════════════════════ */
function showPopup(icon, title, msg) {
  const overlay = document.getElementById('popup-overlay');
  const iconEl  = document.getElementById('popup-icon');
  const titleEl = document.getElementById('popup-title');
  const msgEl   = document.getElementById('popup-msg');
  if (!overlay) return;
  if (iconEl)  iconEl.textContent  = icon;
  if (titleEl) titleEl.textContent = title;
  if (msgEl)   msgEl.textContent   = msg;
  overlay.classList.remove('hidden');
}

/* Expose globally so auth.js can trigger popups */
window.__ns_showPopup = showPopup;

function closePopup() {
  document.getElementById('popup-overlay')?.classList.add('hidden');
}

function showLevelUp(level) {
  const overlay = document.getElementById('levelup-overlay');
  if (!overlay) return;
  const numEl = document.getElementById('levelup-num');
  if (numEl) numEl.textContent = `Level ${level}`;
  overlay.classList.remove('hidden');
  spawnConfetti();
}

function closeLevelUp() {
  document.getElementById('levelup-overlay')?.classList.add('hidden');
}

export function bindUIEvents() {
  // Popup close
  document.getElementById('popup-close')?.addEventListener('click', closePopup);
  document.getElementById('popup-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'popup-overlay') closePopup();
  });

  // Level-up close
  document.getElementById('levelup-close')?.addEventListener('click', closeLevelUp);
  document.getElementById('levelup-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'levelup-overlay') closeLevelUp();
  });

  // Keyboard: Escape closes any popup
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePopup(); closeLevelUp(); }
  });

  // Daily reward
  document.getElementById('btn-daily')?.addEventListener('click', claimDailyReward);

  // Sound toggle
  document.getElementById('btn-sound-toggle')?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    lsSet('ns_sound', soundEnabled ? '1' : '0');
    updateSoundIcon();
    if (soundEnabled) playSound('click');
  });

  // Theme toggle
  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);

  // Referral chip — copy code
  document.getElementById('referral-chip')?.addEventListener('click', async () => {
    const code = state.referralCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showPopup('🔗', 'Copied!', `Referral code "${code}" copied to clipboard!`);
    } catch {
      showPopup('🔗', 'Your Code', `Share this code: ${code}`);
    }
  });

  // Feedback image preview
  document.getElementById('feedback-image')?.addEventListener('change', () => {
    const file    = document.getElementById('feedback-image')?.files?.[0];
    const preview = document.getElementById('feedback-preview');
    const lbl     = document.getElementById('file-name-display');
    if (!file) return;
    if (lbl) lbl.textContent = file.name.length > 20 ? file.name.slice(0, 18) + '…' : file.name;
    if (preview) {
      preview.src = URL.createObjectURL(file);
      preview.classList.remove('hidden');
    }
  });
}


/* ═══════════════════════════════════════════════════════════════
   LIVE FEED
═══════════════════════════════════════════════════════════════ */
function addFeedItem(html, avatar = '⚡') {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;

  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `
    <div class="feed-avatar">${avatar}</div>
    <div class="feed-text">${html}</div>
    <div class="feed-time">now</div>
  `;

  feed.insertBefore(item, feed.firstChild);

  // Keep max 8 items in the feed
  while (feed.children.length > 8) {
    feed.removeChild(feed.lastChild);
  }
}

function emitFakeFeedItem() {
  const tpl   = FEED_TEMPLATES[Math.floor(Math.random() * FEED_TEMPLATES.length)];
  const name  = FEED_NAMES[Math.floor(Math.random() * FEED_NAMES.length)];
  const value = randInt(5, 50);
  const avatar = FEED_AVATARS[Math.floor(Math.random() * FEED_AVATARS.length)];
  addFeedItem(tpl(name, value), avatar);
}

function startFakeFeed() {
  emitFakeFeedItem();
  feedInterval = setInterval(emitFakeFeedItem, 4000);
}


/* ═══════════════════════════════════════════════════════════════
   DAILY TIMER LOOP
═══════════════════════════════════════════════════════════════ */
function startDailyTimer() {
  updateDailyButton();
  dailyInterval = setInterval(updateDailyButton, 1000);
}


/* ═══════════════════════════════════════════════════════════════
   CONFETTI
═══════════════════════════════════════════════════════════════ */
function spawnConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  container.innerHTML = '';

  const colors = ['#ffd700','#00d4ff','#a855f7','#f0abfc','#39ff14','#ff6b35'];
  for (let i = 0; i < 35; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${randItem(colors)};
      animation-duration: ${0.8 + Math.random() * 1.2}s;
      animation-delay: ${Math.random() * 0.5}s;
      width: ${6 + Math.random() * 7}px;
      height: ${6 + Math.random() * 7}px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
    `;
    container.appendChild(piece);
  }
}


/* ═══════════════════════════════════════════════════════════════
   FLOATING PARTICLES BACKGROUND
═══════════════════════════════════════════════════════════════ */
function spawnParticles() {
  const bg = document.getElementById('particles-bg');
  if (!bg) return;

  const colors = ['#00d4ff','#a855f7','#f0abfc','#39ff14','#ffd700'];
  for (let i = 0; i < 12; i++) { // Reduced from 22 — faster init + less CPU
    const p    = document.createElement('div');
    p.className = 'particle';
    const size = 2 + Math.random() * 4;
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      bottom: -10px;
      width: ${size}px;
      height: ${size}px;
      background: ${randItem(colors)};
      animation-duration: ${7 + Math.random() * 10}s;
      animation-delay: ${Math.random() * 9}s;
      box-shadow: 0 0 ${size * 2}px currentColor;
    `;
    bg.appendChild(p);
  }
}


/* ═══════════════════════════════════════════════════════════════
   THEME TOGGLE
═══════════════════════════════════════════════════════════════ */
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  lsSet('ns_theme', isLight ? 'light' : 'dark');
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = isLight ? '☀️' : '🌙';
}

export function loadTheme() {
  const saved = lsGet('ns_theme');
  if (saved === 'light') {
    document.body.classList.add('light');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = '☀️';
  }
}


/* ═══════════════════════════════════════════════════════════════
   SOUND SYSTEM
   Synthesised tones via Web Audio API.
   No external files needed — works completely offline.
═══════════════════════════════════════════════════════════════ */
function updateSoundIcon() {
  const icon = document.getElementById('sound-icon');
  if (icon) icon.textContent = soundEnabled ? '🔊' : '🔇';
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case 'click':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
        break;

      case 'spin':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        break;

      case 'coins':
        [0, 0.1, 0.2].forEach((t) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(880 + t * 440, ctx.currentTime + t);
          g.gain.setValueAtTime(0.12, ctx.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
          o.start(ctx.currentTime + t);
          o.stop(ctx.currentTime + t + 0.15);
        });
        return; // Return early — multiple oscillators

      case 'exp':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
        break;

      case 'levelup':
        [0, 0.15, 0.3, 0.45].forEach((t, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type = 'sine';
          const freqs = [523, 659, 784, 1047]; // C5, E5, G5, C6
          o.frequency.setValueAtTime(freqs[i], ctx.currentTime + t);
          g.gain.setValueAtTime(0.15, ctx.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
          o.start(ctx.currentTime + t);
          o.stop(ctx.currentTime + t + 0.2);
        });
        return;

      case 'error':
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
        break;

      default: return;
    }

    osc.start?.(ctx.currentTime);
    osc.stop?.(ctx.currentTime + 0.5);

  } catch {
    // Web Audio not supported — silent fail
  }
}

/* Expose so auth.js tab navigation can play click sounds */
window.__ns_playSound = playSound;

/* ═══════════════════════════════════════════════════════════════
   NEONSPIN — script.js  v3.0  (UPGRADED)
   Main game logic module. Preserves ALL v1 + v2 features:
     Spin Wheel · EXP/Level · Daily Reward · Tasks · Feed
     Near Miss · Jackpot · Bonus · Streak · Particles
     Dark/Light Mode · Sound Effects · Confetti
   
   New in v3:
     • ES module (import/export)
     • Custom EXP curve: expRequired = 50 * level^1.3
     • Firebase stat sync via auth.js
     • Sound system with toggle
     • Exposes window.__ns_* hooks for auth.js to call back
═══════════════════════════════════════════════════════════════ */

'use strict';

import { syncUserStats } from './auth.js';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const DAILY_COOLDOWN   = 24 * 60 * 60 * 1000;
const FEED_INTERVAL    = 4000;
const TIMER_INTERVAL   = 1000;
const JACKPOT_SEGMENT  = 4;       // index of '50 Coins' in SEGMENTS
const NEAR_MISS_CHANCE = 0.20;
const BONUS_CHANCE     = 0.10;
const BONUS_MIN        = 10;
const BONUS_MAX        = 30;

/* ─── Custom EXP curve (matches auth.js) ────────────────────── */
function expRequired(level) {
  return Math.floor(50 * Math.pow(level, 1.3));
}

function levelFromExp(totalExp) {
  let level = 1;
  let accumulated = 0;
  while (true) {
    const needed = expRequired(level);
    if (accumulated + needed > totalExp) break;
    accumulated += needed;
    level++;
    if (level > 1000) break;
  }
  return level;
}

function expInCurrentLevel(totalExp) {
  let accumulated = 0;
  let level = 1;
  while (true) {
    const needed = expRequired(level);
    if (accumulated + needed > totalExp) return totalExp - accumulated;
    accumulated += needed;
    level++;
    if (level > 1000) break;
  }
  return 0;
}

/* ─── Wheel Segments ────────────────────────────────────────── */
const SEGMENTS = [
  { label: '10 Coins', icon: '💰', type: 'coins', value: 10,  color: '#ffd700', dark: '#b8960a' },
  { label: '5 EXP',    icon: '⭐', type: 'exp',   value: 5,   color: '#a855f7', dark: '#7c3aed' },
  { label: '20 Coins', icon: '💰', type: 'coins', value: 20,  color: '#00d4ff', dark: '#0096b3' },
  { label: '+1 Spin',  icon: '🎰', type: 'spin',  value: 1,   color: '#39ff14', dark: '#28b80e' },
  { label: '50 Coins', icon: '💰', type: 'coins', value: 50,  color: '#f0abfc', dark: '#c026d3' },
  { label: '10 EXP',   icon: '⭐', type: 'exp',   value: 10,  color: '#ff6b35', dark: '#cc4a1a' },
  { label: '15 Coins', icon: '💰', type: 'coins', value: 15,  color: '#00d4ff', dark: '#0096b3' },
  { label: '25 EXP',   icon: '⭐', type: 'exp',   value: 25,  color: '#a855f7', dark: '#7c3aed' },
];

/* ─── Fake live feed data ────────────────────────────────────── */
const FEED_TEMPLATES = [
  { avatar: '🦊', msg: (n,v) => `<strong>${n}</strong> just spun <span class="highlight">+${v} Coins!</span>` },
  { avatar: '🐉', msg: (n,v) => `<strong>${n}</strong> leveled up to <span class="highlight">Level ${v}!</span>` },
  { avatar: '🌙', msg: (n,v) => `<strong>${n}</strong> claimed their <span class="highlight">Daily Reward!</span>` },
  { avatar: '⚡', msg: (n,v) => `<strong>${n}</strong> earned <span class="highlight">+${v} EXP!</span>` },
  { avatar: '🔥', msg: (n,v) => `<strong>${n}</strong> completed a <span class="highlight">Daily Task!</span>` },
  { avatar: '💫', msg: (n,v) => `<strong>${n}</strong> scored <span class="highlight">${v} Coins</span> on a spin!` },
  { avatar: '🎯', msg: (n,v) => `<strong>${n}</strong> is on a <span class="highlight">3-day streak!</span>` },
  { avatar: '🚀', msg: (n,v) => `<strong>${n}</strong> earned <span class="highlight">+${v} EXP</span> today!` },
];

const FAKE_NAMES = [
  'Rahul_G','Priya_22','ZeroX','NightOwl','AcePlayer','Kira99','DarkStar',
  'Pixel_K','ShadowRun','LunaX','ViperZ','Rocketeer','Blaze77','StormX',
  'PhoenixK','AaravX','Devil_99','CoolBoy','GamerRaj','TechGuru',
  'NoobMaster','ProKiller','SilentX','MysticBoy','Alpha_01','BetaKnight',
  'CodeNinja','Hackerman','GhostRider','FireFury','IceDragon','ThunderX',
  'Speedster','TurboMax','UltraZ','AnkitPro','RohitX','Yash_007',
  'KabirDev','OmGamer','RudraKing','AryanX','Manav_Pro','VarunLive',
  'HarshOP','NikhilX','ParthDev','DhruvPro','TanishX','AyaanLive',
  'QueenBee','MissPriya','AngelX','CuteDev','SweetGirl','HotShot',
  'LadyBoss','MissFire','DivaX','PinkStorm','BeautyX','InstaQueen',
  'ChillGirl','StarGirl','MoonLight','AlexX','JordanPro','TaylorX',
  'MorganLive','CaseyX','JamieDev','RileyPro','QuinnX','AveryLive',
  'ParkerX','LoganDev','CameronPro','DakotaX','ReeseLive','SkylerX',
  'NoahX','LiamPro','MasonX','EthanLive','LucasX','JamesDev',
  'BenjaminPro','ElijahX','WilliamLive','HenryX','OliviaX','EmmaPro',
  'AvaX','SophiaLive','IsabellaX','MiaDev','CharlottePro','AmeliaX',
  'HarperLive','EvelynX','ZaynX','ArhamPro','FaizanX','RehanLive',
  'SameerX','ImranDev','ZubairPro','HassanX','AliLive','FarhanX',
  'CyberX','NeonBoy','GlitchX','DataKing','CryptoX','BitMaster',
  'PixelHero','AI_Genius','BotX','ServerLord','CloudX','MatrixBoy',
  'NanoTech','QuantumX','FutureDev',
];

/* ─── Daily tasks config ─────────────────────────────────────── */
const TASKS_CONFIG = [
  { id: 'task_login',  icon: '👋', name: 'Log in today',            reward: '+5 EXP',    type: 'exp',   value: 5  },
  { id: 'task_spin',   icon: '🎰', name: 'Spin the wheel once',     reward: '+10 Coins', type: 'coins', value: 10 },
  { id: 'task_daily',  icon: '🎁', name: 'Claim your daily reward', reward: '+15 EXP',   type: 'exp',   value: 15 },
  { id: 'task_3spins', icon: '🔄', name: 'Spin the wheel 3 times',  reward: '+20 Coins', type: 'coins', value: 20 },
  { id: 'task_level',  icon: '🔥', name: 'Reach Level 2',           reward: '+30 Coins', type: 'coins', value: 30 },
];

/* ═══════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════ */
const state = {
  coins:           0,
  exp:             0,
  level:           1,
  spins:           3,
  lastDailyReward: 0,
  lastDailyReset:  0,
  tasks:           {},
  spinCount:       0,
  streak:          0,
  lastVisit:       0,
  firstTime:       true,
  referralCode:    '',
};

/* Expose state globally so auth.js can read/write it */
window.__ns_state = state;

let isSpinning   = false;
let currentAngle = 0;
let feedTimer    = null;
let dailyTimer   = null;

/* ═══════════════════════════════════════════════════════════════
   DOM REFS
═══════════════════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

const DOM = {
  coins:      () => $('stat-coins'),
  exp:        () => $('stat-exp'),
  level:      () => $('stat-level'),
  expBar:     () => $('exp-bar-fill'),
  expPct:     () => $('exp-pct'),
  spinCount:  () => $('spin-count'),
  btnSpin:    () => $('btn-spin'),
  btnDaily:   () => $('btn-daily'),
  dailyTimer: () => $('daily-timer'),
  tasksList:  () => $('tasks-list'),
  feed:       () => $('activity-feed'),
  canvas:     () => $('spin-canvas'),
  popOverlay: () => $('popup-overlay'),
  popIcon:    () => $('popup-icon'),
  popTitle:   () => $('popup-title'),
  popMsg:     () => $('popup-msg'),
  popClose:   () => $('popup-close'),
  lvlOverlay: () => $('levelup-overlay'),
  lvlNum:     () => $('levelup-num'),
  lvlClose:   () => $('levelup-close'),
  confetti:   () => $('confetti-container'),
  particlesBg:() => $('particles-bg'),
  wheelRing:  () => document.querySelector('.wheel-ring'),
  streakChip: () => $('streak-count'),
};

/* ═══════════════════════════════════════════════════════════════
   SOUND SYSTEM
   Base64 or Web Audio API tones — no external files needed.
   Each sound is a tiny synthesised beep via AudioContext.
═══════════════════════════════════════════════════════════════ */
let soundEnabled = localStorage.getItem('ns_sound') !== '0';

function updateSoundIcon() {
  const icon = $('sound-icon');
  if (icon) icon.textContent = soundEnabled ? '🔊' : '🔇';
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case 'click':
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
        break;

      case 'spin':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
        break;

      case 'levelup':
        // Ascending arpeggio
        [261, 329, 392, 523].forEach((freq, i) => {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          o2.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
          g2.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.12);
          g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.2);
          o2.start(ctx.currentTime + i * 0.12);
          o2.stop(ctx.currentTime + i * 0.12 + 0.2);
        });
        break;

      case 'reward':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(550, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
        break;

      case 'jackpot':
        [523, 659, 784, 1047].forEach((freq, i) => {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.type = 'square';
          o2.connect(g2); g2.connect(ctx.destination);
          o2.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
          g2.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.08);
          g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.25);
          o2.start(ctx.currentTime + i * 0.08);
          o2.stop(ctx.currentTime + i * 0.08 + 0.25);
        });
        break;

      case 'task':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
        break;
    }

    // Clean up context after sound plays
    setTimeout(() => ctx.close(), 1000);
  } catch (_) {
    // AudioContext not available (e.g. file:// in some browsers) — silently ignore
  }
}

/* Expose globally so auth.js can trigger sounds */
window.__ns_playSound = playSound;

/* ═══════════════════════════════════════════════════════════════
   THEME (Dark / Light)
═══════════════════════════════════════════════════════════════ */
function loadTheme() {
  const saved = localStorage.getItem('ns_theme');
  if (saved === 'light') applyTheme('light');
}

function applyTheme(mode) {
  document.body.classList.toggle('light-mode', mode === 'light');
  const icon = $('theme-icon');
  if (icon) icon.textContent = mode === 'light' ? '☀️' : '🌙';
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  const mode    = isLight ? 'light' : 'dark';
  localStorage.setItem('ns_theme', mode);
  applyTheme(mode);
  playSound('click');
}

/* ═══════════════════════════════════════════════════════════════
   LOCAL STATE PERSISTENCE
═══════════════════════════════════════════════════════════════ */
function saveState() {
  try { localStorage.setItem('neonspin_v3', JSON.stringify(state)); } catch (_) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem('neonspin_v3')
             || localStorage.getItem('neonspin_v1'); // migrate from v1
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (_) {}

  // Daily task reset at midnight
  const now      = Date.now();
  const midnight = getMidnight();
  if (!state.lastDailyReset || state.lastDailyReset < midnight) {
    state.tasks          = {};
    state.lastDailyReset = now;
  }

  // Ensure defaults for new fields
  if (!state.spins      && state.spins !== 0) state.spins     = 3;
  if (!state.spinCount)  state.spinCount = 0;
  if (!state.streak)     state.streak    = 0;
  if (!state.referralCode) state.referralCode = '';
}

function getMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/* Expose save/update so auth.js can call them */
window.__ns_saveState   = saveState;
window.__ns_updateStats = () => updateStats(false);
window.__ns_updateStreakChip = (val) => {
  const el = DOM.streakChip();
  if (el) el.textContent = val;
};

/* ═══════════════════════════════════════════════════════════════
   UI UPDATES
═══════════════════════════════════════════════════════════════ */
function updateStats(animate = false) {
  const level   = levelFromExp(state.exp);
  const inLevel = expInCurrentLevel(state.exp);
  const needed  = expRequired(level);
  const pct     = Math.min((inLevel / needed) * 100, 100);

  // Sync level back to state if it changed
  if (level !== state.level) {
    const prev   = state.level;
    state.level  = level;
    if (level > prev) {
      playSound('levelup');
      setTimeout(() => showLevelUp(level), 300);
    }
  }

  if (DOM.coins())    DOM.coins().textContent     = state.coins;
  if (DOM.exp())      DOM.exp().textContent       = state.exp;
  if (DOM.level())    DOM.level().textContent     = state.level;
  if (DOM.expBar())   DOM.expBar().style.width    = pct + '%';
  if (DOM.expPct())   DOM.expPct().textContent    = `${inLevel} / ${needed} EXP`;
  if (DOM.spinCount()) DOM.spinCount().textContent = state.spins;

  // Streak chip
  const sc = DOM.streakChip();
  if (sc) sc.textContent = state.streak;

  // Low spins warning
  const badge = DOM.spinCount();
  if (badge) badge.classList.toggle('low', state.spins <= 1);

  // Animate stat cards
  if (animate) {
    ['card-coins','card-exp','card-level'].forEach((id) => {
      const card = $(id);
      if (!card) return;
      card.classList.add('active');
      setTimeout(() => card.classList.remove('active'), 600);
    });
  }

  // Sync to Firestore (fire-and-forget)
  syncUserStats(state).catch(() => {});
}

function popStat(key) {
  const el = DOM[key]?.();
  if (!el) return;
  el.classList.remove('pop');
  void el.offsetWidth; // reflow to retrigger animation
  el.classList.add('pop');
  setTimeout(() => el.classList.remove('pop'), 400);
}

/* ═══════════════════════════════════════════════════════════════
   REWARD ENGINE
═══════════════════════════════════════════════════════════════ */
function giveReward(type, value) {
  if (type === 'coins') {
    state.coins += value;
    popStat('coins');
  } else if (type === 'exp') {
    state.exp += value;
    popStat('exp');
  } else if (type === 'spin') {
    state.spins += value;
  }
  updateStats(true);
  saveState();
  checkTaskProgress();
}

/* Expose so auth.js can award milestone prizes */
window.__ns_giveReward = giveReward;

/* ═══════════════════════════════════════════════════════════════
   SPIN WHEEL — CANVAS DRAWING
═══════════════════════════════════════════════════════════════ */
function drawWheel(angle) {
  const canvas   = DOM.canvas();
  if (!canvas) return;
  const ctx      = canvas.getContext('2d');
  const cx       = canvas.width  / 2;
  const cy       = canvas.height / 2;
  const radius   = cx - 4;
  const segAngle = (2 * Math.PI) / SEGMENTS.length;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < SEGMENTS.length; i++) {
    const seg   = SEGMENTS[i];
    const startA = angle + i * segAngle;
    const endA   = startA + segAngle;
    const midA   = startA + segAngle / 2;

    // Segment fill
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startA, endA);
    ctx.closePath();
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, seg.dark + 'cc');
    grad.addColorStop(1, seg.color + 'ff');
    ctx.fillStyle = grad;
    ctx.fill();

    // Segment border
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startA, endA);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Emoji icon
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(midA);
    ctx.font         = `${Math.floor(radius * 0.18)}px serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(seg.icon, radius * 0.68, 0);
    ctx.restore();

    // Label text
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(midA);
    ctx.font         = `bold ${Math.floor(radius * 0.095)}px Rajdhani, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#ffffff';
    ctx.shadowColor  = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur   = 4;
    ctx.fillText(seg.label, radius * 0.42, 0);
    ctx.restore();
  }

  // Centre hub circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.17, 0, 2 * Math.PI);
  const hubGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.17);
  hubGrad.addColorStop(0, '#1a1f35');
  hubGrad.addColorStop(1, '#0a0d1a');
  ctx.fillStyle   = hubGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,212,255,0.6)';
  ctx.lineWidth   = 2.5;
  ctx.stroke();
}

/* ═══════════════════════════════════════════════════════════════
   SPIN LOGIC
═══════════════════════════════════════════════════════════════ */
function weightedRandom(items, weights) {
  let total = 0;
  for (const w of weights) total += w;
  let rand = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return items[i];
  }
  return items[items.length - 1];
}

function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

/* ── Near-miss effect ─────────────────────────────────────────
   20% chance to flash the wheel gold when not hitting jackpot.
   Creates tension / excitement without deceiving the user.     */
function triggerNearMiss(segIdx) {
  if (segIdx === JACKPOT_SEGMENT) return;
  if (Math.random() > NEAR_MISS_CHANCE) return;
  const ring = DOM.wheelRing();
  if (!ring) return;
  ring.classList.add('wheel-near-win');
  setTimeout(() => ring.classList.remove('wheel-near-win'), 500);
}

function spinWheel() {
  if (isSpinning) return;

  if (state.spins <= 0) {
    showPopup('😔', 'No Spins Left!', 'Complete tasks or claim your daily reward to earn more spins!');
    playSound('click');
    return;
  }

  isSpinning = true;
  state.spins--;
  DOM.btnSpin().disabled = true;
  DOM.spinCount().textContent = state.spins;
  playSound('spin');

  const weights = [20, 20, 18, 8, 6, 20, 15, 12];
  const seg     = weightedRandom(SEGMENTS, weights);
  const segIdx  = SEGMENTS.indexOf(seg);

  const segAngle    = (2 * Math.PI) / SEGMENTS.length;
  const segMidAngle = segIdx * segAngle + segAngle / 2;
  const targetOffset = -Math.PI / 2 - segMidAngle;
  const extraSpins   = (4 + Math.floor(Math.random() * 4)) * 2 * Math.PI;
  const normOffset   = ((targetOffset - currentAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const targetAngle  = currentAngle + extraSpins + normOffset;
  const duration     = 4000 + Math.random() * 1500;
  let   startTime    = null;
  const startAng     = currentAngle;

  DOM.wheelRing().classList.add('spinning');

  function animateFrame(now) {
    if (!startTime) startTime = now;
    const elapsed  = now - startTime;
    const t        = Math.min(elapsed / duration, 1);
    currentAngle   = startAng + (targetAngle - startAng) * easeOut(t);
    drawWheel(currentAngle);

    if (t < 1) {
      requestAnimationFrame(animateFrame);
    } else {
      // Spin finished
      currentAngle = targetAngle;
      drawWheel(currentAngle);
      isSpinning = false;
      DOM.btnSpin().disabled = false;
      DOM.wheelRing().classList.remove('spinning');

      state.spinCount++;
      saveState();

      triggerNearMiss(segIdx);

      // Give main reward
      giveReward(seg.type, seg.value);

      const isJackpot = (segIdx === JACKPOT_SEGMENT);

      // Random bonus coins (10% chance)
      let bonusCoins = 0;
      if (Math.random() < BONUS_CHANCE) {
        bonusCoins = Math.floor(Math.random() * (BONUS_MAX - BONUS_MIN + 1)) + BONUS_MIN;
        state.coins += bonusCoins;
        popStat('coins');
        updateStats(false);
        saveState();
      }

      setTimeout(() => {
        if (isJackpot) {
          playSound('jackpot');
          showPopup('💥', 'JACKPOT!!!', "UNBELIEVABLE! You hit 50 Coins! You're on fire! 🔥");
          spawnConfetti();
          addFeedItem('<strong>You</strong> hit the <span class="highlight">JACKPOT — 50 Coins!</span> 💥', '💥');
        } else {
          playSound('reward');
          let title, msg;
          if (seg.type === 'coins') {
            title = `+${seg.value} Coins!`;
            msg   = 'Ka-ching! Those coins are hitting different. 💰';
          } else if (seg.type === 'exp') {
            title = `+${seg.value} EXP!`;
            msg   = "You're leveling up fast! Keep going. ⭐";
          } else {
            title = 'Free Spin!';
            msg   = 'Luck is totally on your side today! 🎰';
          }
          if (bonusCoins > 0) msg += ` (+${bonusCoins} bonus coins! 🎁)`;
          showPopup(seg.icon, title, msg);
          addFeedItem(
            `You just spun <span class="highlight">+${seg.value} ${seg.type === 'coins' ? 'Coins' : seg.type === 'exp' ? 'EXP' : 'Spin'}!</span>`,
            '⚡'
          );
        }

        if (!isJackpot && bonusCoins > 0) {
          setTimeout(() => showPopup('🎁', 'BONUS!', `Extra ${bonusCoins} coins landed in your wallet!`), 1800);
        }
      }, 300);

      // Task progress
      checkTaskProgress();
    }
  }

  requestAnimationFrame(animateFrame);
}

/* ═══════════════════════════════════════════════════════════════
   DAILY REWARD
═══════════════════════════════════════════════════════════════ */
function claimDailyReward() {
  const now  = Date.now();
  const diff = now - (state.lastDailyReward || 0);
  if (diff < DAILY_COOLDOWN) return;

  const rewards = [
    { type: 'coins', value: 50,  icon: '💰', label: '50 Coins'  },
    { type: 'exp',   value: 30,  icon: '⭐', label: '30 EXP'    },
    { type: 'coins', value: 100, icon: '💰', label: '100 Coins' },
    { type: 'exp',   value: 50,  icon: '⭐', label: '50 EXP'    },
    { type: 'spin',  value: 2,   icon: '🎰', label: '2 Spins'   },
  ];
  const r = rewards[Math.floor(Math.random() * rewards.length)];

  state.lastDailyReward = now;
  giveReward(r.type, r.value);

  if (!state.tasks['task_daily']) completeTask('task_daily', false);

  saveState();
  updateDailyButton();
  playSound('reward');
  showPopup(r.icon, 'Daily Reward!', `You got ${r.label}! Come back tomorrow for more! 🎁`);
  addFeedItem('<strong>You</strong> claimed your <span class="highlight">Daily Reward!</span>', '🎁');
}

function updateDailyButton() {
  const btn     = DOM.btnDaily();
  const now     = Date.now();
  const diff    = now - (state.lastDailyReward || 0);
  const timerEl = DOM.dailyTimer();
  if (!btn || !timerEl) return;

  if (diff >= DAILY_COOLDOWN) {
    btn.disabled        = false;
    timerEl.textContent = 'Ready!';
    timerEl.style.color = 'var(--neon-green)';
  } else {
    btn.disabled        = true;
    timerEl.textContent = formatTime(DAILY_COOLDOWN - diff);
    timerEl.style.color = 'var(--neon-gold)';
  }
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

/* ═══════════════════════════════════════════════════════════════
   DAILY TASKS
═══════════════════════════════════════════════════════════════ */
function renderTasks() {
  const list = DOM.tasksList();
  if (!list) return;
  list.innerHTML = '';

  TASKS_CONFIG.forEach((task) => {
    const done = !!state.tasks[task.id];
    const el   = document.createElement('div');
    el.className  = `task-item${done ? ' completed' : ''}`;
    el.dataset.id = task.id;
    el.innerHTML  = `
      <div class="task-check">${done ? '✓' : ''}</div>
      <div class="task-icon">${task.icon}</div>
      <div class="task-body">
        <div class="task-name">${task.name}</div>
        <div class="task-reward">${task.reward}</div>
      </div>
      <button class="task-btn"${done ? ' disabled' : ''}>${done ? 'Done ✓' : 'Claim'}</button>
    `;

    if (!done) {
      const btn = el.querySelector('.task-btn');
      btn.addEventListener('click', (e) => { e.stopPropagation(); handleTaskClaim(task.id); });
      el.addEventListener('click', () => handleTaskClaim(task.id));
    }

    list.appendChild(el);
  });
}

function handleTaskClaim(taskId) {
  const task = TASKS_CONFIG.find((t) => t.id === taskId);
  if (!task || state.tasks[taskId]) return;

  if (taskId === 'task_spin'   && state.spinCount < 1)
    return showPopup('🎰', 'Not Yet!', 'Spin the wheel at least once first!');
  if (taskId === 'task_daily'  && (Date.now() - state.lastDailyReward) >= DAILY_COOLDOWN)
    return showPopup('🎁', 'Not Yet!', 'Claim your daily reward first!');
  if (taskId === 'task_3spins' && state.spinCount < 3)
    return showPopup('🔄', 'Not Yet!', `You've only spun ${state.spinCount}/3 times!`);
  if (taskId === 'task_level'  && state.level < 2)
    return showPopup('🔥', 'Not Yet!', 'You need to reach Level 2 first!');

  completeTask(taskId, true);
}

function completeTask(taskId, showNotif) {
  if (state.tasks[taskId]) return;
  const task = TASKS_CONFIG.find((t) => t.id === taskId);
  if (!task) return;

  state.tasks[taskId] = true;
  giveReward(task.type, task.value);
  playSound('task');

  if (showNotif) {
    showPopup(task.icon, 'Task Complete!', `You earned ${task.reward}! 🎉`);
    addFeedItem(`<strong>You</strong> completed a <span class="highlight">Daily Task!</span>`, '🎯');
  }

  renderTasks();
  saveState();
}

function checkTaskProgress() {
  // Auto-complete login task on first check
  if (!state.tasks['task_login']) completeTask('task_login', false);
  renderTasks();
}

/* ═══════════════════════════════════════════════════════════════
   LIVE FEED
═══════════════════════════════════════════════════════════════ */
function addFeedItem(html, avatar = '⚡') {
  const feed = DOM.feed();
  if (!feed) return;

  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `
    <div class="feed-avatar">${avatar}</div>
    <div class="feed-text">${html}</div>
    <div class="feed-time">now</div>
  `;

  feed.insertBefore(item, feed.firstChild);

  // Keep max 8 items
  while (feed.children.length > 8) {
    feed.removeChild(feed.lastChild);
  }
}

function startFakeFeed() {
  function emitFakeItem() {
    const template = FEED_TEMPLATES[Math.floor(Math.random() * FEED_TEMPLATES.length)];
    const name     = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
    const value    = Math.floor(Math.random() * 50) + 5;
    addFeedItem(template.msg(name, value), template.avatar);
  }

  emitFakeItem();
  feedTimer = setInterval(emitFakeItem, FEED_INTERVAL);
}

/* ═══════════════════════════════════════════════════════════════
   POPUPS
═══════════════════════════════════════════════════════════════ */
function showPopup(icon, title, msg) {
  const overlay = DOM.popOverlay();
  if (!overlay) return;

  DOM.popIcon().textContent  = icon;
  DOM.popTitle().textContent = title;
  DOM.popMsg().textContent   = msg;
  overlay.classList.remove('hidden');
}

/* Expose globally so auth.js can show popups */
window.__ns_showPopup = showPopup;

function closePopup() {
  DOM.popOverlay()?.classList.add('hidden');
}

function showLevelUp(level) {
  const overlay = DOM.lvlOverlay();
  if (!overlay) return;
  DOM.lvlNum().textContent = `Level ${level}`;
  overlay.classList.remove('hidden');
  spawnConfetti();
  playSound('levelup');
}

function closeLevelUp() {
  DOM.lvlOverlay()?.classList.add('hidden');
}

/* ═══════════════════════════════════════════════════════════════
   CONFETTI
═══════════════════════════════════════════════════════════════ */
function spawnConfetti() {
  const container = DOM.confetti();
  if (!container) return;
  container.innerHTML = '';

  const colors = ['#ffd700','#00d4ff','#a855f7','#f0abfc','#39ff14','#ff6b35'];
  for (let i = 0; i < 30; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration: ${0.8 + Math.random() * 1.2}s;
      animation-delay: ${Math.random() * 0.4}s;
      width: ${6 + Math.random() * 6}px;
      height: ${6 + Math.random() * 6}px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
    `;
    container.appendChild(piece);
  }
}

/* ═══════════════════════════════════════════════════════════════
   PARTICLES BACKGROUND
═══════════════════════════════════════════════════════════════ */
function spawnParticles() {
  const bg = DOM.particlesBg();
  if (!bg) return;

  const colors = ['#00d4ff','#a855f7','#f0abfc','#39ff14','#ffd700'];
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = 2 + Math.random() * 4;
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      bottom: -10px;
      width: ${size}px;
      height: ${size}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration: ${6 + Math.random() * 10}s;
      animation-delay: ${Math.random() * 8}s;
      box-shadow: 0 0 ${size * 2}px currentColor;
    `;
    bg.appendChild(p);
  }
}

/* ═══════════════════════════════════════════════════════════════
   EVENT BINDING
═══════════════════════════════════════════════════════════════ */
function bindEvents() {
  DOM.btnSpin()?.addEventListener('click', spinWheel);
  DOM.btnDaily()?.addEventListener('click', claimDailyReward);
  DOM.popClose()?.addEventListener('click', closePopup);
  DOM.lvlClose()?.addEventListener('click', closeLevelUp);

  DOM.popOverlay()?.addEventListener('click', (e) => {
    if (e.target === DOM.popOverlay()) closePopup();
  });

  DOM.lvlOverlay()?.addEventListener('click', (e) => {
    if (e.target === DOM.lvlOverlay()) closeLevelUp();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePopup(); closeLevelUp(); }
  });

  // Sound toggle
  $('btn-sound-toggle')?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('ns_sound', soundEnabled ? '1' : '0');
    updateSoundIcon();
    if (soundEnabled) playSound('click');
  });

  // Theme toggle
  $('btn-theme-toggle')?.addEventListener('click', toggleTheme);
}

/* ═══════════════════════════════════════════════════════════════
   DAILY REWARD TIMER LOOP
═══════════════════════════════════════════════════════════════ */
function startDailyTimer() {
  updateDailyButton();
  dailyTimer = setInterval(updateDailyButton, TIMER_INTERVAL);
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
function init() {
  loadState();
  loadTheme();
  updateSoundIcon();
  updateStats(false);
  spawnParticles();
  startFakeFeed();
  startDailyTimer();
  renderTasks();
  bindEvents();

  // Draw initial wheel
  currentAngle = -Math.PI / 2;
  drawWheel(currentAngle);

  // Auto-complete login task
  checkTaskProgress();

  // Welcome feed message (slight delay so feed is visible)
  setTimeout(() => {
    addFeedItem(
      `<strong>Welcome back!</strong> You have <span class="highlight">${state.spins} free spins</span> waiting!`,
      '⚡'
    );
  }, 600);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

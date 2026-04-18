/* ================================================================
   js/config.js — Firebase config + App-wide constants
   Import this file FIRST in any module that needs Firebase or
   shared constants. Nothing here has side effects.
================================================================ */

'use strict';

// ── Firebase Config ─────────────────────────────────────────
export const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBPDul4R8nIYcLVwpw1snmukOI3mRLHbEg',
  authDomain:        'neonspin-rewards-4101a.firebaseapp.com',
  projectId:         'neonspin-rewards-4101a',
  storageBucket:     'neonspin-rewards-4101a.firebasestorage.app',
  messagingSenderId: '424031837123',
  appId:             '1:424031837123:web:4b5566d57d8fef3bc93b76',
  measurementId:     'G-184R1198TX',
  databaseURL:       'https://neonspin-rewards-4101a-default-rtdb.firebaseio.com',
};

// ── Cloudinary ─────────────────────────────────────────────
export const CLOUDINARY = {
  cloudName:    'dary8yynb',
  uploadPreset: 'neonspin_upload',
  uploadUrl:    'https://api.cloudinary.com/v1_1/dary8yynb/image/upload',
};

// ── Admin access ────────────────────────────────────────────
export const ADMIN_EMAIL = 'neonspin.dev@gmail.com';

// ── DB path helpers ─────────────────────────────────────────
// Centralised — rename a path here, NOT in 10 scattered files.
export const PATHS = {
  user:           (uid) => `users/${uid}`,
  users:          'users',
  feedback:       'feedback',
  rewardRequests: 'rewardRequests',
  broadcasts:     'broadcasts',
};

// ── EXP & Level system ──────────────────────────────────────
// Formula: levels 1-4 are easy, levels 5+ scale faster.
// Total EXP to reach level 12 ≈ 2840 EXP → ~14 days at 200 EXP/day.
export function expRequired(level) {
  if (level <= 4) return 50 + (level - 1) * 30; // 50, 80, 110, 140
  return Math.floor(190 * Math.pow(level - 3, 1.3));
}

export function levelFromExp(totalExp) {
  let level = 1;
  let acc = 0;
  while (true) {
    const needed = expRequired(level);
    if (acc + needed > totalExp) break;
    acc += needed;
    level++;
    if (level > 500) break;
  }
  return level;
}

export function expInCurrentLevel(totalExp) {
  let acc = 0;
  let level = 1;
  while (true) {
    const needed = expRequired(level);
    if (acc + needed > totalExp) return totalExp - acc;
    acc += needed;
    level++;
    if (level > 500) break;
  }
  return 0;
}

// ── Reward eligibility requirements ─────────────────────────
export const REWARD_MIN_LEVEL  = 12;  // Must reach level 12 to request
export const REWARD_MIN_STREAK = 7;   // Should have 7-day streak bonus

// ── Spin wheel segments ─────────────────────────────────────
export const SEGMENTS = [
  { label: '10 Coins', icon: '💰', type: 'coins', value: 10,  color: '#c8960a', glow: '#ffd700' },
  { label: '5 EXP',   icon: '⭐', type: 'exp',   value: 5,   color: '#7c3aed', glow: '#a855f7' },
  { label: '20 Coins', icon: '💰', type: 'coins', value: 20,  color: '#0096b3', glow: '#00d4ff' },
  { label: '+1 Spin',  icon: '🎰', type: 'spin',  value: 1,   color: '#28b80e', glow: '#39ff14' },
  { label: '50 Coins', icon: '💰', type: 'coins', value: 50,  color: '#9333ea', glow: '#f0abfc' },
  { label: '10 EXP',  icon: '⭐', type: 'exp',   value: 10,  color: '#cc4a1a', glow: '#ff6b35' },
  { label: '15 Coins', icon: '💰', type: 'coins', value: 15,  color: '#0096b3', glow: '#00d4ff' },
  { label: '25 EXP',  icon: '⭐', type: 'exp',   value: 25,  color: '#6d28d9', glow: '#a855f7' },
];

// Weighted odds — each index repeated = higher chance
export const SPIN_WEIGHTS = [
  0, 0, 0, 0,    // 10 Coins ×4
  1, 1, 1,       // 5 EXP ×3
  2, 2, 2,       // 20 Coins ×3
  3,             // +1 Spin ×1 (rare)
  4,             // 50 Coins ×1 (jackpot)
  5, 5, 5,       // 10 EXP ×3
  6, 6, 6,       // 15 Coins ×3
  7, 7, 7,       // 25 EXP ×3
];

// ── Daily tasks ─────────────────────────────────────────────
export const TASKS_CONFIG = [
  { id: 'task_login',  icon: '👋', name: 'Log in today',           reward: '+5 EXP',    type: 'exp',   value: 5  },
  { id: 'task_spin',   icon: '🎰', name: 'Spin the wheel once',    reward: '+10 Coins', type: 'coins', value: 10 },
  { id: 'task_daily',  icon: '🎁', name: 'Claim your daily reward',reward: '+15 EXP',   type: 'exp',   value: 15 },
  { id: 'task_3spins', icon: '🔄', name: 'Spin the wheel 3 times', reward: '+20 Coins', type: 'coins', value: 20 },
  { id: 'task_level',  icon: '🔥', name: 'Reach Level 2',          reward: '+30 Coins', type: 'coins', value: 30 },
];

// ── Milestones ──────────────────────────────────────────────
export const MILESTONES = [
  { id: 'first_spin', icon: '🎰', name: 'First Spin',   req: 'Spin the wheel once',      coins: 10,  exp: 0  },
  { id: 'level5',     icon: '🔥', name: 'Rising Star',  req: 'Reach Level 5',            coins: 50,  exp: 30 },
  { id: 'streak3',    icon: '⚡', name: '3-Day Streak', req: 'Login 3 days in a row',    coins: 20,  exp: 20 },
  { id: 'coins100',   icon: '💰', name: 'Century Club', req: 'Earn 100 total coins',     coins: 0,   exp: 50 },
  { id: 'level10',    icon: '👑', name: 'Veteran',      req: 'Reach Level 10',           coins: 80,  exp: 0  },
  { id: 'streak7',    icon: '🌟', name: 'Devoted',      req: '7-day login streak bonus', coins: 50,  exp: 50 },
  { id: 'spins10',    icon: '🎡', name: 'Spin Master',  req: 'Spin 10 times',            coins: 30,  exp: 20 },
  { id: 'coins500',   icon: '🏦', name: 'Whale',        req: 'Earn 500 total coins',     coins: 0,   exp: 80 },
  { id: 'level12',    icon: '💎', name: 'Legend',       req: 'Reach Level 12',           coins: 150, exp: 0  },
];

// ── Streak system (bonus-only, never forced) ────────────────
// Streak does NOT block features. It gives BONUS EXP on daily claim.
export function streakBonusExp(streak) {
  if (streak < 3)  return 0;
  if (streak < 7)  return 10;
  if (streak < 14) return 25;
  if (streak < 30) return 50;
  return 100; // 30+ day streak = 100 bonus EXP
}

// ── Live feed content ────────────────────────────────────────
export const FEED_NAMES = [
  'Rahul_G','Priya_22','ZeroX','NightOwl','AcePlayer','Kira99','DarkStar',
  'Pixel_K','ShadowRun','LunaX','ViperZ','Rocketeer','Blaze77','StormX',
  'PhoenixK','AaravX','Devil_99','GamerRaj','TechGuru','NoobMaster',
  'ProKiller','SilentX','MysticBoy','Alpha_01','CodeNinja','GhostRider',
  'FireFury','IceDragon','ThunderX','AnkitPro','RohitX','Yash_007',
  'OmGamer','RudraKing','AryanX','HarshOP','NikhilX','AyaanLive',
  'QueenBee','MissPriya','AngelX','LadyBoss','DivaX','PinkStorm',
  'AlexX','JordanPro','TaylorX','NoahX','LiamPro','MasonX',
];

export const FEED_AVATARS = ['🦊','🐉','🌙','⚡','🔥','💫','🎯','🚀','🦋','🐺'];

export const FEED_TEMPLATES = [
  (n, v) => `<strong>${n}</strong> spun <span class="highlight">+${v} Coins!</span>`,
  (n, v) => `<strong>${n}</strong> levelled up to <span class="highlight">Level ${v}!</span>`,
  (n)    => `<strong>${n}</strong> claimed their <span class="highlight">Daily Reward!</span>`,
  (n, v) => `<strong>${n}</strong> earned <span class="highlight">+${v} EXP!</span>`,
  (n)    => `<strong>${n}</strong> completed a <span class="highlight">Daily Task!</span>`,
  (n, v) => `<strong>${n}</strong> scored <span class="highlight">${v} taps</span> in Tap Frenzy!`,
  (n)    => `<strong>${n}</strong> is on a <span class="highlight">3-day streak! 🔥</span>`,
  (n, v) => `<strong>${n}</strong> just won <span class="highlight">${v} Coins</span> on the wheel!`,
];

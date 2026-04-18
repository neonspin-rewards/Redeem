/* ================================================================
   js/auth.js — Firebase Auth (popup login) + user profile sync.

   WHY POPUP (not redirect)?
   We switched to popup because redirect causes infinite loading
   on GitHub Pages when the authDomain isn't properly configured.
   Popup is triggered directly by user tap so it works on mobile.

   FLOW:
   1. User taps "Continue with Google"
   2. signInWithPopup() opens Google login in a popup
   3. onAuthStateChanged fires when login completes
   4. We load/create the user profile in Realtime DB
   5. onUserReady callback fires with the profile data
================================================================ */

'use strict';

import { initializeApp } from
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  getDatabase,
  ref, get, set, update, push,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

import { FIREBASE_CONFIG, PATHS, ADMIN_EMAIL, MILESTONES, streakBonusExp } from './config.js';
import { generateReferralCode, todayStr, yesterdayStr, lsGet, lsSet } from './utils.js';
import { getState, setState, mergeProfile } from './state.js';

// ── Firebase init ─────────────────────────────────────────────
const _app      = initializeApp(FIREBASE_CONFIG);
export const auth     = getAuth(_app);
export const db       = getDatabase(_app);
const provider  = new GoogleAuthProvider();

// ── Module state ──────────────────────────────────────────────
let _currentUser    = null;
let _userProfile    = null;
let _onUserReady    = null;
let _onUserGone     = null;

export const getCurrentUser  = () => _currentUser;
export const getCurrentUid   = () => _currentUser?.uid ?? null;
export const getUserProfile  = () => _userProfile;
export const isAdmin         = () => _currentUser?.email === ADMIN_EMAIL;

// ── Error messages ────────────────────────────────────────────
function friendlyError(code) {
  const map = {
    'auth/unauthorized-domain':   '❌ Domain not authorised. Add neonspin-rewards.github.io to Firebase Console → Auth → Authorized Domains.',
    'auth/popup-blocked':         '🚫 Popup was blocked. Please allow popups for this site and try again.',
    'auth/popup-closed-by-user':  '⚠️ Sign-in cancelled. Tap the button again to try.',
    'auth/network-request-failed':'📡 No internet connection. Please check and retry.',
    'auth/too-many-requests':     '⏳ Too many attempts. Wait a minute and try again.',
    'auth/cancelled-popup-request': '⚠️ Only one popup at a time. Please try again.',
  };
  return map[code] || `Sign-in error: ${code}`;
}

// ── Terms gate ────────────────────────────────────────────────
export function initTermsGate() {
  const accepted = lsGet('ns_terms_accepted');
  const overlay  = document.getElementById('terms-overlay');
  const authOvrl = document.getElementById('auth-overlay');
  if (!overlay || !authOvrl) return;

  if (!accepted) {
    overlay.classList.remove('hidden');
  }

  document.getElementById('btn-accept-terms')?.addEventListener('click', () => {
    lsSet('ns_terms_accepted', '1');
    overlay.classList.add('hidden');
    if (!_currentUser) authOvrl.classList.remove('hidden');
  });

  document.getElementById('btn-reopen-terms')?.addEventListener('click', () => {
    authOvrl.classList.add('hidden');
    overlay.classList.remove('hidden');
  });
}

// ── Auth buttons ──────────────────────────────────────────────
export function initAuthButtons() {
  // Header sign-in button → open auth modal
  document.getElementById('btn-header-signin')?.addEventListener('click', () => {
    if (!lsGet('ns_terms_accepted')) {
      document.getElementById('terms-overlay')?.classList.remove('hidden');
    } else {
      document.getElementById('auth-overlay')?.classList.remove('hidden');
    }
  });

  // Google sign-in inside auth modal
  document.getElementById('btn-google-signin')?.addEventListener('click', _doSignIn);

  // Guest continue
  document.getElementById('btn-guest-play')?.addEventListener('click', () => {
    document.getElementById('auth-overlay')?.classList.add('hidden');
  });

  // Avatar button → sign out
  document.getElementById('user-avatar-btn')?.addEventListener('click', () => {
    if (confirm('Sign out of NeonSpin?')) _doSignOut();
  });
}

async function _doSignIn() {
  const errEl     = document.getElementById('auth-error-msg');
  const loadEl    = document.getElementById('auth-loading');
  const signinBtn = document.getElementById('btn-google-signin');

  if (errEl)     errEl.classList.add('hidden');
  if (loadEl)    loadEl.classList.remove('hidden');
  if (signinBtn) signinBtn.disabled = true;

  try {
    const referralInput = document.getElementById('referral-input')?.value?.trim().toUpperCase() || '';
    // Store referral code temporarily so onAuthStateChanged can use it
    if (referralInput) lsSet('ns_pending_referral', referralInput);

    await signInWithPopup(auth, provider);
    // onAuthStateChanged will fire next — close modal there
  } catch (err) {
    console.error('[auth] Sign-in error:', err.code, err.message);
    if (errEl) {
      errEl.textContent = friendlyError(err.code);
      errEl.classList.remove('hidden');
    }
  } finally {
    if (loadEl)    loadEl.classList.add('hidden');
    if (signinBtn) signinBtn.disabled = false;
  }
}

async function _doSignOut() {
  try {
    await fbSignOut(auth);
  } catch (e) {
    console.error('[auth] Sign-out error:', e);
  }
}

// ── Auth observer ─────────────────────────────────────────────
export function initAuthObserver(onUserReady, onUserGone) {
  _onUserReady = onUserReady;
  _onUserGone  = onUserGone;

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      _currentUser = user;
      document.getElementById('auth-overlay')?.classList.add('hidden');
      _showUserAvatar(user);

      try {
        const profile = await _loadOrCreateProfile(user);
        _userProfile = profile;
        mergeProfile(profile);
        _onUserReady?.(profile);
      } catch (e) {
        console.error('[auth] Profile load error:', e);
        _onUserReady?.(null);
      }
    } else {
      _currentUser = null;
      _userProfile = null;
      _hideUserAvatar();
      _onUserGone?.();
    }
  });
}

function _showUserAvatar(user) {
  const avatarBtn  = document.getElementById('user-avatar-btn');
  const avatarText = document.getElementById('user-avatar-text');
  const signinBtn  = document.getElementById('btn-header-signin');

  if (avatarText) avatarText.textContent = (user.displayName || user.email || 'U')[0].toUpperCase();
  avatarBtn?.classList.remove('hidden');
  signinBtn?.classList.add('hidden');
}

function _hideUserAvatar() {
  document.getElementById('user-avatar-btn')?.classList.add('hidden');
  document.getElementById('btn-header-signin')?.classList.remove('hidden');
}

// ── Profile management ────────────────────────────────────────
async function _loadOrCreateProfile(user) {
  const userRef  = ref(db, PATHS.user(user.uid));
  const snapshot = await get(userRef);

  if (snapshot.exists()) {
    const profile = snapshot.val();
    // Update login streak + one-time login bonus
    return await _updateLogin(user, profile);
  } else {
    // New user — create profile
    return await _createProfile(user);
  }
}

async function _createProfile(user) {
  const referralCode    = generateReferralCode();
  const pendingReferral = lsGet('ns_pending_referral') || '';
  const firstLoginBonus = Math.floor(Math.random() * 81) + 20; // 20-100

  const profile = {
    uid:              user.uid,
    displayName:      user.displayName || 'Player',
    email:            user.email || '',
    photoURL:         user.photoURL || '',
    coins:            firstLoginBonus > 50 ? 0 : 0,
    exp:              firstLoginBonus,
    level:            1,
    spinCount:        0,
    streak:           1,
    lastLoginDay:     todayStr(),
    lastDailyReward:  0,
    referralCode,
    referredBy:       pendingReferral,
    milestonesAchieved: [],
    firstLoginDone:   true,
    joinedAt:         Date.now(),
    tasks:            {},
  };

  await set(ref(db, PATHS.user(user.uid)), profile);

  // Process referral bonus
  if (pendingReferral) {
    lsSet('ns_pending_referral', '');
    await _applyReferralBonus(pendingReferral, user.uid);
  }

  // Show first-login bonus popup
  window.__ns_showPopup?.('🎁', 'Welcome Bonus!', `You received +${firstLoginBonus} EXP as a new player!`);

  return profile;
}

async function _updateLogin(user, profile) {
  const today = todayStr();
  const yesterday = yesterdayStr();
  let updates = { displayName: user.displayName || profile.displayName };

  // Streak logic (bonus only — never forced)
  let streak = profile.streak || 0;
  if (profile.lastLoginDay === today) {
    // Already logged in today — no change
  } else if (profile.lastLoginDay === yesterday) {
    streak += 1;
    updates.streak = streak;
  } else {
    // Streak broken — reset but don't punish user
    streak = 1;
    updates.streak = 1;
  }

  updates.lastLoginDay = today;

  // Update in DB
  await update(ref(db, PATHS.user(user.uid)), updates);

  return { ...profile, ...updates };
}

async function _applyReferralBonus(code, newUid) {
  try {
    const usersRef = ref(db, PATHS.users);
    const snap = await get(usersRef);
    if (!snap.exists()) return;

    snap.forEach((child) => {
      const p = child.val();
      if (p.referralCode === code && child.key !== newUid) {
        // Give referrer bonus
        update(ref(db, PATHS.user(child.key)), {
          coins: (p.coins || 0) + 20,
          exp:   (p.exp   || 0) + 10,
        });
      }
    });
  } catch (e) {
    console.warn('[auth] Referral bonus error:', e);
  }
}

// ── Sync state → Firebase ─────────────────────────────────────
export async function syncUserStats(gameState) {
  const uid = getCurrentUid();
  if (!uid) return;

  try {
    await update(ref(db, PATHS.user(uid)), {
      coins:      gameState.coins,
      exp:        gameState.exp,
      level:      gameState.level,
      spinCount:  gameState.spinCount,
      streak:     gameState.streak,
      tasks:      gameState.tasks || {},
    });
  } catch (e) {
    console.warn('[auth] syncUserStats error:', e);
  }
}

// ── Redeem request ────────────────────────────────────────────
export async function submitRedeemRequest() {
  const uid  = getCurrentUid();
  const user = getCurrentUser();
  if (!uid || !user) {
    window.__ns_showPopup?.('🔒', 'Sign In Required', 'Please sign in to request a reward.');
    return;
  }

  const s = getState();
  const { REWARD_MIN_LEVEL } = await import('./config.js');

  if (s.level < REWARD_MIN_LEVEL) {
    window.__ns_showPopup?.('⚠️', 'Not Eligible',
      `You need to reach Level ${REWARD_MIN_LEVEL} to request a reward. Current level: ${s.level}`);
    return;
  }

  try {
    await push(ref(db, PATHS.rewardRequests), {
      uid:       uid,
      email:     user.email,
      name:      user.displayName,
      level:     s.level,
      coins:     s.coins,
      streak:    s.streak,
      status:    'pending',
      createdAt: Date.now(),
    });
    window.__ns_showPopup?.('✅', 'Request Sent!',
      'Your reward request has been submitted! The admin will review it within 24 hours.');
  } catch (e) {
    console.error('[auth] submitRedeemRequest error:', e);
    window.__ns_showPopup?.('❌', 'Error', 'Failed to submit. Please try again.');
  }
}

// ── Feedback submit ───────────────────────────────────────────
export async function submitFeedback() {
  const msg = document.getElementById('feedback-message')?.value?.trim();
  if (!msg) {
    window.__ns_showPopup?.('⚠️', 'Empty Feedback', 'Please write a message before submitting.');
    return;
  }

  const uid  = getCurrentUid();
  const user = getCurrentUser();
  const imgFile = document.getElementById('feedback-image')?.files?.[0];

  let imageURL = '';

  // Upload image to Cloudinary if provided
  if (imgFile) {
    try {
      const { CLOUDINARY } = await import('./config.js');
      const form = new FormData();
      form.append('file', imgFile);
      form.append('upload_preset', CLOUDINARY.uploadPreset);

      const res  = await fetch(CLOUDINARY.uploadUrl, { method: 'POST', body: form });
      const data = await res.json();
      imageURL   = data.secure_url || '';
    } catch (e) {
      console.warn('[auth] Cloudinary upload failed:', e);
    }
  }

  try {
    await push(ref(db, PATHS.feedback), {
      userId:    uid || 'guest',
      name:      user?.displayName || 'Guest',
      email:     user?.email || '',
      message:   msg,
      imageURL,
      timestamp: Date.now(),
    });

    // Clear form
    const msgEl = document.getElementById('feedback-message');
    if (msgEl) msgEl.value = '';
    const previewEl = document.getElementById('feedback-preview');
    if (previewEl) previewEl.classList.add('hidden');
    const fileNameEl = document.getElementById('file-name-display');
    if (fileNameEl) fileNameEl.textContent = '(optional)';

    window.__ns_showPopup?.('💬', 'Thanks!', 'Your feedback has been submitted. We read every message!');
    loadFeedbackList();
  } catch (e) {
    console.error('[auth] submitFeedback error:', e);
    window.__ns_showPopup?.('❌', 'Error', 'Failed to submit feedback. Please try again.');
  }
}

export async function loadFeedbackList() {
  const listEl = document.getElementById('feedback-list');
  if (!listEl) return;

  try {
    const snap = await get(ref(db, PATHS.feedback));
    if (!snap.exists()) { listEl.innerHTML = ''; return; }

    const items = [];
    snap.forEach((child) => items.push(child.val()));
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    listEl.innerHTML = items.slice(0, 5).map((f) => `
      <div class="feedback-item">
        <div class="feedback-item-header">
          <span class="feedback-item-name">${escHtml(f.name || 'Anonymous')}</span>
          <span class="feedback-item-time">${_timeAgo(f.timestamp)}</span>
        </div>
        <div>${escHtml(f.message || '')}</div>
        ${f.imageURL ? `<img src="${f.imageURL}" alt="Screenshot" loading="lazy" />` : ''}
      </div>
    `).join('');
  } catch (e) {
    // Silently fail — feedback list is non-critical
    console.warn('[auth] loadFeedbackList:', e.message);
  }
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Leaderboard ───────────────────────────────────────────────
export async function loadLeaderboard(sortBy = 'level') {
  const listEl = document.getElementById('leaderboard-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="lb-empty">Loading…</div>';

  try {
    const uid  = getCurrentUid();
    const snap = await get(ref(db, PATHS.users));

    let users = [];
    if (snap.exists()) {
      snap.forEach((child) => {
        const p = child.val();
        users.push({ uid: child.key, ...p });
      });
    }

    // Merge fake leaderboard players to make it look active
    const fakeUsers = _generateFakeLeaderboard(sortBy);
    const allUsers  = [...users, ...fakeUsers];

    // Sort
    allUsers.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

    // Top 20
    const top = allUsers.slice(0, 20);

    if (top.length === 0) {
      listEl.innerHTML = '<div class="lb-empty">No players yet — be the first!</div>';
      return;
    }

    listEl.innerHTML = top.map((p, i) => {
      const rank   = i + 1;
      const isMe   = p.uid === uid;
      const rClass = rank === 1 ? 'r1 top-1' : rank === 2 ? 'r2' : rank === 3 ? 'r3' : 'rn';
      const medal  = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const name   = escHtml(p.displayName || 'Player');
      const initials = name[0].toUpperCase();
      const score  = sortBy === 'level'  ? `Lv.${p.level || 1}`
                   : sortBy === 'coins'  ? `${p.coins || 0} 💰`
                   : `${p.streak || 0}🔥`;
      const meta   = `Lv.${p.level || 1} · ${p.coins || 0} coins`;

      return `
        <div class="lb-row ${isMe ? 'is-me' : ''} ${rank === 1 ? 'top-1' : ''}">
          <div class="lb-rank ${rClass}">${medal}</div>
          <div class="lb-avatar">${initials}</div>
          <div class="lb-info">
            <div class="lb-name">${name} ${isMe ? '(you)' : ''}</div>
            <div class="lb-meta">${meta}</div>
          </div>
          <div class="lb-score">${score}</div>
        </div>`;
    }).join('');

    // My rank card
    if (uid) {
      const myIdx = top.findIndex((p) => p.uid === uid);
      const rankCard = document.getElementById('my-rank-card');
      if (rankCard && myIdx >= 0) {
        document.getElementById('my-rank-num').textContent = `#${myIdx + 1}`;
        document.getElementById('my-rank-info').textContent =
          `${top[myIdx]?.displayName || 'You'} · Lv.${top[myIdx]?.level || 1}`;
        rankCard.classList.remove('hidden');
      }
    }
  } catch (e) {
    console.error('[auth] loadLeaderboard error:', e);
    listEl.innerHTML = `<div class="lb-empty">Loading failed. ${_generateFakeLeaderboardHTML(sortBy)}</div>`;
  }
}

function _generateFakeLeaderboard(sortBy) {
  const fakeNames = [
    ['Rahul_G',85,2340,12,8], ['AcePlayer',72,1980,10,6], ['Priya_22',68,1750,9,5],
    ['ZeroX',55,1560,8,4], ['NightOwl',49,1340,7,3], ['Kira99',44,1200,7,7],
    ['DarkStar',38,980,6,5], ['PhoenixK',35,870,5,3], ['ShadowRun',30,760,5,2],
    ['BlazePro',25,640,4,4], ['LunaX',22,580,4,1], ['ViperZ',18,490,3,6],
    ['Rocketeer',15,420,3,2], ['StormX',12,360,2,1], ['GamerRaj',10,310,2,3],
  ];
  return fakeNames.map(([name, coins, exp, level, streak]) => ({
    uid: `fake_${name}`,
    displayName: name,
    coins,
    exp,
    level,
    streak,
    isFake: true,
  }));
}

function _generateFakeLeaderboardHTML() { return ''; }

// ── Reward eligibility ────────────────────────────────────────
export function updateRewardEligibility() {
  const s = getState();
  const { REWARD_MIN_LEVEL, REWARD_MIN_STREAK } = { REWARD_MIN_LEVEL: 12, REWARD_MIN_STREAK: 7 };

  const levelOk  = s.level >= REWARD_MIN_LEVEL;
  const streakOk = s.streak >= REWARD_MIN_STREAK;
  const eligible  = levelOk && streakOk;

  // Level requirement
  document.getElementById('req-level-badge'  )?.setAttribute('textContent', `Lv. ${s.level}`);
  document.getElementById('req-level-badge'  ) && (document.getElementById('req-level-badge').textContent = `Lv. ${s.level}`);
  document.getElementById('req-level-status' ) && (document.getElementById('req-level-status').textContent = levelOk ? '✅' : '❌');
  document.getElementById('req-streak-badge' ) && (document.getElementById('req-streak-badge').textContent = `${s.streak} days`);
  document.getElementById('req-streak-status') && (document.getElementById('req-streak-status').textContent = streakOk ? '✅' : '❌');

  // Main eligibility card
  const icon    = document.getElementById('elig-icon');
  const title   = document.getElementById('elig-title');
  const subtitle = document.getElementById('elig-subtitle');
  const btn     = document.getElementById('btn-redeem');

  if (icon)    icon.textContent    = eligible ? '🎁' : '🔒';
  if (title)   title.textContent   = eligible ? 'You\'re Eligible!' : 'Not Yet Eligible';
  if (subtitle) subtitle.textContent = eligible
    ? 'Tap below to request your reward!'
    : `Reach Level ${REWARD_MIN_LEVEL} with a 7-day streak to unlock.`;

  if (btn) {
    btn.disabled = !eligible;
    btn.setAttribute('aria-disabled', String(!eligible));
  }
}

// ── Milestones ────────────────────────────────────────────────
export function renderMilestones(achieved = []) {
  const listEl = document.getElementById('milestone-list');
  if (!listEl) return;

  const { MILESTONES } = { MILESTONES: [] };
  // Import from config synchronously via the cached module
  import('./config.js').then(({ MILESTONES }) => {
    listEl.innerHTML = MILESTONES.map((m) => {
      const done = achieved.includes(m.id);
      return `
        <div class="milestone-item ${done ? 'achieved' : ''}">
          <div class="milestone-icon">${m.icon}</div>
          <div class="milestone-name">
            ${escHtml(m.name)}
            <span class="milestone-req">${escHtml(m.req)}</span>
          </div>
          <div class="milestone-reward">
            ${m.coins ? `+${m.coins}💰` : ''} ${m.exp ? `+${m.exp}⭐` : ''}
          </div>
          <div class="milestone-done">${done ? '✅' : '⬜'}</div>
        </div>`;
    }).join('');
  });
}

/* ═══════════════════════════════════════════════════════════════
   NEONSPIN — auth.js
   Google Sign-In (redirect flow) + User Profile management.
   Imported by: app.js

   FLOW:
   1. User taps "Continue with Google"
   2. signInWithRedirect() → page navigates away to Google
   3. Google authenticates → redirects BACK to your site
   4. getRedirectResult() on page load picks up the signed-in user
   5. onAuthStateChanged fires → we load/create the user profile
   6. Profile data is passed to app.js via the onUserReady callback

   WHY REDIRECT (not popup)?
   signInWithPopup() is blocked by mobile browsers because the
   popup is not triggered by a direct user tap (it goes through
   async module code first). Redirect works on all devices.

   REQUIRES (one-time Firebase Console setup):
   Authentication → Settings → Authorized domains → Add:
     neonspin-rewards.github.io
═══════════════════════════════════════════════════════════════ */

'use strict';
import {
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// ✅ FIXED: Realtime Database functions (NOT Firestore)
import {
  ref, get, set, update, push,
  query, orderByChild, equalTo, limitToFirst,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

import { auth, provider, db, CLOUDINARY, PATHS } from './firebase.js';
import {
  showEl, hideEl, setText,
  todayStr, yesterdayStr,
  generateReferralCode,
  levelFromExp,
  escapeHtml, lsGet, lsSet,
} from './utils.js';


/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const REFERRAL_BONUS_NEW   = 30;
const REFERRAL_BONUS_GIVER = 20;
const REWARD_MIN_LEVEL     = 10;
const REWARD_MIN_STREAK    = 7;

export const MILESTONES = [
  { id: 'first_spin', icon: '🎰', name: 'First Spin',   req: 'Spin the wheel once',   coins: 10,  exp: 0  },
  { id: 'level5',     icon: '🔥', name: 'Rising Star',  req: 'Reach Level 5',         coins: 50,  exp: 30 },
  { id: 'streak3',    icon: '⚡', name: '3-Day Streak', req: 'Login 3 days in a row', coins: 20,  exp: 20 },
  { id: 'coins100',   icon: '💰', name: 'Century Club', req: 'Earn 100 total coins',  coins: 0,   exp: 50 },
  { id: 'level10',    icon: '👑', name: 'Legend',       req: 'Reach Level 10',        coins: 100, exp: 0  },
  { id: 'streak7',    icon: '🌟', name: 'Devoted',      req: '7-day login streak',    coins: 50,  exp: 50 },
  { id: 'spins10',    icon: '🎡', name: 'Spin Master',  req: 'Spin 10 times',         coins: 30,  exp: 20 },
  { id: 'coins500',   icon: '🏦', name: 'Whale',        req: 'Earn 500 total coins',  coins: 0,   exp: 80 },
];


/* ═══════════════════════════════════════════════════════════════
   MODULE STATE (private)
═══════════════════════════════════════════════════════════════ */
let _currentUser     = null;
let _userProfile     = null;
let _leaderSort      = 'level';
let _authInitialised = false;


/* ═══════════════════════════════════════════════════════════════
   PUBLIC GETTERS
═══════════════════════════════════════════════════════════════ */
export const getCurrentUser    = () => _currentUser;
export const getCurrentUid     = () => _currentUser?.uid ?? null;
export const getUserProfile    = () => _userProfile;
export const isAuthInitialised = () => _authInitialised;


/* ═══════════════════════════════════════════════════════════════
   AUTH ERROR → READABLE MESSAGE
═══════════════════════════════════════════════════════════════ */
function friendlyError(code) {
  const map = {
    'auth/unauthorized-domain':
      '❌ Domain not authorised. Add "neonspin-rewards.github.io" to Firebase Console → Authentication → Authorized Domains.',
    'auth/popup-blocked':
      '🚫 Popup blocked. Please allow popups and try again.',
    'auth/popup-closed-by-user':
      '⚠️ Sign-in cancelled. Tap the button again.',
    'auth/network-request-failed':
      '📡 No internet. Please check your connection.',
    'auth/too-many-requests':
      '⏳ Too many attempts. Wait a minute and try again.',
    'auth/operation-not-allowed':
      '🔒 Google sign-in not enabled. Go to Firebase Console → Authentication.',
    'auth/redirect-cancelled-by-user':
      '⚠️ Sign-in cancelled. Tap the button again.',
    'auth/redirect-operation-pending':
      '⏳ Sign-in already in progress. Please wait…',
  };
  return map[code] || `Sign-in failed (${code || 'unknown'}). Please try again.`;
}


/* ═══════════════════════════════════════════════════════════════
   AUTH MODAL UI HELPERS
═══════════════════════════════════════════════════════════════ */
function showAuthError(msg) {
  const errEl  = document.getElementById('auth-error-msg');
  const loadEl = document.getElementById('auth-loading');
  const btn    = document.getElementById('btn-google-signin');
  const btnTxt = document.getElementById('signin-btn-text');
  if (errEl)  { errEl.textContent = msg; errEl.classList.remove('hidden'); }
  if (loadEl) { loadEl.classList.add('hidden'); }
  if (btn)    { btn.disabled = false; }
  if (btnTxt) { btnTxt.textContent = 'Continue with Google'; }
}

function showAuthLoading() {
  const errEl  = document.getElementById('auth-error-msg');
  const loadEl = document.getElementById('auth-loading');
  const btn    = document.getElementById('btn-google-signin');
  const btnTxt = document.getElementById('signin-btn-text');
  if (errEl)  { errEl.classList.add('hidden'); }
  if (loadEl) { loadEl.classList.remove('hidden'); }
  if (btn)    { btn.disabled = true; }
  if (btnTxt) { btnTxt.textContent = 'Redirecting…'; }
}


/* ═══════════════════════════════════════════════════════════════
   TERMS GATE
═══════════════════════════════════════════════════════════════ */
export function initTermsGate() {
  if (!lsGet('ns_terms_accepted')) {
    showEl('terms-overlay');
    hideEl('auth-overlay');
  } else {
    hideEl('terms-overlay');
  }

  document.getElementById('btn-accept-terms')?.addEventListener('click', () => {
    lsSet('ns_terms_accepted', '1');
    hideEl('terms-overlay');
    if (!_currentUser) showEl('auth-overlay');
  });

  document.getElementById('btn-reopen-terms')?.addEventListener('click', () => {
    hideEl('auth-overlay');
    showEl('terms-overlay');
  });
}


/* ═══════════════════════════════════════════════════════════════
   AUTH BUTTON WIRING
═══════════════════════════════════════════════════════════════ */
export function initAuthButtons() {
  document.getElementById('btn-header-signin')?.addEventListener('click', () => {
    if (!lsGet('ns_terms_accepted')) { showEl('terms-overlay'); return; }
    showEl('auth-overlay');
  });

  document.getElementById('btn-google-signin')?.addEventListener('click', handleGoogleSignIn);

  document.getElementById('user-avatar-btn')?.addEventListener('click', () => {
    if (confirm('Sign out of NeonSpin?')) handleSignOut();
  });

  document.getElementById('btn-guest-play')?.addEventListener('click', () => {
    hideEl('auth-overlay');
  });
}


/* ═══════════════════════════════════════════════════════════════
   GOOGLE SIGN-IN — REDIRECT FLOW
═══════════════════════════════════════════════════════════════ */
async function handleGoogleSignIn() {
  if (!lsGet('ns_terms_accepted')) {
    showEl('terms-overlay'); hideEl('auth-overlay'); return;
  }

  // Save referral code before page navigates away
  const refVal = (document.getElementById('referral-input')?.value || '').trim().toUpperCase();
  if (refVal) sessionStorage.setItem('ns_pending_referral', refVal);

  showAuthLoading();

  try {
     const result = await signInWithPopup(auth, provider);

if (result?.user) {
  hideEl('auth-overlay');
  document.getElementById('auth-loading')?.classList.add('hidden');
}
    // ↑ Page navigates to Google here. Code below does NOT run.
  } catch (err) {
    console.error('[Auth] Redirect error:', err);
    showAuthError(friendlyError(err.code));
  }
}

/** Called on every page load to catch the Google redirect return. */

async function handleSignOut() {
  try {
    await fbSignOut(auth);
    _currentUser = null;
    _userProfile = null;
    hideEl('user-avatar-btn');
    showEl('btn-header-signin');
    if (lsGet('ns_terms_accepted')) showEl('auth-overlay');
  } catch (err) {
    console.error('[Auth] Sign-out error:', err);
  }
}

export async function signOut() { return handleSignOut(); }


/* ═══════════════════════════════════════════════════════════════
   AUTH STATE OBSERVER
   Single source of truth for sign-in state.
   Calls onUserReady(profile) when user is signed in,
   calls onUserGone() when signed out.
═══════════════════════════════════════════════════════════════ */
export function initAuthObserver(onUserReady, onUserGone) {
  onAuthStateChanged(auth, async (user) => {
    const isFirstCall = !_authInitialised;
    _authInitialised  = true;

    if (user) {
      _currentUser = user;
      hideEl('auth-overlay');
      hideEl('btn-header-signin');
      showEl('user-avatar-btn');
      setText('user-avatar-text',
        (user.displayName?.[0] || user.email?.[0] || '?').toUpperCase()
      );
      await loadOrCreateUserProfile(user);
      await handleStreak();
      onUserReady?.(_userProfile);
    } else {
      _currentUser = null;
      _userProfile  = null;
      showEl('btn-header-signin');
      hideEl('user-avatar-btn');

      // FIX: On the very first auth check (page load) delay the auth
      // modal by 120ms so the loading screen has time to fade out first.
      // Without this, the auth modal and loading screen overlap briefly,
      // causing a visual flash / layout shift.
      const delay = isFirstCall ? 120 : 0;
      setTimeout(() => {
        if (lsGet('ns_terms_accepted') && !_currentUser) showEl('auth-overlay');
      }, delay);

      onUserGone?.();
    }
  });
}


/* ═══════════════════════════════════════════════════════════════
   LOAD OR CREATE USER PROFILE
═══════════════════════════════════════════════════════════════ */
async function loadOrCreateUserProfile(user) {
  const userRef = ref(db, PATHS.user(user.uid));
  try {
    const snap = await get(userRef);

    if (snap.exists()) {
      _userProfile = snap.val();
    } else {
      const bonusExp = Math.floor(Math.random() * 81) + 20;
      _userProfile = {
        uid: user.uid, email: user.email || '',
        displayName: user.displayName || 'Player',
        photoURL: user.photoURL || '',
        coins: 0, exp: bonusExp,
        level: levelFromExp(bonusExp),
        streak: 1, lastLoginDay: todayStr(),
        lastDailyReward: 0,
        referralCode: generateReferralCode(),
        referredBy: '', spinCount: 0,
        milestonesAchieved: [], joinedAt: Date.now(),
      };
      await set(userRef, _userProfile);

      const pendingRef = sessionStorage.getItem('ns_pending_referral');
      if (pendingRef) {
        sessionStorage.removeItem('ns_pending_referral');
        await applyReferralCode(user.uid, pendingRef, bonusExp);
      } else {
        window.__ns_showPopup?.('🎉', 'Welcome to NeonSpin!',
          `You earned +${bonusExp} bonus EXP! Spin the wheel to begin! 🚀`);
      }
    }
  } catch (err) {
    console.error('[Auth] Profile load error:', err);
    _userProfile = _userProfile || {
      uid: user.uid, coins: 0, exp: 0, level: 1,
      streak: 0, spinCount: 0, milestonesAchieved: [],
      referralCode: '', lastDailyReward: 0,
    };
  }
}


/* ═══════════════════════════════════════════════════════════════
   REFERRAL CODE
═══════════════════════════════════════════════════════════════ */
async function applyReferralCode(newUid, code, newUserExp) {
  if (!code || code.length < 4) {
    window.__ns_showPopup?.('🎉', 'Welcome!', `You got +${newUserExp} bonus EXP!`); return;
  }
  try {
    const snap = await get(
      query(ref(db, PATHS.users), orderByChild('referralCode'), equalTo(code), limitToFirst(1))
    );
    if (!snap.exists()) {
      window.__ns_showPopup?.('🎉', 'Welcome!', `You got +${newUserExp} bonus EXP!`); return;
    }
    const referrerUid = Object.keys(snap.val())[0];
    if (referrerUid === newUid) {
      window.__ns_showPopup?.('🎉', 'Welcome!', `You got +${newUserExp} bonus EXP!`); return;
    }
    const totalExp = newUserExp + REFERRAL_BONUS_NEW;
    await update(ref(db, PATHS.user(newUid)), { exp: totalExp, level: levelFromExp(totalExp), referredBy: code });
    _userProfile.exp = totalExp; _userProfile.level = levelFromExp(totalExp);
    const refData = snap.val()[referrerUid];
    const newRefExp = (refData.exp || 0) + REFERRAL_BONUS_GIVER;
    await update(ref(db, PATHS.user(referrerUid)), { exp: newRefExp, level: levelFromExp(newRefExp) });
    window.__ns_showPopup?.('🎁', 'Referral Bonus!',
      `Welcome! +${newUserExp} EXP + ${REFERRAL_BONUS_NEW} referral bonus! 🚀`);
  } catch (err) {
    console.error('[Auth] Referral error:', err);
    window.__ns_showPopup?.('🎉', 'Welcome!', `You got +${newUserExp} bonus EXP!`);
  }
}


/* ═══════════════════════════════════════════════════════════════
   STREAK
═══════════════════════════════════════════════════════════════ */
async function handleStreak() {
  if (!_currentUser || !_userProfile) return;
  const today = todayStr(), yesterday = yesterdayStr();
  const lastDay = _userProfile.lastLoginDay || '';
  if (lastDay === today) return;

  const newStreak = lastDay === yesterday ? (_userProfile.streak || 0) + 1 : 1;
  _userProfile.streak = newStreak;
  _userProfile.lastLoginDay = today;

  try {
    await update(ref(db, PATHS.user(_currentUser.uid)), { streak: newStreak, lastLoginDay: today });
  } catch (err) { console.error('[Auth] Streak error:', err); }

  if (newStreak > 1) {
    setTimeout(() => {
      const msg = newStreak >= REWARD_MIN_STREAK
        ? 'Incredible! You are eligible for a reward! 🏆'
        : 'Keep it up! Come back tomorrow!';
      window.__ns_showPopup?.('🔥', `${newStreak}-Day Streak!`, msg);
    }, 1200);
  }
}


/* ═══════════════════════════════════════════════════════════════
   SYNC STATS TO FIREBASE
   Uses update() — never overwrites the whole user document.
═══════════════════════════════════════════════════════════════ */
export async function syncUserStats(state) {
  if (!_currentUser) return;
  try {
    await update(ref(db, PATHS.user(_currentUser.uid)), {
      coins: state.coins, exp: state.exp, level: state.level,
      streak: state.streak, spinCount: state.spinCount,
      lastDailyReward: state.lastDailyReward,
    });
    _userProfile = { ..._userProfile, ...state };
  } catch (err) { console.error('[Auth] Sync error:', err); }
  checkMilestones(state);
  updateRewardEligibility(state);
}


/* ═══════════════════════════════════════════════════════════════
   LEADERBOARD
═══════════════════════════════════════════════════════════════ */
export async function loadLeaderboard(sortKey = 'level') {
  _leaderSort = sortKey;
  const listEl = document.getElementById('leaderboard-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="lb-loading">Loading…</div>';

  try {
    const snap = await get(
      query(ref(db, PATHS.users), orderByChild(sortKey), limitToFirst(50))
    );
    if (!snap.exists()) {
      listEl.innerHTML = '<div class="lb-empty">No players yet!</div>'; return;
    }

    const players = [];
    snap.forEach((child) => players.push({ uid: child.key, ...child.val() }));
    players.sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0));
    const top20 = players.slice(0, 20);

    listEl.innerHTML = '';
    top20.forEach((p, idx) => {
      const rank = idx + 1, isMe = _currentUser && p.uid === _currentUser.uid;
      const item = document.createElement('div');
      item.className = `lb-item${rank <= 3 ? ` rank-${rank}` : ''}${isMe ? ' my-entry' : ''}`;
      const rankLabel = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const initial = (p.displayName || p.email || '?')[0].toUpperCase();
      const rawName = (p.displayName || p.email?.split('@')[0] || 'Player').split(' ')[0];
      const safeName = escapeHtml(rawName.length > 14 ? rawName.slice(0, 13) + '…' : rawName);
      const val = sortKey === 'coins' ? `${p.coins ?? 0} 💰`
                : sortKey === 'streak' ? `${p.streak ?? 0} 🔥`
                : `Lv. ${p.level ?? 1}`;
      item.innerHTML = `
        <div class="lb-rank">${rankLabel}</div>
        <div class="lb-avatar">${escapeHtml(initial)}</div>
        <div class="lb-info">
          <div class="lb-name">${safeName}${isMe ? ' <span style="color:var(--neon-green);font-size:.65rem;">(You)</span>' : ''}</div>
          <div class="lb-sub">Lv. ${p.level ?? 1} · ${p.streak ?? 0}🔥</div>
        </div>
        <div class="lb-value">${val}</div>
      `;
      listEl.appendChild(item);
      if (isMe && _userProfile) {
        document.getElementById('my-rank-card')?.classList.remove('hidden');
        setText('my-rank-num', `#${rank}`);
        setText('my-rank-info', `Lv. ${_userProfile.level}`);
      }
    });
  } catch (err) {
    console.error('[Auth] Leaderboard error:', err);
    listEl.innerHTML = '<div class="lb-empty">Failed to load. Please try again.</div>';
  }
}


/* ═══════════════════════════════════════════════════════════════
   REWARD ELIGIBILITY
═══════════════════════════════════════════════════════════════ */
export function updateRewardEligibility(state) {
  const levelOk  = (state.level  || 1) >= REWARD_MIN_LEVEL;
  const streakOk = (state.streak || 0) >= REWARD_MIN_STREAK;

  document.getElementById('req-level-row')?.classList.toggle('met', levelOk);
  document.getElementById('req-streak-row')?.classList.toggle('met', streakOk);
  setText('req-level-badge',   `Lv. ${state.level ?? 1}`);
  setText('req-streak-badge',  `${state.streak ?? 0} days`);
  setText('req-level-status',  levelOk  ? '✅' : '❌');
  setText('req-streak-status', streakOk ? '✅' : '❌');

  const btn = document.getElementById('btn-redeem');
  if (btn) {
    const eligible = levelOk && streakOk;
    btn.disabled = !eligible;
    btn.setAttribute('aria-disabled', String(!eligible));
    setText('elig-icon',     eligible ? '🎁' : '🔒');
    setText('elig-title',    eligible ? "You're Eligible!" : 'Not Yet Eligible');
    setText('elig-subtitle', eligible
      ? 'Tap below to request your reward.'
      : `Need Level ${REWARD_MIN_LEVEL} & ${REWARD_MIN_STREAK}-day streak.`);
  }
}


/* ═══════════════════════════════════════════════════════════════
   REDEEM REQUEST
═══════════════════════════════════════════════════════════════ */
export async function submitRedeemRequest(state) {
  if (!_currentUser || !_userProfile) {
    window.__ns_showPopup?.('🔒', 'Sign In Required', 'Please sign in to request a reward.'); return;
  }
  if ((state.level || 1) < REWARD_MIN_LEVEL || (state.streak || 0) < REWARD_MIN_STREAK) {
    window.__ns_showPopup?.('🔒', 'Not Eligible', 'Keep playing to meet the requirements!'); return;
  }
  try {
    const reqSnap = await get(
      query(ref(db, PATHS.rewardRequests), orderByChild('uid'), equalTo(_currentUser.uid), limitToFirst(5))
    );
    if (reqSnap.exists()) {
      let hasPending = false;
      reqSnap.forEach((c) => { if (c.val().status === 'pending') hasPending = true; });
      if (hasPending) {
        window.__ns_showPopup?.('⏳', 'Already Requested', 'You have a pending request. Please wait for admin approval.'); return;
      }
    }
    await push(ref(db, PATHS.rewardRequests), {
      uid: _currentUser.uid, email: _userProfile.email || '',
      name: _userProfile.displayName || 'Player',
      level: state.level, coins: state.coins, streak: state.streak,
      status: 'pending', createdAt: Date.now(),
    });
    window.__ns_showPopup?.('🎁', 'Request Submitted!', 'Our team will review within 24–48 hours. Check your email!');
  } catch (err) {
    console.error('[Auth] Redeem error:', err);
    window.__ns_showPopup?.('❌', 'Error', 'Failed to submit. Please try again.');
  }
}


/* ═══════════════════════════════════════════════════════════════
   MILESTONES
═══════════════════════════════════════════════════════════════ */
export function checkMilestones(state) {
  if (!_currentUser || !_userProfile || !state) return;
  const achieved = Array.isArray(_userProfile.milestonesAchieved)
    ? [..._userProfile.milestonesAchieved] : [];

  MILESTONES.forEach((m) => {
    if (achieved.includes(m.id)) return;
    let earned = false;
    switch (m.id) {
      case 'first_spin': earned = (state.spinCount || 0) >= 1;   break;
      case 'level5':     earned = (state.level     || 1) >= 5;   break;
      case 'streak3':    earned = (state.streak    || 0) >= 3;   break;
      case 'coins100':   earned = (state.coins     || 0) >= 100; break;
      case 'level10':    earned = (state.level     || 1) >= 10;  break;
      case 'streak7':    earned = (state.streak    || 0) >= 7;   break;
      case 'spins10':    earned = (state.spinCount || 0) >= 10;  break;
      case 'coins500':   earned = (state.coins     || 0) >= 500; break;
    }
    if (earned) {
      achieved.push(m.id);
      _userProfile.milestonesAchieved = achieved;
      if (m.coins > 0) window.__ns_giveReward?.('coins', m.coins);
      if (m.exp   > 0) window.__ns_giveReward?.('exp',   m.exp);
      update(ref(db, PATHS.user(_currentUser.uid)), { milestonesAchieved: achieved }).catch(console.error);
      const rewardTxt = [m.coins > 0 ? `+${m.coins} Coins` : '', m.exp > 0 ? `+${m.exp} EXP` : '']
        .filter(Boolean).join(' & ');
      setTimeout(() => window.__ns_showPopup?.(m.icon, `Milestone: ${m.name}!`, `${m.req} — Reward: ${rewardTxt}`), 800);
    }
  });
  renderMilestones(achieved);
}

export function renderMilestones(achievedIds = []) {
  const listEl = document.getElementById('milestone-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  MILESTONES.forEach((m) => {
    const done = achievedIds.includes(m.id);
    const item = document.createElement('div');
    item.className = `milestone-item${done ? ' achieved' : ''}`;
    const rewardTxt = [m.coins > 0 ? `+${m.coins}💰` : '', m.exp > 0 ? `+${m.exp}⭐` : '']
      .filter(Boolean).join(' ');
    item.innerHTML = `
      <div class="milestone-icon">${m.icon}</div>
      <div class="milestone-info">
        <div class="milestone-name">${escapeHtml(m.name)}</div>
        <div class="milestone-req">${escapeHtml(m.req)}</div>
      </div>
      <div class="milestone-badge">${done ? '✅ Earned' : rewardTxt}</div>
    `;
    listEl.appendChild(item);
  });
}


/* ═══════════════════════════════════════════════════════════════
   FEEDBACK
═══════════════════════════════════════════════════════════════ */
export async function submitFeedback() {
  if (!_currentUser) {
    window.__ns_showPopup?.('🔒', 'Sign In Required', 'Please sign in to submit feedback.'); return;
  }
  const msgEl  = document.getElementById('feedback-message');
  const fileEl = document.getElementById('feedback-image');
  const btnEl  = document.getElementById('btn-submit-feedback');
  const message = (msgEl?.value || '').trim();
  const file    = fileEl?.files?.[0];
  if (!message && !file) {
    window.__ns_showPopup?.('💬', 'Nothing to Submit', 'Please add a message or attach an image.'); return;
  }
  if (btnEl) { btnEl.disabled = true; btnEl.querySelector('.btn-text').textContent = 'Uploading…'; }
  try {
    let imageURL = '';
    if (file) {
      const fd = new FormData();
      fd.append('file', file); fd.append('upload_preset', CLOUDINARY.uploadPreset);
      const res = await fetch(CLOUDINARY.uploadUrl, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.secure_url) throw new Error(data.error?.message || 'Upload failed');
      imageURL = data.secure_url;
    }
    await push(ref(db, PATHS.feedback), {
      userId: _currentUser.uid, email: _userProfile?.email || '',
      name: _userProfile?.displayName || 'Anonymous',
      message, imageURL, timestamp: Date.now(),
    });
    if (msgEl) msgEl.value = '';
    if (fileEl) fileEl.value = '';
    document.getElementById('feedback-preview')?.classList.add('hidden');
    const lbl = document.getElementById('file-name-display');
    if (lbl) lbl.textContent = '(optional)';
    window.__ns_showPopup?.('📤', 'Feedback Sent!', 'Thank you for your feedback! 🙏');
    loadFeedbackList();
  } catch (err) {
    console.error('[Auth] Feedback error:', err);
    window.__ns_showPopup?.('❌', 'Upload Failed', 'Please check your connection and try again.');
  } finally {
    if (btnEl) { btnEl.disabled = false; btnEl.querySelector('.btn-text').textContent = 'Submit Feedback'; }
  }
}

export async function loadFeedbackList() {
  const listEl = document.getElementById('feedback-list');
  if (!listEl) return;
  try {
    const snap = await get(query(ref(db, PATHS.feedback), orderByChild('timestamp'), limitToFirst(50)));
    if (!snap.exists()) { listEl.innerHTML = '<p class="feedback-empty">No feedback yet — be the first!</p>'; return; }
    const items = [];
    snap.forEach((c) => items.push(c.val()));
    const recent = items.reverse().slice(0, 5);
    listEl.innerHTML = '';
    recent.forEach((f) => {
      const card = document.createElement('div');
      card.className = 'feedback-card';
      const dateStr = f.timestamp ? new Date(f.timestamp).toLocaleDateString() : '';
      card.innerHTML = `
        ${f.imageURL ? `<img class="feedback-img" src="${escapeHtml(f.imageURL)}" alt="Screenshot" loading="lazy"/>` : ''}
        <p class="feedback-text">${escapeHtml(f.message || '')}</p>
        <p class="feedback-ts">${escapeHtml(f.name || 'Anonymous')} · ${dateStr}</p>
      `;
      listEl.appendChild(card);
    });
  } catch (err) {
    console.error('[Auth] Load feedback error:', err);
    listEl.innerHTML = '<p class="feedback-empty">Could not load feedback.</p>';
  }
}

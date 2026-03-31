/* ═══════════════════════════════════════════════════════════════
   NEONSPIN — auth.js
   Handles everything that touches Firebase Auth + Firestore:
     • Terms acceptance gate
     • Google Sign-In / Sign-Out
     • First-login user profile creation (EXP bonus + referral code)
     • Referral code validation & bonus
     • Daily streak tracking
     • Real-time stat sync (coins / exp / level / streak → Firestore)
     • Leaderboard fetch & render
     • Reward eligibility check & redeem request
     • Feedback upload (Cloudinary image → Firestore)
     • Milestone awards
   
   Exports: syncUserStats(), loadLeaderboard(), submitFeedback(),
            signOut(), getCurrentUid()
═══════════════════════════════════════════════════════════════ */

'use strict';

import { auth, db, provider, CLOUDINARY, COL }
  from './firebase.js';

import {
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
  where,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const REFERRAL_BONUS_EXP = 30;      // EXP given to new user who uses a valid referral code
const REFERRAL_BONUS_GIVER = 20;    // EXP bonus for the person whose code was used
const DAILY_COOLDOWN_MS  = 24 * 60 * 60 * 1000;
const STREAK_WINDOW_MS   = 48 * 60 * 60 * 1000; // >24h gap resets streak
const REWARD_MIN_LEVEL   = 10;
const REWARD_MIN_STREAK  = 7;

/* ─── Milestone definitions ──────────────────────────────────── */
const MILESTONES = [
  { id: 'first_spin',   icon: '🎰', name: 'First Spin',      req: 'Spin the wheel once',        coins: 10,  exp: 0  },
  { id: 'level5',       icon: '🔥', name: 'Rising Star',     req: 'Reach Level 5',              coins: 50,  exp: 30 },
  { id: 'streak3',      icon: '⚡', name: '3-Day Streak',    req: 'Login 3 days in a row',       coins: 20,  exp: 20 },
  { id: 'coins100',     icon: '💰', name: 'Century Club',    req: 'Earn 100 total coins',        coins: 0,   exp: 50 },
  { id: 'level10',      icon: '👑', name: 'Legend',          req: 'Reach Level 10',             coins: 100, exp: 0  },
  { id: 'streak7',      icon: '🌟', name: 'Devoted',         req: 'Login 7 days in a row',       coins: 50,  exp: 50 },
  { id: 'spins10',      icon: '🎡', name: 'Spin Master',     req: 'Spin the wheel 10 times',    coins: 30,  exp: 20 },
  { id: 'coins500',     icon: '🏦', name: 'Whale',           req: 'Earn 500 total coins',        coins: 0,   exp: 80 },
];

/* ═══════════════════════════════════════════════════════════════
   MODULE STATE
═══════════════════════════════════════════════════════════════ */
let _currentUser    = null;   // Firebase user object
let _userProfile    = null;   // Firestore user doc data
let _leaderSort     = 'level';// current leaderboard sort key

/* ═══════════════════════════════════════════════════════════════
   UTILITY HELPERS
═══════════════════════════════════════════════════════════════ */

/** Generate a random 6-character alphanumeric referral code */
function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Calculate required EXP for a given level */
function expRequired(level) {
  return Math.floor(50 * Math.pow(level, 1.3));
}

/** Calculate level from total EXP using the custom curve */
function levelFromExp(totalExp) {
  let level = 1;
  let accumulated = 0;
  while (true) {
    const needed = expRequired(level);
    if (accumulated + needed > totalExp) break;
    accumulated += needed;
    level++;
    if (level > 1000) break; // safety cap
  }
  return level;
}

/** Today's date as "YYYY-MM-DD" string (for streak comparison) */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Yesterday's date string */
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ═══════════════════════════════════════════════════════════════
   DOM HELPERS — read UI elements safely
═══════════════════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

function showEl(id)  { const el = $(id); if (el) el.classList.remove('hidden'); }
function hideEl(id)  { const el = $(id); if (el) el.classList.add('hidden');    }
function setText(id, text) { const el = $(id); if (el) el.textContent = text;  }

/* ═══════════════════════════════════════════════════════════════
   TERMS GATE
   Shows terms modal on very first visit; blocks auth modal until
   user clicks "I Understand & Accept".
═══════════════════════════════════════════════════════════════ */
function initTermsGate() {
  const accepted = localStorage.getItem('ns_terms_accepted');

  if (!accepted) {
    // Show terms, hide auth until accepted
    showEl('terms-overlay');
    hideEl('auth-overlay');
  } else {
    // Terms already accepted — skip straight to auth check
    hideEl('terms-overlay');
  }

  $('btn-accept-terms')?.addEventListener('click', () => {
    localStorage.setItem('ns_terms_accepted', '1');
    hideEl('terms-overlay');
    // If not signed in after terms, show auth modal
    if (!_currentUser) showEl('auth-overlay');
  });

  // "Reopen terms" link inside auth modal
  $('btn-reopen-terms')?.addEventListener('click', () => {
    hideEl('auth-overlay');
    showEl('terms-overlay');
  });
}

/* ═══════════════════════════════════════════════════════════════
   GOOGLE SIGN-IN
═══════════════════════════════════════════════════════════════ */
function initAuthButtons() {
  // Header sign-in shortcut
  $('btn-header-signin')?.addEventListener('click', () => {
    const accepted = localStorage.getItem('ns_terms_accepted');
    if (!accepted) { showEl('terms-overlay'); return; }
    showEl('auth-overlay');
  });

  // Google sign-in button inside auth modal
  $('btn-google-signin')?.addEventListener('click', handleGoogleSignIn);

  // User avatar → sign out
  $('user-avatar-btn')?.addEventListener('click', () => {
    if (confirm('Sign out of NeonSpin?')) handleSignOut();
  });
}

async function handleGoogleSignIn() {
  const btn = $('btn-google-signin');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }

  try {
    // Read referral code from input before popup (popup closes the page on mobile)
    const referralInput = ($('referral-input')?.value || '').trim().toUpperCase();
    // Store it in sessionStorage so we can read it after redirect (popup is fine)
    if (referralInput) sessionStorage.setItem('ns_pending_referral', referralInput);

    await signInWithPopup(auth, provider);
    // onAuthStateChanged will fire and handle the rest
  } catch (err) {
    console.error('Sign-in error:', err);
    if (btn) {
      btn.disabled    = false;
      btn.textContent = 'Try Again';
      setTimeout(() => { btn.innerHTML = `<svg class="google-icon" width="20" height="20" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.96l3.007 2.332C4.672 5.163 6.656 3.58 9 3.58z"/></svg> Continue with Google`; }, 2000);
    }
  }
}

async function handleSignOut() {
  try {
    await fbSignOut(auth);
    // Reset local state — page reload is cleanest
    _currentUser  = null;
    _userProfile  = null;
    showEl('auth-overlay');
    hideEl('user-avatar-btn');
    showEl('btn-header-signin');
  } catch (err) {
    console.error('Sign-out error:', err);
  }
}

/* ─── Public export used by admin.js ─────────────────────────── */
export function getCurrentUid() {
  return _currentUser?.uid ?? null;
}

export async function signOut() {
  return handleSignOut();
}

/* ═══════════════════════════════════════════════════════════════
   AUTH STATE OBSERVER
   Single source of truth — runs on every page load and sign-in.
═══════════════════════════════════════════════════════════════ */
function initAuthObserver() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      _currentUser = user;
      hideEl('auth-overlay');
      hideEl('btn-header-signin');
      showEl('user-avatar-btn');

      // Set avatar initial
      const initial = (user.displayName?.[0] || user.email?.[0] || '?').toUpperCase();
      setText('user-avatar-text', initial);

      // Load or create user profile
      await loadOrCreateUserProfile(user);

      // Sync local state from Firestore
      applyProfileToLocalState(_userProfile);

      // Handle streak (daily login)
      await handleStreak();

      // Update UI
      updateHeaderAvatar(user);

    } else {
      // Not signed in
      _currentUser = null;
      _userProfile = null;
      showEl('btn-header-signin');
      hideEl('user-avatar-btn');
      // Show auth if terms already accepted
      if (localStorage.getItem('ns_terms_accepted')) {
        showEl('auth-overlay');
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   USER PROFILE — LOAD OR CREATE
═══════════════════════════════════════════════════════════════ */
async function loadOrCreateUserProfile(user) {
  const ref  = doc(db, COL.users, user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    // Returning user
    _userProfile = snap.data();
  } else {
    // ── First login ──────────────────────────────────────────
    const bonusExp  = Math.floor(Math.random() * 81) + 20; // 20–100
    const refCode   = generateReferralCode();

    _userProfile = {
      uid:          user.uid,
      email:        user.email,
      displayName:  user.displayName || 'Player',
      photoURL:     user.photoURL    || '',
      coins:        0,
      exp:          bonusExp,
      level:        levelFromExp(bonusExp),
      streak:       1,
      lastLoginDay: todayStr(),
      referralCode: refCode,
      referredBy:   '',
      spinCount:    0,
      milestonesAchieved: [],
      joinedAt:     serverTimestamp(),
    };

    await setDoc(ref, _userProfile);

    // Handle referral code entered at sign-in
    const pendingRef = sessionStorage.getItem('ns_pending_referral');
    if (pendingRef) {
      sessionStorage.removeItem('ns_pending_referral');
      await applyReferralCode(user.uid, pendingRef, bonusExp);
    } else {
      // Show welcome popup (only for brand new users with no referral code — handled here)
      showWelcomePopup(bonusExp);
    }
  }
}

async function applyReferralCode(newUid, code, newUserExp) {
  if (!code || code.length !== 6) { showWelcomePopup(newUserExp); return; }

  try {
    // Find the user who owns this code
    const q    = query(collection(db, COL.users), where('referralCode', '==', code), limit(1));
    const snap = await getDocs(q);

    if (snap.empty || snap.docs[0].id === newUid) {
      // Invalid code or self-referral
      showWelcomePopup(newUserExp);
      return;
    }

    const giverRef = doc(db, COL.users, snap.docs[0].id);

    // Bonus EXP for the new user
    const totalExp  = newUserExp + REFERRAL_BONUS_EXP;
    const newLevel  = levelFromExp(totalExp);

    await updateDoc(doc(db, COL.users, newUid), {
      exp: totalExp,
      level: newLevel,
      referredBy: code,
    });

    // Bonus EXP for the referrer
    const giverData = snap.docs[0].data();
    const giverExp  = (giverData.exp || 0) + REFERRAL_BONUS_GIVER;
    const giverLvl  = levelFromExp(giverExp);
    await updateDoc(giverRef, { exp: giverExp, level: giverLvl });

    // Update local profile
    _userProfile.exp   = totalExp;
    _userProfile.level = newLevel;
    _userProfile.referredBy = code;

    showWelcomePopup(newUserExp, REFERRAL_BONUS_EXP);
  } catch (err) {
    console.error('Referral apply error:', err);
    showWelcomePopup(newUserExp);
  }
}

function showWelcomePopup(bonusExp, referralBonus = 0) {
  const extra = referralBonus > 0
    ? ` Plus +${referralBonus} EXP referral bonus!`
    : '';
  window.__ns_showPopup?.(
    '🎉',
    'Welcome to NeonSpin!',
    `You've earned +${bonusExp} bonus EXP to start.${extra} Spin the wheel to begin! 🚀`
  );
}

/* ═══════════════════════════════════════════════════════════════
   STREAK TRACKING
   Rules:
     • First login of any given day = streak continues / starts
     • If last login was today already → no change
     • If last login was yesterday → streak++
     • If gap > 1 day → streak resets to 1
═══════════════════════════════════════════════════════════════ */
async function handleStreak() {
  if (!_currentUser || !_userProfile) return;

  const today     = todayStr();
  const yesterday = yesterdayStr();
  const lastDay   = _userProfile.lastLoginDay || '';

  if (lastDay === today) return; // Already counted today

  let newStreak = 1;
  if (lastDay === yesterday) {
    newStreak = (_userProfile.streak || 0) + 1;
  }

  _userProfile.streak       = newStreak;
  _userProfile.lastLoginDay = today;

  // Persist to Firestore
  try {
    await updateDoc(doc(db, COL.users, _currentUser.uid), {
      streak:       newStreak,
      lastLoginDay: today,
    });
  } catch (err) {
    console.error('Streak update error:', err);
  }

  // Notify local script.js of new streak value
  if (window.__ns_state) {
    window.__ns_state.streak = newStreak;
    window.__ns_saveState?.();
    window.__ns_updateStats?.();
    window.__ns_updateStreakChip?.(newStreak);
  }

  // Show streak popup for notable milestones
  if (newStreak > 1) {
    setTimeout(() => {
      window.__ns_showPopup?.(
        '🔥',
        `${newStreak}-Day Streak!`,
        newStreak >= 7
          ? 'Incredible dedication! You\'re almost eligible for a reward! 🏆'
          : 'Keep it up! Come back tomorrow to continue your streak!'
      );
    }, 1200);
  }

  // Check streak milestones
  checkMilestones();
}

/* ═══════════════════════════════════════════════════════════════
   SYNC LOCAL STATE → FIRESTORE
   Called by script.js whenever coins / exp / level changes.
   Exported so script.js can import it.
═══════════════════════════════════════════════════════════════ */
export async function syncUserStats(state) {
  if (!_currentUser) return;

  try {
    await updateDoc(doc(db, COL.users, _currentUser.uid), {
      coins:     state.coins,
      exp:       state.exp,
      level:     state.level,
      streak:    state.streak,
      spinCount: state.spinCount,
    });
    _userProfile = { ..._userProfile, ...state };
  } catch (err) {
    console.error('Stat sync error:', err);
  }

  // Check milestones after every stat change
  checkMilestones();
  updateRewardEligibility(state);
}

/* ═══════════════════════════════════════════════════════════════
   APPLY FIRESTORE PROFILE → LOCAL STATE
   Writes Firestore data into script.js's shared __ns_state object
═══════════════════════════════════════════════════════════════ */
function applyProfileToLocalState(profile) {
  if (!profile || !window.__ns_state) return;

  const s = window.__ns_state;
  s.coins     = profile.coins     ?? s.coins;
  s.exp       = profile.exp       ?? s.exp;
  s.level     = profile.level     ?? s.level;
  s.streak    = profile.streak    ?? s.streak;
  s.spinCount = profile.spinCount ?? s.spinCount;
  s.referralCode = profile.referralCode ?? '';

  window.__ns_saveState?.();
  window.__ns_updateStats?.();
  window.__ns_updateStreakChip?.(s.streak);

  // Set referral chip display
  const chip = document.getElementById('referral-code-display');
  if (chip) chip.textContent = profile.referralCode || '—';

  // Copy-to-clipboard on referral chip click
  const referralChip = document.querySelector('.referral-chip');
  if (referralChip && !referralChip._bound) {
    referralChip._bound = true;
    referralChip.addEventListener('click', () => {
      navigator.clipboard?.writeText(profile.referralCode || '').then(() => {
        window.__ns_showPopup?.('🔗', 'Copied!', `Your referral code ${profile.referralCode} has been copied to clipboard!`);
      });
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   LEADERBOARD
═══════════════════════════════════════════════════════════════ */
export async function loadLeaderboard(sortKey = 'level') {
  _leaderSort = sortKey;

  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML = '<div class="lb-loading">Loading…</div>';

  try {
    const q    = query(
      collection(db, COL.users),
      orderBy(sortKey, 'desc'),
      limit(20)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = '<div class="lb-empty">No players yet — be the first!</div>';
      return;
    }

    list.innerHTML = '';
    let myRank = null;
    let rank   = 1;

    snap.docs.forEach((docSnap) => {
      const p    = docSnap.data();
      const isMe = _currentUser && docSnap.id === _currentUser.uid;

      const item = document.createElement('div');
      item.className = `lb-item${rank <= 3 ? ` rank-${rank}` : ''}${isMe ? ' my-entry' : ''}`;

      const rankLabel = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const nameInitial = (p.displayName || p.email || '?')[0].toUpperCase();
      const displayName = p.displayName ? p.displayName.split(' ')[0] : (p.email?.split('@')[0] || 'Player');
      const safeDisplayName = displayName.length > 14 ? displayName.slice(0, 13) + '…' : displayName;

      const valueLabel = sortKey === 'level'
        ? `Lv. ${p.level ?? 1}`
        : sortKey === 'coins'
          ? `${p.coins ?? 0} 💰`
          : `${p.streak ?? 0} 🔥`;

      item.innerHTML = `
        <div class="lb-rank">${rankLabel}</div>
        <div class="lb-avatar">${nameInitial}</div>
        <div class="lb-info">
          <div class="lb-name">${safeDisplayName}${isMe ? ' <span style="color:var(--neon-green);font-size:0.65rem;">(You)</span>' : ''}</div>
          <div class="lb-sub">Lv. ${p.level ?? 1} · ${p.streak ?? 0}🔥 streak</div>
        </div>
        <div class="lb-value">${valueLabel}</div>
      `;

      list.appendChild(item);

      if (isMe) myRank = rank;
      rank++;
    });

    // Show "your rank" pinned card
    if (myRank && _userProfile) {
      const card = document.getElementById('my-rank-card');
      if (card) {
        card.classList.remove('hidden');
        setText('my-rank-num', `#${myRank}`);
        setText('my-rank-info', `Lv. ${_userProfile.level} · ${_userProfile.coins} coins`);
      }
    }

  } catch (err) {
    console.error('Leaderboard error:', err);
    list.innerHTML = '<div class="lb-empty">Failed to load — check your connection.</div>';
  }
}

/* ═══════════════════════════════════════════════════════════════
   REWARD ELIGIBILITY
═══════════════════════════════════════════════════════════════ */
function updateRewardEligibility(state) {
  const levelOk  = (state.level  || 1)  >= REWARD_MIN_LEVEL;
  const streakOk = (state.streak || 0)  >= REWARD_MIN_STREAK;

  // Requirement rows
  const levelRow  = document.getElementById('req-level-row');
  const streakRow = document.getElementById('req-streak-row');

  if (levelRow) levelRow.classList.toggle('met', levelOk);
  if (streakRow) streakRow.classList.toggle('met', streakOk);

  setText('req-level-badge',  `Lv. ${state.level ?? 1}`);
  setText('req-streak-badge', `${state.streak ?? 0} days`);
  setText('req-level-status',  levelOk  ? '✅' : '❌');
  setText('req-streak-status', streakOk ? '✅' : '❌');

  const redeemBtn = document.getElementById('btn-redeem');
  if (redeemBtn) {
    const eligible = levelOk && streakOk;
    redeemBtn.disabled  = !eligible;
    redeemBtn.setAttribute('aria-disabled', String(!eligible));

    if (eligible) {
      setText('elig-icon',     '🎁');
      setText('elig-title',    'You\'re Eligible!');
      setText('elig-subtitle', 'You meet the requirements. Tap to request your reward.');
    } else {
      setText('elig-icon',     '🔒');
      setText('elig-title',    'Not Yet Eligible');
      setText('elig-subtitle', `Need Level ${REWARD_MIN_LEVEL} & a ${REWARD_MIN_STREAK}-day streak.`);
    }
  }
}

/* ── Redeem request ────────────────────────────────────────── */
async function submitRedeemRequest() {
  if (!_currentUser || !_userProfile) {
    window.__ns_showPopup?.('🔒', 'Sign In Required', 'Please sign in to request a reward.');
    return;
  }

  const state = window.__ns_state;
  if (!state) return;

  const levelOk  = (state.level  || 1)  >= REWARD_MIN_LEVEL;
  const streakOk = (state.streak || 0)  >= REWARD_MIN_STREAK;
  if (!levelOk || !streakOk) return;

  try {
    // Check for already-pending request
    const existing = query(
      collection(db, COL.rewards),
      where('uid', '==', _currentUser.uid),
      where('status', '==', 'pending'),
      limit(1)
    );
    const existSnap = await getDocs(existing);
    if (!existSnap.empty) {
      window.__ns_showPopup?.('⏳', 'Already Requested', 'You already have a pending reward request. Please wait for admin approval.');
      return;
    }

    await addDoc(collection(db, COL.rewards), {
      uid:       _currentUser.uid,
      email:     _userProfile.email,
      name:      _userProfile.displayName,
      level:     state.level,
      coins:     state.coins,
      streak:    state.streak,
      status:    'pending',
      createdAt: serverTimestamp(),
    });

    window.__ns_showPopup?.('🎁', 'Request Submitted!', 'Your reward request has been sent! Our team will review it within 24–48 hours. Check your email for updates.');

  } catch (err) {
    console.error('Redeem error:', err);
    window.__ns_showPopup?.('❌', 'Error', 'Failed to submit request. Please try again.');
  }
}

/* ═══════════════════════════════════════════════════════════════
   MILESTONES
═══════════════════════════════════════════════════════════════ */
function checkMilestones() {
  if (!_currentUser || !_userProfile || !window.__ns_state) return;

  const state    = window.__ns_state;
  const achieved = _userProfile.milestonesAchieved || [];

  MILESTONES.forEach((m) => {
    if (achieved.includes(m.id)) return; // already earned

    let earned = false;
    switch (m.id) {
      case 'first_spin':  earned = (state.spinCount || 0) >= 1;   break;
      case 'level5':      earned = (state.level      || 1) >= 5;  break;
      case 'streak3':     earned = (state.streak     || 0) >= 3;  break;
      case 'coins100':    earned = (state.coins      || 0) >= 100;break;
      case 'level10':     earned = (state.level      || 1) >= 10; break;
      case 'streak7':     earned = (state.streak     || 0) >= 7;  break;
      case 'spins10':     earned = (state.spinCount  || 0) >= 10; break;
      case 'coins500':    earned = (state.coins      || 0) >= 500;break;
    }

    if (earned) {
      achieved.push(m.id);
      _userProfile.milestonesAchieved = achieved;

      // Give milestone rewards via script.js
      if (m.coins > 0) window.__ns_giveReward?.('coins', m.coins);
      if (m.exp   > 0) window.__ns_giveReward?.('exp',   m.exp);

      // Persist to Firestore
      updateDoc(doc(db, COL.users, _currentUser.uid), {
        milestonesAchieved: achieved,
      }).catch(console.error);

      // Show popup
      setTimeout(() => {
        window.__ns_showPopup?.(
          m.icon,
          `Milestone: ${m.name}!`,
          `${m.req} — Reward: ${m.coins > 0 ? `+${m.coins} Coins` : ''} ${m.exp > 0 ? `+${m.exp} EXP` : ''}!`
        );
      }, 800);
    }
  });

  // Re-render milestone list in rewards tab
  renderMilestones(achieved);
}

function renderMilestones(achievedIds) {
  const list = document.getElementById('milestone-list');
  if (!list) return;

  list.innerHTML = '';
  MILESTONES.forEach((m) => {
    const done = achievedIds.includes(m.id);
    const item = document.createElement('div');
    item.className = `milestone-item${done ? ' achieved' : ''}`;
    item.innerHTML = `
      <div class="milestone-icon">${m.icon}</div>
      <div class="milestone-info">
        <div class="milestone-name">${m.name}</div>
        <div class="milestone-req">${m.req}</div>
      </div>
      <div class="milestone-badge">
        ${done
          ? '✅ Earned'
          : `${m.coins > 0 ? `+${m.coins}💰` : ''} ${m.exp > 0 ? `+${m.exp}⭐` : ''}`
        }
      </div>
    `;
    list.appendChild(item);
  });
}

/* ═══════════════════════════════════════════════════════════════
   FEEDBACK SYSTEM (Cloudinary upload + Firestore save)
═══════════════════════════════════════════════════════════════ */
export async function submitFeedback() {
  if (!_currentUser) {
    window.__ns_showPopup?.('🔒', 'Sign In Required', 'Please sign in to submit feedback.');
    return;
  }

  const msgEl  = document.getElementById('feedback-message');
  const fileEl = document.getElementById('feedback-image');
  const btnEl  = document.getElementById('btn-submit-feedback');

  const message = (msgEl?.value || '').trim();
  const file    = fileEl?.files?.[0];

  if (!message && !file) {
    window.__ns_showPopup?.('💬', 'Nothing to submit', 'Please add a message or image.');
    return;
  }

  if (btnEl) { btnEl.disabled = true; btnEl.querySelector('.btn-text').textContent = 'Uploading…'; }

  try {
    let imageURL = '';

    // ── Upload image to Cloudinary if one is attached ──
    if (file) {
      const formData = new FormData();
      formData.append('file',          file);
      formData.append('upload_preset', CLOUDINARY.uploadPreset);
      formData.append('cloud_name',    CLOUDINARY.cloudName);

      const res  = await fetch(CLOUDINARY.uploadUrl, { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok || !data.secure_url) throw new Error(data.error?.message || 'Cloudinary upload failed');
      imageURL = data.secure_url;
    }

    // ── Save to Firestore ──
    await addDoc(collection(db, COL.feedback), {
      userId:    _currentUser.uid,
      email:     _userProfile?.email    || '',
      name:      _userProfile?.displayName || 'Anonymous',
      message,
      imageURL,
      timestamp: serverTimestamp(),
    });

    // Clear form
    if (msgEl)  { msgEl.value = ''; }
    if (fileEl) { fileEl.value = ''; }
    const preview = document.getElementById('feedback-preview');
    const label   = document.getElementById('file-name-display');
    if (preview) preview.classList.add('hidden');
    if (label)   label.textContent = '(optional)';

    window.__ns_showPopup?.('📤', 'Feedback Sent!', 'Thank you! Your feedback helps us improve NeonSpin. 🙏');

    // Reload feedback list
    loadFeedbackList();

  } catch (err) {
    console.error('Feedback submit error:', err);
    window.__ns_showPopup?.('❌', 'Upload Failed', 'Could not upload. Please check your connection and try again.');
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.querySelector('.btn-text').textContent = 'Submit Feedback';
    }
  }
}

/* ── Load recent feedback from Firestore and render it ─────── */
async function loadFeedbackList() {
  const listEl = document.getElementById('feedback-list');
  if (!listEl) return;

  try {
    const q    = query(
      collection(db, COL.feedback),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      listEl.innerHTML = '<p class="feedback-empty">No feedback yet — be the first!</p>';
      return;
    }

    listEl.innerHTML = '';
    snap.docs.forEach((docSnap) => {
      const f   = docSnap.data();
      const ts  = f.timestamp?.toDate?.() ?? new Date();
      const card = document.createElement('div');
      card.className = 'feedback-card';
      card.innerHTML = `
        ${f.imageURL ? `<img class="feedback-img" src="${f.imageURL}" alt="Feedback image" loading="lazy" />` : ''}
        <p class="feedback-text">${escapeHtml(f.message || '')}</p>
        <p class="feedback-ts">
          ${escapeHtml(f.name || 'Anonymous')} · ${ts.toLocaleDateString()}
        </p>
      `;
      listEl.appendChild(card);
    });
  } catch (err) {
    console.error('Load feedback error:', err);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════════════
   HEADER AVATAR & USER INFO
═══════════════════════════════════════════════════════════════ */
function updateHeaderAvatar(user) {
  const initial = (user.displayName?.[0] || user.email?.[0] || '?').toUpperCase();
  setText('user-avatar-text', initial);
  showEl('user-avatar-btn');
  hideEl('btn-header-signin');
}

/* ═══════════════════════════════════════════════════════════════
   TAB SWITCHING  (Bottom navigation)
═══════════════════════════════════════════════════════════════ */
function initTabNav() {
  const navBtns  = document.querySelectorAll('.nav-btn');
  const sections = document.querySelectorAll('.tab-section');

  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      // Update nav buttons
      navBtns.forEach((b) => {
        b.classList.toggle('active', b.dataset.tab === target);
        b.setAttribute('aria-selected', String(b.dataset.tab === target));
      });

      // Show/hide sections
      sections.forEach((sec) => {
        sec.classList.toggle('active', sec.id === `tab-${target}`);
      });

      // Lazy-load tab content
      if (target === 'leaderboard' && _currentUser) {
        loadLeaderboard(_leaderSort);
      }
      if (target === 'rewards' && window.__ns_state) {
        updateRewardEligibility(window.__ns_state);
        renderMilestones(_userProfile?.milestonesAchieved || []);
      }

      // Play click sound
      window.__ns_playSound?.('click');
    });
  });

  // Leaderboard sort filter buttons
  document.querySelectorAll('.lb-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lb-filter-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      loadLeaderboard(btn.dataset.sort);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   FEEDBACK FORM — UI BINDINGS (preview, submit)
═══════════════════════════════════════════════════════════════ */
function initFeedbackForm() {
  const fileEl   = document.getElementById('feedback-image');
  const preview  = document.getElementById('feedback-preview');
  const label    = document.getElementById('file-name-display');
  const submitBtn = document.getElementById('btn-submit-feedback');

  fileEl?.addEventListener('change', () => {
    const file = fileEl.files?.[0];
    if (!file) return;
    if (label) label.textContent = file.name.length > 20 ? file.name.slice(0, 18) + '…' : file.name;
    if (preview) {
      const url = URL.createObjectURL(file);
      preview.src = url;
      preview.classList.remove('hidden');
    }
  });

  submitBtn?.addEventListener('click', submitFeedback);
}

/* ═══════════════════════════════════════════════════════════════
   REWARD REDEEM BUTTON BINDING
═══════════════════════════════════════════════════════════════ */
function initRedeemButton() {
  document.getElementById('btn-redeem')?.addEventListener('click', submitRedeemRequest);
}

/* ═══════════════════════════════════════════════════════════════
   MINI-GAME TAB SWITCHING (within Games tab)
═══════════════════════════════════════════════════════════════ */
function initGameTabs() {
  document.querySelectorAll('.game-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.game;

      document.querySelectorAll('.game-tab-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });

      document.querySelectorAll('.mini-game-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `game-${target}`);
      });
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   INIT — entry point, called when DOM is ready
═══════════════════════════════════════════════════════════════ */
function init() {
  initTermsGate();
  initAuthButtons();
  initAuthObserver();
  initTabNav();
  initFeedbackForm();
  initRedeemButton();
  initGameTabs();

  // Load initial feedback
  loadFeedbackList();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

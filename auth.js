/* ═══════════════════════════════════════════════════════════════
   NEONSPIN — auth.js  (FIXED v3.1)

   KEY FIX: signInWithPopup → signInWithRedirect
   ─────────────────────────────────────────────────────────────
   WHY POPUP BROKE ON MOBILE:
   • Android Chrome blocks popups triggered from async / module code
     because it breaks the "direct user gesture" requirement.
   • signInWithRedirect sends the user to Google directly —
     no popup, no block, works on all mobile browsers.

   HOW REDIRECT FLOW WORKS:
   1. User taps "Continue with Google"
   2. signInWithRedirect() → page navigates to Google
   3. Google authenticates → redirects back to your site
   4. getRedirectResult() on page load picks up the signed-in user
   5. onAuthStateChanged fires → app loads normally

   ⚠️  ALSO REQUIRED IN FIREBASE CONSOLE (one-time setup):
   ─────────────────────────────────────────────────────────────
   console.firebase.google.com → neonspin-rewards-4101a
   → Authentication → Settings → Authorized domains → Add:
       neonspin-rewards.github.io
   Without this, Firebase rejects ALL auth with "unauthorized-domain".
═══════════════════════════════════════════════════════════════ */

'use strict';

import { auth, db, provider, CLOUDINARY, COL }
  from './firebase.js';

import {
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  doc, getDoc, setDoc, updateDoc,
  collection, query, orderBy, limit,
  getDocs, addDoc, serverTimestamp, where,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const REFERRAL_BONUS_EXP   = 30;
const REFERRAL_BONUS_GIVER = 20;
const REWARD_MIN_LEVEL     = 10;
const REWARD_MIN_STREAK    = 7;

const MILESTONES = [
  { id:'first_spin', icon:'🎰', name:'First Spin',    req:'Spin the wheel once',      coins:10,  exp:0  },
  { id:'level5',     icon:'🔥', name:'Rising Star',   req:'Reach Level 5',            coins:50,  exp:30 },
  { id:'streak3',    icon:'⚡', name:'3-Day Streak',  req:'Login 3 days in a row',    coins:20,  exp:20 },
  { id:'coins100',   icon:'💰', name:'Century Club',  req:'Earn 100 total coins',     coins:0,   exp:50 },
  { id:'level10',    icon:'👑', name:'Legend',        req:'Reach Level 10',           coins:100, exp:0  },
  { id:'streak7',    icon:'🌟', name:'Devoted',       req:'Login 7 days in a row',    coins:50,  exp:50 },
  { id:'spins10',    icon:'🎡', name:'Spin Master',   req:'Spin the wheel 10 times',  coins:30,  exp:20 },
  { id:'coins500',   icon:'🏦', name:'Whale',         req:'Earn 500 total coins',     coins:0,   exp:80 },
];

/* ═══════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════ */
let _currentUser = null;
let _userProfile = null;
let _leaderSort  = 'level';

/* ═══════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════ */
const $       = (id) => document.getElementById(id);
const showEl  = (id) => { const e=$(id); if(e) e.classList.remove('hidden'); };
const hideEl  = (id) => { const e=$(id); if(e) e.classList.add('hidden');    };
const setText = (id,t) => { const e=$(id); if(e) e.textContent=t;           };

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}
function expRequired(level) { return Math.floor(50 * Math.pow(level, 1.3)); }
function levelFromExp(totalExp) {
  let level=1, acc=0;
  while(true) {
    const n = expRequired(level);
    if(acc+n > totalExp) break;
    acc+=n; level++;
    if(level>1000) break;
  }
  return level;
}
function todayStr()     { return new Date().toISOString().slice(0,10); }
function yesterdayStr() { const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── Map Firebase error codes → readable messages ─────────────── */
function friendlyError(code) {
  const map = {
    'auth/unauthorized-domain':
      '❌ Domain not authorised in Firebase. The admin must add "neonspin-rewards.github.io" to Firebase Console → Authentication → Authorized Domains.',
    'auth/popup-blocked':
      '🚫 Popup blocked by browser. Please allow popups for this site and try again.',
    'auth/popup-closed-by-user':
      '⚠️ Sign-in was cancelled. Tap the button again to try.',
    'auth/network-request-failed':
      '📡 No internet connection. Please check your network and try again.',
    'auth/too-many-requests':
      '⏳ Too many attempts. Please wait a minute and try again.',
    'auth/user-cancelled':
      '⚠️ Sign-in was cancelled. Tap the button again.',
    'auth/operation-not-allowed':
      '🔒 Google sign-in is not enabled in Firebase Console → Authentication → Sign-in methods.',
    'auth/redirect-cancelled-by-user':
      '⚠️ Sign-in was cancelled. Tap the button again.',
    'auth/redirect-operation-pending':
      '⏳ A sign-in is already in progress. Please wait…',
  };
  return map[code] || `Sign-in failed (${code || 'unknown'}). Please try again.`;
}

/* ── Show error inside auth modal ─────────────────────────────── */
function showAuthError(msg) {
  const box     = $('auth-error-msg');
  const loading = $('auth-loading');
  const btn     = $('btn-google-signin');
  const btnText = $('signin-btn-text');
  if (box)     { box.textContent = msg; box.style.display = 'block'; }
  if (loading) { loading.style.display = 'none'; }
  if (btn)     { btn.disabled = false; }
  if (btnText) { btnText.textContent = 'Continue with Google'; }
}

function showAuthLoading() {
  const box     = $('auth-error-msg');
  const loading = $('auth-loading');
  const btn     = $('btn-google-signin');
  const btnText = $('signin-btn-text');
  if (box)     { box.style.display = 'none'; }
  if (loading) { loading.style.display = 'block'; }
  if (btn)     { btn.disabled = true; }
  if (btnText) { btnText.textContent = 'Redirecting…'; }
}

/* Expose globally so the inline <script> in index.html can also call them */
window.showAuthError   = showAuthError;
window.showAuthLoading = showAuthLoading;

/* ═══════════════════════════════════════════════════════════════
   TERMS GATE
═══════════════════════════════════════════════════════════════ */
function initTermsGate() {
  if (!localStorage.getItem('ns_terms_accepted')) {
    showEl('terms-overlay');
    hideEl('auth-overlay');
  } else {
    hideEl('terms-overlay');
  }

  // Backup listener (onclick="closeTerms()" in HTML is the primary handler)
  $('btn-accept-terms')?.addEventListener('click', () => {
    localStorage.setItem('ns_terms_accepted', '1');
    hideEl('terms-overlay');
    if (!_currentUser) showEl('auth-overlay');
  });

  $('btn-reopen-terms')?.addEventListener('click', () => {
    hideEl('auth-overlay');
    showEl('terms-overlay');
  });
}

/* ═══════════════════════════════════════════════════════════════
   GOOGLE SIGN-IN  ← REDIRECT FLOW (mobile-safe)
═══════════════════════════════════════════════════════════════ */
function initAuthButtons() {
  $('btn-header-signin')?.addEventListener('click', () => {
    if (!localStorage.getItem('ns_terms_accepted')) { showEl('terms-overlay'); return; }
    showEl('auth-overlay');
  });

  $('btn-google-signin')?.addEventListener('click', handleGoogleSignIn);

  $('user-avatar-btn')?.addEventListener('click', () => {
    if (confirm('Sign out of NeonSpin?')) handleSignOut();
  });
}

async function handleGoogleSignIn() {
  if (!localStorage.getItem('ns_terms_accepted')) {
    showEl('terms-overlay'); hideEl('auth-overlay'); return;
  }

  // Save referral code before page navigates away
  const refVal = ($('referral-input')?.value || '').trim().toUpperCase();
  if (refVal) sessionStorage.setItem('ns_pending_referral', refVal);

  showAuthLoading();

  try {
    // ── REDIRECT (not popup) ─────────────────────────────────────
    // This navigates the page to Google. When Google is done it
    // redirects back here. getRedirectResult() below handles return.
    await signInWithRedirect(auth, provider);
    // Code below this line does NOT execute (page has navigated away)
  } catch (err) {
    console.error('Redirect initiation error:', err);
    showAuthError(friendlyError(err.code));
  }
}

/* ── Called on every page load to pick up redirect result ─────── */
async function handleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      // Signed in via redirect — hide modal immediately
      hideEl('auth-overlay');
      const loading = $('auth-loading');
      if (loading) loading.style.display = 'none';
    }
    // If result is null this was a normal page load — do nothing
  } catch (err) {
    console.error('Redirect result error:', err);
    // Show the modal again with a friendly error message
    showEl('auth-overlay');
    showAuthError(friendlyError(err.code));
  }
}

async function handleSignOut() {
  try {
    await fbSignOut(auth);
    _currentUser = null; _userProfile = null;
    hideEl('user-avatar-btn');
    showEl('btn-header-signin');
    if (localStorage.getItem('ns_terms_accepted')) showEl('auth-overlay');
  } catch (err) { console.error('Sign-out error:', err); }
}

export function getCurrentUid() { return _currentUser?.uid ?? null; }
export async function signOut() { return handleSignOut(); }

/* ═══════════════════════════════════════════════════════════════
   AUTH STATE OBSERVER
═══════════════════════════════════════════════════════════════ */
function initAuthObserver() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      _currentUser = user;
      hideEl('auth-overlay');
      hideEl('btn-header-signin');
      showEl('user-avatar-btn');
      setText('user-avatar-text', (user.displayName?.[0] || user.email?.[0] || '?').toUpperCase());
      await loadOrCreateUserProfile(user);
      applyProfileToLocalState(_userProfile);
      await handleStreak();
      updateHeaderAvatar(user);
    } else {
      _currentUser = null; _userProfile = null;
      showEl('btn-header-signin');
      hideEl('user-avatar-btn');
      if (localStorage.getItem('ns_terms_accepted')) showEl('auth-overlay');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   USER PROFILE
═══════════════════════════════════════════════════════════════ */
async function loadOrCreateUserProfile(user) {
  const ref  = doc(db, COL.users, user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) { _userProfile = snap.data(); return; }

  const bonusExp = Math.floor(Math.random() * 81) + 20;
  _userProfile = {
    uid: user.uid, email: user.email,
    displayName: user.displayName || 'Player',
    photoURL: user.photoURL || '',
    coins: 0, exp: bonusExp,
    level: levelFromExp(bonusExp),
    streak: 1, lastLoginDay: todayStr(),
    referralCode: generateReferralCode(),
    referredBy: '', spinCount: 0,
    milestonesAchieved: [], joinedAt: serverTimestamp(),
  };
  await setDoc(ref, _userProfile);

  const pendingRef = sessionStorage.getItem('ns_pending_referral');
  if (pendingRef) { sessionStorage.removeItem('ns_pending_referral'); await applyReferralCode(user.uid, pendingRef, bonusExp); }
  else showWelcomePopup(bonusExp);
}

async function applyReferralCode(newUid, code, newUserExp) {
  if (!code || code.length < 4) { showWelcomePopup(newUserExp); return; }
  try {
    const q = query(collection(db, COL.users), where('referralCode','==',code), limit(1));
    const s = await getDocs(q);
    if (s.empty || s.docs[0].id === newUid) { showWelcomePopup(newUserExp); return; }
    const totalExp = newUserExp + REFERRAL_BONUS_EXP;
    await updateDoc(doc(db, COL.users, newUid), { exp:totalExp, level:levelFromExp(totalExp), referredBy:code });
    const gd = s.docs[0].data(), ge = (gd.exp||0)+REFERRAL_BONUS_GIVER;
    await updateDoc(doc(db, COL.users, s.docs[0].id), { exp:ge, level:levelFromExp(ge) });
    _userProfile.exp = totalExp; _userProfile.level = levelFromExp(totalExp);
    showWelcomePopup(newUserExp, REFERRAL_BONUS_EXP);
  } catch (err) { console.error('Referral error:',err); showWelcomePopup(newUserExp); }
}

function showWelcomePopup(bonus, refBonus=0) {
  const extra = refBonus > 0 ? ` Plus +${refBonus} EXP referral bonus!` : '';
  window.__ns_showPopup?.('🎉','Welcome to NeonSpin!',`You've earned +${bonus} bonus EXP to start.${extra} Spin the wheel to begin! 🚀`);
}

/* ═══════════════════════════════════════════════════════════════
   STREAK
═══════════════════════════════════════════════════════════════ */
async function handleStreak() {
  if (!_currentUser || !_userProfile) return;
  const today=todayStr(), yesterday=yesterdayStr(), lastDay=_userProfile.lastLoginDay||'';
  if (lastDay === today) return;
  const newStreak = lastDay===yesterday ? (_userProfile.streak||0)+1 : 1;
  _userProfile.streak=newStreak; _userProfile.lastLoginDay=today;
  try { await updateDoc(doc(db,COL.users,_currentUser.uid),{streak:newStreak,lastLoginDay:today}); }
  catch(err) { console.error('Streak error:',err); }
  if (window.__ns_state) { window.__ns_state.streak=newStreak; window.__ns_saveState?.(); window.__ns_updateStats?.(); window.__ns_updateStreakChip?.(newStreak); }
  if (newStreak>1) setTimeout(()=>window.__ns_showPopup?.('🔥',`${newStreak}-Day Streak!`, newStreak>=7?'Incredible dedication! Almost eligible for a reward! 🏆':'Keep it up! Come back tomorrow!'), 1200);
  checkMilestones();
}

/* ═══════════════════════════════════════════════════════════════
   SYNC TO FIRESTORE
═══════════════════════════════════════════════════════════════ */
export async function syncUserStats(state) {
  if (!_currentUser) return;
  try { await updateDoc(doc(db,COL.users,_currentUser.uid),{coins:state.coins,exp:state.exp,level:state.level,streak:state.streak,spinCount:state.spinCount}); _userProfile={..._userProfile,...state}; }
  catch(err) { console.error('Sync error:',err); }
  checkMilestones();
  updateRewardEligibility(state);
}

/* ═══════════════════════════════════════════════════════════════
   APPLY PROFILE → LOCAL STATE
═══════════════════════════════════════════════════════════════ */
function applyProfileToLocalState(profile) {
  if (!profile || !window.__ns_state) return;
  const s=window.__ns_state;
  s.coins=profile.coins??s.coins; s.exp=profile.exp??s.exp; s.level=profile.level??s.level;
  s.streak=profile.streak??s.streak; s.spinCount=profile.spinCount??s.spinCount;
  s.referralCode=profile.referralCode||'';
  window.__ns_saveState?.(); window.__ns_updateStats?.(); window.__ns_updateStreakChip?.(s.streak);
  const chip=document.getElementById('referral-code-display');
  if (chip) chip.textContent=profile.referralCode||'—';
  const rChip=document.querySelector('.referral-chip');
  if (rChip&&!rChip._bound) { rChip._bound=true; rChip.addEventListener('click',()=>{ navigator.clipboard?.writeText(profile.referralCode||'').then(()=>window.__ns_showPopup?.('🔗','Copied!',`Code ${profile.referralCode} copied to clipboard!`)); }); }
}

/* ═══════════════════════════════════════════════════════════════
   LEADERBOARD
═══════════════════════════════════════════════════════════════ */
export async function loadLeaderboard(sortKey='level') {
  _leaderSort=sortKey;
  const list=document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML='<div class="lb-loading">Loading…</div>';
  try {
    const snap=await getDocs(query(collection(db,COL.users),orderBy(sortKey,'desc'),limit(20)));
    if (snap.empty) { list.innerHTML='<div class="lb-empty">No players yet!</div>'; return; }
    list.innerHTML=''; let rank=1;
    snap.docs.forEach((d)=>{
      const p=d.data(), isMe=_currentUser&&d.id===_currentUser.uid;
      const item=document.createElement('div');
      item.className=`lb-item${rank<=3?` rank-${rank}`:''}${isMe?' my-entry':''}`;
      const rl=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':`#${rank}`;
      const ni=(p.displayName||p.email||'?')[0].toUpperCase();
      const dn=(p.displayName||p.email?.split('@')[0]||'Player').split(' ')[0];
      const sn=dn.length>14?dn.slice(0,13)+'…':dn;
      const val=sortKey==='level'?`Lv. ${p.level??1}`:sortKey==='coins'?`${p.coins??0} 💰`:`${p.streak??0} 🔥`;
      item.innerHTML=`<div class="lb-rank">${rl}</div><div class="lb-avatar">${ni}</div><div class="lb-info"><div class="lb-name">${sn}${isMe?' <span style="color:var(--neon-green);font-size:.65rem;">(You)</span>':''}</div><div class="lb-sub">Lv. ${p.level??1} · ${p.streak??0}🔥</div></div><div class="lb-value">${val}</div>`;
      list.appendChild(item);
      if (isMe&&_userProfile) { const card=document.getElementById('my-rank-card'); if(card){card.classList.remove('hidden');setText('my-rank-num',`#${rank}`);setText('my-rank-info',`Lv. ${_userProfile.level}`);} }
      rank++;
    });
  } catch(err) { console.error('Leaderboard error:',err); list.innerHTML='<div class="lb-empty">Failed to load.</div>'; }
}

/* ═══════════════════════════════════════════════════════════════
   REWARD ELIGIBILITY
═══════════════════════════════════════════════════════════════ */
function updateRewardEligibility(state) {
  const lo=(state.level||1)>=REWARD_MIN_LEVEL, so=(state.streak||0)>=REWARD_MIN_STREAK;
  document.getElementById('req-level-row')?.classList.toggle('met',lo);
  document.getElementById('req-streak-row')?.classList.toggle('met',so);
  setText('req-level-badge',`Lv. ${state.level??1}`); setText('req-streak-badge',`${state.streak??0} days`);
  setText('req-level-status',lo?'✅':'❌'); setText('req-streak-status',so?'✅':'❌');
  const btn=document.getElementById('btn-redeem');
  if (btn) { const e=lo&&so; btn.disabled=!e; btn.setAttribute('aria-disabled',String(!e)); setText('elig-icon',e?'🎁':'🔒'); setText('elig-title',e?"You're Eligible!":'Not Yet Eligible'); setText('elig-subtitle',e?'Tap to request your reward.':`Need Level ${REWARD_MIN_LEVEL} & ${REWARD_MIN_STREAK}-day streak.`); }
}

async function submitRedeemRequest() {
  if (!_currentUser||!_userProfile) { window.__ns_showPopup?.('🔒','Sign In Required','Please sign in to request a reward.'); return; }
  const state=window.__ns_state; if (!state) return;
  if ((state.level||1)<REWARD_MIN_LEVEL||(state.streak||0)<REWARD_MIN_STREAK) return;
  try {
    const ex=await getDocs(query(collection(db,COL.rewards),where('uid','==',_currentUser.uid),where('status','==','pending'),limit(1)));
    if (!ex.empty) { window.__ns_showPopup?.('⏳','Already Requested','You have a pending request. Please wait for admin approval.'); return; }
    await addDoc(collection(db,COL.rewards),{uid:_currentUser.uid,email:_userProfile.email,name:_userProfile.displayName,level:state.level,coins:state.coins,streak:state.streak,status:'pending',createdAt:serverTimestamp()});
    window.__ns_showPopup?.('🎁','Request Submitted!','Our team will review it within 24–48 hours. Check your email!');
  } catch(err) { console.error('Redeem error:',err); window.__ns_showPopup?.('❌','Error','Failed to submit. Please try again.'); }
}

/* ═══════════════════════════════════════════════════════════════
   MILESTONES
═══════════════════════════════════════════════════════════════ */
function checkMilestones() {
  if (!_currentUser||!_userProfile||!window.__ns_state) return;
  const state=window.__ns_state, achieved=_userProfile.milestonesAchieved||[];
  MILESTONES.forEach((m)=>{
    if (achieved.includes(m.id)) return;
    let earned=false;
    switch(m.id){case 'first_spin':earned=(state.spinCount||0)>=1;break;case 'level5':earned=(state.level||1)>=5;break;case 'streak3':earned=(state.streak||0)>=3;break;case 'coins100':earned=(state.coins||0)>=100;break;case 'level10':earned=(state.level||1)>=10;break;case 'streak7':earned=(state.streak||0)>=7;break;case 'spins10':earned=(state.spinCount||0)>=10;break;case 'coins500':earned=(state.coins||0)>=500;break;}
    if (earned){achieved.push(m.id);_userProfile.milestonesAchieved=achieved;if(m.coins>0)window.__ns_giveReward?.('coins',m.coins);if(m.exp>0)window.__ns_giveReward?.('exp',m.exp);updateDoc(doc(db,COL.users,_currentUser.uid),{milestonesAchieved:achieved}).catch(console.error);setTimeout(()=>window.__ns_showPopup?.(m.icon,`Milestone: ${m.name}!`,`${m.req} — Reward: ${m.coins>0?`+${m.coins} Coins`:''} ${m.exp>0?`+${m.exp} EXP`:''}`),800);}
  });
  renderMilestones(achieved);
}

function renderMilestones(ids) {
  const list=document.getElementById('milestone-list'); if(!list) return;
  list.innerHTML='';
  MILESTONES.forEach((m)=>{
    const done=ids.includes(m.id), item=document.createElement('div');
    item.className=`milestone-item${done?' achieved':''}`;
    item.innerHTML=`<div class="milestone-icon">${m.icon}</div><div class="milestone-info"><div class="milestone-name">${m.name}</div><div class="milestone-req">${m.req}</div></div><div class="milestone-badge">${done?'✅ Earned':`${m.coins>0?`+${m.coins}💰`:''} ${m.exp>0?`+${m.exp}⭐`:''}`}</div>`;
    list.appendChild(item);
  });
}

/* ═══════════════════════════════════════════════════════════════
   FEEDBACK
═══════════════════════════════════════════════════════════════ */
export async function submitFeedback() {
  if (!_currentUser){window.__ns_showPopup?.('🔒','Sign In Required','Please sign in to submit feedback.');return;}
  const msgEl=$('feedback-message'),fileEl=$('feedback-image'),btnEl=$('btn-submit-feedback');
  const message=(msgEl?.value||'').trim(), file=fileEl?.files?.[0];
  if (!message&&!file){window.__ns_showPopup?.('💬','Nothing to submit','Please add a message or image.');return;}
  if(btnEl){btnEl.disabled=true;btnEl.querySelector('.btn-text').textContent='Uploading…';}
  try {
    let imageURL='';
    if(file){const fd=new FormData();fd.append('file',file);fd.append('upload_preset',CLOUDINARY.uploadPreset);const res=await fetch(CLOUDINARY.uploadUrl,{method:'POST',body:fd});const data=await res.json();if(!res.ok||!data.secure_url)throw new Error(data.error?.message||'Upload failed');imageURL=data.secure_url;}
    await addDoc(collection(db,COL.feedback),{userId:_currentUser.uid,email:_userProfile?.email||'',name:_userProfile?.displayName||'Anonymous',message,imageURL,timestamp:serverTimestamp()});
    if(msgEl)msgEl.value='';if(fileEl)fileEl.value='';
    const preview=$('feedback-preview'),lbl=$('file-name-display');
    if(preview)preview.classList.add('hidden');if(lbl)lbl.textContent='(optional)';
    window.__ns_showPopup?.('📤','Feedback Sent!','Thank you! 🙏');
    loadFeedbackList();
  } catch(err){console.error('Feedback error:',err);window.__ns_showPopup?.('❌','Upload Failed','Please check your connection.');}
  finally{if(btnEl){btnEl.disabled=false;btnEl.querySelector('.btn-text').textContent='Submit Feedback';}}
}

async function loadFeedbackList() {
  const listEl=$('feedback-list');if(!listEl)return;
  try {
    const snap=await getDocs(query(collection(db,COL.feedback),orderBy('timestamp','desc'),limit(5)));
    if(snap.empty){listEl.innerHTML='<p class="feedback-empty">No feedback yet — be the first!</p>';return;}
    listEl.innerHTML='';
    snap.docs.forEach((d)=>{const f=d.data(),ts=f.timestamp?.toDate?.()??new Date();const card=document.createElement('div');card.className='feedback-card';card.innerHTML=`${f.imageURL?`<img class="feedback-img" src="${f.imageURL}" alt="Feedback" loading="lazy" />`:''}<p class="feedback-text">${esc(f.message||'')}</p><p class="feedback-ts">${esc(f.name||'Anonymous')} · ${ts.toLocaleDateString()}</p>`;listEl.appendChild(card);});
  } catch(err){console.error('Load feedback error:',err);}
}

/* ═══════════════════════════════════════════════════════════════
   HEADER AVATAR
═══════════════════════════════════════════════════════════════ */
function updateHeaderAvatar(user) {
  setText('user-avatar-text',(user.displayName?.[0]||user.email?.[0]||'?').toUpperCase());
  showEl('user-avatar-btn'); hideEl('btn-header-signin');
}

/* ═══════════════════════════════════════════════════════════════
   TAB NAVIGATION
═══════════════════════════════════════════════════════════════ */
function initTabNav() {
  document.querySelectorAll('.nav-btn').forEach((btn)=>{
    btn.addEventListener('click',()=>{
      const t=btn.dataset.tab;
      document.querySelectorAll('.nav-btn').forEach((b)=>{b.classList.toggle('active',b.dataset.tab===t);b.setAttribute('aria-selected',String(b.dataset.tab===t));});
      document.querySelectorAll('.tab-section').forEach((s)=>{s.classList.toggle('active',s.id===`tab-${t}`);});
      if(t==='leaderboard'&&_currentUser) loadLeaderboard(_leaderSort);
      if(t==='rewards'&&window.__ns_state){updateRewardEligibility(window.__ns_state);renderMilestones(_userProfile?.milestonesAchieved||[]);}
      window.__ns_playSound?.('click');
    });
  });
  document.querySelectorAll('.lb-filter-btn').forEach((btn)=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.lb-filter-btn').forEach((b)=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-pressed',String(b===btn));});
      loadLeaderboard(btn.dataset.sort);
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   FEEDBACK FORM
═══════════════════════════════════════════════════════════════ */
function initFeedbackForm() {
  $('feedback-image')?.addEventListener('change',()=>{
    const file=$('feedback-image').files?.[0];if(!file)return;
    const lbl=$('file-name-display'),preview=$('feedback-preview');
    if(lbl)lbl.textContent=file.name.length>20?file.name.slice(0,18)+'…':file.name;
    if(preview){preview.src=URL.createObjectURL(file);preview.classList.remove('hidden');}
  });
  $('btn-submit-feedback')?.addEventListener('click',submitFeedback);
}

/* ═══════════════════════════════════════════════════════════════
   GAME TABS
═══════════════════════════════════════════════════════════════ */
function initGameTabs() {
  document.querySelectorAll('.game-tab-btn').forEach((btn)=>{
    btn.addEventListener('click',()=>{
      const t=btn.dataset.game;
      document.querySelectorAll('.game-tab-btn').forEach((b)=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-selected',String(b===btn));});
      document.querySelectorAll('.mini-game-panel').forEach((p)=>{p.classList.toggle('active',p.id===`game-${t}`);});
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
function init() {
  handleRedirectResult(); // ← must be first, handles Google return
  initTermsGate();
  initAuthButtons();
  initAuthObserver();
  initTabNav();
  initFeedbackForm();
  initGameTabs();
  document.getElementById('btn-redeem')?.addEventListener('click', submitRedeemRequest);
  loadFeedbackList();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

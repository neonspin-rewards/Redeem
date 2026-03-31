/* ═══════════════════════════════════════════════════════════════
   NEONSPIN — admin.js
   Full admin panel logic. Access restricted to:
     neonspin.dev@gmail.com

   Features:
     • Google Sign-In with email whitelist guard
     • Dashboard stats (users, rewards, feedback, highest level)
     • Users table — sortable, searchable, paginated (20/page)
     • Edit user coins / EXP / spins
     • Reward requests — approve / reject with Firestore update
     • Feedback viewer (with images)
     • Broadcast system (writes to Firestore broadcasts/ collection)
     • Export users as JSON
     • Toast notification system
     • Confirm modal before destructive actions
═══════════════════════════════════════════════════════════════ */

'use strict';

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  getCountFromServer,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ─── Firebase init (same config as firebase.js) ─────────────── */
const firebaseConfig = {
  apiKey:            'AIzaSyBPDul4R8nIYcLVwpw1snmukOI3mRLHbEg',
  authDomain:        'neonspin-rewards-4101a.firebaseapp.com',
  projectId:         'neonspin-rewards-4101a',
  storageBucket:     'neonspin-rewards-4101a.firebasestorage.app',
  messagingSenderId: '424031837123',
  appId:             '1:424031837123:web:4b5566d57d8fef3bc93b76',
};

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();

/* ─── Admin whitelist ────────────────────────────────────────── */
const ADMIN_EMAIL = 'neonspin.dev@gmail.com';

/* ─── Collection names ───────────────────────────────────────── */
const COL = {
  users:      'users',
  rewards:    'rewardRequests',
  feedback:   'feedback',
  broadcasts: 'broadcasts',
};

/* ═══════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════ */
let allUsers   = [];      // cached users array
let usersPage  = 1;
const PAGE_SIZE = 20;

let editTarget = null;    // { id, data } for edit modal
let confirmCb  = null;    // callback for confirm modal

/* ═══════════════════════════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════════════════════════ */
const $ = (id) => document.getElementById(id);

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

function show(id) { const el = $(id); if (el) el.classList.remove('hidden'); }
function hide(id) { const el = $(id); if (el) el.classList.add('hidden'); }

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Toast ──────────────────────────────────────────────────── */
let toastTimer = null;
function toast(msg, icon = '✅', duration = 3500) {
  const el = $('toast');
  setText('toast-icon', icon);
  setText('toast-msg',  msg);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

/* ── Confirm modal ──────────────────────────────────────────── */
function confirm(title, body, onOk) {
  setText('confirm-title', title);
  setText('confirm-body',  body);
  confirmCb = onOk;
  show('confirm-modal');
}

/* ═══════════════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════════════ */
async function handleAdminSignIn() {
  const btn = $('btn-google-admin');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
  setText('auth-error', '');

  try {
    await signInWithPopup(auth, provider);
    // onAuthStateChanged handles the rest
  } catch (err) {
    setText('auth-error', 'Sign-in failed. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Sign in with Google'; }
  }
}

function initAuth() {
  $('btn-google-admin')?.addEventListener('click', handleAdminSignIn);
  $('btn-signout')?.addEventListener('click', async () => {
    await signOut(auth);
    location.reload();
  });

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      show('auth-gate');
      hide('admin-shell');
      return;
    }

    // ── Access control: only the admin email may proceed ──────
    if (user.email !== ADMIN_EMAIL) {
      setText('auth-error', `❌ Access denied. Only ${ADMIN_EMAIL} can access the admin panel.`);
      signOut(auth);
      const btn = $('btn-google-admin');
      if (btn) { btn.disabled = false; btn.textContent = 'Sign in with Google'; }
      return;
    }

    // Admin verified — show shell
    hide('auth-gate');
    show('admin-shell');
    setText('admin-greeting', `👋 ${user.displayName || user.email}`);

    // Load initial data
    loadDashboard();
  });
}

/* ═══════════════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════════════ */
function initNav() {
  document.querySelectorAll('.nav-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.panel;

      // Activate nav link
      document.querySelectorAll('.nav-link').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // Show panel
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      $(`panel-${panelId}`)?.classList.add('active');

      // Lazy-load panel data
      switch (panelId) {
        case 'dashboard': loadDashboard();    break;
        case 'users':     loadUsers();        break;
        case 'rewards':   loadRewards();      break;
        case 'feedback':  loadFeedback();     break;
        case 'broadcast': loadBroadcasts();   break;
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════════════ */
async function loadDashboard() {
  try {
    // Count collections in parallel
    const [
      usersSnap,
      pendingSnap,
      approvedSnap,
      feedbackSnap,
    ] = await Promise.all([
      getCountFromServer(collection(db, COL.users)),
      getCountFromServer(query(collection(db, COL.rewards), where('status', '==', 'pending'))),
      getCountFromServer(query(collection(db, COL.rewards), where('status', '==', 'approved'))),
      getCountFromServer(collection(db, COL.feedback)),
    ]);

    setText('stat-total-users',      usersSnap.data().count);
    setText('stat-pending-rewards',  pendingSnap.data().count);
    setText('stat-approved-rewards', approvedSnap.data().count);
    setText('stat-feedback-count',   feedbackSnap.data().count);

    // Highest level & total coins — fetch top user by level
    const topLevelSnap = await getDocs(query(collection(db, COL.users), orderBy('level', 'desc'), limit(1)));
    if (!topLevelSnap.empty) {
      setText('stat-highest-level', topLevelSnap.docs[0].data().level ?? 1);
    }

    // Sum coins (fetch up to 500 users — good enough for dashboard)
    const coinsSnap = await getDocs(query(collection(db, COL.users), limit(500)));
    let totalCoins = 0;
    coinsSnap.docs.forEach((d) => { totalCoins += (d.data().coins || 0); });
    setText('stat-total-coins', totalCoins.toLocaleString());

    // Load recent reward requests in dashboard table
    await loadRecentRewardsForDash();

  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

async function loadRecentRewardsForDash() {
  const tbody = $('dash-rewards-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="loading-row"><div class="spinner"></div></td></tr>';

  try {
    const snap = await getDocs(
      query(collection(db, COL.rewards), orderBy('createdAt', 'desc'), limit(10))
    );

    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No reward requests yet.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    snap.docs.forEach((docSnap) => {
      const r = docSnap.data();
      const id = docSnap.id;
      tbody.innerHTML += buildRewardRow(id, r);
    });

    bindRewardActions(tbody);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Error loading data.</td></tr>';
  }
}

/* ═══════════════════════════════════════════════════════════════
   USERS
═══════════════════════════════════════════════════════════════ */
async function loadUsers(sortKey = 'level') {
  const tbody = $('users-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="11" class="loading-row"><div class="spinner"></div></td></tr>';

  try {
    const snap = await getDocs(query(collection(db, COL.users), orderBy(sortKey, 'desc'), limit(500)));
    allUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    usersPage = 1;
    renderUsersTable();
  } catch (err) {
    console.error('Load users error:', err);
    tbody.innerHTML = '<tr><td colspan="11" class="empty-row">Error loading users.</td></tr>';
  }
}

function renderUsersTable() {
  const tbody       = $('users-body');
  const searchTerm  = ($('user-search')?.value || '').toLowerCase().trim();
  const pageInfo    = $('page-info');
  const countLabel  = $('users-count-label');

  // Filter
  const filtered = allUsers.filter((u) => {
    if (!searchTerm) return true;
    return (
      (u.displayName || '').toLowerCase().includes(searchTerm) ||
      (u.email       || '').toLowerCase().includes(searchTerm) ||
      (u.referralCode|| '').toLowerCase().includes(searchTerm)
    );
  });

  // Paginate
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  if (usersPage > totalPages) usersPage = totalPages;
  const start  = (usersPage - 1) * PAGE_SIZE;
  const slice  = filtered.slice(start, start + PAGE_SIZE);

  if (pageInfo)  pageInfo.textContent  = `Page ${usersPage} / ${totalPages}`;
  if (countLabel) countLabel.textContent = `${filtered.length} users`;

  $('btn-prev-page').disabled = usersPage <= 1;
  $('btn-next-page').disabled = usersPage >= totalPages;

  if (!slice.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-row">No users found.</td></tr>';
    return;
  }

  tbody.innerHTML = slice.map((u, i) => {
    const rank    = start + i + 1;
    const joined  = fmtDate(u.joinedAt);
    const name    = escapeHtml(u.displayName || '—');
    const email   = escapeHtml(u.email       || '—');
    return `
      <tr>
        <td>${rank}</td>
        <td class="td-name">${name}</td>
        <td style="font-size:0.78rem;">${email}</td>
        <td><span class="level-badge">Lv. ${u.level ?? 1}</span></td>
        <td>${(u.coins ?? 0).toLocaleString()}</td>
        <td>${(u.exp   ?? 0).toLocaleString()}</td>
        <td><span class="streak-badge">🔥 ${u.streak ?? 0}</span></td>
        <td>${u.spinCount ?? 0}</td>
        <td style="font-family:monospace;font-size:0.78rem;">${escapeHtml(u.referralCode || '—')}</td>
        <td style="font-size:0.75rem;">${joined}</td>
        <td>
          <button class="btn btn-outline btn-sm" data-action="edit-user" data-id="${u.id}">✏️ Edit</button>
        </td>
      </tr>
    `;
  }).join('');

  // Bind edit buttons
  tbody.querySelectorAll('[data-action="edit-user"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const user = allUsers.find((u) => u.id === btn.dataset.id);
      if (user) openEditModal(user);
    });
  });
}

/* ─── Edit user modal ────────────────────────────────────────── */
function openEditModal(user) {
  editTarget = user;
  setText('edit-user-label', `Editing: ${user.displayName || user.email}`);
  $('edit-coins').value = user.coins  ?? 0;
  $('edit-exp').value   = user.exp    ?? 0;
  $('edit-spins').value = user.spins  ?? 0;
  show('edit-modal');
}

async function saveEditModal() {
  if (!editTarget) return;
  const newCoins = parseInt($('edit-coins').value, 10) || 0;
  const newExp   = parseInt($('edit-exp').value,   10) || 0;
  const newSpins = parseInt($('edit-spins').value, 10) || 0;

  try {
    await updateDoc(doc(db, COL.users, editTarget.id), {
      coins:     newCoins,
      exp:       newExp,
      spins:     newSpins,
    });
    toast(`✅ Updated ${editTarget.displayName || editTarget.email}`);
    hide('edit-modal');
    loadUsers($('user-sort')?.value || 'level');
  } catch (err) {
    console.error('Edit save error:', err);
    toast('❌ Save failed', '❌');
  }
}

/* ═══════════════════════════════════════════════════════════════
   REWARD REQUESTS
═══════════════════════════════════════════════════════════════ */
async function loadRewards() {
  const tbody      = $('rewards-body');
  const filterVal  = $('reward-filter')?.value || 'all';
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="8" class="loading-row"><div class="spinner"></div></td></tr>';

  try {
    let q = query(collection(db, COL.rewards), orderBy('createdAt', 'desc'), limit(100));
    if (filterVal !== 'all') {
      q = query(collection(db, COL.rewards), where('status', '==', filterVal), orderBy('createdAt', 'desc'), limit(100));
    }

    const snap = await getDocs(q);

    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No reward requests found.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    snap.docs.forEach((docSnap) => {
      tbody.innerHTML += buildRewardRow(docSnap.id, docSnap.data());
    });

    bindRewardActions(tbody);
  } catch (err) {
    console.error('Load rewards error:', err);
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Error loading requests.</td></tr>';
  }
}

function buildRewardRow(id, r) {
  const status   = r.status || 'pending';
  const badgeCls = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';
  const date     = fmtDate(r.createdAt);

  return `
    <tr>
      <td class="td-name">${escapeHtml(r.name || '—')}</td>
      <td style="font-size:0.78rem;">${escapeHtml(r.email || '—')}</td>
      <td><span class="level-badge">Lv. ${r.level ?? '?'}</span></td>
      <td>${r.coins ?? '?'}</td>
      <td><span class="streak-badge">🔥 ${r.streak ?? '?'}</span></td>
      <td><span class="status-badge ${badgeCls}">${status}</span></td>
      <td style="font-size:0.75rem;">${date}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        ${status === 'pending' ? `
          <button class="btn btn-approve btn-sm" data-action="approve" data-id="${id}">✅ Approve</button>
          <button class="btn btn-reject  btn-sm" data-action="reject"  data-id="${id}">❌ Reject</button>
        ` : `<span style="font-size:0.72rem;color:var(--text3);">No actions</span>`}
      </td>
    </tr>
  `;
}

function bindRewardActions(container) {
  container.querySelectorAll('[data-action="approve"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      confirm(
        'Approve Reward Request?',
        'This will mark the request as approved in Firestore. Remember to contact the user separately.',
        async () => {
          await updateRewardStatus(btn.dataset.id, 'approved');
        }
      );
    });
  });

  container.querySelectorAll('[data-action="reject"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      confirm(
        'Reject Reward Request?',
        'This will mark the request as rejected. This action cannot be undone easily.',
        async () => {
          await updateRewardStatus(btn.dataset.id, 'rejected');
        }
      );
    });
  });
}

async function updateRewardStatus(id, status) {
  try {
    await updateDoc(doc(db, COL.rewards, id), {
      status,
      resolvedAt:    serverTimestamp(),
      resolvedByEmail: auth.currentUser?.email || ADMIN_EMAIL,
    });
    toast(`✅ Request ${status}`);
    // Reload whichever panel is showing
    loadDashboard();
    loadRewards();
  } catch (err) {
    console.error('Update reward error:', err);
    toast('❌ Update failed', '❌');
  }
}

/* ═══════════════════════════════════════════════════════════════
   FEEDBACK
═══════════════════════════════════════════════════════════════ */
async function loadFeedback() {
  const grid = $('feedback-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';

  try {
    const snap = await getDocs(
      query(collection(db, COL.feedback), orderBy('timestamp', 'desc'), limit(50))
    );

    if (snap.empty) {
      grid.innerHTML = '<div class="empty-row">No feedback yet.</div>';
      return;
    }

    grid.innerHTML = '';
    snap.docs.forEach((docSnap) => {
      const f    = docSnap.data();
      const card = document.createElement('div');
      card.className = 'fb-card';
      card.innerHTML = `
        ${f.imageURL ? `<img class="fb-img" src="${escapeHtml(f.imageURL)}" alt="Feedback image" loading="lazy" />` : ''}
        <p class="fb-msg">${escapeHtml(f.message || '(no message)')}</p>
        <p class="fb-meta">
          ${escapeHtml(f.name || 'Anonymous')} · ${escapeHtml(f.email || '')} · ${fmtDate(f.timestamp)}
        </p>
        <div style="margin-top:8px;">
          <button class="btn btn-danger btn-sm" data-del-id="${docSnap.id}">🗑 Delete</button>
        </div>
      `;
      grid.appendChild(card);
    });

    // Bind delete buttons
    grid.querySelectorAll('[data-del-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        confirm('Delete Feedback?', 'This feedback will be permanently deleted from Firestore.', async () => {
          try {
            await deleteDoc(doc(db, COL.feedback, btn.dataset.delId));
            toast('🗑 Feedback deleted');
            loadFeedback();
          } catch (err) {
            toast('❌ Delete failed', '❌');
          }
        });
      });
    });

  } catch (err) {
    console.error('Load feedback error:', err);
    grid.innerHTML = '<div class="empty-row">Error loading feedback.</div>';
  }
}

/* ═══════════════════════════════════════════════════════════════
   BROADCAST
═══════════════════════════════════════════════════════════════ */
async function sendBroadcast() {
  const title = ($('broadcast-title')?.value || '').trim();
  const body  = ($('broadcast-body')?.value  || '').trim();

  if (!title || !body) {
    toast('⚠️ Title and message are required', '⚠️');
    return;
  }

  try {
    await addDoc(collection(db, COL.broadcasts), {
      title,
      body,
      sentBy:    auth.currentUser?.email || ADMIN_EMAIL,
      createdAt: serverTimestamp(),
    });
    toast('📢 Broadcast sent!');
    $('broadcast-title').value = '';
    $('broadcast-body').value  = '';
    loadBroadcasts();
  } catch (err) {
    console.error('Broadcast send error:', err);
    toast('❌ Failed to send broadcast', '❌');
  }
}

async function loadBroadcasts() {
  const tbody = $('broadcasts-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="loading-row"><div class="spinner"></div></td></tr>';

  try {
    const snap = await getDocs(
      query(collection(db, COL.broadcasts), orderBy('createdAt', 'desc'), limit(20))
    );

    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No broadcasts sent yet.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    snap.docs.forEach((docSnap) => {
      const b  = docSnap.data();
      const id = docSnap.id;
      tbody.innerHTML += `
        <tr>
          <td class="td-name">${escapeHtml(b.title || '—')}</td>
          <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(b.body || '—')}</td>
          <td style="font-size:0.78rem;">${escapeHtml(b.sentBy || '—')}</td>
          <td style="font-size:0.75rem;">${fmtDate(b.createdAt)}</td>
          <td>
            <button class="btn btn-danger btn-sm" data-del-broadcast="${id}">🗑</button>
          </td>
        </tr>
      `;
    });

    // Delete broadcast
    tbody.querySelectorAll('[data-del-broadcast]').forEach((btn) => {
      btn.addEventListener('click', () => {
        confirm('Delete Broadcast?', 'The broadcast message will be permanently removed from Firestore.', async () => {
          try {
            await deleteDoc(doc(db, COL.broadcasts, btn.dataset.delBroadcast));
            toast('🗑 Broadcast deleted');
            loadBroadcasts();
          } catch (err) {
            toast('❌ Delete failed', '❌');
          }
        });
      });
    });

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Error loading broadcasts.</td></tr>';
  }
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT USERS
═══════════════════════════════════════════════════════════════ */
function exportUsers() {
  if (!allUsers.length) {
    toast('⚠️ Load users first (Users panel)', '⚠️');
    return;
  }

  // Sanitise for export (remove any sensitive fields if needed in future)
  const exportData = allUsers.map((u) => ({
    uid:         u.id,
    displayName: u.displayName,
    email:       u.email,
    level:       u.level,
    coins:       u.coins,
    exp:         u.exp,
    streak:      u.streak,
    spinCount:   u.spinCount,
    referralCode:u.referralCode,
    joinedAt:    u.joinedAt?.toDate?.()?.toISOString?.() ?? '—',
  }));

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `neonspin-users-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`📥 Exported ${allUsers.length} users`);
}

/* ═══════════════════════════════════════════════════════════════
   BIND ALL UI EVENTS
═══════════════════════════════════════════════════════════════ */
function bindEvents() {
  /* ── Dashboard ── */
  $('dash-refresh')?.addEventListener('click', loadDashboard);

  /* ── Users ── */
  $('users-refresh')?.addEventListener('click', () => {
    usersPage = 1;
    loadUsers($('user-sort')?.value || 'level');
  });

  $('user-sort')?.addEventListener('change', () => {
    usersPage = 1;
    loadUsers($('user-sort').value);
  });

  $('user-search')?.addEventListener('input', () => {
    usersPage = 1;
    renderUsersTable();
  });

  $('btn-prev-page')?.addEventListener('click', () => {
    if (usersPage > 1) { usersPage--; renderUsersTable(); }
  });

  $('btn-next-page')?.addEventListener('click', () => {
    usersPage++;
    renderUsersTable();
  });

  /* ── Edit modal ── */
  $('edit-cancel')?.addEventListener('click', () => hide('edit-modal'));
  $('edit-save')?.addEventListener('click', saveEditModal);

  /* ── Rewards ── */
  $('rewards-refresh')?.addEventListener('click', loadRewards);
  $('reward-filter')?.addEventListener('change', loadRewards);

  /* ── Feedback ── */
  $('feedback-refresh')?.addEventListener('click', loadFeedback);

  /* ── Broadcast ── */
  $('btn-send-broadcast')?.addEventListener('click', sendBroadcast);
  $('broadcasts-refresh')?.addEventListener('click', loadBroadcasts);

  /* ── Settings ── */
  $('btn-export-users')?.addEventListener('click', exportUsers);

  /* ── Confirm modal ── */
  $('confirm-cancel')?.addEventListener('click', () => {
    hide('confirm-modal');
    confirmCb = null;
  });

  $('confirm-ok')?.addEventListener('click', async () => {
    hide('confirm-modal');
    if (typeof confirmCb === 'function') {
      await confirmCb();
      confirmCb = null;
    }
  });

  // Close modals on backdrop click
  $('confirm-modal')?.addEventListener('click', (e) => {
    if (e.target === $('confirm-modal')) {
      hide('confirm-modal');
      confirmCb = null;
    }
  });
  $('edit-modal')?.addEventListener('click', (e) => {
    if (e.target === $('edit-modal')) hide('edit-modal');
  });

  // ESC to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hide('confirm-modal');
      hide('edit-modal');
      confirmCb = null;
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */
function init() {
  initAuth();
  initNav();
  bindEvents();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

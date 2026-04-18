/* ================================================================
   admin/admin.js — NeonSpin Admin Panel
   Access restricted to: neonspin.dev@gmail.com

   Features:
   • Google sign-in (whitelist check)
   • Dashboard stats: users, requests, feedback, highest level
   • Users table: sortable, searchable, paginated (20/page)
   • Edit user: coins, EXP, spins
   • Reward requests: approve / reject
   • Feedback viewer with image thumbnails
   • Broadcast system (writes to DB broadcasts/)
   • Send redeem directly to a user
   • Export users as JSON
   • Toast notification system
================================================================ */

'use strict';

import { initializeApp } from
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

import {
  getAuth, GoogleAuthProvider,
  signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  getDatabase, ref, get, update, push, remove,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

/* ─── Firebase config ────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            'AIzaSyBPDul4R8nIYcLVwpw1snmukOI3mRLHbEg',
  authDomain:        'neonspin-rewards-4101a.firebaseapp.com',
  projectId:         'neonspin-rewards-4101a',
  storageBucket:     'neonspin-rewards-4101a.firebasestorage.app',
  messagingSenderId: '424031837123',
  appId:             '1:424031837123:web:4b5566d57d8fef3bc93b76',
  databaseURL:       'https://neonspin-rewards-4101a-default-rtdb.firebaseio.com',
};

const ADMIN_EMAIL = 'neonspin.dev@gmail.com';
const PAGE_SIZE   = 20;

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getDatabase(app);
const provider = new GoogleAuthProvider();

/* ─── State ──────────────────────────────────────────────── */
let _allUsers    = [];
let _filteredUsers = [];
let _currentPage = 0;

/* ─── Auth ───────────────────────────────────────────────── */
document.getElementById('btn-admin-login')?.addEventListener('click', async () => {
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    errEl.textContent = `Sign-in failed: ${e.message}`;
    errEl.style.display = 'block';
  }
});

document.getElementById('btn-admin-logout')?.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user && user.email === ADMIN_EMAIL) {
    document.getElementById('login-screen').style.display  = 'none';
    document.getElementById('dashboard').style.display     = 'block';
    document.getElementById('admin-name').textContent      = user.displayName || user.email;
    _loadDashboard();
  } else if (user) {
    // Wrong email — sign out and show error
    signOut(auth);
    const errEl = document.getElementById('login-error');
    errEl.textContent = '❌ Access denied. This panel is restricted to the admin account.';
    errEl.style.display = 'block';
  } else {
    document.getElementById('login-screen').style.display = '';
    document.getElementById('dashboard').style.display    = 'none';
  }
});

/* ─── Dashboard loader ───────────────────────────────────── */
async function _loadDashboard() {
  await Promise.all([_loadUsers(), _loadRequests(), _loadFeedback()]);
}

/* ─── Users ──────────────────────────────────────────────── */
async function _loadUsers() {
  const snap = await get(ref(db, 'users'));
  _allUsers = [];

  if (snap.exists()) {
    snap.forEach((child) => {
      _allUsers.push({ uid: child.key, ...child.val() });
    });
  }

  _allUsers.sort((a, b) => (b.level || 0) - (a.level || 0));
  _filteredUsers = [..._allUsers];
  _currentPage   = 0;

  // Stats
  _setText('stat-users', _allUsers.length);
  _setText('stat-max-level', _allUsers[0]?.level || 0);

  _renderUsersPage();

  // Search
  const searchEl = document.getElementById('user-search');
  searchEl?.addEventListener('input', () => {
    const q = searchEl.value.toLowerCase();
    _filteredUsers = _allUsers.filter((u) =>
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
    _currentPage = 0;
    _renderUsersPage();
  });

  // Pagination
  document.getElementById('btn-prev-page')?.addEventListener('click', () => {
    if (_currentPage > 0) { _currentPage--; _renderUsersPage(); }
  });
  document.getElementById('btn-next-page')?.addEventListener('click', () => {
    const maxPage = Math.ceil(_filteredUsers.length / PAGE_SIZE) - 1;
    if (_currentPage < maxPage) { _currentPage++; _renderUsersPage(); }
  });

  // Export
  document.getElementById('btn-export')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(_allUsers, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'neonspin-users.json'; a.click();
    URL.revokeObjectURL(url);
  });
}

function _renderUsersPage() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  const start  = _currentPage * PAGE_SIZE;
  const page   = _filteredUsers.slice(start, start + PAGE_SIZE);
  const total  = _filteredUsers.length;
  const maxPage = Math.ceil(total / PAGE_SIZE);

  _setText('page-info', `Page ${_currentPage + 1} / ${maxPage} (${total} users)`);

  if (page.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No users found.</td></tr>';
    return;
  }

  tbody.innerHTML = page.map((u) => `
    <tr>
      <td>${_esc(u.displayName || 'Unknown')}</td>
      <td style="color:var(--muted)">${_esc(u.email || '—')}</td>
      <td><strong style="color:var(--accent)">${u.level || 1}</strong></td>
      <td>${u.coins || 0}</td>
      <td>${u.exp || 0}</td>
      <td>${u.streak || 0} 🔥</td>
      <td style="color:var(--muted)">${u.joinedAt ? _dateStr(u.joinedAt) : '—'}</td>
      <td>
        <button class="btn btn-blue" onclick="_openEdit('${u.uid}')">✏️ Edit</button>
      </td>
    </tr>
  `).join('');
}

/* Edit user modal */
window._openEdit = function(uid) {
  const user = _allUsers.find((u) => u.uid === uid);
  if (!user) return;
  document.getElementById('edit-uid').value   = uid;
  document.getElementById('edit-coins').value  = user.coins || 0;
  document.getElementById('edit-exp').value    = user.exp || 0;
  document.getElementById('edit-spins').value  = user.spinCount || 0;
  document.getElementById('edit-modal').classList.add('open');
};

document.getElementById('btn-edit-cancel')?.addEventListener('click', () => {
  document.getElementById('edit-modal').classList.remove('open');
});

document.getElementById('btn-edit-save')?.addEventListener('click', async () => {
  const uid    = document.getElementById('edit-uid').value;
  const coins  = parseInt(document.getElementById('edit-coins').value || '0');
  const exp    = parseInt(document.getElementById('edit-exp').value || '0');
  const spins  = parseInt(document.getElementById('edit-spins').value || '0');

  if (!uid) return;
  try {
    await update(ref(db, `users/${uid}`), { coins, exp, spins });
    _toast('✅ User updated!');
    document.getElementById('edit-modal').classList.remove('open');
    // Refresh local list
    const u = _allUsers.find((x) => x.uid === uid);
    if (u) { u.coins = coins; u.exp = exp; u.spins = spins; }
    _renderUsersPage();
  } catch (e) {
    _toast('❌ Update failed: ' + e.message);
  }
});

/* ─── Reward Requests ─────────────────────────────────────── */
async function _loadRequests() {
  const snap = await get(ref(db, 'rewardRequests'));
  const tbody = document.getElementById('requests-tbody');
  if (!tbody) return;

  let rows = [];
  let pendingCount = 0;

  if (snap.exists()) {
    snap.forEach((child) => rows.push({ key: child.key, ...child.val() }));
  }

  rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  pendingCount = rows.filter((r) => r.status === 'pending').length;
  _setText('stat-pending', pendingCount);
  _setText('pending-count-badge', `${pendingCount} pending`);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No requests yet.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r) => `
    <tr id="req-row-${r.key}">
      <td>${_esc(r.name || '—')}</td>
      <td style="color:var(--muted)">${_esc(r.email || '—')}</td>
      <td><strong style="color:var(--accent)">${r.level || 1}</strong></td>
      <td>${r.coins || 0}</td>
      <td>${r.streak || 0}🔥</td>
      <td><span class="badge badge-${r.status || 'pending'}">${r.status || 'pending'}</span></td>
      <td style="color:var(--muted)">${r.createdAt ? _dateStr(r.createdAt) : '—'}</td>
      <td>
        ${r.status === 'pending' ? `
          <button class="btn btn-green" onclick="_approveReq('${r.key}')">✅ Approve</button>
          <button class="btn btn-red" onclick="_rejectReq('${r.key}')">❌ Reject</button>
        ` : '—'}
      </td>
    </tr>
  `).join('');
}

window._approveReq = async function(key) {
  await update(ref(db, `rewardRequests/${key}`), { status: 'approved' });
  _toast('✅ Request approved!');
  _loadRequests();
};

window._rejectReq = async function(key) {
  await update(ref(db, `rewardRequests/${key}`), { status: 'rejected' });
  _toast('Rejected.');
  _loadRequests();
};

/* ─── Feedback ───────────────────────────────────────────── */
async function _loadFeedback() {
  const snap  = await get(ref(db, 'feedback'));
  const tbody = document.getElementById('feedback-tbody');
  if (!tbody) return;

  let rows = [];
  if (snap.exists()) snap.forEach((c) => rows.push({ key: c.key, ...c.val() }));
  rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  _setText('stat-feedback', rows.length);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No feedback yet.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.slice(0, 50).map((f) => `
    <tr>
      <td>${_esc(f.name || 'Anonymous')}</td>
      <td style="max-width:280px;word-break:break-word">${_esc(f.message || '')}</td>
      <td>${f.imageURL ? `<img class="fb-img" src="${f.imageURL}" loading="lazy" alt="screenshot" />` : '—'}</td>
      <td style="color:var(--muted)">${f.timestamp ? _dateStr(f.timestamp) : '—'}</td>
      <td>
        <button class="btn btn-red" onclick="_deleteFeedback('${f.key}')">🗑</button>
      </td>
    </tr>
  `).join('');
}

window._deleteFeedback = async function(key) {
  if (!confirm('Delete this feedback?')) return;
  await remove(ref(db, `feedback/${key}`));
  _toast('🗑 Feedback deleted.');
  _loadFeedback();
};

/* ─── Broadcast ──────────────────────────────────────────── */
document.getElementById('btn-broadcast')?.addEventListener('click', async () => {
  const title = document.getElementById('bc-title')?.value?.trim();
  const msg   = document.getElementById('bc-msg')?.value?.trim();
  if (!title || !msg) { _toast('⚠️ Fill in both fields.'); return; }

  await push(ref(db, 'broadcasts'), {
    title,
    message: msg,
    createdAt: Date.now(),
    createdBy: auth.currentUser?.email || 'admin',
  });

  document.getElementById('bc-title').value = '';
  document.getElementById('bc-msg').value   = '';
  _toast('📣 Broadcast sent!');
});

/* ─── Send Redeem ────────────────────────────────────────── */
document.getElementById('btn-send-redeem')?.addEventListener('click', async () => {
  const uidOrEmail = document.getElementById('redeem-uid')?.value?.trim();
  const note       = document.getElementById('redeem-note')?.value?.trim();
  if (!uidOrEmail || !note) { _toast('⚠️ Fill in all fields.'); return; }

  // Find user by UID or email
  let targetUid = null;
  const byUid = _allUsers.find((u) => u.uid === uidOrEmail);
  if (byUid) {
    targetUid = byUid.uid;
  } else {
    const byEmail = _allUsers.find((u) => (u.email || '').toLowerCase() === uidOrEmail.toLowerCase());
    if (byEmail) targetUid = byEmail.uid;
  }

  if (!targetUid) { _toast('❌ User not found. Check UID or email.'); return; }

  await push(ref(db, `users/${targetUid}/redeems`), {
    note,
    sentAt: Date.now(),
    sentBy: auth.currentUser?.email || 'admin',
  });

  document.getElementById('redeem-uid').value  = '';
  document.getElementById('redeem-note').value = '';
  _toast(`✅ Redeem sent to user!`);
});

/* ─── Helpers ────────────────────────────────────────────── */
function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _dateStr(ts) {
  return new Date(ts).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

let _toastTimer = null;
function _toast(msg, dur = 2800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

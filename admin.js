/* ================================================================
   admin.js — NeonSpin Production Admin Panel v2.0
   ================================================================
   FEATURES:
   • Role-based auth: user | admin | super_admin
   • checkAdminAccess() — verifies role from Firebase
   • Tab navigation: Users / Redeem / Feedback / Flagged / Logs / Settings
   • Full user management: ban/unban, add/remove coins (max 1000),
     EXP, level, spins
   • Redeem system: approve (deducts coins), reject, mark as paid
   • Admin Audit Log: every action logged to adminLogs/
   • Anti-cheat: flagUserIfSuspicious() auto-flags anomalies
   • Super Admin only: promote/demote admins, system settings
   • Feedback delete
   • Broadcast system
   ================================================================ */

'use strict';

import { initializeApp } from
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

import {
  getAuth, GoogleAuthProvider,
  signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import {
  getDatabase, ref, get, update, push, remove, set, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

/* ─── Firebase Config ─────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            'AIzaSyBPDul4R8nIYcLVwpw1snmukOI3mRLHbEg',
  authDomain:        'neonspin-rewards-4101a.firebaseapp.com',
  projectId:         'neonspin-rewards-4101a',
  storageBucket:     'neonspin-rewards-4101a.firebasestorage.app',
  messagingSenderId: '424031837123',
  appId:             '1:424031837123:web:4b5566d57d8fef3bc93b76',
  databaseURL:       'https://neonspin-rewards-4101a-default-rtdb.firebaseio.com',
};

/* ─── Constants ───────────────────────────────────────────── */
const SUPER_ADMIN_EMAIL = 'neonspin.dev@gmail.com';
const PAGE_SIZE         = 20;
const LOGS_PAGE_SIZE    = 30;
const MAX_COINS_PER_ADD = 1000; // Safety limit per admin action

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getDatabase(app);
const provider = new GoogleAuthProvider();

/* ─── Global State ────────────────────────────────────────── */
let _currentAdminRole = null;  // 'admin' | 'super_admin'
let _currentAdminId   = null;
let _currentAdminEmail= null;

let _allUsers      = [];
let _filteredUsers = [];
let _currentPage   = 0;

let _allLogs       = [];
let _filteredLogs  = [];
let _logsPage      = 0;

let _systemSettings = {};

/* ================================================================
   ROLE-BASED ACCESS CONTROL
================================================================ */

/**
 * checkAdminAccess()
 * After login, fetch user's role from Firebase.
 * Only 'admin' or 'super_admin' may access the panel.
 * SUPER_ADMIN_EMAIL is always treated as super_admin regardless of DB role.
 */
async function checkAdminAccess(user) {
  try {
    const snap = await get(ref(db, `users/${user.uid}`));
    const userData = snap.exists() ? snap.val() : {};

    // Email override: owner always has super_admin
    let role = userData.role || 'user';
    if (user.email === SUPER_ADMIN_EMAIL) {
      role = 'super_admin';
      // Also write it to DB if not already set
      if (userData.role !== 'super_admin') {
        await update(ref(db, `users/${user.uid}`), { role: 'super_admin' }).catch(() => {});
      }
    }

    if (role === 'admin' || role === 'super_admin') {
      _currentAdminRole  = role;
      _currentAdminId    = user.uid;
      _currentAdminEmail = user.email;
      return { allowed: true, role };
    }

    return { allowed: false, role };
  } catch (e) {
    console.error('[AdminAccess] Error checking role:', e);
    // Fallback: check email
    if (user.email === SUPER_ADMIN_EMAIL) {
      _currentAdminRole  = 'super_admin';
      _currentAdminId    = user.uid;
      _currentAdminEmail = user.email;
      return { allowed: true, role: 'super_admin' };
    }
    return { allowed: false, role: 'user' };
  }
}

/* ─── Apply role-based UI visibility ────────────────────────── */
function _applyRoleUI(role) {
  const isSuperAdmin = role === 'super_admin';
  const badge = document.getElementById('admin-role-badge');
  if (badge) {
    badge.textContent = isSuperAdmin ? '👑 Super Admin' : '🛡 Admin';
    badge.className   = `dash-role-badge ${isSuperAdmin ? 'role-super_admin' : 'role-admin'}`;
  }

  // Show super_admin-only elements
  document.querySelectorAll('.super-admin-only').forEach(el => {
    el.style.display = isSuperAdmin ? '' : 'none';
  });
}

/* ================================================================
   AUTH
================================================================ */

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

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const { allowed, role } = await checkAdminAccess(user);

    if (allowed) {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('dashboard').style.display    = 'block';
      document.getElementById('admin-name').textContent     = user.displayName || user.email;
      _applyRoleUI(role);
      _loadDashboard();
    } else {
      signOut(auth);
      const errEl = document.getElementById('login-error');
      errEl.textContent = '❌ Access denied. You do not have admin privileges. Contact the super admin to get access.';
      errEl.style.display = 'block';
    }
  } else {
    _currentAdminRole  = null;
    _currentAdminId    = null;
    _currentAdminEmail = null;
    document.getElementById('login-screen').style.display = '';
    document.getElementById('dashboard').style.display    = 'none';
  }
});

/* ================================================================
   DASHBOARD LOADER
================================================================ */

async function _loadDashboard() {
  _initTabs();
  _initConfirmModal();
  _initEditModalButtons();

  await Promise.all([
    _loadUsers(),
    _loadRequests(),
    _loadFeedback(),
    _loadFlaggedUsers(),
  ]);

  if (_currentAdminRole === 'super_admin') {
    _loadSystemSettings();
  }
}

/* ================================================================
   TAB NAVIGATION
================================================================ */

function _initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      // Deactivate all
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      // Activate selected
      btn.classList.add('active');
      const panel = document.getElementById(`tab-${tabId}`);
      if (panel) panel.classList.add('active');
      // Load on-demand
      if (tabId === 'logs') _loadAdminLogs();
      if (tabId === 'flagged') _loadFlaggedUsers();
      if (tabId === 'settings' && _currentAdminRole === 'super_admin') {
        _loadSystemSettings();
        _renderRolesTable();
      }
    });
  });
}

/* ================================================================
   CONFIRM MODAL (reusable)
================================================================ */

let _confirmResolve = null;

function _initConfirmModal() {
  document.getElementById('btn-confirm-yes')?.addEventListener('click', () => {
    _closeConfirm(true);
  });
  document.getElementById('btn-confirm-no')?.addEventListener('click', () => {
    _closeConfirm(false);
  });
}

function _confirmAction(title, message) {
  return new Promise((resolve) => {
    _confirmResolve = resolve;
    document.getElementById('confirm-title').textContent   = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-modal').classList.add('open');
  });
}

function _closeConfirm(result) {
  document.getElementById('confirm-modal').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
}

/* ================================================================
   ADMIN LOG SYSTEM
================================================================ */

/**
 * logAdminAction(action, targetUserId, details)
 * Writes an audit entry to adminLogs/
 */
async function logAdminAction(action, targetUserId = '', details = '') {
  try {
    await push(ref(db, 'adminLogs'), {
      adminId:     _currentAdminId,
      adminEmail:  _currentAdminEmail || '',
      targetUserId,
      action,
      details,
      timestamp:   Date.now(),
    });
  } catch (e) {
    console.warn('[AdminLog] Failed to log action:', e.message);
  }
}

/* ================================================================
   ANTI-CHEAT: FLAG USERS
================================================================ */

/**
 * flagUserIfSuspicious(userId, newData, oldData)
 * Auto-flags users if coins or EXP jump suspiciously.
 * Threshold is loaded from settings (default 500 coins / 200 EXP).
 */
async function flagUserIfSuspicious(userId, newData, oldData) {
  const coinThreshold = _systemSettings?.flagCoinThreshold ?? 500;
  const expThreshold  = 200;

  const coinDelta = (newData.coins || 0) - (oldData.coins || 0);
  const expDelta  = (newData.exp   || 0) - (oldData.exp   || 0);

  const reasons = [];
  if (coinDelta > coinThreshold) reasons.push(`Coins jumped +${coinDelta} in one session`);
  if (expDelta  > expThreshold)  reasons.push(`EXP jumped +${expDelta} in one session`);

  if (reasons.length === 0) return;

  try {
    await set(ref(db, `flaggedUsers/${userId}`), {
      userId,
      displayName:  newData.displayName || oldData.displayName || 'Unknown',
      email:        newData.email        || oldData.email        || '',
      reason:       reasons.join(' | '),
      coinsBefore:  oldData.coins  || 0,
      coinsAfter:   newData.coins  || 0,
      expBefore:    oldData.exp    || 0,
      expAfter:     newData.exp    || 0,
      timestamp:    Date.now(),
      resolved:     false,
    });
    console.log(`[AntiCheat] Flagged user ${userId}: ${reasons.join(', ')}`);
  } catch (e) {
    console.warn('[AntiCheat] Could not flag user:', e.message);
  }
}

/* ================================================================
   USERS — LOAD & RENDER
================================================================ */

async function fetchAllUsers() {
  const snap = await get(ref(db, 'users'));
  _allUsers = [];
  if (snap.exists()) {
    snap.forEach((child) => {
      _allUsers.push({ uid: child.key, ...child.val() });
    });
  }
  _allUsers.sort((a, b) => (b.level || 0) - (a.level || 0));
  return _allUsers;
}

async function _loadUsers() {
  try {
    await fetchAllUsers();
    _filteredUsers = [..._allUsers];
    _currentPage   = 0;

    // Stats
    _setText('stat-users',     _allUsers.length);
    _setText('stat-max-level', _allUsers[0]?.level || 0);
    _setText('stat-banned',    _allUsers.filter(u => u.banned).length);

    _renderUsersPage();
    _renderRolesTable();
    _initUserFilters();
    _initPagination();
    _initExport();
  } catch (e) {
    _toast('❌ Failed to load users: ' + e.message);
  }
}

function _initUserFilters() {
  const applyFilters = () => {
    const q       = (document.getElementById('user-search')?.value || '').toLowerCase();
    const roleF   = document.getElementById('user-filter-role')?.value || '';
    const banF    = document.getElementById('user-filter-ban')?.value  || '';

    _filteredUsers = _allUsers.filter(u => {
      const matchSearch = !q ||
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.email       || '').toLowerCase().includes(q);
      const matchRole = !roleF || (u.role || 'user') === roleF;
      const matchBan  = !banF  ||
        (banF === 'banned' ? !!u.banned : !u.banned);
      return matchSearch && matchRole && matchBan;
    });
    _currentPage = 0;
    _renderUsersPage();
  };

  document.getElementById('user-search')?.addEventListener('input', applyFilters);
  document.getElementById('user-filter-role')?.addEventListener('change', applyFilters);
  document.getElementById('user-filter-ban')?.addEventListener('change', applyFilters);
}

function _initPagination() {
  document.getElementById('btn-prev-page')?.addEventListener('click', () => {
    if (_currentPage > 0) { _currentPage--; _renderUsersPage(); }
  });
  document.getElementById('btn-next-page')?.addEventListener('click', () => {
    const maxPage = Math.ceil(_filteredUsers.length / PAGE_SIZE) - 1;
    if (_currentPage < maxPage) { _currentPage++; _renderUsersPage(); }
  });
}

function _initExport() {
  document.getElementById('btn-export')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(_allUsers, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `neonspin-users-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    _toast('⬇ Users exported as JSON');
  });
}

function _renderUsersPage() {
  const tbody   = document.getElementById('users-tbody');
  if (!tbody) return;

  const start   = _currentPage * PAGE_SIZE;
  const page    = _filteredUsers.slice(start, start + PAGE_SIZE);
  const total   = _filteredUsers.length;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  _setText('page-info', `Page ${_currentPage + 1} / ${maxPage} (${total} users)`);

  if (page.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="10">No users found.</td></tr>';
    return;
  }

  tbody.innerHTML = page.map(u => {
    const role    = u.role || 'user';
    const isSelf  = u.uid === _currentAdminId;
    const isAdmin = role === 'admin' || role === 'super_admin';
    // Admin cannot edit other admins/super_admin unless is super_admin
    const canEdit = !isAdmin || _currentAdminRole === 'super_admin' || isSelf;

    const roleBadge = role === 'super_admin'
      ? '<span class="badge badge-super">👑 Super</span>'
      : role === 'admin'
        ? '<span class="badge badge-admin">🛡 Admin</span>'
        : '<span class="badge badge-user">User</span>';

    const statusBadge = u.banned
      ? '<span class="badge badge-banned">🚫 Banned</span>'
      : '<span class="badge badge-active">✅ Active</span>';

    return `<tr>
      <td><strong>${_esc(u.displayName || 'Unknown')}</strong></td>
      <td style="color:var(--muted);font-size:12px">${_esc(u.email || '—')}</td>
      <td>${roleBadge}</td>
      <td><strong style="color:var(--accent)">${u.level || 1}</strong></td>
      <td>${u.coins || 0}</td>
      <td>${u.exp || 0}</td>
      <td>${u.streak || 0} 🔥</td>
      <td>${statusBadge}</td>
      <td style="color:var(--muted);font-size:12px">${u.joinedAt ? _dateStr(u.joinedAt) : '—'}</td>
      <td>
        ${canEdit
          ? `<button class="btn btn-blue" onclick="window._openEditModal('${u.uid}')">✏️ Edit</button>`
          : `<span style="font-size:12px;color:var(--muted)">Protected</span>`
        }
      </td>
    </tr>`;
  }).join('');
}

/* ================================================================
   EDIT USER MODAL
================================================================ */

function _initEditModalButtons() {
  // Close buttons
  document.getElementById('btn-edit-cancel-x')?.addEventListener('click', _closeEditModal);
  document.getElementById('btn-edit-close')?.addEventListener('click', _closeEditModal);

  // Add Coins
  document.getElementById('btn-add-coins')?.addEventListener('click', async () => {
    const uid    = document.getElementById('edit-uid').value;
    const amount = parseInt(document.getElementById('edit-add-coins').value || '0');
    if (!uid) return;
    if (isNaN(amount) || amount < 1)  { _toast('⚠️ Enter a valid amount'); return; }
    if (amount > MAX_COINS_PER_ADD)   { _toast(`⚠️ Max ${MAX_COINS_PER_ADD} coins per action`); return; }
    await updateUserCoins(uid, amount, 'add');
  });

  // Remove Coins
  document.getElementById('btn-remove-coins')?.addEventListener('click', async () => {
    const uid    = document.getElementById('edit-uid').value;
    const amount = parseInt(document.getElementById('edit-remove-coins').value || '0');
    if (!uid) return;
    if (isNaN(amount) || amount < 1) { _toast('⚠️ Enter a valid amount'); return; }
    await updateUserCoins(uid, amount, 'remove');
  });

  // Add EXP
  document.getElementById('btn-add-exp')?.addEventListener('click', async () => {
    const uid    = document.getElementById('edit-uid').value;
    const amount = parseInt(document.getElementById('edit-add-exp').value || '0');
    if (!uid) return;
    if (isNaN(amount) || amount < 1) { _toast('⚠️ Enter a valid amount'); return; }
    await updateUserExp(uid, amount, 'add');
  });

  // Remove EXP
  document.getElementById('btn-remove-exp')?.addEventListener('click', async () => {
    const uid    = document.getElementById('edit-uid').value;
    const amount = parseInt(document.getElementById('edit-remove-exp').value || '0');
    if (!uid) return;
    if (isNaN(amount) || amount < 1) { _toast('⚠️ Enter a valid amount'); return; }
    await updateUserExp(uid, amount, 'remove');
  });

  // Set Level
  document.getElementById('btn-set-level')?.addEventListener('click', async () => {
    const uid   = document.getElementById('edit-uid').value;
    const level = parseInt(document.getElementById('edit-set-level').value || '0');
    if (!uid) return;
    if (isNaN(level) || level < 1 || level > 500) { _toast('⚠️ Level must be 1–500'); return; }
    await updateUserLevel(uid, level);
  });

  // Set Spins
  document.getElementById('btn-set-spins')?.addEventListener('click', async () => {
    const uid   = document.getElementById('edit-uid').value;
    const spins = parseInt(document.getElementById('edit-spins').value || '0');
    if (!uid) return;
    if (isNaN(spins) || spins < 0) { _toast('⚠️ Enter a valid spin count'); return; }
    try {
      _guardAdminTarget(uid);
      await update(ref(db, `users/${uid}`), { spinCount: spins });
      await logAdminAction('SET_SPINS', uid, `Spins set to ${spins}`);
      _refreshEditModal(uid);
      _toast(`✅ Spins set to ${spins}`);
    } catch(e) { _toast('❌ ' + e.message); }
  });

  // Ban
  document.getElementById('btn-ban-user')?.addEventListener('click', async () => {
    const uid = document.getElementById('edit-uid').value;
    if (!uid) return;
    const ok = await _confirmAction('🚫 Ban User', 'Are you sure you want to ban this user? They will no longer be able to access the app.');
    if (!ok) return;
    await banUser(uid);
  });

  // Unban
  document.getElementById('btn-unban-user')?.addEventListener('click', async () => {
    const uid = document.getElementById('edit-uid').value;
    if (!uid) return;
    await unbanUser(uid);
  });

  // Promote to Admin
  document.getElementById('btn-promote-admin')?.addEventListener('click', async () => {
    const uid  = document.getElementById('edit-uid').value;
    const role = document.getElementById('edit-current-role').value;
    if (!uid) return;
    if (role === 'super_admin') { _toast('⚠️ Cannot modify super admin role'); return; }
    if (_currentAdminRole !== 'super_admin') { _toast('❌ Only super admin can change roles'); return; }
    const ok = await _confirmAction('⬆ Promote to Admin', 'This user will gain admin panel access. Continue?');
    if (!ok) return;
    try {
      await update(ref(db, `users/${uid}`), { role: 'admin' });
      await logAdminAction('PROMOTE_ADMIN', uid, 'Promoted to admin by super admin');
      _refreshEditModal(uid);
      await _loadUsers();
      _toast('✅ User promoted to Admin');
    } catch(e) { _toast('❌ ' + e.message); }
  });

  // Demote to User
  document.getElementById('btn-demote-admin')?.addEventListener('click', async () => {
    const uid  = document.getElementById('edit-uid').value;
    const role = document.getElementById('edit-current-role').value;
    if (!uid) return;
    if (role === 'super_admin') { _toast('⚠️ Cannot demote super admin'); return; }
    if (_currentAdminRole !== 'super_admin') { _toast('❌ Only super admin can change roles'); return; }
    const ok = await _confirmAction('⬇ Demote to User', 'This admin will lose panel access. Continue?');
    if (!ok) return;
    try {
      await update(ref(db, `users/${uid}`), { role: 'user' });
      await logAdminAction('DEMOTE_ADMIN', uid, 'Demoted from admin to user');
      _refreshEditModal(uid);
      await _loadUsers();
      _toast('✅ Admin demoted to User');
    } catch(e) { _toast('❌ ' + e.message); }
  });
}

window._openEditModal = function(uid) {
  const user = _allUsers.find(u => u.uid === uid);
  if (!user) return;

  // Security: regular admin cannot edit admins/super_admins
  const targetRole = user.role || 'user';
  if ((targetRole === 'admin' || targetRole === 'super_admin') && _currentAdminRole !== 'super_admin') {
    _toast('❌ Only super admin can edit admin accounts');
    return;
  }

  document.getElementById('edit-uid').value         = uid;
  document.getElementById('edit-current-role').value = targetRole;

  // Info block
  const isBanned = !!user.banned;
  document.getElementById('edit-user-info').innerHTML = `
    <strong style="color:var(--text)">${_esc(user.displayName || 'Unknown')}</strong>
    &nbsp;·&nbsp; ${_esc(user.email || '—')}
    <br>
    <span style="font-size:12px">
      🏆 Level ${user.level || 1} &nbsp;·&nbsp;
      💰 ${user.coins || 0} coins &nbsp;·&nbsp;
      ⭐ ${user.exp || 0} EXP &nbsp;·&nbsp;
      🎰 ${user.spinCount || 0} spins
    </span>
  `;

  // Pre-fill fields
  document.getElementById('edit-add-coins').value    = '';
  document.getElementById('edit-remove-coins').value = '';
  document.getElementById('edit-add-exp').value      = '';
  document.getElementById('edit-remove-exp').value   = '';
  document.getElementById('edit-set-level').value    = user.level || 1;
  document.getElementById('edit-spins').value        = user.spinCount || 0;

  // Ban / Unban buttons
  document.getElementById('btn-ban-user').style.display   = isBanned ? 'none' : '';
  document.getElementById('btn-unban-user').style.display = isBanned ? ''     : 'none';
  document.getElementById('ban-status-text').textContent  = isBanned
    ? `Banned on ${user.bannedAt ? _dateStr(user.bannedAt) : 'unknown date'}`
    : 'User is active';

  // Role change zone text
  document.getElementById('role-status-text').textContent = `Current role: ${targetRole}`;

  document.getElementById('edit-modal').classList.add('open');
};

function _closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
}

async function _refreshEditModal(uid) {
  // Refresh local user data
  try {
    const snap = await get(ref(db, `users/${uid}`));
    if (snap.exists()) {
      const idx = _allUsers.findIndex(u => u.uid === uid);
      const updated = { uid, ...snap.val() };
      if (idx >= 0) _allUsers[idx] = updated;
      else _allUsers.push(updated);
    }
    _renderUsersPage();
    // Re-open with fresh data if modal still open
    const modal = document.getElementById('edit-modal');
    if (modal.classList.contains('open')) {
      window._openEditModal(uid);
    }
  } catch (e) {
    console.warn('_refreshEditModal error:', e.message);
  }
}

/* ─── Guard: admin cannot modify other admins/super_admin ──── */
function _guardAdminTarget(uid) {
  const target = _allUsers.find(u => u.uid === uid);
  if (!target) return; // New user not in cache yet, allow
  const targetRole = target.role || 'user';
  if ((targetRole === 'admin' || targetRole === 'super_admin') && _currentAdminRole !== 'super_admin') {
    throw new Error('You cannot modify another admin account. Only super admin can do this.');
  }
}

/* ================================================================
   USER MANAGEMENT FUNCTIONS
================================================================ */

async function updateUserCoins(uid, amount, operation) {
  try {
    _guardAdminTarget(uid);
    const snap    = await get(ref(db, `users/${uid}`));
    if (!snap.exists()) { _toast('❌ User not found'); return; }
    const old     = snap.val();
    const current = old.coins || 0;
    const newVal  = operation === 'add'
      ? current + amount
      : Math.max(0, current - amount);

    await update(ref(db, `users/${uid}`), { coins: newVal });
    await logAdminAction(
      operation === 'add' ? 'ADD_COINS' : 'REMOVE_COINS',
      uid,
      `${operation === 'add' ? '+' : '-'}${amount} coins (${current} → ${newVal})`
    );

    // Anti-cheat check on add
    if (operation === 'add') {
      await flagUserIfSuspicious(uid, { ...old, coins: newVal }, old);
    }

    // Update local cache
    const idx = _allUsers.findIndex(u => u.uid === uid);
    if (idx >= 0) _allUsers[idx].coins = newVal;

    _renderUsersPage();
    await _refreshEditModal(uid);
    _toast(`✅ Coins ${operation === 'add' ? 'added' : 'removed'}: ${amount} (new total: ${newVal})`);
  } catch (e) {
    _toast('❌ ' + e.message);
  }
}

async function updateUserExp(uid, amount, operation) {
  try {
    _guardAdminTarget(uid);
    const snap    = await get(ref(db, `users/${uid}`));
    if (!snap.exists()) { _toast('❌ User not found'); return; }
    const old     = snap.val();
    const current = old.exp || 0;
    const newVal  = operation === 'add'
      ? current + amount
      : Math.max(0, current - amount);

    await update(ref(db, `users/${uid}`), { exp: newVal });
    await logAdminAction(
      'UPDATE_EXP',
      uid,
      `EXP ${operation === 'add' ? '+' : '-'}${amount} (${current} → ${newVal})`
    );

    if (operation === 'add') {
      await flagUserIfSuspicious(uid, { ...old, exp: newVal }, old);
    }

    const idx = _allUsers.findIndex(u => u.uid === uid);
    if (idx >= 0) _allUsers[idx].exp = newVal;

    _renderUsersPage();
    await _refreshEditModal(uid);
    _toast(`✅ EXP ${operation === 'add' ? 'added' : 'removed'}: ${amount} (new total: ${newVal})`);
  } catch (e) {
    _toast('❌ ' + e.message);
  }
}

async function updateUserLevel(uid, level) {
  try {
    _guardAdminTarget(uid);
    await update(ref(db, `users/${uid}`), { level });
    await logAdminAction('CHANGE_LEVEL', uid, `Level set to ${level}`);

    const idx = _allUsers.findIndex(u => u.uid === uid);
    if (idx >= 0) _allUsers[idx].level = level;

    _renderUsersPage();
    await _refreshEditModal(uid);
    _toast(`✅ Level set to ${level}`);
  } catch (e) {
    _toast('❌ ' + e.message);
  }
}

async function banUser(uid) {
  try {
    _guardAdminTarget(uid);
    await update(ref(db, `users/${uid}`), { banned: true, bannedAt: Date.now() });
    await logAdminAction('BAN_USER', uid, 'User banned by admin');

    const idx = _allUsers.findIndex(u => u.uid === uid);
    if (idx >= 0) { _allUsers[idx].banned = true; _allUsers[idx].bannedAt = Date.now(); }

    _renderUsersPage();
    await _refreshEditModal(uid);
    _setText('stat-banned', _allUsers.filter(u => u.banned).length);
    _toast('🚫 User has been banned');
  } catch (e) {
    _toast('❌ ' + e.message);
  }
}

async function unbanUser(uid) {
  try {
    _guardAdminTarget(uid);
    await update(ref(db, `users/${uid}`), { banned: false, bannedAt: null });
    await logAdminAction('UNBAN_USER', uid, 'User unbanned by admin');

    const idx = _allUsers.findIndex(u => u.uid === uid);
    if (idx >= 0) { _allUsers[idx].banned = false; _allUsers[idx].bannedAt = null; }

    _renderUsersPage();
    await _refreshEditModal(uid);
    _setText('stat-banned', _allUsers.filter(u => u.banned).length);
    _toast('✅ User has been unbanned');
  } catch (e) {
    _toast('❌ ' + e.message);
  }
}

/* ================================================================
   REDEEM / WITHDRAWAL REQUESTS
================================================================ */

let _allRequests = [];

async function _loadRequests() {
  const snap  = await get(ref(db, 'rewardRequests'));
  const tbody = document.getElementById('requests-tbody');
  if (!tbody) return;

  _allRequests = [];
  if (snap.exists()) {
    snap.forEach(child => _allRequests.push({ key: child.key, ...child.val() }));
  }
  _allRequests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const pendingCount = _allRequests.filter(r => r.status === 'pending').length;
  _setText('stat-pending', pendingCount);
  _setText('pending-count-badge', `${pendingCount} pending`);
  const dot = document.getElementById('dot-redeem');
  if (dot) dot.classList.toggle('show', pendingCount > 0);

  // Filter
  const filterEl = document.getElementById('redeem-status-filter');
  const renderRequests = () => {
    const f    = filterEl?.value || '';
    const rows = f ? _allRequests.filter(r => r.status === f) : _allRequests;
    _renderRequestsTable(rows);
  };

  filterEl?.removeEventListener('change', renderRequests);
  filterEl?.addEventListener('change', renderRequests);
  renderRequests();
}

function _renderRequestsTable(rows) {
  const tbody = document.getElementById('requests-tbody');
  if (!tbody) return;

  if (rows.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No requests found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const coinRate = _systemSettings?.coinRate ?? 1000;
    const rupees   = r.rupees ?? Math.floor((r.coins || 0) / coinRate);
    return `<tr id="req-row-${r.key}">
      <td><strong>${_esc(r.name || '—')}</strong></td>
      <td style="color:var(--muted);font-size:12px">${_esc(r.email || '—')}</td>
      <td><span class="upi-text">${_esc(r.upi || r.email || '—')}</span></td>
      <td>${r.coinsUsed || r.coins || 0}</td>
      <td style="color:var(--gold)">₹${rupees}</td>
      <td><strong style="color:var(--accent)">${r.level || 1}</strong></td>
      <td><span class="badge badge-${r.status || 'pending'}">${r.status || 'pending'}</span></td>
      <td style="color:var(--muted);font-size:12px">${r.createdAt ? _dateStr(r.createdAt) : '—'}</td>
      <td>
        <div class="btn-group">
          ${r.status === 'pending' ? `
            <button class="btn btn-green" onclick="window._approveReq('${r.key}')">✅ Approve</button>
            <button class="btn btn-red"   onclick="window._rejectReq('${r.key}')">❌ Reject</button>
          ` : ''}
          ${r.status === 'approved' ? `
            <button class="btn btn-gold" onclick="window._markPaid('${r.key}')">💸 Mark Paid</button>
          ` : ''}
          ${r.status !== 'pending' && r.status !== 'approved' ? '<span style="color:var(--muted);font-size:12px">—</span>' : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

window._approveReq = async function(key) {
  const req = _allRequests.find(r => r.key === key);
  if (!req) return;

  const ok = await _confirmAction(
    '✅ Approve Request',
    `Approve withdrawal of ${req.coinsUsed || req.coins || 0} coins for ${req.name || req.email}? Their coins will be deducted.`
  );
  if (!ok) return;

  try {
    await handleRedeemRequest(key, 'approved');
    _toast('✅ Request approved and coins deducted!');
  } catch (e) {
    _toast('❌ Approve failed: ' + e.message);
  }
};

window._rejectReq = async function(key) {
  const req = _allRequests.find(r => r.key === key);
  if (!req) return;

  const ok = await _confirmAction('❌ Reject Request', `Reject this withdrawal request from ${req.name || req.email}?`);
  if (!ok) return;

  try {
    await handleRedeemRequest(key, 'rejected');
    _toast('Request rejected.');
  } catch (e) {
    _toast('❌ Reject failed: ' + e.message);
  }
};

window._markPaid = async function(key) {
  const req = _allRequests.find(r => r.key === key);
  if (!req) return;

  const ok = await _confirmAction('💸 Mark as Paid', `Confirm payment sent to ${req.upi || req.email} for ${req.name}?`);
  if (!ok) return;

  try {
    await update(ref(db, `rewardRequests/${key}`), { status: 'paid', paidAt: Date.now(), paidBy: _currentAdminEmail });
    await logAdminAction('MARK_PAID', req.userId || '', `Marked paid: ${req.coinsUsed || req.coins || 0} coins → UPI ${req.upi || '—'}`);
    _toast('💸 Marked as paid!');
    await _loadRequests();
  } catch (e) {
    _toast('❌ ' + e.message);
  }
};

/**
 * handleRedeemRequest(key, action)
 * Approves or rejects a redeem request.
 * On approval: deducts coins from user's account.
 */
async function handleRedeemRequest(key, action) {
  const req = _allRequests.find(r => r.key === key);
  if (!req) throw new Error('Request not found');

  if (action === 'approved') {
    // Deduct coins from user
    if (req.userId) {
      const userSnap = await get(ref(db, `users/${req.userId}`));
      if (userSnap.exists()) {
        const userData   = userSnap.val();
        const coinsToUse = req.coinsUsed || req.coins || 0;
        const newCoins   = Math.max(0, (userData.coins || 0) - coinsToUse);
        await update(ref(db, `users/${req.userId}`), { coins: newCoins });

        // Update local cache
        const idx = _allUsers.findIndex(u => u.uid === req.userId);
        if (idx >= 0) _allUsers[idx].coins = newCoins;
      }
    }
    await update(ref(db, `rewardRequests/${key}`), {
      status:     'approved',
      approvedAt: Date.now(),
      approvedBy: _currentAdminEmail,
    });
    await logAdminAction(
      'APPROVE_REDEEM',
      req.userId || '',
      `Approved ${req.coinsUsed || req.coins || 0} coins for ${req.name} (UPI: ${req.upi || '—'})`
    );
  } else {
    await update(ref(db, `rewardRequests/${key}`), {
      status:     'rejected',
      rejectedAt: Date.now(),
      rejectedBy: _currentAdminEmail,
    });
    await logAdminAction(
      'REJECT_REDEEM',
      req.userId || '',
      `Rejected request from ${req.name}`
    );
  }

  await _loadRequests();
  _renderUsersPage();
}

/* ─── Send Redeem to User ─────────────────────────────────── */
document.getElementById('btn-send-redeem')?.addEventListener('click', async () => {
  const uidOrEmail = document.getElementById('redeem-uid')?.value?.trim();
  const note       = document.getElementById('redeem-note')?.value?.trim();
  if (!uidOrEmail || !note) { _toast('⚠️ Fill in all fields.'); return; }

  const byUid   = _allUsers.find(u => u.uid === uidOrEmail);
  const byEmail = _allUsers.find(u => (u.email || '').toLowerCase() === uidOrEmail.toLowerCase());
  const target  = byUid || byEmail;

  if (!target) { _toast('❌ User not found. Check UID or email.'); return; }

  try {
    await push(ref(db, `users/${target.uid}/redeems`), {
      note,
      sentAt: Date.now(),
      sentBy: _currentAdminEmail || 'admin',
    });
    await logAdminAction('SEND_REDEEM', target.uid, `Manual redeem sent: "${note}"`);
    document.getElementById('redeem-uid').value  = '';
    document.getElementById('redeem-note').value = '';
    _toast(`✅ Redeem sent to ${target.displayName || target.email}`);
  } catch (e) {
    _toast('❌ ' + e.message);
  }
});

/* ================================================================
   FEEDBACK
================================================================ */

async function _loadFeedback() {
  const snap  = await get(ref(db, 'feedback'));
  const tbody = document.getElementById('feedback-tbody');
  if (!tbody) return;

  let rows = [];
  if (snap.exists()) snap.forEach(c => rows.push({ key: c.key, ...c.val() }));
  rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  _setText('stat-feedback', rows.length);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No feedback yet.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.slice(0, 100).map(f => `
    <tr>
      <td><strong>${_esc(f.name || 'Anonymous')}</strong></td>
      <td style="max-width:300px;word-break:break-word">${_esc(f.message || '')}</td>
      <td>${f.imageURL ? `<img class="fb-img" src="${f.imageURL}" loading="lazy" alt="screenshot" />` : '—'}</td>
      <td style="color:var(--muted);font-size:12px">${f.timestamp ? _dateStr(f.timestamp) : '—'}</td>
      <td>
        <button class="btn btn-red" onclick="window._deleteFeedback('${f.key}')">🗑 Delete</button>
      </td>
    </tr>
  `).join('');
}

window._deleteFeedback = async function(key) {
  const ok = await _confirmAction('🗑 Delete Feedback', 'Delete this feedback item permanently?');
  if (!ok) return;
  try {
    await remove(ref(db, `feedback/${key}`));
    await logAdminAction('DELETE_FEEDBACK', '', `Feedback deleted: key=${key}`);
    _toast('🗑 Feedback deleted.');
    _loadFeedback();
  } catch (e) {
    _toast('❌ ' + e.message);
  }
};

/* ================================================================
   FLAGGED USERS
================================================================ */

async function _loadFlaggedUsers() {
  const snap  = await get(ref(db, 'flaggedUsers'));
  const tbody = document.getElementById('flagged-tbody');
  if (!tbody) return;

  let rows = [];
  if (snap.exists()) {
    snap.forEach(child => {
      const data = child.val();
      if (!data.resolved) rows.push({ key: child.key, ...data });
    });
  }
  rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  _setText('stat-flagged', rows.length);
  const dot = document.getElementById('dot-flagged');
  if (dot) dot.classList.toggle('show', rows.length > 0);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">✅ No flagged users. System clean!</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(f => {
    const user = _allUsers.find(u => u.uid === f.userId || u.uid === f.key);
    const name = f.displayName || user?.displayName || f.key;
    return `<tr>
      <td>
        <strong>${_esc(name)}</strong>
        <br><span style="font-size:11px;color:var(--muted)">${_esc(f.email || '')}</span>
      </td>
      <td><span class="flag-reason">${_esc(f.reason || '—')}</span></td>
      <td>${f.coinsBefore ?? '—'}</td>
      <td style="color:var(--orange)">${f.coinsAfter ?? '—'}</td>
      <td>${f.expBefore ?? '—'}</td>
      <td style="color:var(--orange)">${f.expAfter ?? '—'}</td>
      <td style="color:var(--muted);font-size:12px">${f.timestamp ? _dateStr(f.timestamp) : '—'}</td>
      <td>
        <div class="btn-group">
          <button class="btn btn-red"  onclick="window._banFlaggedUser('${f.key}')">🚫 Ban</button>
          <button class="btn btn-blue" onclick="window._ignoreFlaggedUser('${f.key}')">✅ Ignore</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

window._banFlaggedUser = async function(key) {
  const ok = await _confirmAction('🚫 Ban Flagged User', 'This will ban the user immediately for suspicious activity.');
  if (!ok) return;
  try {
    const flagSnap = await get(ref(db, `flaggedUsers/${key}`));
    const flagData = flagSnap.exists() ? flagSnap.val() : {};
    const uid      = flagData.userId || key;

    await update(ref(db, `users/${uid}`), { banned: true, bannedAt: Date.now() });
    await update(ref(db, `flaggedUsers/${key}`), { resolved: true, resolution: 'banned', resolvedAt: Date.now() });
    await logAdminAction('BAN_USER', uid, `Banned via anti-cheat: ${flagData.reason || '—'}`);

    const idx = _allUsers.findIndex(u => u.uid === uid);
    if (idx >= 0) { _allUsers[idx].banned = true; }

    _toast('🚫 User banned and flag resolved.');
    _loadFlaggedUsers();
    _renderUsersPage();
  } catch (e) {
    _toast('❌ ' + e.message);
  }
};

window._ignoreFlaggedUser = async function(key) {
  try {
    await update(ref(db, `flaggedUsers/${key}`), { resolved: true, resolution: 'ignored', resolvedAt: Date.now() });
    await logAdminAction('IGNORE_FLAG', key, 'Flag dismissed as false positive');
    _toast('✅ Flag dismissed.');
    _loadFlaggedUsers();
  } catch (e) {
    _toast('❌ ' + e.message);
  }
};

/* ================================================================
   ADMIN LOGS
================================================================ */

async function _loadAdminLogs() {
  try {
    const snap = await get(ref(db, 'adminLogs'));
    _allLogs   = [];
    if (snap.exists()) {
      snap.forEach(child => _allLogs.push({ key: child.key, ...child.val() }));
    }
    _allLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    _filteredLogs = [..._allLogs];
    _logsPage     = 0;

    const filter = document.getElementById('log-action-filter');
    const applyLogFilter = () => {
      const f = filter?.value || '';
      _filteredLogs = f ? _allLogs.filter(l => l.action === f) : [..._allLogs];
      _logsPage = 0;
      _renderLogsPage();
    };

    filter?.removeEventListener('change', applyLogFilter);
    filter?.addEventListener('change', applyLogFilter);
    document.getElementById('btn-refresh-logs')?.removeEventListener('click', _loadAdminLogs);
    document.getElementById('btn-refresh-logs')?.addEventListener('click', _loadAdminLogs);

    document.getElementById('btn-prev-logs')?.addEventListener('click', () => {
      if (_logsPage > 0) { _logsPage--; _renderLogsPage(); }
    });
    document.getElementById('btn-next-logs')?.addEventListener('click', () => {
      const max = Math.ceil(_filteredLogs.length / LOGS_PAGE_SIZE) - 1;
      if (_logsPage < max) { _logsPage++; _renderLogsPage(); }
    });

    _renderLogsPage();
  } catch (e) {
    _toast('❌ Failed to load logs: ' + e.message);
  }
}

function _renderLogsPage() {
  const tbody = document.getElementById('logs-tbody');
  if (!tbody) return;

  const start   = _logsPage * LOGS_PAGE_SIZE;
  const page    = _filteredLogs.slice(start, start + LOGS_PAGE_SIZE);
  const total   = _filteredLogs.length;
  const maxPage = Math.max(1, Math.ceil(total / LOGS_PAGE_SIZE));

  _setText('logs-page-info', `Page ${_logsPage + 1} / ${maxPage} (${total} entries)`);

  if (page.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No log entries yet.</td></tr>';
    return;
  }

  tbody.innerHTML = page.map((l, i) => {
    const targetUser = _allUsers.find(u => u.uid === l.targetUserId);
    const targetName = targetUser
      ? `${_esc(targetUser.displayName || targetUser.email || l.targetUserId)}`
      : (l.targetUserId ? `<span style="color:var(--muted)">${_esc(l.targetUserId).substring(0,12)}…</span>` : '—');

    return `<tr>
      <td style="color:var(--muted);font-size:11px">${start + i + 1}</td>
      <td style="font-size:12px">${_esc(l.adminEmail || l.adminId || '—')}</td>
      <td><span class="log-action">${_esc(l.action || '—')}</span></td>
      <td style="font-size:12px">${targetName}</td>
      <td style="color:var(--muted);font-size:12px;max-width:240px;word-break:break-word">${_esc(l.details || '—')}</td>
      <td style="color:var(--muted);font-size:12px;white-space:nowrap">${l.timestamp ? _dateTimeStr(l.timestamp) : '—'}</td>
    </tr>`;
  }).join('');
}

/* ================================================================
   SYSTEM SETTINGS (super_admin only)
================================================================ */

async function _loadSystemSettings() {
  try {
    const snap = await get(ref(db, 'settings'));
    _systemSettings = snap.exists() ? snap.val() : {};

    // Populate form fields
    const fields = ['coinRate', 'adReward', 'dailyAdLimit', 'minRedeemLevel', 'minStreak', 'flagCoinThreshold'];
    const defaults = { coinRate: 1000, adReward: 5, dailyAdLimit: 20, minRedeemLevel: 12, minStreak: 7, flagCoinThreshold: 500 };

    fields.forEach(f => {
      const el = document.getElementById(`setting-${f}`);
      if (el) el.value = _systemSettings[f] ?? defaults[f];
    });
  } catch (e) {
    console.warn('_loadSystemSettings error:', e.message);
  }
}

document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
  if (_currentAdminRole !== 'super_admin') {
    _toast('❌ Only super admin can change system settings');
    return;
  }
  try {
    const fields   = ['coinRate', 'adReward', 'dailyAdLimit', 'minRedeemLevel', 'minStreak', 'flagCoinThreshold'];
    const newSettings = {};
    fields.forEach(f => {
      const el = document.getElementById(`setting-${f}`);
      if (el) newSettings[f] = parseInt(el.value) || 0;
    });

    await set(ref(db, 'settings'), { ...newSettings, updatedAt: Date.now(), updatedBy: _currentAdminEmail });
    _systemSettings = newSettings;
    await logAdminAction('UPDATE_SETTINGS', '', `Settings updated: ${JSON.stringify(newSettings)}`);
    _toast('💾 Settings saved successfully!');
  } catch (e) {
    _toast('❌ Failed to save: ' + e.message);
  }
});

/* ─── Copy Firebase Rules ─────────────────────────────────── */
document.getElementById('btn-copy-rules')?.addEventListener('click', () => {
  const rules = document.getElementById('firebase-rules-display')?.textContent || '';
  navigator.clipboard.writeText(rules).then(() => {
    _toast('📋 Firebase rules copied to clipboard!');
  }).catch(() => {
    _toast('⚠️ Copy failed — please copy manually');
  });
});

/* ================================================================
   ROLE MANAGEMENT TABLE (super_admin only)
================================================================ */

function _renderRolesTable() {
  if (_currentAdminRole !== 'super_admin') return;
  const tbody = document.getElementById('roles-tbody');
  if (!tbody) return;

  // Show all users, not just admins — for easy promotion
  const relevant = _allUsers.filter(u => {
    const r = u.role || 'user';
    return r === 'admin' || r === 'super_admin' || r === 'user';
  }).slice(0, 50); // Cap at 50 for performance

  if (relevant.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No users.</td></tr>';
    return;
  }

  tbody.innerHTML = relevant.map(u => {
    const role   = u.role || 'user';
    const isSelf = u.uid === _currentAdminId;

    const roleBadge = role === 'super_admin'
      ? '<span class="badge badge-super">👑 Super Admin</span>'
      : role === 'admin'
        ? '<span class="badge badge-admin">🛡 Admin</span>'
        : '<span class="badge badge-user">User</span>';

    return `<tr>
      <td><strong>${_esc(u.displayName || 'Unknown')}</strong></td>
      <td style="color:var(--muted);font-size:12px">${_esc(u.email || '—')}</td>
      <td>${roleBadge}</td>
      <td>
        ${isSelf || role === 'super_admin' ? '<span style="color:var(--muted);font-size:12px">Protected</span>' : `
          <div class="btn-group">
            ${role !== 'admin' ? `<button class="btn btn-gold" onclick="window._promoteUser('${u.uid}')">⬆ Make Admin</button>` : ''}
            ${role === 'admin' ? `<button class="btn btn-orange" onclick="window._demoteUser('${u.uid}')">⬇ Demote</button>` : ''}
          </div>
        `}
      </td>
    </tr>`;
  }).join('');
}

window._promoteUser = async function(uid) {
  const ok = await _confirmAction('⬆ Promote to Admin', 'This user will gain full admin panel access.');
  if (!ok) return;
  try {
    await update(ref(db, `users/${uid}`), { role: 'admin' });
    await logAdminAction('PROMOTE_ADMIN', uid, 'Promoted to admin');
    await fetchAllUsers();
    _renderRolesTable();
    _renderUsersPage();
    _toast('✅ User promoted to Admin!');
  } catch (e) {
    _toast('❌ ' + e.message);
  }
};

window._demoteUser = async function(uid) {
  const user = _allUsers.find(u => u.uid === uid);
  if (user?.role === 'super_admin') { _toast('⚠️ Cannot demote super admin'); return; }
  const ok = await _confirmAction('⬇ Demote Admin', 'This admin will lose all admin panel access.');
  if (!ok) return;
  try {
    await update(ref(db, `users/${uid}`), { role: 'user' });
    await logAdminAction('DEMOTE_ADMIN', uid, 'Demoted from admin to user');
    await fetchAllUsers();
    _renderRolesTable();
    _renderUsersPage();
    _toast('✅ Admin demoted to User.');
  } catch (e) {
    _toast('❌ ' + e.message);
  }
};

/* ================================================================
   BROADCAST
================================================================ */

document.getElementById('btn-broadcast')?.addEventListener('click', async () => {
  const title = document.getElementById('bc-title')?.value?.trim();
  const msg   = document.getElementById('bc-msg')?.value?.trim();
  if (!title || !msg) { _toast('⚠️ Fill in both fields.'); return; }

  try {
    await push(ref(db, 'broadcasts'), {
      title,
      message:   msg,
      createdAt: Date.now(),
      createdBy: _currentAdminEmail || 'admin',
    });
    document.getElementById('bc-title').value = '';
    document.getElementById('bc-msg').value   = '';
    await logAdminAction('BROADCAST', '', `Broadcast sent: "${title}"`);
    _toast('📣 Broadcast sent to all users!');
  } catch (e) {
    _toast('❌ ' + e.message);
  }
});

/* ================================================================
   HELPERS
================================================================ */

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}

function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _dateStr(ts) {
  return new Date(ts).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

function _dateTimeStr(ts) {
  return new Date(ts).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

let _toastTimer = null;
window._adminToast = function(msg, dur = 2800) { _toast(msg, dur); };
function _toast(msg, dur = 2800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

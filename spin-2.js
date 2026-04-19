/* ================================================================
   js/features/spin.js — Spin Wheel Engine.
   Draws canvas, animates spin, applies rewards, updates state.
================================================================ */
'use strict';

import { SEGMENTS, SPIN_WEIGHTS, TASKS_CONFIG } from './config.js';
import { levelFromExp, expRequired, expInCurrentLevel } from './config.js';
import { getState, setState } from './state.js';
import { debounce, todayStr, lsGet, lsSet } from './utils.js';
import { playSound } from './sound.js';
import { syncUserStats } from './auth.js';
import { giveReward as giveRewardSecure } from './reward-system.js';

const SEG_COUNT  = SEGMENTS.length;
const SEG_ANGLE  = (Math.PI * 2) / SEG_COUNT;

let _canvas      = null;
let _ctx2d       = null;
let _angle       = -Math.PI / 2;
let _isSpinning  = false;
let _rafId       = null;
let _dailyInterval = null;

/* ─── Init ─────────────────────────────────────────────────── */
export function initSpin() {
  _canvas = document.getElementById('spin-canvas');
  if (!_canvas) return;
  _ctx2d = _canvas.getContext('2d');

  _resizeCanvas();
  window.addEventListener('resize', debounce(_resizeCanvas, 150));

  drawWheel(_angle);

  const btn = document.getElementById('btn-spin');
  btn?.addEventListener('click', debounce(_onSpin, 500));

  // Expose giveReward globally (games use it)
  window.__ns_giveReward = giveReward;

  // Init daily reward timer
  _initDailyTimer();

  // Init tasks
  renderTasks();

  // Auto-complete login task on load
  _completeTask('task_login');
}

/* ─── Canvas drawing ─────────────────────────────────────────── */
function _resizeCanvas() {
  if (!_canvas) return;
  const size = Math.min(300, window.innerWidth * 0.88);
  _canvas.width  = size;
  _canvas.height = size;
  drawWheel(_angle);
}

export function drawWheel(angle) {
  if (!_canvas || !_ctx2d) return;
  const cx = _canvas.width  / 2;
  const cy = _canvas.height / 2;
  const r  = cx - 4;
  const ctx = _ctx2d;

  ctx.clearRect(0, 0, _canvas.width, _canvas.height);

  // Draw each segment
  for (let i = 0; i < SEG_COUNT; i++) {
    const start = angle + i * SEG_ANGLE;
    const end   = start + SEG_ANGLE;
    const seg   = SEGMENTS[i];

    // Segment fill
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();

    // Segment border
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner glow arc
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, start, end);
    ctx.strokeStyle = seg.glow + '55';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Label (icon + text)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + SEG_ANGLE / 2);

    // Icon
    ctx.font = `${Math.max(14, r * 0.13)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(seg.icon, r * 0.58, 0);

    // Label text
    ctx.font = `bold ${Math.max(9, r * 0.085)}px 'Rajdhani', sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur = 3;
    ctx.fillText(seg.label, r * 0.30, 0);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // Centre hub circle (drawn over segments)
  const hubR = Math.max(20, r * 0.13);
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fillStyle = '#080b14';
  ctx.fill();
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 3;
  ctx.stroke();
}

/* ─── Spin logic ─────────────────────────────────────────────── */
function _onSpin() {
  const s = getState();
  if (_isSpinning) return;
  if (s.spins <= 0) {
    playSound('error');
    window.__ns_showPopup?.('❌', 'No Spins Left!', 'Come back tomorrow or complete tasks to earn more spins!');
    return;
  }

  // Pick winner
  const winIdx = SPIN_WEIGHTS[Math.floor(Math.random() * SPIN_WEIGHTS.length)];

  // Calculate target angle: winner segment should land under pointer (top)
  const targetSegCenter = -Math.PI / 2 - (winIdx * SEG_ANGLE + SEG_ANGLE / 2);
  const extraSpins      = (Math.random() * 3 + 5) * Math.PI * 2; // 5-8 full rotations
  const targetAngle     = targetSegCenter + extraSpins;

  // Deduct spin immediately
  setState({ spins: s.spins - 1, spinCount: (s.spinCount || 0) + 1 });

  const btn = document.getElementById('btn-spin');
  if (btn) btn.disabled = true;
  _isSpinning = true;

  playSound('spin');
  _animate(_angle, _angle + targetAngle, 4000, 'easeOut', () => {
    _angle = ((_angle + targetAngle) % (Math.PI * 2));
    _isSpinning = false;
    if (btn) btn.disabled = false;

    const reward = SEGMENTS[winIdx];
    giveReward(reward.type, reward.value, reward.icon, reward.label);
    _completeTask('task_spin');
    _checkSpinCountTask();
  });
}

function _animate(from, to, duration, easing, onDone) {
  const start = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing === 'easeOut' ? _easeOut(progress) : progress;
    const current = from + (to - from) * easedProgress;

    _angle = current;
    drawWheel(current);

    if (progress < 1) {
      _rafId = requestAnimationFrame(tick);
    } else {
      onDone?.();
    }
  }

  _rafId = requestAnimationFrame(tick);
}

function _easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

/* ─── Reward distribution ────────────────────────────────────── */
export function giveReward(type, value, icon = '🎁', label = '') {
  let msg   = '';
  let sound = 'click';

  switch (type) {
    case 'coins':
      msg   = `You earned ${value} coins! 💰`;
      sound = 'coins';
      break;
    case 'exp':
      msg   = `You earned ${value} EXP! ⭐`;
      sound = 'exp';
      break;
    case 'spin':
      msg   = `You got +${value} free spin! 🎰`;
      sound = 'coins';
      break;
    default:
      return;
  }

  // Use centralized reward system with validation and anti-cheat
  const success = giveRewardSecure(type, value, 'spin_wheel', { icon, label });
  
  if (!success) {
    console.error('[spin] Reward validation failed!');
    playSound('error');
    window.__ns_showPopup?.('⚠️', 'Error', 'Reward could not be processed.');
    return;
  }

  window.__ns_showPopup?.(icon, label || 'Reward!', msg);
  playSound(sound);

  // Check milestones
  _checkMilestones();
}

/* ─── Daily reward ───────────────────────────────────────────── */
function _initDailyTimer() {
  _renderDailyTimer();
  _clearDailyInterval();
  _dailyInterval = setInterval(_renderDailyTimer, 1000);

  document.getElementById('btn-daily')?.addEventListener('click', _claimDaily);
}

function _clearDailyInterval() {
  if (_dailyInterval) { clearInterval(_dailyInterval); _dailyInterval = null; }
}

function _renderDailyTimer() {
  const s      = getState();
  const now    = Date.now();
  const last   = s.lastDailyReward || 0;
  const next   = last + 24 * 60 * 60 * 1000; // 24h cooldown
  const diff   = next - now;
  const timerEl = document.getElementById('daily-timer');
  const btn     = document.getElementById('btn-daily');

  if (diff <= 0) {
    if (timerEl) timerEl.textContent = 'Ready!';
    if (btn) btn.disabled = false;
  } else {
    const s2 = Math.floor(diff / 1000);
    const h  = Math.floor(s2 / 3600);
    const m  = Math.floor((s2 % 3600) / 60);
    const sec = s2 % 60;
    if (timerEl) timerEl.textContent =
      `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    if (btn) btn.disabled = true;
  }
}

function _claimDaily() {
  const s   = getState();
  const now = Date.now();
  const last = s.lastDailyReward || 0;

  if (now - last < 24 * 60 * 60 * 1000) {
    playSound('error');
    return;
  }

  // Base reward + streak bonus
  const { streakBonusExp } = { streakBonusExp: (streak) => {
    if (streak < 3)  return 0;
    if (streak < 7)  return 10;
    if (streak < 14) return 25;
    return 50;
  }};

  const baseCoins = 15 + Math.floor(Math.random() * 10);
  const baseExp   = 10;
  const bonus     = streakBonusExp(s.streak);

  // Give coins using centralized system
  giveRewardSecure('coins', baseCoins, 'daily_reward', { 
    icon: '🎁', 
    label: 'Daily Coins' 
  });

  // Give EXP + bonus using centralized system
  giveRewardSecure('exp', baseExp + bonus, 'daily_reward', { 
    icon: '⭐', 
    label: 'Daily EXP' 
  });

  // Update last claim time
  setState({ lastDailyReward: now });

  playSound('coins');
  const bonusStr = bonus > 0 ? `\n🔥 Streak bonus: +${bonus} EXP!` : '';
  window.__ns_showPopup?.('🎁', 'Daily Reward!',
    `+${baseCoins} Coins & +${baseExp + bonus} EXP claimed!${bonusStr}`);

  _completeTask('task_daily');
  syncUserStats(getState()).catch(() => {});
}

/* ─── Daily tasks ────────────────────────────────────────────── */
export function renderTasks() {
  const listEl = document.getElementById('tasks-list');
  if (!listEl) return;

  const s = getState();

  // Reset tasks if it's a new day
  const today = todayStr();
  if (s.lastDailyReset !== today) {
    setState({ tasks: {}, lastDailyReset: today });
  }

  const tasks  = getState().tasks || {};
  listEl.innerHTML = TASKS_CONFIG.map((task) => {
    const done = !!tasks[task.id];
    return `
      <div class="task-item ${done ? 'done' : ''}" id="task-${task.id}">
        <div class="task-icon">${task.icon}</div>
        <div class="task-info">
          <div class="task-name">${task.name}</div>
          <div class="task-reward">${task.reward}</div>
        </div>
        <div class="task-check">${done ? '✅' : '⬜'}</div>
      </div>`;
  }).join('');
}

export function _completeTask(taskId) {
  const s = getState();
  const tasks = s.tasks || {};
  if (tasks[taskId]) return; // Already done

  const task = TASKS_CONFIG.find((t) => t.id === taskId);
  if (!task) return;

  const newTasks = { ...tasks, [taskId]: true };
  setState({ tasks: newTasks });

  // Give reward using centralized system
  if (task.type && task.value > 0) {
    giveRewardSecure(task.type, task.value, 'task_complete', {
      icon: task.icon,
      label: `Task: ${task.name}`
    });
  }

  // Update task UI
  const taskEl = document.getElementById(`task-${taskId}`);
  if (taskEl) {
    taskEl.classList.add('done');
    const checkEl = taskEl.querySelector('.task-check');
    if (checkEl) checkEl.textContent = '✅';
  }

  syncUserStats(getState()).catch(() => {});
}

function _checkSpinCountTask() {
  const s = getState();
  if ((s.spinCount || 0) >= 3) _completeTask('task_3spins');
}

/* ─── Milestones ─────────────────────────────────────────────── */
function _checkMilestones() {
  import('./auth.js').then(({ getUserProfile, getCurrentUid }) => {
    import('./config.js').then(({ MILESTONES }) => {
      const s       = getState();
      const profile = getUserProfile();
      if (!profile) return;

      const achieved = profile.milestonesAchieved || [];
      const toGrant  = [];

      MILESTONES.forEach((m) => {
        if (achieved.includes(m.id)) return;
        let met = false;
        switch (m.id) {
          case 'first_spin': met = s.spinCount >= 1; break;
          case 'level5':     met = s.level >= 5; break;
          case 'level10':    met = s.level >= 10; break;
          case 'level12':    met = s.level >= 12; break;
          case 'streak3':    met = s.streak >= 3; break;
          case 'streak7':    met = s.streak >= 7; break;
          case 'coins100':   met = s.coins >= 100; break;
          case 'coins500':   met = s.coins >= 500; break;
          case 'spins10':    met = s.spinCount >= 10; break;
        }
        if (met) toGrant.push(m);
      });

      if (toGrant.length === 0) return;

      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')
        .then(({ ref, update }) => {
          import('./auth.js').then(({ db, getCurrentUid }) => {
            const uid = getCurrentUid();
            if (!uid) return;
            const newAchieved = [...achieved, ...toGrant.map((m) => m.id)];
            
            // Give milestone rewards using centralized system
            toGrant.forEach((m) => {
              if (m.coins > 0) {
                giveRewardSecure('coins', m.coins, 'milestone', {
                  icon: m.icon,
                  label: `Milestone: ${m.name}`
                });
              }
              if (m.exp > 0) {
                giveRewardSecure('exp', m.exp, 'milestone', {
                  icon: m.icon,
                  label: `Milestone: ${m.name}`
                });
              }
            });

            update(ref(db, `users/${uid}`), { milestonesAchieved: newAchieved }).catch(() => {});

            if (toGrant.length > 0) {
              const m = toGrant[0];
              const coinsStr = m.coins > 0 ? `+${m.coins} Coins` : '';
              const expStr = m.exp > 0 ? `+${m.exp} EXP` : '';
              const rewardStr = [coinsStr, expStr].filter(Boolean).join(' & ');
              window.__ns_showPopup?.('🏅', `Milestone: ${m.name}!`,
                `${rewardStr} for: ${m.req}`);
            }
          });
        });
    });
  });
}

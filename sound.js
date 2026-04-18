/* ================================================================
   js/ui/sound.js — Web Audio API sound synthesis.
   No external audio files — works offline.
================================================================ */
'use strict';

import { lsGet, lsSet } from './utils.js';

let _enabled = lsGet('ns_sound') !== '0';
let _ctx = null;

function _getCtx() {
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { _ctx = null; }
  }
  return _ctx;
}

export function isSoundEnabled() { return _enabled; }

export function initSoundToggle() {
  _updateIcon();
  document.getElementById('btn-sound-toggle')?.addEventListener('click', () => {
    _enabled = !_enabled;
    lsSet('ns_sound', _enabled ? '1' : '0');
    _updateIcon();
    if (_enabled) playSound('click');
  });
}

function _updateIcon() {
  const el = document.getElementById('sound-icon');
  if (el) el.textContent = _enabled ? '🔊' : '🔇';
}

export function playSound(type) {
  if (!_enabled) return;
  const ctx = _getCtx();
  if (!ctx) return;

  // Resume context if suspended (autoplay policy)
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  try {
    const t = ctx.currentTime;

    const osc  = () => ctx.createOscillator();
    const gain = () => ctx.createGain();
    const play = (o, g, dur) => { o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur); };

    switch (type) {
      case 'click': {
        const o = osc(), g = gain();
        o.type = 'sine'; o.frequency.setValueAtTime(800, t);
        g.gain.setValueAtTime(.1, t); g.gain.exponentialRampToValueAtTime(.001, t + .08);
        play(o, g, .08); break;
      }
      case 'spin': {
        const o = osc(), g = gain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(600, t + .3);
        g.gain.setValueAtTime(.07, t); g.gain.exponentialRampToValueAtTime(.001, t + .3);
        play(o, g, .3); break;
      }
      case 'coins': {
        [0, .1, .2].forEach((delay) => {
          const o = osc(), g = gain();
          o.type = 'sine'; o.frequency.setValueAtTime(880 + delay * 440, t + delay);
          g.gain.setValueAtTime(.12, t + delay); g.gain.exponentialRampToValueAtTime(.001, t + delay + .15);
          play(o, g, delay + .15);
        }); return;
      }
      case 'exp': {
        const o = osc(), g = gain();
        o.type = 'triangle'; o.frequency.setValueAtTime(440, t); o.frequency.exponentialRampToValueAtTime(880, t + .2);
        g.gain.setValueAtTime(.1, t); g.gain.exponentialRampToValueAtTime(.001, t + .2);
        play(o, g, .2); break;
      }
      case 'levelup': {
        [523, 659, 784, 1047].forEach((freq, i) => {
          const delay = i * .15;
          const o = osc(), g = gain();
          o.type = 'sine'; o.frequency.setValueAtTime(freq, t + delay);
          g.gain.setValueAtTime(.15, t + delay); g.gain.exponentialRampToValueAtTime(.001, t + delay + .2);
          play(o, g, delay + .2);
        }); return;
      }
      case 'error': {
        const o = osc(), g = gain();
        o.type = 'square'; o.frequency.setValueAtTime(200, t);
        g.gain.setValueAtTime(.06, t); g.gain.exponentialRampToValueAtTime(.001, t + .25);
        play(o, g, .25); break;
      }
      case 'flip': {
        const o = osc(), g = gain();
        o.type = 'sine'; o.frequency.setValueAtTime(600, t); o.frequency.exponentialRampToValueAtTime(900, t + .06);
        g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.001, t + .06);
        play(o, g, .06); break;
      }
      case 'match': {
        [440, 554, 659].forEach((freq, i) => {
          const delay = i * .08;
          const o = osc(), g = gain();
          o.type = 'sine'; o.frequency.setValueAtTime(freq, t + delay);
          g.gain.setValueAtTime(.1, t + delay); g.gain.exponentialRampToValueAtTime(.001, t + delay + .12);
          play(o, g, delay + .12);
        }); return;
      }
    }
  } catch { /* silent fail */ }
}

// Expose globally for cross-module usage
window.__ns_playSound = playSound;

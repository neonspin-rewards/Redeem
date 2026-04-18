/* ================================================================
   js/ui/particles.js — Animated background particles.
   Uses CSS animations, not canvas — no reflow risk.
================================================================ */
'use strict';

const PARTICLE_COUNT = 35;
const COLORS = ['rgba(0,212,255,.5)', 'rgba(168,85,247,.5)', 'rgba(251,191,36,.4)', 'rgba(57,255,20,.4)'];

export function initParticles() {
  const container = document.getElementById('particles-bg');
  if (!container) return;

  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = document.createElement('div');
    p.className = 'particle';

    const size   = Math.random() * 3 + 1;
    const x      = Math.random() * 100;
    const delay  = Math.random() * 20;
    const dur    = Math.random() * 15 + 10;
    const color  = COLORS[Math.floor(Math.random() * COLORS.length)];

    Object.assign(p.style, {
      width:            `${size}px`,
      height:           `${size}px`,
      left:             `${x}%`,
      top:              `${Math.random() * 100}%`,
      background:       color,
      boxShadow:        `0 0 ${size * 3}px ${color}`,
      opacity:          String(Math.random() * .6 + .2),
      animation:        `particleFloat ${dur}s ${delay}s ease-in-out infinite alternate`,
    });

    fragment.appendChild(p);
  }

  container.appendChild(fragment);

  // Inject particle keyframes once
  if (!document.getElementById('particle-keyframes')) {
    const style = document.createElement('style');
    style.id = 'particle-keyframes';
    style.textContent = `
      @keyframes particleFloat {
        0%   { transform: translateY(0) translateX(0) scale(1); opacity: .3; }
        100% { transform: translateY(-40px) translateX(${Math.random() > .5 ? '' : '-'}15px) scale(1.3); opacity: .7; }
      }
    `;
    document.head.appendChild(style);
  }
}

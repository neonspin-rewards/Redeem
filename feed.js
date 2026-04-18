/* ================================================================
   js/features/feed.js — Fake live activity feed.
   Shows realistic-looking activity from other users.
================================================================ */
'use strict';

import { FEED_NAMES, FEED_AVATARS, FEED_TEMPLATES } from './config.js';
import { randInt, randItem } from './utils.js';

let _interval = null;
const MAX_ITEMS = 6;

export function initFeed() {
  const container = document.getElementById('activity-feed');
  if (!container) return;

  // Populate initial items
  for (let i = 0; i < 4; i++) _addFeedItem(container, true);

  // Rotate new items every 4-8 seconds
  _clearInterval();
  _interval = setInterval(() => {
    _addFeedItem(container, false);
    // Remove oldest if over limit
    const items = container.querySelectorAll('.feed-item');
    if (items.length > MAX_ITEMS) {
      const oldest = items[0];
      oldest.classList.add('fading-out');
      setTimeout(() => oldest.remove(), 300);
    }
  }, randInt(4000, 8000));
}

function _addFeedItem(container, silent = false) {
  const name     = randItem(FEED_NAMES);
  const avatar   = randItem(FEED_AVATARS);
  const tmplIdx  = randInt(0, FEED_TEMPLATES.length - 1);
  const val      = tmplIdx === 1 ? randInt(2, 8) : randInt(5, 80); // level or value
  const template = FEED_TEMPLATES[tmplIdx];
  const text     = template(name, val);
  const time     = 'just now';

  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `
    <div class="feed-avatar">${avatar}</div>
    <div class="feed-text">${text}</div>
    <div class="feed-time">${time}</div>
  `;

  if (silent) {
    container.appendChild(item);
  } else {
    container.prepend(item);
  }
}

function _clearInterval() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

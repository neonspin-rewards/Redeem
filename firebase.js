/* ═══════════════════════════════════════════════════════════════
   NEONSPIN — firebase.js
   Firebase v9 (modular) initialisation.
   Exports: app, auth, db  — imported by auth.js and script.js
═══════════════════════════════════════════════════════════════ */

import { initializeApp }         from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider }
                                  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore }           from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAnalytics }           from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';

/* ─── YOUR FIREBASE CONFIG ───────────────────────────────────
   Do NOT change these values.
   Keep this file out of public commits if you add server-side
   secrets later (API key here is safe — Firebase security is
   enforced via Firestore Rules, not the API key itself).
─────────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            'AIzaSyBPDul4R8nIYcLVwpw1snmukOI3mRLHbEg',
  authDomain:        'neonspin-rewards-4101a.firebaseapp.com',
  projectId:         'neonspin-rewards-4101a',
  storageBucket:     'neonspin-rewards-4101a.firebasestorage.app',
  messagingSenderId: '424031837123',
  appId:             '1:424031837123:web:4b5566d57d8fef3bc93b76',
  measurementId:     'G-184R1198TX',
};

/* ─── INITIALISE APP ─────────────────────────────────────────── */
export const app      = initializeApp(firebaseConfig);
export const auth     = getAuth(app);
export const db       = getFirestore(app);
export const provider = new GoogleAuthProvider();

/* Optional — analytics only runs in browsers that support it */
try { getAnalytics(app); } catch (_) { /* non-browser env — ignore */ }

/* ─── CLOUDINARY CONFIG ─────────────────────────────────────── */
export const CLOUDINARY = {
  cloudName:    'dary8yynb',
  uploadPreset: 'neonspin_upload',
  /* Unsigned upload endpoint — no API secret needed */
  uploadUrl: 'https://api.cloudinary.com/v1_1/dary8yynb/image/upload',
};

/* ─── COLLECTION NAMES ──────────────────────────────────────── */
/* Centralise collection names so a rename only touches one file */
export const COL = {
  users:    'users',
  feedback: 'feedback',
  rewards:  'rewardRequests',
};

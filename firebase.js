/* ═══════════════════════════════════════════════════════════════
   NEONSPIN — firebase.js
   Firebase initialisation & exports.
   Imported by: auth.js, app.js

   ⚠️  CRITICAL BUG FIXED FROM OLD VERSION:
   The old firebase.js imported `getFirestore` (Cloud Firestore)
   but your Firebase project uses the REALTIME DATABASE.
   These are two completely different Firebase products with
   different SDKs, different APIs, and different data structures.
   Using the wrong one causes silent failures — nothing saves.

   THIS FILE now imports from `firebase-database` (Realtime DB).

   REALTIME DB vs FIRESTORE:
   • Realtime DB  → JSON tree, `ref()` / `set()` / `update()`
   • Firestore    → document/collection model, `doc()` / `getDoc()`
   Your dashboard URL ending in "-default-rtdb.firebaseio.com"
   confirms you are using Realtime Database.
═══════════════════════════════════════════════════════════════ */

// Firebase App (core — always needed)
import { initializeApp } from
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

// Firebase Auth (Google Sign-In)
import { getAuth, GoogleAuthProvider } from
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// ✅ FIXED: Realtime Database (NOT Firestore)
import { getDatabase } from
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';


/* ─────────────────────────────────────────────────────────────
   YOUR FIREBASE CONFIG
   These values come from Firebase Console → Project Settings.
   The API key here is safe to be public — Firebase security
   is enforced by Database Rules, not by hiding this key.
───────────────────────────────────────────────────────────────  */
const firebaseConfig = {
  apiKey:            'AIzaSyBPDul4R8nIYcLVwpw1snmukOI3mRLHbEg',
  authDomain:        'neonspin-rewards-4101a.firebaseapp.com',
  projectId:         'neonspin-rewards-4101a',
  storageBucket:     'neonspin-rewards-4101a.firebasestorage.app',
  messagingSenderId: '424031837123',
  appId:             '1:424031837123:web:4b5566d57d8fef3bc93b76',
  measurementId:     'G-184R1198TX',
  // ✅ REQUIRED for Realtime Database — was missing/wrong before
  databaseURL:       'https://neonspin-rewards-4101a-default-rtdb.firebaseio.com',
};


/* ─────────────────────────────────────────────────────────────
   INITIALISE
   initializeApp() is safe to call once. If called twice it
   throws — but we only have one script tag so it won't happen.
───────────────────────────────────────────────────────────────  */
const app = initializeApp(firebaseConfig);


/* ─────────────────────────────────────────────────────────────
   EXPORTS
   Other modules import exactly what they need from here.
───────────────────────────────────────────────────────────────  */

/** Firebase Auth instance */
export const auth = getAuth(app);

/** Google Auth provider (configured for sign-in) */
export const provider = new GoogleAuthProvider();

/** Realtime Database instance */
export const db = getDatabase(app);


/* ─────────────────────────────────────────────────────────────
   CLOUDINARY CONFIG
   Used by the feedback form to upload screenshot images.
   Unsigned uploads only — no API secret needed in the browser.
───────────────────────────────────────────────────────────────  */
export const CLOUDINARY = {
  cloudName:    'dary8yynb',
  uploadPreset: 'neonspin_upload',
  uploadUrl:    'https://api.cloudinary.com/v1_1/dary8yynb/image/upload',
};


/* ─────────────────────────────────────────────────────────────
   DATABASE PATH CONSTANTS
   Centralise all DB paths here so a rename only touches
   one file. No more scattered magic strings.

   Realtime DB structure:
   /users/{uid}/
     coins, exp, level, streak, lastLoginDay,
     spinCount, referralCode, referredBy,
     milestonesAchieved, joinedAt, displayName,
     email, photoURL, lastDailyReward

   /feedback/{pushId}/
     userId, name, email, message, imageURL, timestamp

   /rewardRequests/{pushId}/
     uid, email, name, level, coins, streak, status, createdAt
───────────────────────────────────────────────────────────────  */
export const PATHS = {
  user:           (uid) => `users/${uid}`,
  users:          'users',
  feedback:       'feedback',
  rewardRequests: 'rewardRequests',
};

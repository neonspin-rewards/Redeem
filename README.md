# ⚡ NeonSpin — Gaming Rewards Platform

<div align="center">

![NeonSpin Banner](https://img.shields.io/badge/NeonSpin-Gaming%20Rewards-00d4ff?style=for-the-badge&logo=firebase&logoColor=white)
![Status](https://img.shields.io/badge/Status-Live-39ff14?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-a855f7?style=for-the-badge)
![Firebase](https://img.shields.io/badge/Firebase-Realtime%20DB-ffd700?style=for-the-badge&logo=firebase)

**Spin the wheel · Earn rewards · Level up · Climb the leaderboard**

[🚀 Live Demo](https://neonspin-rewards.github.io/Redeem/) · [🐛 Report Bug](https://github.com/neonspin-rewards/Redeem/issues) · [💡 Request Feature](https://github.com/neonspin-rewards/Redeem/issues)

</div>

---

## 📸 Screenshots

| Loading | Home | Spin |
|---------|------|------|
| Neon logo screen | Stats + wheel + feed | Animated spin result |

---

## ✨ Features

| Feature | Details |
|---------|---------|
| 🎡 **Spin Wheel** | 8-segment canvas wheel with smooth ease-out animation |
| 🏆 **Leaderboard** | Real-time top players sorted by level, coins, or streak |
| 🎁 **Daily Rewards** | 24-hour cooldown system with countdown timer |
| ✅ **Daily Tasks** | 5 auto-tracked tasks that reset each day |
| 📊 **EXP & Levels** | Custom curve: `50 × level^1.3` per level |
| 🔥 **Login Streaks** | Consecutive day tracking with milestone bonuses |
| 🏅 **Milestones** | 8 achievement badges with automatic coin/EXP rewards |
| 🎮 **Mini Games** | Tap Frenzy (10s challenge) + 2048 (classic puzzle) |
| 📤 **Feedback** | Image upload via Cloudinary + Firebase storage |
| 🔗 **Referrals** | 6-char referral codes with bonus EXP for both parties |
| 🌙 **Dark/Light** | Full theme toggle saved to localStorage |
| 🔊 **Sound FX** | Synthesised Web Audio API tones — no external files |
| 📱 **Mobile-First** | Responsive, AMOLED-optimised, safe-area aware |
| ⚡ **Offline-Ready** | localStorage state means game works without internet |

---

## 🛠️ Tech Stack

```
Frontend      HTML5 · CSS3 · Vanilla ES Modules (no framework)
Auth          Firebase Authentication (Google Sign-In, redirect flow)
Database      Firebase Realtime Database
Image Upload  Cloudinary (unsigned upload preset)
Fonts         Google Fonts — Orbitron + Rajdhani
Hosting       GitHub Pages
Canvas        HTML5 Canvas API (spin wheel rendering)
Audio         Web Audio API (synthesised tones)
```

---

## 📁 Project Structure

```
NeonSpin/
├── index.html          # App shell — single page, all tabs
├── style.css           # Neon glassmorphism design system
│
├── firebase.js         # Firebase init + Realtime DB exports
├── utils.js            # Pure helpers (EXP math, dates, localStorage)
├── auth.js             # Google Sign-In + user profile + leaderboard
├── spin.js             # Wheel engine + state + daily + tasks + sound
├── game.js             # Tap Frenzy + 2048 mini games
├── app.js              # Master entry point — wires all modules
│
├── database.rules.json # Firebase Realtime DB security rules
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- A [Firebase](https://console.firebase.google.com/) project with:
  - **Authentication** → Google sign-in method enabled
  - **Realtime Database** created (not Firestore)
- A [Cloudinary](https://cloudinary.com/) account with an unsigned upload preset

### 1. Clone the repository

```bash
git clone https://github.com/neonspin-rewards/Redeem.git
cd Redeem
```

### 2. Configure Firebase

Open `firebase.js` and replace the config object with your own project values:

```js
const firebaseConfig = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT',
  storageBucket:     'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
  databaseURL:       'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
};
```

Also update `CLOUDINARY` in the same file:

```js
export const CLOUDINARY = {
  cloudName:    'YOUR_CLOUD_NAME',
  uploadPreset: 'YOUR_UPLOAD_PRESET',
  uploadUrl:    'https://api.cloudinary.com/v1_1/YOUR_CLOUD_NAME/image/upload',
};
```

### 3. Set Firebase Authorised Domains

In Firebase Console → **Authentication** → **Settings** → **Authorised domains**, add:

```
neonspin-rewards.github.io
localhost
```

### 4. Deploy Database Rules

**Option A — Firebase Console** (recommended):
1. Go to **Realtime Database** → **Rules** tab
2. Paste the contents of `database.rules.json`
3. Click **Publish**

**Option B — Firebase CLI**:
```bash
npm install -g firebase-tools
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only database
```

### 5. Deploy to GitHub Pages

Push to your `main` branch — GitHub Pages auto-deploys from the root:

```bash
git add .
git commit -m "feat: initial deploy"
git push origin main
```

Then in your repo: **Settings** → **Pages** → Source: `main` / `/ (root)` → **Save**.

Your site will be live at:
```
https://YOUR_USERNAME.github.io/YOUR_REPO/
```

---

## 🔐 Firebase Database Rules

The `database.rules.json` file implements **deny-by-default** security:

| Path | Read | Write | Notes |
|------|------|-------|-------|
| `/users/*` | ✅ Auth only | ✅ Own UID only | Leaderboard requires all-read |
| `/feedback/*` | ✅ Auth only | ✅ Auth only | Validated message length ≤ 300 |
| `/rewardRequests/*` | ✅ Own only | ✅ Auth, create-only | Status locked to `"pending"` |
| Everything else | ❌ Denied | ❌ Denied | Default deny |

Key protections:
- `spinCount` can only **increase** — prevents rewind exploits
- `uid` field in any document must match `auth.uid` — no impersonation
- Reward eligibility enforced server-side (`level ≥ 10`, `streak ≥ 7`)
- Users cannot set their own reward `status` — admins manage via Console

---

## 🎮 Game Systems

### Spin Wheel
- 8 segments with weighted probability table
- 5–8 full rotations before landing (feels real)
- 20% near-miss mechanic (lands adjacent to jackpot)
- Anti-exploit: debounce + `isSpinning` flag + server sync

### EXP & Levels
```
EXP needed for level N = floor(50 × N^1.3)

Level 1 →  50 EXP    Level 5  → 180 EXP
Level 10 → 398 EXP   Level 20 → 907 EXP
```

### Milestone Rewards

| Milestone | Requirement | Reward |
|-----------|-------------|--------|
| First Spin | Spin once | +10 Coins |
| Rising Star | Reach Level 5 | +50 Coins, +30 EXP |
| 3-Day Streak | 3 consecutive days | +20 Coins, +20 EXP |
| Century Club | 100 total coins | +50 EXP |
| Legend | Reach Level 10 | +100 Coins |
| Devoted | 7-day streak | +50 Coins, +50 EXP |
| Spin Master | 10 total spins | +30 Coins, +20 EXP |
| Whale | 500 total coins | +80 EXP |

### Reward Eligibility
Players must meet **both** requirements to request a reward:
- Level ≥ 10
- Login streak ≥ 7 days

Requests go to `/rewardRequests` in Firebase for admin review.

---

## ⚡ Performance Notes

| Optimisation | Detail |
|---|---|
| Canvas size cached | `getBoundingClientRect` called once per resize, not every frame |
| Canvas buffer preserved | `canvas.width` only reset when physical px size changes |
| Grid texture fixed | `body::before` fixed pseudo — not repainted on scroll |
| Shimmer uses transform | `translateX` is GPU-composited, no paint cost |
| Backdrop-filter capped | Max `blur(6px)` across all cards — visually identical, 3× cheaper |
| Font variants trimmed | 5 weights loaded instead of 9 |
| Particles reduced | 12 DOM nodes instead of 22 |
| Loading delay removed | App visible immediately after local state loads |

---

## 🧪 Local Development

Because this project uses **ES Modules** (`type="module"`), you cannot open `index.html` directly as a `file://` URL — the browser blocks module imports for security.

Use any local server:

```bash
# Python
python3 -m http.server 8080

# Node (npx)
npx serve .

# VS Code
# Install "Live Server" extension → right-click index.html → Open with Live Server
```

Then visit `http://localhost:8080`.

---

## 🗺️ Roadmap

- [ ] Push notifications for daily reward reminder
- [ ] Social sharing of spin results
- [ ] Admin dashboard (review reward requests)
- [ ] PWA / installable app manifest
- [ ] Referral leaderboard
- [ ] Weekly tournament mode
- [ ] Google AdSense integration

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feat/your-feature`
5. Open a Pull Request

Please follow the existing code style — each file is well-commented and modular.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 📧 Contact & Support

- **Email:** support@neonspin.app
- **Issues:** [GitHub Issues](https://github.com/neonspin-rewards/Redeem/issues)
- **Live site:** [neonspin-rewards.github.io/Redeem](https://neonspin-rewards.github.io/Redeem/)

---

<div align="center">

Made with ⚡ by the NeonSpin team · Powered by Firebase + GitHub Pages

</div>

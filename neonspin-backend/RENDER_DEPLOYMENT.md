# 🚀 Render Deployment Guide

## Step 1: Prepare Repository

1. Create new folder: `neonspin-backend`
2. Add all files from above
3. Initialize Git:
```bash
cd neonspin-backend
git init
git add .
git commit -m "Initial backend setup"
```

4. Push to GitHub:
```bash
git remote add origin https://github.com/YOUR_USERNAME/neonspin-backend.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:

**Settings:**
- Name: `neonspin-backend`
- Environment: `Node`
- Branch: `main`
- Build Command: `npm install`
- Start Command: `node index.js`

**Environment Variables:**
Add in Render dashboard:
- `PORT` → (leave empty, Render auto-assigns)
- `NODE_ENV` → `production`
- `FRONTEND_URL` → `https://your-frontend-url.com`

5. Click **"Create Web Service"**

## Step 3: Test Deployment

Once deployed, you'll get a URL like:
`https://neonspin-backend.onrender.com`

Test it:
```bash
# Health check
curl https://neonspin-backend.onrender.com/

# Should return:
# {"message":"NeonSpin Backend Running 🚀","status":"healthy",...}
```

## Step 4: Update Frontend

In your frontend JavaScript, update API calls:

```javascript
const API_URL = 'https://neonspin-backend.onrender.com';

// Example: Add coins
async function addCoins(userId, coins) {
  const response = await fetch(`${API_URL}/addCoins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, coins })
  });
  return response.json();
}

// Example: Ban user
async function banUser(userId, reason) {
  const response = await fetch(`${API_URL}/banUser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, reason })
  });
  return response.json();
}

// Example: Redeem request
async function createRedeemRequest(userId, amount) {
  const response = await fetch(`${API_URL}/redeemRequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, amount })
  });
  return response.json();
}
```

## Step 5: Monitor

- Check logs in Render dashboard
- Monitor requests and errors
- Set up alerts for downtime

## Free Tier Notes

Render free tier:
- ✅ Automatic HTTPS
- ✅ Auto-deploy on Git push
- ⚠️ Spins down after 15 min inactivity
- ⚠️ Cold start ~30 seconds

For production, upgrade to paid tier ($7/month) for:
- No spin down
- Faster performance
- More resources

## Troubleshooting

**Issue: "Application failed to respond"**
- Check logs in Render dashboard
- Verify `node index.js` runs locally
- Check environment variables

**Issue: CORS errors**
- Add frontend URL to `FRONTEND_URL` env variable
- Check CORS configuration in `index.js`

**Issue: 404 on routes**
- Verify routes are correct
- Check request method (GET/POST)
- Test with Postman first

## Next Steps

1. ✅ Deploy backend
2. ✅ Test all endpoints
3. ✅ Update frontend to use backend URL
4. ✅ Add Firebase integration (when ready)
5. ✅ Add authentication
6. ✅ Add rate limiting
7. ✅ Add database connection

---

**Your backend is ready to deploy! 🎉**

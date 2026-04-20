# NeonSpin Backend

Node.js backend server for NeonSpin reward-based web app.

## Features

- ✅ Add coins to users
- ✅ Ban users with reason tracking
- ✅ Handle redeem requests
- ✅ Request validation
- ✅ Error handling
- ✅ CORS support
- ✅ Production-ready

## Tech Stack

- Node.js
- Express.js
- CORS
- Helmet (security)
- dotenv (environment variables)

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production

```bash
npm start
```

## API Endpoints

### GET /
Health check

### POST /addCoins
Add coins to user
```json
{
  "userId": "string",
  "coins": number
}
```

### POST /banUser
Ban a user
```json
{
  "userId": "string",
  "reason": "string"
}
```

### POST /redeemRequest
Create redeem request
```json
{
  "userId": "string",
  "amount": number
}
```

### GET /health
Server health status

### GET /api/info
API information

## Render Deployment

1. Push to GitHub
2. Connect repository to Render
3. Set build command: `npm install`
4. Set start command: `node index.js`
5. Add environment variables in Render dashboard

## Environment Variables

See `.env.example` for required variables.

## Firebase Integration

Firebase integration ready - add credentials in `.env` and uncomment TODO sections in `index.js`.

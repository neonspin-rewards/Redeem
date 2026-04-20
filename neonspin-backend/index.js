const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Validation middleware
const validateRequest = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        missingFields
      });
    }
    
    next();
  };
};

// Validation helpers
const isValidUserId = (userId) => {
  return userId && typeof userId === 'string' && userId.trim().length > 0;
};

const isValidNumber = (num) => {
  return typeof num === 'number' && !isNaN(num) && num >= 0;
};

// Routes

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'NeonSpin Backend Running 🚀',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Add coins to user
app.post('/addCoins', validateRequest(['userId', 'coins']), async (req, res) => {
  try {
    const { userId, coins } = req.body;
    
    // Validation
    if (!isValidUserId(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid userId'
      });
    }
    
    if (!isValidNumber(coins) || coins <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coins amount. Must be a positive number.'
      });
    }
    
    if (coins > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Maximum coins per request: 10000'
      });
    }
    
    console.log(`[AddCoins] User: ${userId}, Coins: ${coins}`);
    
    // TODO: Add Firebase integration here
    // await updateUserCoins(userId, coins);
    
    res.json({
      success: true,
      message: `Successfully added ${coins} coins to user ${userId}`,
      data: {
        userId,
        coinsAdded: coins,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('[AddCoins Error]', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Ban user
app.post('/banUser', validateRequest(['userId', 'reason']), async (req, res) => {
  try {
    const { userId, reason } = req.body;
    
    // Validation
    if (!isValidUserId(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid userId'
      });
    }
    
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reason. Must be a non-empty string.'
      });
    }
    
    if (reason.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Reason too long. Maximum 500 characters.'
      });
    }
    
    console.log(`[BanUser] User: ${userId}, Reason: ${reason}`);
    
    // TODO: Add Firebase integration here
    // await banUserInDatabase(userId, reason);
    
    res.json({
      success: true,
      message: `User ${userId} has been banned`,
      data: {
        userId,
        reason,
        bannedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('[BanUser Error]', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Create redeem request
app.post('/redeemRequest', validateRequest(['userId', 'amount']), async (req, res) => {
  try {
    const { userId, amount } = req.body;
    
    // Validation
    if (!isValidUserId(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid userId'
      });
    }
    
    if (!isValidNumber(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount. Must be a positive number.'
      });
    }
    
    if (amount < 100) {
      return res.status(400).json({
        success: false,
        error: 'Minimum redeem amount: 100 coins'
      });
    }
    
    if (amount > 100000) {
      return res.status(400).json({
        success: false,
        error: 'Maximum redeem amount: 100000 coins'
      });
    }
    
    console.log(`[RedeemRequest] User: ${userId}, Amount: ${amount}`);
    
    // TODO: Add Firebase integration here
    // const requestId = await createRedeemRequest(userId, amount);
    
    res.json({
      success: true,
      message: `Redeem request received for ${amount} coins`,
      data: {
        userId,
        amount,
        status: 'pending',
        requestedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('[RedeemRequest Error]', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Additional utility routes

// Get server health
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage()
  });
});

// Get API info
app.get('/api/info', (req, res) => {
  res.json({
    name: 'NeonSpin API',
    version: '1.0.0',
    endpoints: {
      'GET /': 'Health check',
      'POST /addCoins': 'Add coins to user',
      'POST /banUser': 'Ban a user',
      'POST /redeemRequest': 'Create redeem request',
      'GET /health': 'Server health status',
      'GET /api/info': 'API information'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('=================================');
  console.log('🚀 NeonSpin Backend Server');
  console.log('=================================');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log('=================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

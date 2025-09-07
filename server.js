const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const http = require('http');
const socketIo = require('socket.io');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Simple logger fallback
const logger = {
  info: (message) => console.log(`ℹ️  ${new Date().toISOString()} - ${message}`),
  error: (message) => console.error(`❌ ${new Date().toISOString()} - ${message}`),
  warn: (message) => console.warn(`⚠️  ${new Date().toISOString()} - ${message}`)
};

// Database connection function
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`Database connection error: ${error.message}`);
    process.exit(1);
  }
};

// Simple error handler middleware
const errorHandler = (err, req, res, next) => {
  logger.error(err.stack);
  
  const error = {
    message: err.message || 'Internal Server Error',
    status: err.statusCode || 500
  };
  
  if (process.env.NODE_ENV === 'development') {
    error.stack = err.stack;
  }
  
  res.status(error.status).json({ error });
};

// Simple 404 handler
const notFound = (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
};

// Simple rate limiting
const { globalLimiter } = require('./src/middleware/rateLimit');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Socket.io setup with CORS
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Connect to MongoDB
connectDB();

// Trust proxy for production
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'https://healthfriend.xyz',
      'https://www.healthfriend.xyz'
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitization middleware
app.use(mongoSanitize());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// Rate limiting
app.use('/api/', globalLimiter);

// Simple socket setup (replace with actual socket handlers later)
io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`);
  });
  
  // Video call events
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.broadcast.to(roomId).emit('user-connected', socket.id);
  });
  
  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    socket.broadcast.to(roomId).emit('user-disconnected', socket.id);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.status(200).json(healthCheck);
});

// Helper function to safely require route files
const safeRequire = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      return require(filePath);
    } else {
      logger.warn(`Route file not found: ${filePath}`);
      return null;
    }
  } catch (error) {
    logger.error(`Error loading route: ${filePath} - ${error.message}`);
    return null;
  }
};

// Conditionally load API Routes (only if files exist)
const authRoutes = safeRequire('./src/routes/auth');
const userRoutes = safeRequire('./src/routes/users');
const consultationRoutes = safeRequire('./src/routes/consultations');
const doctorRoutes = safeRequire('./src/routes/doctors');
const paymentRoutes = safeRequire('./src/routes/payments');
const adminRoutes = safeRequire('./src/routes/admin');
const aiRoutes = safeRequire('./src/routes/ai');

// Use routes only if they exist
if (authRoutes) app.use('/api/auth', authRoutes);
if (userRoutes) app.use('/api/users', userRoutes);
if (consultationRoutes) app.use('/api/consultations', consultationRoutes);
if (doctorRoutes) app.use('/api/doctors', doctorRoutes);
if (paymentRoutes) app.use('/api/payments', paymentRoutes);
if (adminRoutes) app.use('/api/admin', adminRoutes);
if (aiRoutes) app.use('/api/ai', aiRoutes);

// Static file serving
app.use('/uploads', express.static('uploads'));

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: 'HealthFriend API Server',
    version: '1.0.0',
    status: 'Running',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      health: '/health',
      api: '/api',
      uploads: '/uploads'
    },
    loadedRoutes: {
      auth: !!authRoutes,
      users: !!userRoutes,
      consultations: !!consultationRoutes,
      doctors: !!doctorRoutes,
      payments: !!paymentRoutes,
      admin: !!adminRoutes,
      ai: !!aiRoutes
    }
  });
});

// API status route
app.get('/api', (req, res) => {
  res.json({
    message: 'HealthFriend API',
    version: '1.0.0',
    status: 'Ready',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Process terminated');
    mongoose.connection.close();
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Process terminated');
    mongoose.connection.close();
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', err);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception thrown:', err);
  process.exit(1);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`HealthFriend API server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🚀 HealthFriend API server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📡 API Base: http://localhost:${PORT}/api`);
});

module.exports = { app, server, io };
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    const dbName = process.env.DB_NAME || 'healthfriend';
    
    if (!mongoURI) {
      throw new Error('MongoDB URI is not defined in environment variables');
    }

    // MongoDB connection options
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: dbName,
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      bufferMaxEntries: 0, // Disable mongoose buffering
      bufferCommands: false, // Disable mongoose buffering
      autoIndex: process.env.NODE_ENV === 'development', // Build indexes in development
      autoCreate: true, // Auto create collections
    };

    // Connect to MongoDB
    const conn = await mongoose.connect(mongoURI, options);

    logger.info(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    
    // Log connection status
    mongoose.connection.on('connected', () => {
      logger.info('🔗 Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('❌ Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ Mongoose disconnected from MongoDB');
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        logger.info('🔌 MongoDB connection closed through app termination');
        process.exit(0);
      } catch (error) {
        logger.error('Error closing MongoDB connection:', error);
        process.exit(1);
      }
    });

    return conn;
    
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error.message);
    
    // Retry connection after 5 seconds in production
    if (process.env.NODE_ENV === 'production') {
      logger.info('⏳ Retrying MongoDB connection in 5 seconds...');
      setTimeout(connectDB, 5000);
    } else {
      // Exit process in development
      process.exit(1);
    }
  }
};

// Database health check function
const checkDBHealth = async () => {
  try {
    const adminDb = mongoose.connection.db.admin();
    const result = await adminDb.ping();
    return {
      status: 'healthy',
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      name: mongoose.connection.name,
      ping: result
    };
  } catch (error) {
    logger.error('Database health check failed:', error);
    return {
      status: 'unhealthy',
      readyState: mongoose.connection.readyState,
      error: error.message
    };
  }
};

// Get database statistics
const getDBStats = async () => {
  try {
    const db = mongoose.connection.db;
    const stats = await db.stats();
    const collections = await db.listCollections().toArray();
    
    return {
      database: db.databaseName,
      collections: collections.length,
      dataSize: stats.dataSize,
      storageSize: stats.storageSize,
      indexes: stats.indexes,
      objects: stats.objects,
      avgObjSize: stats.avgObjSize
    };
  } catch (error) {
    logger.error('Failed to get database stats:', error);
    return null;
  }
};

// Create database indexes
const createIndexes = async () => {
  try {
    logger.info('🔍 Creating database indexes...');
    
    // User indexes
    await mongoose.connection.collection('users').createIndex({ walletAddress: 1 }, { unique: true });
    await mongoose.connection.collection('users').createIndex({ email: 1 }, { unique: true });
    await mongoose.connection.collection('users').createIndex({ role: 1 });
    await mongoose.connection.collection('users').createIndex({ 'doctorProfile.specialization': 1 });
    await mongoose.connection.collection('users').createIndex({ 'doctorProfile.isVerified': 1 });
    await mongoose.connection.collection('users').createIndex({ isActive: 1 });
    
    // Consultation indexes
    await mongoose.connection.collection('consultations').createIndex({ patient: 1, createdAt: -1 });
    await mongoose.connection.collection('consultations').createIndex({ doctor: 1, createdAt: -1 });
    await mongoose.connection.collection('consultations').createIndex({ status: 1 });
    await mongoose.connection.collection('consultations').createIndex({ type: 1 });
    await mongoose.connection.collection('consultations').createIndex({ scheduledDate: 1 });
    await mongoose.connection.collection('consultations').createIndex({ consultationId: 1 }, { unique: true });
    
    // Payment indexes
    await mongoose.connection.collection('payments').createIndex({ payer: 1, createdAt: -1 });
    await mongoose.connection.collection('payments').createIndex({ payee: 1, createdAt: -1 });
    await mongoose.connection.collection('payments').createIndex({ status: 1 });
    await mongoose.connection.collection('payments').createIndex({ transactionHash: 1 }, { unique: true, sparse: true });
    await mongoose.connection.collection('payments').createIndex({ paymentId: 1 }, { unique: true });
    
    // Medical record indexes
    await mongoose.connection.collection('medicalrecords').createIndex({ patient: 1, recordDate: -1 });
    await mongoose.connection.collection('medicalrecords').createIndex({ doctor: 1 });
    await mongoose.connection.collection('medicalrecords').createIndex({ recordType: 1 });
    await mongoose.connection.collection('medicalrecords').createIndex({ tags: 1 });
    
    // Notification indexes
    await mongoose.connection.collection('notifications').createIndex({ recipient: 1, createdAt: -1 });
    await mongoose.connection.collection('notifications').createIndex({ isRead: 1 });
    await mongoose.connection.collection('notifications').createIndex({ type: 1 });
    
    // System log indexes
    await mongoose.connection.collection('systemlogs').createIndex({ level: 1, timestamp: -1 });
    await mongoose.connection.collection('systemlogs').createIndex({ user: 1, timestamp: -1 });
    await mongoose.connection.collection('systemlogs').createIndex({ timestamp: -1 });
    
    logger.info('✅ Database indexes created successfully');
    
  } catch (error) {
    logger.error('❌ Failed to create database indexes:', error);
  }
};

// Setup database with indexes (run only in development or first deployment)
const setupDatabase = async () => {
  try {
    if (process.env.NODE_ENV === 'development' || process.env.SETUP_DATABASE === 'true') {
      await createIndexes();
    }
  } catch (error) {
    logger.error('Database setup failed:', error);
  }
};

module.exports = {
  connectDB,
  checkDBHealth,
  getDBStats,
  createIndexes,
  setupDatabase
};
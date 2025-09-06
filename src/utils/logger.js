const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    if (stack) {
      return `${timestamp} [${level}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level}]: ${message}`;
  })
);

// Daily rotate file transport for general logs
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: process.env.LOG_MAX_SIZE || '20m',
  maxFiles: process.env.LOG_MAX_FILES || '14d',
  format: logFormat,
  level: process.env.LOG_LEVEL || 'info'
});

// Daily rotate file transport for error logs
const errorFileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: process.env.LOG_MAX_SIZE || '20m',
  maxFiles: process.env.LOG_MAX_FILES || '14d',
  format: logFormat,
  level: 'error'
});

// Daily rotate file transport for audit logs
const auditFileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'audit-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: process.env.LOG_MAX_SIZE || '20m',
  maxFiles: process.env.LOG_MAX_FILES || '30d',
  format: logFormat,
  level: 'info'
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'healthfriend-api' },
  transports: [
    fileRotateTransport,
    errorFileRotateTransport
  ],
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'exceptions.log'),
      format: logFormat
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'rejections.log'),
      format: logFormat
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV === 'development') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Create audit logger for security-sensitive operations
const auditLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'healthfriend-audit' },
  transports: [auditFileRotateTransport]
});

// Helper functions for structured logging
const logHelpers = {
  // Authentication logs
  logAuth: (action, userId, walletAddress, ip, userAgent, success = true, error = null) => {
    const logData = {
      action,
      userId,
      walletAddress,
      ip,
      userAgent,
      success,
      timestamp: new Date().toISOString()
    };
    
    if (error) {
      logData.error = error.message || error;
    }
    
    if (success) {
      auditLogger.info('Authentication event', logData);
    } else {
      auditLogger.warn('Authentication failure', logData);
    }
  },

  // Payment logs
  logPayment: (action, userId, amount, currency, transactionHash, consultationId, success = true, error = null) => {
    const logData = {
      action,
      userId,
      amount,
      currency,
      transactionHash,
      consultationId,
      success,
      timestamp: new Date().toISOString()
    };
    
    if (error) {
      logData.error = error.message || error;
    }
    
    auditLogger.info('Payment event', logData);
  },

  // Medical data access logs
  logMedicalAccess: (action, userId, patientId, recordId, recordType, ip) => {
    const logData = {
      action,
      userId,
      patientId,
      recordId,
      recordType,
      ip,
      timestamp: new Date().toISOString()
    };
    
    auditLogger.info('Medical data access', logData);
  },

  // Consultation logs
  logConsultation: (action, consultationId, patientId, doctorId, type, status) => {
    const logData = {
      action,
      consultationId,
      patientId,
      doctorId,
      type,
      status,
      timestamp: new Date().toISOString()
    };
    
    logger.info('Consultation event', logData);
  },

  // API request logs
  logRequest: (method, url, userId, ip, statusCode, responseTime, userAgent) => {
    const logData = {
      method,
      url,
      userId,
      ip,
      statusCode,
      responseTime,
      userAgent,
      timestamp: new Date().toISOString()
    };
    
    if (statusCode >= 400) {
      logger.warn('API request', logData);
    } else {
      logger.info('API request', logData);
    }
  },

  // Error logs with context
  logError: (error, context = {}) => {
    const logData = {
      message: error.message,
      stack: error.stack,
      ...context,
      timestamp: new Date().toISOString()
    };
    
    logger.error('Application error', logData);
  },

  // Security events
  logSecurity: (event, userId, ip, userAgent, severity = 'medium', details = {}) => {
    const logData = {
      event,
      userId,
      ip,
      userAgent,
      severity,
      details,
      timestamp: new Date().toISOString()
    };
    
    auditLogger.warn('Security event', logData);
  },

  // Database operations
  logDatabase: (operation, collection, query, userId, duration, success = true, error = null) => {
    const logData = {
      operation,
      collection,
      query: JSON.stringify(query),
      userId,
      duration,
      success,
      timestamp: new Date().toISOString()
    };
    
    if (error) {
      logData.error = error.message || error;
    }
    
    if (duration > 1000) { // Log slow queries
      logger.warn('Slow database operation', logData);
    } else {
      logger.debug('Database operation', logData);
    }
  }
};

// Export logger and helpers
module.exports = {
  logger,
  auditLogger,
  ...logHelpers,
  
  // Convenience methods
  info: (message, meta = {}) => logger.info(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  error: (message, meta = {}) => logger.error(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),
  
  // Stream for Morgan HTTP logger
  stream: {
    write: (message) => {
      logger.info(message.trim());
    }
  }
};
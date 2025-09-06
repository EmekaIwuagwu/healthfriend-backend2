const { logError } = require('../utils/logger');

// Custom error class
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Handle different types of errors
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' already exists. Please use another value.`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () =>
  new AppError('Your token has expired! Please log in again.', 401);

const handleWeb3Error = (err) => {
  if (err.message.includes('invalid signature')) {
    return new AppError('Invalid wallet signature. Please try again.', 401);
  }
  if (err.message.includes('transaction failed')) {
    return new AppError('Transaction failed. Please check your wallet and try again.', 400);
  }
  return new AppError('Web3 operation failed. Please try again.', 400);
};

const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new AppError('File too large. Maximum size allowed is 10MB.', 400);
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return new AppError('Too many files. Maximum 5 files allowed.', 400);
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new AppError('Unexpected file field.', 400);
  }
  return new AppError('File upload error. Please try again.', 400);
};

const handleRateLimitError = () =>
  new AppError('Too many requests from this IP. Please try again later.', 429);

const handlePaymentError = (err) => {
  if (err.message.includes('insufficient funds')) {
    return new AppError('Insufficient funds for this transaction.', 400);
  }
  if (err.message.includes('network error')) {
    return new AppError('Network error during payment. Please try again.', 500);
  }
  return new AppError('Payment processing failed. Please try again.', 400);
};

// Send error response in development
const sendErrorDev = (err, req, res) => {
  // API
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    });
  }
  
  // Rendered website
  res.status(err.statusCode).json({
    title: 'Something went wrong!',
    message: err.message
  });
};

// Send error response in production
const sendErrorProd = (err, req, res) => {
  // API
  if (req.originalUrl.startsWith('/api')) {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        timestamp: new Date().toISOString(),
        requestId: req.id || 'unknown'
      });
    }
    
    // Programming or other unknown error: don't leak error details
    console.error('ERROR 💥', err);
    logError(err, {
      path: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id
    });
    
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong!',
      timestamp: new Date().toISOString(),
      requestId: req.id || 'unknown'
    });
  }
  
  // Rendered website
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      title: 'Something went wrong!',
      message: err.message
    });
  }
  
  // Programming or other unknown error: don't leak error details
  console.error('ERROR 💥', err);
  res.status(err.statusCode).json({
    title: 'Something went wrong!',
    message: 'Please try again later.'
  });
};

// Main error handling middleware
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  // Add request ID for tracking
  if (!req.id) {
    req.id = Math.random().toString(36).substr(2, 9);
  }
  
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else {
    let error = { ...err };
    error.message = err.message;
    error.name = err.name;
    
    // Handle specific error types
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    if (error.name === 'Web3Error') error = handleWeb3Error(error);
    if (error.name === 'MulterError') error = handleMulterError(error);
    if (error.name === 'TooManyRequestsError') error = handleRateLimitError();
    if (error.name === 'PaymentError') error = handlePaymentError(error);
    
    sendErrorProd(error, req, res);
  }
};

// Async error handler wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Handle 404 errors
const notFound = (req, res, next) => {
  const err = new AppError(`Not found - ${req.originalUrl}`, 404);
  next(err);
};

// Validation error handler
const handleValidationError = (errors) => {
  const messages = errors.map(error => {
    if (error.type === 'field') {
      return `${error.path}: ${error.msg}`;
    }
    return error.msg;
  });
  
  return new AppError(`Validation Error: ${messages.join(', ')}`, 400);
};

// Database connection error handler
const handleDBConnectionError = (err) => {
  logError(err, { context: 'Database Connection' });
  return new AppError('Database connection failed. Please try again later.', 500);
};

// File upload error handler
const handleFileUploadError = (err) => {
  if (err.code === 'ENOENT') {
    return new AppError('Upload directory not found.', 500);
  }
  if (err.code === 'EACCES') {
    return new AppError('Permission denied for file upload.', 500);
  }
  return new AppError('File upload failed. Please try again.', 500);
};

// Email service error handler
const handleEmailError = (err) => {
  logError(err, { context: 'Email Service' });
  return new AppError('Email service temporarily unavailable.', 500);
};

// AI service error handler
const handleAIError = (err) => {
  if (err.message.includes('rate limit')) {
    return new AppError('AI service rate limit exceeded. Please try again later.', 429);
  }
  if (err.message.includes('API key')) {
    return new AppError('AI service configuration error.', 500);
  }
  return new AppError('AI service temporarily unavailable.', 500);
};

// Socket.io error handler
const handleSocketError = (socket, err) => {
  logError(err, { 
    context: 'Socket.io',
    socketId: socket.id,
    userId: socket.userId
  });
  
  socket.emit('error', {
    message: 'Connection error occurred',
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  AppError,
  globalErrorHandler,
  catchAsync,
  notFound,
  handleValidationError,
  handleDBConnectionError,
  handleFileUploadError,
  handleEmailError,
  handleAIError,
  handleSocketError
};
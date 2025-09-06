const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const User = require('../models/User');
const { AppError } = require('./errorHandler');
const { logAuth, logSecurity } = require('../utils/logger');

// Generate a random nonce for wallet signature
const generateNonce = () => {
  return Math.floor(Math.random() * 1000000).toString();
};

// Verify wallet signature
const verifySignature = (message, signature, address) => {
  try {
    const recoveredAddress = ethers.utils.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

// Generate JWT token
const generateToken = (userId, walletAddress, role) => {
  return jwt.sign(
    { 
      userId, 
      walletAddress, 
      role,
      iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'healthfriend-api',
      audience: 'healthfriend-client'
    }
  );
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'healthfriend-api',
      audience: 'healthfriend-client'
    });
  } catch (error) {
    throw new AppError('Invalid or expired token', 401);
  }
};

// Main authentication middleware
const authenticateWallet = async (req, res, next) => {
  try {
    // Extract token from header
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logSecurity(
        'missing_auth_token',
        null,
        req.ip,
        req.get('User-Agent'),
        'medium',
        { url: req.originalUrl, method: req.method }
      );
      return next(new AppError('Access denied. No token provided.', 401));
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify JWT token
    const decoded = verifyToken(token);
    
    // Find user by ID and ensure they're still active
    const user = await User.findById(decoded.userId).select('+nonce');
    
    if (!user) {
      logSecurity(
        'invalid_user_token',
        decoded.userId,
        req.ip,
        req.get('User-Agent'),
        'high',
        { walletAddress: decoded.walletAddress }
      );
      return next(new AppError('User not found. Invalid token.', 401));
    }

    // Check if user is active and not banned
    if (!user.isActive) {
      logSecurity(
        'inactive_user_access',
        user._id,
        req.ip,
        req.get('User-Agent'),
        'medium',
        { walletAddress: user.walletAddress }
      );
      return next(new AppError('Account is inactive. Please contact support.', 401));
    }

    if (user.isBanned) {
      logSecurity(
        'banned_user_access',
        user._id,
        req.ip,
        req.get('User-Agent'),
        'high',
        { 
          walletAddress: user.walletAddress,
          banReason: user.banReason
        }
      );
      return next(new AppError('Account is banned. Reason: ' + (user.banReason || 'Violation of terms'), 403));
    }

    // Verify wallet address matches
    if (user.walletAddress.toLowerCase() !== decoded.walletAddress.toLowerCase()) {
      logSecurity(
        'wallet_address_mismatch',
        user._id,
        req.ip,
        req.get('User-Agent'),
        'high',
        { 
          userWallet: user.walletAddress,
          tokenWallet: decoded.walletAddress
        }
      );
      return next(new AppError('Wallet address mismatch. Please re-authenticate.', 401));
    }

    // Check token age (optional: force re-auth after certain period)
    const tokenAge = Math.floor(Date.now() / 1000) - decoded.iat;
    const maxTokenAge = 7 * 24 * 60 * 60; // 7 days in seconds
    
    if (tokenAge > maxTokenAge) {
      logAuth(
        'token_expired',
        user._id,
        user.walletAddress,
        req.ip,
        req.get('User-Agent'),
        false,
        'Token too old'
      );
      return next(new AppError('Token has expired. Please re-authenticate.', 401));
    }

    // Update last login if it's been more than an hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (!user.lastLogin || user.lastLogin < oneHourAgo) {
      user.lastLogin = new Date();
      user.loginCount += 1;
      await user.save({ validateBeforeSave: false });
    }

    // Log successful authentication
    logAuth(
      'token_verified',
      user._id,
      user.walletAddress,
      req.ip,
      req.get('User-Agent'),
      true
    );

    // Attach user to request object (remove sensitive fields)
    req.user = {
      id: user._id,
      walletAddress: user.walletAddress,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt
    };

    next();
  } catch (error) {
    logAuth(
      'authentication_error',
      null,
      null,
      req.ip,
      req.get('User-Agent'),
      false,
      error.message
    );

    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token has expired', 401));
    }
    
    next(error);
  }
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without user
    }

    // Try to authenticate, but don't fail if it doesn't work
    await authenticateWallet(req, res, (err) => {
      // If there's an auth error, just continue without user
      if (err) {
        req.user = null;
      }
      next();
    });
  } catch (error) {
    req.user = null;
    next();
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!roles.includes(req.user.role)) {
      logSecurity(
        'unauthorized_role_access',
        req.user.id,
        req.ip,
        req.get('User-Agent'),
        'medium',
        { 
          userRole: req.user.role,
          requiredRoles: roles,
          url: req.originalUrl
        }
      );
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};

// Doctor verification middleware
const requireDoctorVerification = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (req.user.role !== 'doctor') {
      return next(new AppError('Doctor access required', 403));
    }

    // Get full user data to check verification status
    const doctor = await User.findById(req.user.id);
    
    if (!doctor || !doctor.doctorProfile || !doctor.doctorProfile.isVerified) {
      logSecurity(
        'unverified_doctor_access',
        req.user.id,
        req.ip,
        req.get('User-Agent'),
        'medium',
        { url: req.originalUrl }
      );
      return next(new AppError('Doctor verification required to access this resource', 403));
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Admin authorization with different levels
const requireAdmin = (level = 'admin') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AppError('Authentication required', 401));
      }

      if (req.user.role !== 'admin') {
        logSecurity(
          'non_admin_access_attempt',
          req.user.id,
          req.ip,
          req.get('User-Agent'),
          'high',
          { url: req.originalUrl }
        );
        return next(new AppError('Admin access required', 403));
      }

      // Additional admin level checks can be added here
      // For example: super_admin, moderator, etc.
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Rate limiting per user
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const now = Date.now();
    
    if (!requests.has(userId)) {
      requests.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const userRequests = requests.get(userId);
    
    if (now > userRequests.resetTime) {
      userRequests.count = 1;
      userRequests.resetTime = now + windowMs;
      return next();
    }

    if (userRequests.count >= maxRequests) {
      logSecurity(
        'user_rate_limit_exceeded',
        req.user?.id,
        req.ip,
        req.get('User-Agent'),
        'medium',
        { 
          requestCount: userRequests.count,
          maxRequests,
          windowMs
        }
      );
      return next(new AppError('Too many requests. Please try again later.', 429));
    }

    userRequests.count++;
    next();
  };
};

// Resource ownership verification
const requireOwnership = (resourceModel, resourceIdParam = 'id', ownerField = 'patient') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new AppError('Authentication required', 401));
      }

      // Admins can access all resources
      if (req.user.role === 'admin') {
        return next();
      }

      const resourceId = req.params[resourceIdParam];
      const Model = require(`../models/${resourceModel}`);
      
      const resource = await Model.findById(resourceId);
      
      if (!resource) {
        return next(new AppError('Resource not found', 404));
      }

      // Check if user owns the resource
      const ownerId = resource[ownerField]?.toString();
      const userId = req.user.id.toString();

      if (ownerId !== userId) {
        // For doctors, also check if they're assigned to the resource
        if (req.user.role === 'doctor' && resource.doctor?.toString() === userId) {
          return next();
        }

        logSecurity(
          'unauthorized_resource_access',
          req.user.id,
          req.ip,
          req.get('User-Agent'),
          'high',
          { 
            resourceType: resourceModel,
            resourceId,
            ownerId,
            attemptedBy: userId
          }
        );
        return next(new AppError('Access denied. You do not own this resource.', 403));
      }

      // Attach resource to request for downstream use
      req.resource = resource;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Email verification middleware
const requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required', 401));
  }

  if (!req.user.isEmailVerified) {
    return next(new AppError('Email verification required. Please check your email.', 403));
  }

  next();
};

// IP whitelist middleware (for admin functions)
const requireWhitelistedIP = (whitelist = []) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (whitelist.length > 0 && !whitelist.includes(clientIP)) {
      logSecurity(
        'non_whitelisted_ip_access',
        req.user?.id,
        clientIP,
        req.get('User-Agent'),
        'high',
        { 
          url: req.originalUrl,
          whitelist
        }
      );
      return next(new AppError('Access denied from this IP address', 403));
    }

    next();
  };
};

// Session validation (check if user has active session)
const validateSession = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    // Here you could implement additional session validation
    // For example, checking against a session store, Redis, etc.
    
    next();
  } catch (error) {
    next(error);
  }
};

// API key authentication (for third-party integrations)
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
      return next(new AppError('API key required', 401));
    }

    // Here you would validate the API key against your database
    // For now, we'll just check against environment variable
    if (apiKey !== process.env.API_KEY) {
      logSecurity(
        'invalid_api_key',
        null,
        req.ip,
        req.get('User-Agent'),
        'high',
        { apiKey: apiKey.substring(0, 8) + '...' }
      );
      return next(new AppError('Invalid API key', 401));
    }

    // Set a special user for API access
    req.user = {
      id: 'api',
      role: 'api',
      walletAddress: null,
      isApiUser: true
    };

    next();
  } catch (error) {
    next(error);
  }
};

// Webhook signature verification
const verifyWebhookSignature = (secret) => {
  return (req, res, next) => {
    const signature = req.header('X-Webhook-Signature');
    const body = JSON.stringify(req.body);
    
    if (!signature) {
      return next(new AppError('Webhook signature required', 401));
    }

    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (signature !== `sha256=${expectedSignature}`) {
      logSecurity(
        'invalid_webhook_signature',
        null,
        req.ip,
        req.get('User-Agent'),
        'high',
        { 
          providedSignature: signature.substring(0, 16) + '...',
          expectedSignature: expectedSignature.substring(0, 16) + '...'
        }
      );
      return next(new AppError('Invalid webhook signature', 401));
    }

    next();
  };
};

module.exports = {
  // Core authentication
  authenticateWallet,
  optionalAuth,
  
  // Authorization
  authorize,
  requireDoctorVerification,
  requireAdmin,
  requireOwnership,
  requireEmailVerification,
  
  // Security
  userRateLimit,
  requireWhitelistedIP,
  validateSession,
  authenticateApiKey,
  verifyWebhookSignature,
  
  // Utility functions
  generateNonce,
  verifySignature,
  generateToken,
  verifyToken
};
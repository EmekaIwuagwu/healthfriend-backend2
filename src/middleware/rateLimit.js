const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { AppError } = require('./errorHandler');
const { logSecurity } = require('../utils/logger');

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map();

// Custom rate limit store
const createCustomStore = () => {
  return {
    incr: (key, callback) => {
      const now = Date.now();
      const current = rateLimitStore.get(key) || { count: 0, resetTime: now + 60000 };
      
      // Reset if time window has passed
      if (now > current.resetTime) {
        current.count = 1;
        current.resetTime = now + 60000;
      } else {
        current.count++;
      }
      
      rateLimitStore.set(key, current);
      callback(null, current.count, current.resetTime);
    },
    
    decrement: (key) => {
      const current = rateLimitStore.get(key);
      if (current && current.count > 0) {
        current.count--;
        rateLimitStore.set(key, current);
      }
    },
    
    resetKey: (key) => {
      rateLimitStore.delete(key);
    },
    
    resetAll: () => {
      rateLimitStore.clear();
    }
  };
};

// Custom key generator that considers user ID if authenticated
const createKeyGenerator = (includeUser = false) => {
  return (req) => {
    let key = req.ip;
    
    if (includeUser && req.user) {
      key += `:user:${req.user.id}`;
    }
    
    // Include route for endpoint-specific limiting
    if (req.route && req.route.path) {
      key += `:route:${req.method}:${req.route.path}`;
    }
    
    return key;
  };
};

// Custom handler for rate limit exceeded
const createRateLimitHandler = (type = 'general') => {
  return (req, res, next) => {
    const clientIP = req.ip;
    const userAgent = req.get('User-Agent');
    const userId = req.user?.id;
    
    // Log security event
    logSecurity(
      'rate_limit_exceeded',
      userId,
      clientIP,
      userAgent,
      'medium',
      {
        limitType: type,
        url: req.originalUrl,
        method: req.method
      }
    );
    
    // Send appropriate error response
    const error = new AppError(
      `Too many requests. Please try again later.`,
      429
    );
    
    next(error);
  };
};

// Basic rate limiting configurations
const basicRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per window
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(false),
  handler: createRateLimitHandler('basic'),
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.originalUrl === '/health';
  }
});

// Strict rate limiting for authentication endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 auth attempts per window
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(false),
  handler: createRateLimitHandler('authentication'),
  skipSuccessfulRequests: true, // Don't count successful requests
  skipFailedRequests: false // Count failed requests
});

// Payment endpoint rate limiting
const paymentRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 payment attempts per hour
  message: {
    error: 'Too many payment attempts, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(true), // Include user ID
  handler: createRateLimitHandler('payment'),
  skipSuccessfulRequests: false
});

// File upload rate limiting
const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Max 20 uploads per hour
  message: {
    error: 'Too many file uploads, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(true),
  handler: createRateLimitHandler('upload')
});

// AI consultation rate limiting
const aiConsultationRateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 50, // Max 50 AI consultations per day
  message: {
    error: 'Daily AI consultation limit reached, please try again tomorrow.',
    retryAfter: '24 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(true),
  handler: createRateLimitHandler('ai_consultation')
});

// Email sending rate limiting
const emailRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 emails per hour
  message: {
    error: 'Too many emails sent, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(true),
  handler: createRateLimitHandler('email')
});

// Admin endpoint rate limiting (more lenient for admins)
const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Max 200 requests per window for admins
  message: {
    error: 'Admin rate limit exceeded, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(true),
  handler: createRateLimitHandler('admin'),
  skip: (req) => {
    // Only apply to authenticated admin users
    return !req.user || req.user.role !== 'admin';
  }
});

// Search endpoint rate limiting
const searchRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // Max 30 search requests per 5 minutes
  message: {
    error: 'Too many search requests, please try again later.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(true),
  handler: createRateLimitHandler('search')
});

// Consultation booking rate limiting
const consultationBookingRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 consultation bookings per hour
  message: {
    error: 'Too many consultation booking attempts, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(true),
  handler: createRateLimitHandler('consultation_booking')
});

// Progressive delay for repeated requests (slow down middleware)
const progressiveDelay = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 10, // Start delaying after 10 requests
  delayMs: 500, // Add 500ms delay per request after delayAfter
  maxDelayMs: 10000, // Maximum delay of 10 seconds
  keyGenerator: createKeyGenerator(false),
  skip: (req) => {
    // Skip for health checks and static files
    return req.originalUrl === '/health' || req.originalUrl.startsWith('/uploads');
  }
});

// Burst protection (short window, high limit)
const burstProtection = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Max 20 requests per minute
  message: {
    error: 'Request burst detected, please slow down.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(false),
  handler: createRateLimitHandler('burst')
});

// Dynamic rate limiting based on user role
const dynamicRateLimit = (req, res, next) => {
  let maxRequests = 100; // Default for anonymous users
  let windowMs = 15 * 60 * 1000; // 15 minutes
  
  if (req.user) {
    switch (req.user.role) {
      case 'admin':
        maxRequests = 500;
        break;
      case 'doctor':
        maxRequests = 200;
        break;
      case 'patient':
        maxRequests = 150;
        break;
      default:
        maxRequests = 100;
    }
  }
  
  const dynamicLimiter = rateLimit({
    windowMs,
    max: maxRequests,
    message: {
      error: 'Rate limit exceeded for your user level.',
      retryAfter: Math.ceil(windowMs / 60000) + ' minutes'
    },
    keyGenerator: createKeyGenerator(true),
    handler: createRateLimitHandler('dynamic')
  });
  
  dynamicLimiter(req, res, next);
};

// Endpoint-specific rate limiting
const endpointRateLimit = (maxRequests, windowMinutes = 15, type = 'endpoint') => {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    message: {
      error: `Too many requests to this endpoint, please try again later.`,
      retryAfter: `${windowMinutes} minutes`
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: createKeyGenerator(true),
    handler: createRateLimitHandler(type)
  });
};

// Suspicious activity detection
const suspiciousActivityDetector = (req, res, next) => {
  const clientIP = req.ip;
  const userAgent = req.get('User-Agent');
  const userId = req.user?.id;
  
  // Check for suspicious patterns
  const suspiciousPatterns = [
    // No user agent
    !userAgent,
    // Very short user agent
    userAgent && userAgent.length < 10,
    // Common bot patterns
    userAgent && /bot|crawler|spider|scraper/i.test(userAgent),
    // Suspicious request patterns
    req.originalUrl.includes('..'),
    req.originalUrl.includes('script'),
    req.originalUrl.length > 500
  ];
  
  if (suspiciousPatterns.some(pattern => pattern)) {
    logSecurity(
      'suspicious_activity_detected',
      userId,
      clientIP,
      userAgent,
      'high',
      {
        url: req.originalUrl,
        method: req.method,
        suspiciousPatterns: suspiciousPatterns.filter(p => p)
      }
    );
    
    // Apply stricter rate limiting for suspicious requests
    const strictLimiter = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5, // Very limited requests
      message: {
        error: 'Suspicious activity detected. Access restricted.',
        retryAfter: '1 hour'
      },
      keyGenerator: () => clientIP,
      handler: createRateLimitHandler('suspicious')
    });
    
    return strictLimiter(req, res, next);
  }
  
  next();
};

// IP-based blocking for severe violations
const ipBlocking = (() => {
  const blockedIPs = new Set();
  const violations = new Map();
  
  return {
    // Middleware to check blocked IPs
    checkBlocked: (req, res, next) => {
      const clientIP = req.ip;
      
      if (blockedIPs.has(clientIP)) {
        logSecurity(
          'blocked_ip_access_attempt',
          req.user?.id,
          clientIP,
          req.get('User-Agent'),
          'critical',
          { url: req.originalUrl }
        );
        
        return next(new AppError('Access denied', 403));
      }
      
      next();
    },
    
    // Track violations
    trackViolation: (req, type = 'general') => {
      const clientIP = req.ip;
      const current = violations.get(clientIP) || { count: 0, lastViolation: Date.now() };
      
      current.count++;
      current.lastViolation = Date.now();
      violations.set(clientIP, current);
      
      // Block IP after 10 violations in 1 hour
      if (current.count >= 10) {
        blockedIPs.add(clientIP);
        
        logSecurity(
          'ip_address_blocked',
          req.user?.id,
          clientIP,
          req.get('User-Agent'),
          'critical',
          { 
            violationCount: current.count,
            violationType: type
          }
        );
        
        // Auto-unblock after 24 hours
        setTimeout(() => {
          blockedIPs.delete(clientIP);
          violations.delete(clientIP);
        }, 24 * 60 * 60 * 1000);
      }
    },
    
    // Manual IP blocking/unblocking
    blockIP: (ip) => blockedIPs.add(ip),
    unblockIP: (ip) => {
      blockedIPs.delete(ip);
      violations.delete(ip);
    },
    
    // Get blocked IPs
    getBlockedIPs: () => Array.from(blockedIPs),
    
    // Clear violations
    clearViolations: () => {
      violations.clear();
      blockedIPs.clear();
    }
  };
})();

// Whitelist middleware for trusted IPs
const createWhitelistMiddleware = (trustedIPs = []) => {
  return (req, res, next) => {
    const clientIP = req.ip;
    
    // Skip rate limiting for whitelisted IPs
    if (trustedIPs.includes(clientIP)) {
      req.isWhitelisted = true;
      return next();
    }
    
    next();
  };
};

// Skip rate limiting for whitelisted users
const skipForWhitelisted = (req) => {
  return req.isWhitelisted || false;
};

// Cleanup function to remove old entries (should be called periodically)
const cleanup = () => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime + oneHour) {
      rateLimitStore.delete(key);
    }
  }
};

// Set up periodic cleanup (every hour)
setInterval(cleanup, 60 * 60 * 1000);

module.exports = {
  // Basic rate limiting
  basicRateLimit,
  progressiveDelay,
  burstProtection,
  
  // Endpoint-specific rate limiting
  authRateLimit,
  paymentRateLimit,
  uploadRateLimit,
  aiConsultationRateLimit,
  emailRateLimit,
  adminRateLimit,
  searchRateLimit,
  consultationBookingRateLimit,
  
  // Advanced rate limiting
  dynamicRateLimit,
  endpointRateLimit,
  
  // Security features
  suspiciousActivityDetector,
  ipBlocking,
  createWhitelistMiddleware,
  
  // Utilities
  createCustomStore,
  createKeyGenerator,
  createRateLimitHandler,
  skipForWhitelisted,
  cleanup
};
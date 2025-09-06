const { AppError } = require('./errorHandler');
const { logRequest } = require('../utils/logger');

const notFound = (req, res, next) => {
  // Log the 404 request for monitoring
  logRequest(
    req.method,
    req.originalUrl,
    req.user?.id || 'anonymous',
    req.ip,
    404,
    0, // response time not applicable for 404
    req.get('User-Agent')
  );

  // Create detailed error message
  const message = `Route ${req.method} ${req.originalUrl} not found on this server`;
  
  // Check if it's an API request
  if (req.originalUrl.startsWith('/api')) {
    const error = new AppError(message, 404);
    return next(error);
  }
  
  // For non-API requests, send a more user-friendly response
  res.status(404).json({
    status: 'fail',
    message: 'Page not found',
    suggestion: 'Please check the URL and try again',
    availableEndpoints: {
      auth: '/api/auth',
      users: '/api/users',
      consultations: '/api/consultations',
      doctors: '/api/doctors',
      payments: '/api/payments',
      ai: '/api/ai',
      admin: '/api/admin'
    },
    documentation: `${process.env.API_BASE_URL}/docs`,
    timestamp: new Date().toISOString()
  });
};

module.exports = notFound;
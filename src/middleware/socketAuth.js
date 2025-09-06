const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logAuth, logSecurity, logError } = require('../utils/logger');

// Socket.io authentication middleware
const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (!token) {
      logSecurity(
        'socket_connection_no_token',
        null,
        socket.handshake.address,
        socket.handshake.headers['user-agent'],
        'medium',
        { socketId: socket.id }
      );
      return next(new Error('Authentication token required'));
    }
    
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'healthfriend-api',
      audience: 'healthfriend-client'
    });
    
    // Find user and verify they're active
    const user = await User.findById(decoded.userId).select('+nonce');
    
    if (!user) {
      logSecurity(
        'socket_connection_invalid_user',
        decoded.userId,
        socket.handshake.address,
        socket.handshake.headers['user-agent'],
        'high',
        { 
          socketId: socket.id,
          walletAddress: decoded.walletAddress
        }
      );
      return next(new Error('User not found'));
    }
    
    // Check if user is active and not banned
    if (!user.isActive) {
      logSecurity(
        'socket_connection_inactive_user',
        user._id,
        socket.handshake.address,
        socket.handshake.headers['user-agent'],
        'medium',
        { 
          socketId: socket.id,
          walletAddress: user.walletAddress
        }
      );
      return next(new Error('Account inactive'));
    }
    
    if (user.isBanned) {
      logSecurity(
        'socket_connection_banned_user',
        user._id,
        socket.handshake.address,
        socket.handshake.headers['user-agent'],
        'high',
        { 
          socketId: socket.id,
          walletAddress: user.walletAddress,
          banReason: user.banReason
        }
      );
      return next(new Error('Account banned'));
    }
    
    // Verify wallet address matches
    if (user.walletAddress.toLowerCase() !== decoded.walletAddress.toLowerCase()) {
      logSecurity(
        'socket_wallet_address_mismatch',
        user._id,
        socket.handshake.address,
        socket.handshake.headers['user-agent'],
        'high',
        { 
          socketId: socket.id,
          userWallet: user.walletAddress,
          tokenWallet: decoded.walletAddress
        }
      );
      return next(new Error('Wallet address mismatch'));
    }
    
    // Check token age
    const tokenAge = Math.floor(Date.now() / 1000) - decoded.iat;
    const maxTokenAge = 7 * 24 * 60 * 60; // 7 days
    
    if (tokenAge > maxTokenAge) {
      logAuth(
        'socket_token_expired',
        user._id,
        user.walletAddress,
        socket.handshake.address,
        socket.handshake.headers['user-agent'],
        false,
        'Token too old'
      );
      return next(new Error('Token expired'));
    }
    
    // Attach user info to socket
    socket.userId = user._id.toString();
    socket.userRole = user.role;
    socket.walletAddress = user.walletAddress;
    socket.userEmail = user.email;
    socket.userName = `${user.firstName} ${user.lastName}`;
    socket.isEmailVerified = user.isEmailVerified;
    socket.isVerifiedDoctor = user.role === 'doctor' && user.doctorProfile?.isVerified;
    
    // Log successful authentication
    logAuth(
      'socket_authenticated',
      user._id,
      user.walletAddress,
      socket.handshake.address,
      socket.handshake.headers['user-agent'],
      true
    );
    
    next();
  } catch (error) {
    logAuth(
      'socket_authentication_error',
      null,
      null,
      socket.handshake.address,
      socket.handshake.headers['user-agent'],
      false,
      error.message
    );
    
    if (error.name === 'JsonWebTokenError') {
      return next(new Error('Invalid token'));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Token expired'));
    }
    
    next(new Error('Authentication failed'));
  }
};

// Optional socket authentication (doesn't disconnect on failure)
const optionalSocketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (!token) {
      socket.userId = null;
      socket.userRole = 'anonymous';
      return next();
    }
    
    // Try to authenticate, but don't fail if it doesn't work
    await socketAuth(socket, (err) => {
      if (err) {
        socket.userId = null;
        socket.userRole = 'anonymous';
      }
      next();
    });
  } catch (error) {
    socket.userId = null;
    socket.userRole = 'anonymous';
    next();
  }
};

// Role-based socket authorization
const socketAuthorize = (...roles) => {
  return (socket, next) => {
    if (!socket.userId) {
      return next(new Error('Authentication required'));
    }
    
    if (!roles.includes(socket.userRole)) {
      logSecurity(
        'socket_unauthorized_role',
        socket.userId,
        socket.handshake.address,
        socket.handshake.headers['user-agent'],
        'medium',
        { 
          socketId: socket.id,
          userRole: socket.userRole,
          requiredRoles: roles
        }
      );
      return next(new Error('Insufficient permissions'));
    }
    
    next();
  };
};

// Doctor verification middleware for sockets
const requireVerifiedDoctor = (socket, next) => {
  if (!socket.userId) {
    return next(new Error('Authentication required'));
  }
  
  if (socket.userRole !== 'doctor') {
    return next(new Error('Doctor access required'));
  }
  
  if (!socket.isVerifiedDoctor) {
    logSecurity(
      'socket_unverified_doctor_access',
      socket.userId,
      socket.handshake.address,
      socket.handshake.headers['user-agent'],
      'medium',
      { socketId: socket.id }
    );
    return next(new Error('Doctor verification required'));
  }
  
  next();
};

// Rate limiting for socket connections per user
const socketRateLimit = (() => {
  const connections = new Map();
  const maxConnections = 5; // Max 5 concurrent connections per user
  const cleanupInterval = 60 * 1000; // Cleanup every minute
  
  // Cleanup disconnected sockets
  setInterval(() => {
    for (const [userId, sockets] of connections.entries()) {
      const activeSockets = sockets.filter(socket => socket.connected);
      if (activeSockets.length === 0) {
        connections.delete(userId);
      } else {
        connections.set(userId, activeSockets);
      }
    }
  }, cleanupInterval);
  
  return (socket, next) => {
    if (!socket.userId) {
      return next(); // Skip for anonymous users
    }
    
    const userConnections = connections.get(socket.userId) || [];
    
    if (userConnections.length >= maxConnections) {
      logSecurity(
        'socket_connection_limit_exceeded',
        socket.userId,
        socket.handshake.address,
        socket.handshake.headers['user-agent'],
        'medium',
        { 
          socketId: socket.id,
          currentConnections: userConnections.length,
          maxConnections
        }
      );
      return next(new Error(`Maximum ${maxConnections} connections allowed per user`));
    }
    
    // Add socket to user's connections
    userConnections.push(socket);
    connections.set(socket.userId, userConnections);
    
    // Remove socket on disconnect
    socket.on('disconnect', () => {
      const userSockets = connections.get(socket.userId) || [];
      const updatedSockets = userSockets.filter(s => s.id !== socket.id);
      
      if (updatedSockets.length === 0) {
        connections.delete(socket.userId);
      } else {
        connections.set(socket.userId, updatedSockets);
      }
    });
    
    next();
  };
})();

// Namespace-specific authentication
const namespaceAuth = (namespace) => {
  return async (socket, next) => {
    try {
      // Apply basic authentication first
      await socketAuth(socket, (err) => {
        if (err) return next(err);
        
        // Namespace-specific authorization logic
        switch (namespace) {
          case '/consultations':
            // Only authenticated users can join consultation namespace
            if (!socket.userId) {
              return next(new Error('Authentication required for consultations'));
            }
            break;
            
          case '/admin':
            // Only admins can join admin namespace
            if (socket.userRole !== 'admin') {
              logSecurity(
                'socket_unauthorized_admin_namespace',
                socket.userId,
                socket.handshake.address,
                socket.handshake.headers['user-agent'],
                'high',
                { socketId: socket.id, namespace }
              );
              return next(new Error('Admin access required'));
            }
            break;
            
          case '/doctors':
            // Only verified doctors can join doctor namespace
            if (socket.userRole !== 'doctor' || !socket.isVerifiedDoctor) {
              return next(new Error('Verified doctor access required'));
            }
            break;
            
          default:
            // Default namespace - allow authenticated users
            if (!socket.userId) {
              return next(new Error('Authentication required'));
            }
        }
        
        next();
      });
    } catch (error) {
      next(error);
    }
  };
};

// Room-based authorization
const roomAuth = {
  // Check if user can join a consultation room
  consultationRoom: async (socket, consultationId, callback) => {
    try {
      if (!socket.userId) {
        return callback(new Error('Authentication required'));
      }
      
      const Consultation = require('../models/Consultation');
      const consultation = await Consultation.findById(consultationId)
        .populate('patient doctor');
      
      if (!consultation) {
        return callback(new Error('Consultation not found'));
      }
      
      // Check if user is participant in the consultation
      const isParticipant = (
        consultation.patient._id.toString() === socket.userId ||
        (consultation.doctor && consultation.doctor._id.toString() === socket.userId) ||
        socket.userRole === 'admin'
      );
      
      if (!isParticipant) {
        logSecurity(
          'socket_unauthorized_consultation_room',
          socket.userId,
          socket.handshake.address,
          socket.handshake.headers['user-agent'],
          'high',
          { 
            socketId: socket.id,
            consultationId,
            attemptedAccess: true
          }
        );
        return callback(new Error('Access denied to consultation room'));
      }
      
      // Join the room
      socket.join(`consultation_${consultationId}`);
      socket.currentConsultation = consultationId;
      
      callback(null, { success: true, consultationId });
    } catch (error) {
      logError(error, { 
        context: 'Socket Room Authorization',
        socketId: socket.id,
        userId: socket.userId,
        consultationId
      });
      callback(new Error('Authorization failed'));
    }
  },
  
  // Check if user can join a notification room
  notificationRoom: (socket, callback) => {
    if (!socket.userId) {
      return callback(new Error('Authentication required'));
    }
    
    // Users can only join their own notification room
    const roomName = `notifications_${socket.userId}`;
    socket.join(roomName);
    socket.notificationRoom = roomName;
    
    callback(null, { success: true, room: roomName });
  },
  
  // Check if doctor can join doctor-only rooms
  doctorRoom: (socket, callback) => {
    if (!socket.userId) {
      return callback(new Error('Authentication required'));
    }
    
    if (socket.userRole !== 'doctor' || !socket.isVerifiedDoctor) {
      return callback(new Error('Verified doctor access required'));
    }
    
    socket.join('doctors_only');
    callback(null, { success: true, room: 'doctors_only' });
  }
};

// Heartbeat mechanism to detect disconnected clients
const setupHeartbeat = (socket) => {
  let isAlive = true;
  
  socket.on('pong', () => {
    isAlive = true;
  });
  
  const heartbeatInterval = setInterval(() => {
    if (!isAlive) {
      socket.terminate();
      clearInterval(heartbeatInterval);
      return;
    }
    
    isAlive = false;
    socket.ping();
  }, 30000); // Ping every 30 seconds
  
  socket.on('disconnect', () => {
    clearInterval(heartbeatInterval);
  });
};

// Log socket connections and disconnections
const logSocketActivity = (socket) => {
  // Log connection
  logAuth(
    'socket_connected',
    socket.userId,
    socket.walletAddress,
    socket.handshake.address,
    socket.handshake.headers['user-agent'],
    true,
    null,
    { socketId: socket.id }
  );
  
  // Log disconnection
  socket.on('disconnect', (reason) => {
    logAuth(
      'socket_disconnected',
      socket.userId,
      socket.walletAddress,
      socket.handshake.address,
      socket.handshake.headers['user-agent'],
      true,
      null,
      { 
        socketId: socket.id,
        reason,
        duration: Date.now() - socket.handshake.time
      }
    );
  });
};

// Error handler for socket authentication
const handleSocketError = (socket, error) => {
  logError(error, {
    context: 'Socket Authentication',
    socketId: socket.id,
    userId: socket.userId,
    userAgent: socket.handshake.headers['user-agent'],
    address: socket.handshake.address
  });
  
  socket.emit('auth_error', {
    message: 'Authentication error occurred',
    timestamp: new Date().toISOString()
  });
  
  socket.disconnect(true);
};

// Socket middleware composer
const composeSocketMiddleware = (...middlewares) => {
  return async (socket, next) => {
    try {
      for (const middleware of middlewares) {
        await new Promise((resolve, reject) => {
          middleware(socket, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  // Core authentication
  socketAuth,
  optionalSocketAuth,
  
  // Authorization
  socketAuthorize,
  requireVerifiedDoctor,
  namespaceAuth,
  
  // Rate limiting & security
  socketRateLimit,
  
  // Room management
  roomAuth,
  
  // Utilities
  setupHeartbeat,
  logSocketActivity,
  handleSocketError,
  composeSocketMiddleware
};
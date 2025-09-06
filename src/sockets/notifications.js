const { logError, logAuth } = require('../utils/logger');
const Notification = require('../models/Notification');
const User = require('../models/User');

// User presence tracking
const userPresence = new Map();
const userSockets = new Map();
const notificationQueue = new Map();

// Notification types and priorities
const NOTIFICATION_TYPES = {
  // High priority - immediate delivery
  EMERGENCY_ALERT: 'emergency_alert',
  CONSULTATION_STARTED: 'consultation_started',
  PAYMENT_FAILED: 'payment_failed',
  
  // Medium priority - normal delivery
  CONSULTATION_REQUEST: 'consultation_request',
  CONSULTATION_ACCEPTED: 'consultation_accepted',
  PAYMENT_RECEIVED: 'payment_received',
  APPOINTMENT_REMINDER: 'appointment_reminder',
  
  // Low priority - can be batched
  SYSTEM_ANNOUNCEMENT: 'system_announcement',
  PROMOTIONAL_OFFER: 'promotional_offer',
  NEWSLETTER: 'newsletter'
};

const PRIORITY_LEVELS = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

// User presence states
const PRESENCE_STATES = {
  ONLINE: 'online',
  AWAY: 'away',
  BUSY: 'busy',
  OFFLINE: 'offline'
};

// Notification delivery configuration
const DELIVERY_CONFIG = {
  batchInterval: 5000, // 5 seconds for low priority notifications
  maxBatchSize: 10,
  retryAttempts: 3,
  retryDelay: 2000, // 2 seconds
  presenceTimeout: 300000 // 5 minutes before marking as away
};

// Setup notifications socket handlers
const setupNotifications = (io) => {
  const notificationNamespace = io.of('/notifications');
  
  notificationNamespace.on('connection', (socket) => {
    console.log(`Notification socket connected: ${socket.id} (User: ${socket.userId})`);
    
    // Log connection
    logAuth(
      'notification_socket_connected',
      socket.userId,
      socket.walletAddress,
      socket.handshake.address,
      socket.handshake.headers['user-agent'],
      true,
      null,
      { socketId: socket.id }
    );

    // Initialize user presence and socket tracking
    initializeUserConnection(socket);

    // Join user-specific notification room
    socket.on('subscribe-notifications', async (data, callback) => {
      try {
        const roomName = `notifications_${socket.userId}`;
        socket.join(roomName);
        
        // Send pending notifications
        await sendPendingNotifications(socket);
        
        // Mark user as online
        updateUserPresence(socket.userId, PRESENCE_STATES.ONLINE, {
          lastSeen: new Date(),
          socketId: socket.id,
          deviceInfo: socket.handshake.headers['user-agent']
        });

        callback({ 
          success: true, 
          room: roomName,
          presence: PRESENCE_STATES.ONLINE
        });

        console.log(`User ${socket.userId} subscribed to notifications`);
      } catch (error) {
        logError(error, { 
          context: 'Subscribe Notifications',
          userId: socket.userId
        });
        callback({ error: 'Failed to subscribe to notifications' });
      }
    });

    // Handle notification acknowledgment
    socket.on('ack-notification', async (data) => {
      try {
        const { notificationId, action } = data;
        
        if (!notificationId) return;

        // Update notification in database
        await Notification.findByIdAndUpdate(notificationId, {
          isRead: true,
          readAt: new Date(),
          'appDelivery.opened': true,
          'appDelivery.openedAt': new Date()
        });

        // If action was taken (like clicking a button)
        if (action) {
          await Notification.findByIdAndUpdate(notificationId, {
            'appDelivery.clicked': true,
            'appDelivery.clickedAt': new Date(),
            'analytics.clicks': { $inc: 1 }
          });
        }

        // Remove from queue if present
        removeFromQueue(socket.userId, notificationId);

        console.log(`Notification ${notificationId} acknowledged by ${socket.userId}`);
      } catch (error) {
        logError(error, { 
          context: 'Acknowledge Notification',
          userId: socket.userId,
          notificationId: data.notificationId
        });
      }
    });

    // Handle notification action (button clicks, etc.)
    socket.on('notification-action', async (data) => {
      try {
        const { notificationId, action, actionData } = data;
        
        // Update notification analytics
        await Notification.findByIdAndUpdate(notificationId, {
          'analytics.conversions': { $inc: 1 },
          $push: {
            'actionHistory': {
              action,
              actionData,
              timestamp: new Date(),
              userId: socket.userId
            }
          }
        });

        // Handle specific actions
        await handleNotificationAction(socket, action, actionData);

        console.log(`Notification action: ${action} by ${socket.userId}`);
      } catch (error) {
        logError(error, { 
          context: 'Notification Action',
          userId: socket.userId,
          action: data.action
        });
      }
    });

    // Update user presence
    socket.on('presence-update', (data) => {
      try {
        const { state, statusMessage } = data;
        
        if (Object.values(PRESENCE_STATES).includes(state)) {
          updateUserPresence(socket.userId, state, {
            statusMessage,
            lastSeen: new Date(),
            socketId: socket.id
          });

          // Notify contacts about presence change (if needed)
          socket.broadcast.emit('user-presence-change', {
            userId: socket.userId,
            state,
            statusMessage,
            timestamp: new Date()
          });
        }
      } catch (error) {
        logError(error, { 
          context: 'Presence Update',
          userId: socket.userId
        });
      }
    });

    // Request notification history
    socket.on('get-notification-history', async (data, callback) => {
      try {
        const { page = 1, limit = 20, filter = {} } = data;
        
        const notifications = await Notification.find({
          recipient: socket.userId,
          ...filter
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('sender', 'firstName lastName avatar')
        .populate('relatedConsultation', 'consultationId type scheduledDate')
        .lean();

        const total = await Notification.countDocuments({
          recipient: socket.userId,
          ...filter
        });

        callback({
          success: true,
          notifications,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        });
      } catch (error) {
        logError(error, { 
          context: 'Get Notification History',
          userId: socket.userId
        });
        callback({ error: 'Failed to fetch notification history' });
      }
    });

    // Mark all notifications as read
    socket.on('mark-all-read', async (data, callback) => {
      try {
        const { type } = data || {};
        
        const query = { 
          recipient: socket.userId, 
          isRead: false 
        };
        
        if (type) {
          query.type = type;
        }

        const result = await Notification.updateMany(query, {
          isRead: true,
          readAt: new Date()
        });

        callback({
          success: true,
          updated: result.modifiedCount
        });

        console.log(`Marked ${result.modifiedCount} notifications as read for ${socket.userId}`);
      } catch (error) {
        logError(error, { 
          context: 'Mark All Read',
          userId: socket.userId
        });
        callback({ error: 'Failed to mark notifications as read' });
      }
    });

    // Get notification settings
    socket.on('get-notification-settings', async (callback) => {
      try {
        const user = await User.findById(socket.userId)
          .select('notificationPreferences')
          .lean();

        callback({
          success: true,
          settings: user?.notificationPreferences || {}
        });
      } catch (error) {
        logError(error, { 
          context: 'Get Notification Settings',
          userId: socket.userId
        });
        callback({ error: 'Failed to fetch notification settings' });
      }
    });

    // Update notification settings
    socket.on('update-notification-settings', async (data, callback) => {
      try {
        const { settings } = data;
        
        await User.findByIdAndUpdate(socket.userId, {
          notificationPreferences: settings
        });

        callback({ success: true });

        console.log(`Updated notification settings for ${socket.userId}`);
      } catch (error) {
        logError(error, { 
          context: 'Update Notification Settings',
          userId: socket.userId
        });
        callback({ error: 'Failed to update notification settings' });
      }
    });

    // Handle typing indicators (for chat notifications)
    socket.on('typing-start', (data) => {
      const { conversationId } = data;
      socket.to(`conversation_${conversationId}`).emit('user-typing', {
        userId: socket.userId,
        userName: socket.userName,
        isTyping: true
      });
    });

    socket.on('typing-stop', (data) => {
      const { conversationId } = data;
      socket.to(`conversation_${conversationId}`).emit('user-typing', {
        userId: socket.userId,
        userName: socket.userName,
        isTyping: false
      });
    });

    // Handle socket disconnect
    socket.on('disconnect', (reason) => {
      try {
        handleUserDisconnect(socket, reason);
        
        logAuth(
          'notification_socket_disconnected',
          socket.userId,
          socket.walletAddress,
          socket.handshake.address,
          socket.handshake.headers['user-agent'],
          true,
          null,
          { 
            socketId: socket.id,
            reason
          }
        );

        console.log(`Notification socket disconnected: ${socket.id} (${reason})`);
      } catch (error) {
        logError(error, { 
          context: 'Notification Socket Disconnect',
          userId: socket.userId,
          reason
        });
      }
    });

    // Periodic heartbeat to maintain connection
    const heartbeatInterval = setInterval(() => {
      socket.emit('heartbeat', { timestamp: Date.now() });
    }, 30000); // Every 30 seconds

    socket.on('heartbeat-response', () => {
      updateUserPresence(socket.userId, null, { lastSeen: new Date() });
    });

    socket.on('disconnect', () => {
      clearInterval(heartbeatInterval);
    });
  });

  // Initialize user connection tracking
  const initializeUserConnection = (socket) => {
    const userId = socket.userId;
    
    // Track user sockets
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    // Initialize notification queue if doesn't exist
    if (!notificationQueue.has(userId)) {
      notificationQueue.set(userId, []);
    }
  };

  // Update user presence
  const updateUserPresence = (userId, state, metadata = {}) => {
    const currentPresence = userPresence.get(userId) || {};
    
    const updatedPresence = {
      ...currentPresence,
      ...metadata
    };

    if (state) {
      updatedPresence.state = state;
    }

    userPresence.set(userId, updatedPresence);
  };

  // Handle user disconnect
  const handleUserDisconnect = (socket, reason) => {
    const userId = socket.userId;
    
    // Remove socket from tracking
    if (userSockets.has(userId)) {
      userSockets.get(userId).delete(socket.id);
      
      // If no more sockets for this user, mark as offline
      if (userSockets.get(userId).size === 0) {
        updateUserPresence(userId, PRESENCE_STATES.OFFLINE, {
          lastSeen: new Date(),
          disconnectReason: reason
        });
        userSockets.delete(userId);
      }
    }
  };

  // Send pending notifications to user
  const sendPendingNotifications = async (socket) => {
    try {
      const userId = socket.userId;
      
      // Get undelivered notifications from database
      const pendingNotifications = await Notification.find({
        recipient: userId,
        'appDelivery.delivered': { $ne: true },
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('sender', 'firstName lastName avatar')
      .populate('relatedConsultation', 'consultationId type scheduledDate')
      .lean();

      // Send notifications one by one with small delay
      for (const notification of pendingNotifications) {
        await sendNotificationToSocket(socket, notification);
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
      }

      console.log(`Sent ${pendingNotifications.length} pending notifications to ${userId}`);
    } catch (error) {
      logError(error, { 
        context: 'Send Pending Notifications',
        userId: socket.userId
      });
    }
  };

  // Send notification to specific socket
  const sendNotificationToSocket = async (socket, notification) => {
    try {
      // Check user notification preferences
      const user = await User.findById(socket.userId)
        .select('notificationPreferences')
        .lean();

      const preferences = user?.notificationPreferences || {};
      
      // Check if user wants this type of notification
      if (!shouldSendNotification(notification, preferences)) {
        return false;
      }

      // Send notification
      socket.emit('notification', {
        id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        category: notification.category,
        sender: notification.sender,
        relatedConsultation: notification.relatedConsultation,
        richContent: notification.richContent,
        createdAt: notification.createdAt,
        expiresAt: notification.expiresAt
      });

      // Update delivery status
      await Notification.findByIdAndUpdate(notification._id, {
        'appDelivery.delivered': true,
        'appDelivery.deliveredAt': new Date(),
        'analytics.impressions': { $inc: 1 }
      });

      return true;
    } catch (error) {
      logError(error, { 
        context: 'Send Notification to Socket',
        notificationId: notification._id,
        userId: socket.userId
      });
      return false;
    }
  };

  // Check if notification should be sent based on user preferences
  const shouldSendNotification = (notification, preferences) => {
    // Always send critical notifications
    if (notification.priority === PRIORITY_LEVELS.CRITICAL) {
      return true;
    }

    // Check general notification preference
    if (preferences.push === false) {
      return false;
    }

    // Check specific type preferences
    const typePreferences = {
      consultation_request: preferences.consultationReminders,
      consultation_accepted: preferences.consultationReminders,
      payment_received: preferences.paymentNotifications,
      payment_failed: preferences.paymentNotifications,
      promotional_offer: preferences.marketingEmails,
      system_announcement: true // Always send system announcements
    };

    const shouldSend = typePreferences[notification.type];
    return shouldSend !== false; // Default to true if not specified
  };

  // Handle notification actions
  const handleNotificationAction = async (socket, action, actionData) => {
    try {
      switch (action) {
        case 'accept_consultation':
          // Handle consultation acceptance
          socket.emit('redirect', { 
            url: `/consultations/${actionData.consultationId}` 
          });
          break;
          
        case 'view_payment':
          // Handle payment view
          socket.emit('redirect', { 
            url: `/payments/${actionData.paymentId}` 
          });
          break;
          
        case 'dismiss':
          // Just mark as handled, no action needed
          break;
          
        default:
          console.log(`Unhandled notification action: ${action}`);
      }
    } catch (error) {
      logError(error, { 
        context: 'Handle Notification Action',
        action,
        userId: socket.userId
      });
    }
  };

  // Remove notification from queue
  const removeFromQueue = (userId, notificationId) => {
    const queue = notificationQueue.get(userId);
    if (queue) {
      const index = queue.findIndex(n => n._id.toString() === notificationId);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };

  // Periodic cleanup of expired notifications and inactive users
  setInterval(async () => {
    try {
      // Clean up expired notifications
      await Notification.deleteMany({
        expiresAt: { $lt: new Date() },
        isDeleted: true
      });

      // Mark inactive users as away
      const now = Date.now();
      for (const [userId, presence] of userPresence.entries()) {
        if (presence.lastSeen && 
            now - presence.lastSeen.getTime() > DELIVERY_CONFIG.presenceTimeout &&
            presence.state !== PRESENCE_STATES.OFFLINE) {
          updateUserPresence(userId, PRESENCE_STATES.AWAY);
        }
      }

      console.log('Notification cleanup completed');
    } catch (error) {
      logError(error, { context: 'Notification Cleanup' });
    }
  }, 10 * 60 * 1000); // Every 10 minutes

  console.log('✅ Notification socket handlers initialized');
};

// External functions for sending notifications
const sendNotificationToUser = async (userId, notificationData) => {
  try {
    // Create notification in database
    const notification = new Notification({
      recipient: userId,
      ...notificationData,
      deliveryMethods: ['app'],
      appDelivery: {
        delivered: false
      }
    });

    await notification.save();

    // Try to deliver immediately if user is online
    const userSocketIds = userSockets.get(userId);
    if (userSocketIds && userSocketIds.size > 0) {
      const notificationNamespace = require('socket.io')().of('/notifications');
      
      // Send to all user's connected sockets
      for (const socketId of userSocketIds) {
        const socket = notificationNamespace.sockets.get(socketId);
        if (socket) {
          await sendNotificationToSocket(socket, notification);
        }
      }
    } else {
      // Queue for delivery when user comes online
      if (!notificationQueue.has(userId)) {
        notificationQueue.set(userId, []);
      }
      notificationQueue.get(userId).push(notification);
    }

    return { success: true, notificationId: notification._id };
  } catch (error) {
    logError(error, { 
      context: 'Send Notification to User',
      userId,
      notificationData
    });
    return { success: false, error: error.message };
  }
};

// Broadcast notification to multiple users
const broadcastNotification = async (userIds, notificationData) => {
  const results = [];
  
  for (const userId of userIds) {
    const result = await sendNotificationToUser(userId, notificationData);
    results.push({ userId, ...result });
  }
  
  return results;
};

// Get user presence status
const getUserPresence = (userId) => {
  return userPresence.get(userId) || { state: PRESENCE_STATES.OFFLINE };
};

// Get online users count
const getOnlineUsersCount = () => {
  let count = 0;
  for (const presence of userPresence.values()) {
    if (presence.state === PRESENCE_STATES.ONLINE) {
      count++;
    }
  }
  return count;
};

// Get notification delivery statistics
const getNotificationStats = () => {
  return {
    totalQueued: Array.from(notificationQueue.values()).reduce((sum, queue) => sum + queue.length, 0),
    onlineUsers: getOnlineUsersCount(),
    totalUsers: userPresence.size,
    deliveryConfig: DELIVERY_CONFIG
  };
};

module.exports = {
  setupNotifications,
  sendNotificationToUser,
  broadcastNotification,
  getUserPresence,
  getOnlineUsersCount,
  getNotificationStats,
  NOTIFICATION_TYPES,
  PRIORITY_LEVELS,
  PRESENCE_STATES
};
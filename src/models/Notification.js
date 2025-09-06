const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Notification Identification
  notificationId: {
    type: String,
    unique: true,
    required: true,
    default: () => 'NOTIF_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  },
  
  // Notification Details
  recipient: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }, // null for system notifications
  
  // Notification Content
  type: { 
    type: String, 
    enum: [
      // Consultation notifications
      'consultation_request', 
      'consultation_accepted', 
      'consultation_declined',
      'consultation_cancelled', 
      'consultation_reminder',
      'consultation_started',
      'consultation_completed',
      'consultation_rescheduled',
      'consultation_no_show',
      
      // Payment notifications
      'payment_received', 
      'payment_failed',
      'payment_processing',
      'payment_refunded',
      'payment_disputed',
      'payout_processed',
      'payout_failed',
      
      // Medical notifications
      'prescription_ready',
      'lab_results_available',
      'test_reminder',
      'medication_reminder',
      'follow_up_reminder',
      'emergency_alert',
      
      // Account notifications
      'verification_status',
      'account_verified',
      'account_suspended',
      'password_reset',
      'login_alert',
      'profile_updated',
      
      // System notifications
      'system_announcement',
      'maintenance_notice',
      'feature_update',
      'security_alert',
      'policy_update',
      
      // Doctor specific
      'doctor_application_status',
      'doctor_verification_required',
      'new_patient_request',
      'rating_received',
      'document_upload_required',
      
      // General
      'welcome_message',
      'feedback_request',
      'survey_invitation',
      'promotional_offer',
      'birthday_greeting'
    ], 
    required: true,
    index: true
  },
  
  // Notification Priority & Urgency
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent', 'emergency'],
    default: 'normal',
    index: true
  },
  category: {
    type: String,
    enum: ['medical', 'administrative', 'financial', 'social', 'technical', 'marketing'],
    default: 'administrative'
  },
  
  // Content
  title: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 200
  },
  message: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 1000
  },
  shortMessage: {
    type: String,
    trim: true,
    maxlength: 160 // For SMS compatibility
  },
  
  // Rich Content
  richContent: {
    htmlMessage: String, // HTML version for email
    imageUrl: String,
    actionButtons: [{
      text: {
        type: String,
        required: true,
        maxlength: 50
      },
      action: {
        type: String,
        enum: ['redirect', 'api_call', 'deep_link', 'dismiss'],
        required: true
      },
      url: String,
      apiEndpoint: String,
      buttonStyle: {
        type: String,
        enum: ['primary', 'secondary', 'danger', 'success'],
        default: 'primary'
      }
    }],
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Localization
  language: {
    type: String,
    default: 'en',
    enum: ['en', 'es', 'fr', 'de', 'pt', 'ar', 'zh', 'hi', 'yo', 'ig', 'ha']
  },
  translations: [{
    language: String,
    title: String,
    message: String,
    shortMessage: String
  }],
  
  // Related Documents & Context
  relatedConsultation: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Consultation' 
  },
  relatedPayment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Payment' 
  },
  relatedMedicalRecord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicalRecord'
  },
  relatedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // External References
  externalId: String, // Reference to external system
  correlationId: String, // For tracking related notifications
  parentNotification: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Notification'
  },
  
  // Status & Tracking
  isRead: { 
    type: Boolean, 
    default: false,
    index: true
  },
  readAt: Date,
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: Date,
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  
  // Delivery Methods & Status
  deliveryMethods: [{ 
    type: String, 
    enum: ['app', 'email', 'sms', 'push', 'webhook']
  }],
  
  // App Notification
  appDelivery: {
    delivered: { type: Boolean, default: false },
    deliveredAt: Date,
    opened: { type: Boolean, default: false },
    openedAt: Date,
    clicked: { type: Boolean, default: false },
    clickedAt: Date
  },
  
  // Email Delivery
  emailDelivery: {
    emailAddress: String,
    sent: { type: Boolean, default: false },
    sentAt: Date,
    delivered: { type: Boolean, default: false },
    deliveredAt: Date,
    opened: { type: Boolean, default: false },
    openedAt: Date,
    clicked: { type: Boolean, default: false },
    clickedAt: Date,
    bounced: { type: Boolean, default: false },
    bouncedAt: Date,
    bounceReason: String,
    unsubscribed: { type: Boolean, default: false },
    unsubscribedAt: Date,
    messageId: String, // Email service provider message ID
    trackingPixel: String,
    emailTemplate: String
  },
  
  // SMS Delivery
  smsDelivery: {
    phoneNumber: String,
    sent: { type: Boolean, default: false },
    sentAt: Date,
    delivered: { type: Boolean, default: false },
    deliveredAt: Date,
    failed: { type: Boolean, default: false },
    failedAt: Date,
    failureReason: String,
    messageId: String, // SMS service provider message ID
    segmentCount: Number,
    cost: Number
  },
  
  // Push Notification
  pushDelivery: {
    deviceTokens: [String],
    sent: { type: Boolean, default: false },
    sentAt: Date,
    delivered: { type: Boolean, default: false },
    deliveredAt: Date,
    clicked: { type: Boolean, default: false },
    clickedAt: Date,
    failed: { type: Boolean, default: false },
    failedAt: Date,
    failureReason: String,
    messageId: String,
    platform: {
      type: String,
      enum: ['ios', 'android', 'web']
    }
  },
  
  // Webhook Delivery
  webhookDelivery: {
    webhookUrl: String,
    sent: { type: Boolean, default: false },
    sentAt: Date,
    responseStatus: Number,
    responseBody: String,
    retryCount: { type: Number, default: 0 },
    lastRetryAt: Date,
    maxRetries: { type: Number, default: 3 }
  },
  
  // Scheduling & Timing
  scheduledFor: Date, // For delayed delivery
  expiresAt: Date, // Auto-delete after this date
  isScheduled: {
    type: Boolean,
    default: false
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  
  // Batch & Campaign
  batchId: String, // For bulk notifications
  campaignId: String, // For marketing campaigns
  templateId: String, // Reference to notification template
  templateVersion: Number,
  
  // Personalization
  personalizationData: mongoose.Schema.Types.Mixed,
  audienceSegment: String,
  tags: [String],
  
  // Analytics & Metrics
  analytics: {
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    clickThroughRate: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    engagementScore: { type: Number, default: 0 }
  },
  
  // A/B Testing
  abTest: {
    testId: String,
    variant: String,
    controlGroup: Boolean
  },
  
  // Retry Logic
  retryPolicy: {
    maxRetries: { type: Number, default: 3 },
    retryDelay: { type: Number, default: 300 }, // seconds
    backoffMultiplier: { type: Number, default: 2 }
  },
  retryAttempts: [{
    attempt: Number,
    attemptedAt: Date,
    deliveryMethod: String,
    success: Boolean,
    error: String
  }],
  
  // Error Handling
  errors: [{
    deliveryMethod: String,
    errorCode: String,
    errorMessage: String,
    occurredAt: Date,
    resolved: { type: Boolean, default: false },
    resolution: String
  }],
  
  // Compliance & Privacy
  gdprCompliant: { type: Boolean, default: true },
  dataRetentionDays: { type: Number, default: 365 },
  consentRequired: { type: Boolean, default: false },
  consentGiven: { type: Boolean, default: false },
  consentGivenAt: Date,
  optOutUrl: String,
  privacyNoticeUrl: String,
  
  // System Metadata
  source: {
    type: String,
    enum: ['system', 'user', 'api', 'webhook', 'scheduled', 'triggered'],
    default: 'system'
  },
  version: { type: Number, default: 1 },
  environment: {
    type: String,
    enum: ['development', 'staging', 'production'],
    default: 'production'
  },
  
  // Timestamps
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  processedAt: Date,
  completedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for delivery status summary
notificationSchema.virtual('deliveryStatus').get(function() {
  const status = {
    total: this.deliveryMethods.length,
    successful: 0,
    failed: 0,
    pending: 0
  };
  
  this.deliveryMethods.forEach(method => {
    const delivery = this[`${method}Delivery`];
    if (delivery) {
      if (delivery.delivered || delivery.sent) {
        status.successful++;
      } else if (delivery.failed) {
        status.failed++;
      } else {
        status.pending++;
      }
    }
  });
  
  return status;
});

// Virtual for engagement metrics
notificationSchema.virtual('engagementMetrics').get(function() {
  const totalDelivered = this.deliveryMethods.reduce((count, method) => {
    const delivery = this[`${method}Delivery`];
    return count + (delivery?.delivered ? 1 : 0);
  }, 0);
  
  const totalOpened = this.deliveryMethods.reduce((count, method) => {
    const delivery = this[`${method}Delivery`];
    return count + (delivery?.opened ? 1 : 0);
  }, 0);
  
  const totalClicked = this.deliveryMethods.reduce((count, method) => {
    const delivery = this[`${method}Delivery`];
    return count + (delivery?.clicked ? 1 : 0);
  }, 0);
  
  return {
    delivered: totalDelivered,
    opened: totalOpened,
    clicked: totalClicked,
    openRate: totalDelivered > 0 ? (totalOpened / totalDelivered * 100).toFixed(2) : 0,
    clickRate: totalOpened > 0 ? (totalClicked / totalOpened * 100).toFixed(2) : 0
  };
});

// Virtual for time since creation
notificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  const diffInMinutes = Math.floor((now - created) / (1000 * 60));
  
  if (diffInMinutes < 1) return 'just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  
  const diffInMonths = Math.floor(diffInDays / 30);
  return `${diffInMonths}mo ago`;
});

// Indexes
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ priority: 1 });
notificationSchema.index({ scheduledFor: 1 });
notificationSchema.index({ expiresAt: 1 });
notificationSchema.index({ batchId: 1 });
notificationSchema.index({ campaignId: 1 });

// Compound indexes
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, priority: 1, isRead: 1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ isScheduled: 1, scheduledFor: 1 });

// TTL index for automatic deletion of expired notifications
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Text search index
notificationSchema.index({
  title: 'text',
  message: 'text',
  shortMessage: 'text'
}, {
  weights: {
    title: 10,
    message: 5,
    shortMessage: 3
  }
});

// Pre-save middleware
notificationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Set short message if not provided
  if (!this.shortMessage && this.message) {
    this.shortMessage = this.message.length > 160 ? 
      this.message.substring(0, 157) + '...' : 
      this.message;
  }
  
  // Set default expiry if not provided
  if (!this.expiresAt) {
    const expiryDays = this.priority === 'emergency' ? 7 : 30;
    this.expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  }
  
  // Mark as read when clicked
  if (this.isModified('appDelivery.clicked') && this.appDelivery.clicked && !this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
  }
  
  next();
});

// Instance methods
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsDelivered = function(deliveryMethod, messageId = null) {
  if (this.deliveryMethods.includes(deliveryMethod)) {
    const deliveryField = `${deliveryMethod}Delivery`;
    if (this[deliveryField]) {
      this[deliveryField].delivered = true;
      this[deliveryField].deliveredAt = new Date();
      if (messageId) {
        this[deliveryField].messageId = messageId;
      }
    }
  }
  return this.save();
};

notificationSchema.methods.markAsOpened = function(deliveryMethod) {
  if (this.deliveryMethods.includes(deliveryMethod)) {
    const deliveryField = `${deliveryMethod}Delivery`;
    if (this[deliveryField]) {
      this[deliveryField].opened = true;
      this[deliveryField].openedAt = new Date();
      
      // Auto-mark as read when opened
      if (!this.isRead) {
        this.isRead = true;
        this.readAt = new Date();
      }
    }
  }
  return this.save();
};

notificationSchema.methods.markAsClicked = function(deliveryMethod) {
  if (this.deliveryMethods.includes(deliveryMethod)) {
    const deliveryField = `${deliveryMethod}Delivery`;
    if (this[deliveryField]) {
      this[deliveryField].clicked = true;
      this[deliveryField].clickedAt = new Date();
      
      // Update analytics
      this.analytics.clicks += 1;
      
      // Auto-mark as read when clicked
      if (!this.isRead) {
        this.isRead = true;
        this.readAt = new Date();
      }
    }
  }
  return this.save();
};

notificationSchema.methods.markAsFailed = function(deliveryMethod, error) {
  if (this.deliveryMethods.includes(deliveryMethod)) {
    const deliveryField = `${deliveryMethod}Delivery`;
    if (this[deliveryField]) {
      this[deliveryField].failed = true;
      this[deliveryField].failedAt = new Date();
      this[deliveryField].failureReason = error;
    }
    
    // Log error
    this.errors.push({
      deliveryMethod,
      errorMessage: error,
      occurredAt: new Date()
    });
  }
  return this.save();
};

notificationSchema.methods.addRetryAttempt = function(deliveryMethod, success, error = null) {
  this.retryAttempts.push({
    attempt: this.retryAttempts.length + 1,
    attemptedAt: new Date(),
    deliveryMethod,
    success,
    error
  });
  return this.save();
};

notificationSchema.methods.archive = function() {
  this.isArchived = true;
  this.archivedAt = new Date();
  return this.save();
};

notificationSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

notificationSchema.methods.scheduleDelivery = function(scheduledFor, timezone = 'UTC') {
  this.isScheduled = true;
  this.scheduledFor = scheduledFor;
  this.timezone = timezone;
  return this.save();
};

// Static methods
notificationSchema.statics.findByNotificationId = function(notificationId) {
  return this.findOne({ notificationId }).populate('recipient sender');
};

notificationSchema.statics.findUserNotifications = function(userId, options = {}) {
  const {
    unreadOnly = false,
    type = null,
    priority = null,
    limit = 20,
    page = 1
  } = options;
  
  const query = {
    recipient: userId,
    isDeleted: false
  };
  
  if (unreadOnly) query.isRead = false;
  if (type) query.type = type;
  if (priority) query.priority = priority;
  
  const skip = (page - 1) * limit;
  
  return this.find(query)
    .populate('sender')
    .sort({ priority: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

notificationSchema.statics.findScheduledNotifications = function() {
  return this.find({
    isScheduled: true,
    scheduledFor: { $lte: new Date() },
    isDeleted: false
  }).populate('recipient sender');
};

notificationSchema.statics.findUndeliveredNotifications = function() {
  return this.find({
    isScheduled: false,
    $or: [
      { 'appDelivery.delivered': { $ne: true } },
      { 'emailDelivery.sent': { $ne: true } },
      { 'smsDelivery.sent': { $ne: true } },
      { 'pushDelivery.sent': { $ne: true } }
    ],
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
    isDeleted: false
  }).populate('recipient sender');
};

notificationSchema.statics.getNotificationStats = function(userId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        recipient: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: 1 },
        unread: {
          $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] }
        },
        highPriority: {
          $sum: { $cond: [{ $in: ['$priority', ['high', 'urgent', 'emergency']] }, 1, 0] }
        }
      }
    },
    {
      $sort: { total: -1 }
    }
  ]);
};

notificationSchema.statics.markAllAsRead = function(userId, type = null) {
  const query = {
    recipient: userId,
    isRead: false,
    isDeleted: false
  };
  
  if (type) query.type = type;
  
  return this.updateMany(query, {
    $set: {
      isRead: true,
      readAt: new Date()
    }
  });
};

notificationSchema.statics.cleanupExpiredNotifications = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() },
    isDeleted: true
  });
};

module.exports = mongoose.model('Notification', notificationSchema);
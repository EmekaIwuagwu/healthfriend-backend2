const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
  // Log Identification
  logId: {
    type: String,
    unique: true,
    required: true,
    default: () => 'LOG_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  },
  
  // Log Level & Type
  level: { 
    type: String, 
    enum: ['debug', 'info', 'warn', 'error', 'fatal'], 
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: [
      'authentication',
      'authorization', 
      'payment',
      'consultation',
      'medical_data',
      'file_upload',
      'email',
      'sms',
      'database',
      'api',
      'security',
      'performance',
      'system',
      'audit',
      'compliance',
      'error'
    ],
    required: true,
    index: true
  },
  
  // Log Content
  action: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  description: {
    type: String,
    trim: true,
    maxlength: 5000
  },
  
  // User Context
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    index: true
  },
  userRole: {
    type: String,
    enum: ['patient', 'doctor', 'admin', 'system', 'anonymous']
  },
  walletAddress: {
    type: String,
    lowercase: true,
    sparse: true
  },
  sessionId: String,
  
  // Request Context
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']
  },
  url: String,
  route: String,
  statusCode: {
    type: Number,
    min: 100,
    max: 599
  },
  responseTime: {
    type: Number,
    min: 0
  }, // in milliseconds
  requestSize: Number, // in bytes
  responseSize: Number, // in bytes
  
  // Network & Security Context
  ipAddress: {
    type: String,
    validate: {
      validator: function(v) {
        if (!v) return true;
        // Basic IP validation (IPv4 and IPv6)
        return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(v) ||
               /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(v);
      },
      message: 'Invalid IP address format'
    }
  },
  userAgent: String,
  referer: String,
  origin: String,
  xForwardedFor: String,
  geolocation: {
    country: String,
    region: String,
    city: String,
    latitude: Number,
    longitude: Number,
    timezone: String
  },
  
  // Security Context
  securityEvent: {
    type: {
      type: String,
      enum: [
        'login_success',
        'login_failure',
        'logout',
        'password_reset',
        'account_locked',
        'suspicious_activity',
        'rate_limit_exceeded',
        'invalid_token',
        'unauthorized_access',
        'privilege_escalation',
        'data_breach_attempt',
        'malicious_request',
        'sql_injection_attempt',
        'xss_attempt',
        'csrf_attempt'
      ]
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low'
    },
    threat: {
      type: String,
      enum: ['none', 'potential', 'confirmed', 'blocked'],
      default: 'none'
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },
  
  // Application Context
  environment: {
    type: String,
    enum: ['development', 'staging', 'production'],
    default: 'production'
  },
  serverInstance: String,
  nodeVersion: String,
  applicationVersion: String,
  buildVersion: String,
  
  // Database Context
  database: {
    operation: {
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'aggregate', 'index']
    },
    collection: String,
    query: mongoose.Schema.Types.Mixed,
    executionTime: Number, // in milliseconds
    documentsAffected: Number,
    indexesUsed: [String],
    isSlowQuery: {
      type: Boolean,
      default: false
    }
  },
  
  // Payment Context
  payment: {
    paymentId: String,
    transactionHash: String,
    amount: Number,
    currency: String,
    status: String,
    paymentMethod: String,
    processingTime: Number
  },
  
  // Medical Context
  medical: {
    consultationId: String,
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dataType: {
      type: String,
      enum: ['vitals', 'diagnosis', 'prescription', 'lab_result', 'imaging', 'consultation_note']
    },
    hipaaCompliant: {
      type: Boolean,
      default: true
    },
    consentPresent: {
      type: Boolean,
      default: false
    }
  },
  
  // File Operations
  file: {
    operation: {
      type: String,
      enum: ['upload', 'download', 'delete', 'view', 'share']
    },
    fileName: String,
    fileSize: Number,
    fileType: String,
    storageLocation: String,
    encryptionStatus: {
      type: String,
      enum: ['encrypted', 'not_encrypted', 'failed_encryption']
    },
    accessLevel: String
  },
  
  // Communication Logs
  communication: {
    type: {
      type: String,
      enum: ['email', 'sms', 'push_notification', 'webhook']
    },
    recipient: String,
    messageId: String,
    status: {
      type: String,
      enum: ['sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked']
    },
    provider: String,
    cost: Number,
    deliveryTime: Number
  },
  
  // AI & ML Context
  ai: {
    model: String,
    version: String,
    inputSize: Number,
    processingTime: Number,
    confidence: Number,
    tokensUsed: Number,
    cost: Number,
    provider: String
  },
  
  // Performance Metrics
  performance: {
    cpuUsage: Number, // percentage
    memoryUsage: Number, // in MB
    diskUsage: Number, // in MB
    networkLatency: Number, // in ms
    throughput: Number, // requests per second
    errorRate: Number, // percentage
    availability: Number // percentage
  },
  
  // Additional Metadata
  metadata: {
    correlationId: String, // For tracking related logs
    traceId: String, // For distributed tracing
    spanId: String,
    parentSpanId: String,
    tags: [String],
    customFields: mongoose.Schema.Types.Mixed,
    businessContext: String,
    feature: String,
    experiment: String,
    abTestVariant: String
  },
  
  // Error Details
  error: {
    name: String,
    message: String,
    stack: String,
    code: String,
    statusCode: Number,
    isOperational: Boolean,
    innerError: mongoose.Schema.Types.Mixed,
    resolution: String,
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Data Changes (for audit trail)
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    fields: [String], // Fields that were changed
    changeType: {
      type: String,
      enum: ['create', 'update', 'delete', 'restore']
    }
  },
  
  // Compliance & Regulatory
  compliance: {
    gdprApplicable: {
      type: Boolean,
      default: false
    },
    hipaaApplicable: {
      type: Boolean,
      default: false
    },
    dataClassification: {
      type: String,
      enum: ['public', 'internal', 'confidential', 'restricted']
    },
    retentionPeriod: Number, // in days
    anonymized: {
      type: Boolean,
      default: false
    },
    pseudonymized: {
      type: Boolean,
      default: false
    }
  },
  
  // Alert & Notification
  alert: {
    triggered: {
      type: Boolean,
      default: false
    },
    alertType: {
      type: String,
      enum: ['threshold_exceeded', 'anomaly_detected', 'system_down', 'security_breach', 'compliance_violation']
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'error', 'critical'],
      default: 'info'
    },
    notificationSent: {
      type: Boolean,
      default: false
    },
    escalated: {
      type: Boolean,
      default: false
    },
    acknowledged: {
      type: Boolean,
      default: false
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    acknowledgedAt: Date
  },
  
  // Processing Status
  processed: {
    type: Boolean,
    default: false
  },
  processedAt: Date,
  processingDuration: Number,
  
  // Archival
  archived: {
    type: Boolean,
    default: false
  },
  archivedAt: Date,
  archiveLocation: String,
  
  // Timestamps
  timestamp: { 
    type: Date, 
    default: Date.now, 
    index: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }, // Only track creation time
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Remove sensitive information from JSON output
      if (ret.error && ret.error.stack) {
        ret.error.stack = '[REDACTED]';
      }
      if (ret.metadata && ret.metadata.customFields) {
        // Remove sensitive custom fields
        Object.keys(ret.metadata.customFields).forEach(key => {
          if (key.toLowerCase().includes('password') || 
              key.toLowerCase().includes('secret') || 
              key.toLowerCase().includes('token')) {
            ret.metadata.customFields[key] = '[REDACTED]';
          }
        });
      }
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Virtual for log age
systemLogSchema.virtual('age').get(function() {
  const now = new Date();
  const created = new Date(this.timestamp);
  const ageInMinutes = Math.floor((now - created) / (1000 * 60));
  
  if (ageInMinutes < 60) return `${ageInMinutes}m`;
  
  const ageInHours = Math.floor(ageInMinutes / 60);
  if (ageInHours < 24) return `${ageInHours}h`;
  
  const ageInDays = Math.floor(ageInHours / 24);
  return `${ageInDays}d`;
});

// Virtual for severity score
systemLogSchema.virtual('severityScore').get(function() {
  const levelScores = { debug: 1, info: 2, warn: 3, error: 4, fatal: 5 };
  let score = levelScores[this.level] || 0;
  
  // Adjust based on security context
  if (this.securityEvent && this.securityEvent.severity) {
    const securityScores = { low: 1, medium: 2, high: 3, critical: 4 };
    score += securityScores[this.securityEvent.severity] || 0;
  }
  
  // Adjust based on response time
  if (this.responseTime > 5000) score += 1; // Slow response
  if (this.responseTime > 10000) score += 2; // Very slow response
  
  return Math.min(score, 10); // Cap at 10
});

// Virtual for classification
systemLogSchema.virtual('classification').get(function() {
  if (this.level === 'fatal' || this.statusCode >= 500) return 'critical';
  if (this.level === 'error' || this.statusCode >= 400) return 'high';
  if (this.level === 'warn') return 'medium';
  return 'low';
});

// Indexes
systemLogSchema.index({ level: 1, timestamp: -1 });
systemLogSchema.index({ user: 1, timestamp: -1 });
systemLogSchema.index({ timestamp: -1 });
systemLogSchema.index({ category: 1, timestamp: -1 });
systemLogSchema.index({ ipAddress: 1 });
systemLogSchema.index({ 'securityEvent.type': 1 });
systemLogSchema.index({ 'error.code': 1 });
systemLogSchema.index({ statusCode: 1 });

// Compound indexes
systemLogSchema.index({ level: 1, category: 1, timestamp: -1 });
systemLogSchema.index({ user: 1, category: 1, timestamp: -1 });
systemLogSchema.index({ environment: 1, level: 1, timestamp: -1 });
systemLogSchema.index({ 'securityEvent.severity': 1, timestamp: -1 });

// TTL index for automatic cleanup (6 months for most logs, 7 years for audit logs)
systemLogSchema.index({ timestamp: 1 }, { 
  expireAfterSeconds: 180 * 24 * 60 * 60, // 180 days
  partialFilterExpression: { 
    category: { $nin: ['audit', 'compliance', 'medical_data'] } 
  }
});

// Text search index
systemLogSchema.index({
  action: 'text',
  message: 'text',
  description: 'text',
  'error.message': 'text'
}, {
  weights: {
    action: 10,
    message: 8,
    'error.message': 6,
    description: 3
  }
});

// Pre-save middleware
systemLogSchema.pre('save', function(next) {
  // Auto-determine security event severity based on log level
  if (!this.securityEvent.severity && this.level) {
    const severityMap = {
      debug: 'low',
      info: 'low',
      warn: 'medium',
      error: 'high',
      fatal: 'critical'
    };
    this.securityEvent.severity = severityMap[this.level];
  }
  
  // Mark slow queries
  if (this.database && this.database.executionTime > 1000) {
    this.database.isSlowQuery = true;
  }
  
  // Set performance classification
  if (this.responseTime) {
    if (this.responseTime > 10000) this.performance.classification = 'very_slow';
    else if (this.responseTime > 5000) this.performance.classification = 'slow';
    else if (this.responseTime > 1000) this.performance.classification = 'moderate';
    else this.performance.classification = 'fast';
  }
  
  // Auto-trigger alerts for critical events
  if (this.level === 'fatal' || this.severityScore >= 8) {
    this.alert.triggered = true;
    this.alert.severity = 'critical';
  }
  
  next();
});

// Instance methods
systemLogSchema.methods.acknowledge = function(userId) {
  this.alert.acknowledged = true;
  this.alert.acknowledgedBy = userId;
  this.alert.acknowledgedAt = new Date();
  return this.save();
};

systemLogSchema.methods.escalate = function() {
  this.alert.escalated = true;
  return this.save();
};

systemLogSchema.methods.resolve = function(resolution, resolvedBy) {
  if (this.error) {
    this.error.resolution = resolution;
    this.error.resolvedBy = resolvedBy;
    this.error.resolvedAt = new Date();
  }
  return this.save();
};

systemLogSchema.methods.anonymize = function() {
  // Remove or hash personally identifiable information
  if (this.user) this.user = null;
  if (this.walletAddress) this.walletAddress = null;
  if (this.ipAddress) {
    // Keep first 3 octets, zero out the last
    const parts = this.ipAddress.split('.');
    if (parts.length === 4) {
      this.ipAddress = `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
  }
  if (this.userAgent) this.userAgent = '[ANONYMIZED]';
  
  this.compliance.anonymized = true;
  return this.save();
};

systemLogSchema.methods.archive = function(location) {
  this.archived = true;
  this.archivedAt = new Date();
  if (location) this.archiveLocation = location;
  return this.save();
};

// Static methods
systemLogSchema.statics.findByLogId = function(logId) {
  return this.findOne({ logId }).populate('user');
};

systemLogSchema.statics.findUserActivity = function(userId, hours = 24) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    user: userId,
    timestamp: { $gte: startTime }
  }).sort({ timestamp: -1 });
};

systemLogSchema.statics.findSecurityEvents = function(severity = null, hours = 24) {
  const query = {
    'securityEvent.type': { $exists: true },
    timestamp: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
  };
  
  if (severity) {
    query['securityEvent.severity'] = severity;
  }
  
  return this.find(query).sort({ timestamp: -1 });
};

systemLogSchema.statics.findErrorLogs = function(level = 'error', hours = 24) {
  const query = {
    level: { $in: Array.isArray(level) ? level : [level] },
    timestamp: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
  };
  
  return this.find(query)
    .populate('user')
    .sort({ timestamp: -1 });
};

systemLogSchema.statics.findSlowQueries = function(hours = 24) {
  return this.find({
    'database.isSlowQuery': true,
    timestamp: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
  }).sort({ 'database.executionTime': -1 });
};

systemLogSchema.statics.getSystemHealth = function(hours = 1) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: startTime },
        level: { $in: ['error', 'fatal'] }
      }
    },
    {
      $group: {
        _id: '$level',
        count: { $sum: 1 },
        avgResponseTime: { $avg: '$responseTime' },
        categories: { $addToSet: '$category' }
      }
    }
  ]);
};

systemLogSchema.statics.getApiMetrics = function(hours = 24) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: startTime },
        method: { $exists: true },
        statusCode: { $exists: true }
      }
    },
    {
      $group: {
        _id: {
          method: '$method',
          route: '$route',
          statusCode: '$statusCode'
        },
        count: { $sum: 1 },
        avgResponseTime: { $avg: '$responseTime' },
        minResponseTime: { $min: '$responseTime' },
        maxResponseTime: { $max: '$responseTime' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

systemLogSchema.statics.findAnomalies = function(hours = 24) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return this.find({
    timestamp: { $gte: startTime },
    $or: [
      { responseTime: { $gt: 10000 } }, // Very slow responses
      { 'database.executionTime': { $gt: 5000 } }, // Very slow queries
      { 'securityEvent.riskScore': { $gt: 70 } }, // High risk events
      { statusCode: { $in: [500, 502, 503, 504] } } // Server errors
    ]
  }).sort({ timestamp: -1 });
};

systemLogSchema.statics.cleanupOldLogs = function(days = 180) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  // Don't delete audit, compliance, or medical data logs
  return this.deleteMany({
    timestamp: { $lt: cutoffDate },
    category: { $nin: ['audit', 'compliance', 'medical_data'] },
    level: { $nin: ['fatal'] }, // Keep fatal errors
    archived: { $ne: true } // Don't delete archived logs
  });
};

systemLogSchema.statics.generateReport = function(startDate, endDate, categories = null) {
  const matchStage = {
    timestamp: {
      $gte: startDate,
      $lte: endDate
    }
  };
  
  if (categories) {
    matchStage.category = { $in: categories };
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          level: '$level',
          category: '$category'
        },
        count: { $sum: 1 },
        avgResponseTime: { $avg: '$responseTime' },
        errors: {
          $sum: { $cond: [{ $in: ['$level', ['error', 'fatal']] }, 1, 0] }
        }
      }
    },
    {
      $sort: { '_id.date': -1, '_id.level': 1 }
    }
  ]);
};

module.exports = mongoose.model('SystemLog', systemLogSchema);
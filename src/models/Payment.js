const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // Payment Identification
  paymentId: { 
    type: String, 
    unique: true, 
    required: true,
    default: () => 'PAY_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  },
  
  // Blockchain Transaction Details
  transactionHash: { 
    type: String, 
    unique: true, 
    sparse: true,
    index: true
  },
  blockNumber: {
    type: Number,
    min: 0
  },
  blockHash: String,
  gasUsed: {
    type: Number,
    min: 0
  },
  gasFee: {
    type: Number,
    min: 0
  }, // in ETH/MATIC
  gasPrice: {
    type: Number,
    min: 0
  }, // in Gwei
  nonce: Number,
  
  // Payment Information
  amount: { 
    type: Number, 
    required: true,
    min: 0
  }, // Amount in fiat currency (USD)
  currency: { 
    type: String, 
    default: 'USD',
    enum: ['USD', 'NGN', 'EUR', 'GBP']
  },
  cryptoAmount: {
    type: Number,
    min: 0
  }, // Amount in cryptocurrency
  cryptoCurrency: {
    type: String,
    enum: ['ETH', 'MATIC', 'USDC', 'USDT', 'BTC'],
    default: 'MATIC'
  },
  exchangeRate: {
    type: Number,
    min: 0
  }, // Fiat to crypto rate at time of payment
  networkFee: {
    type: Number,
    min: 0
  }, // Additional network fees
  
  // Participants
  payer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  payerWalletAddress: {
    type: String,
    required: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid Ethereum wallet address format'
    }
  },
  payee: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    index: true
  }, // null for platform fees
  payeeWalletAddress: {
    type: String,
    lowercase: true,
    sparse: true,
    validate: {
      validator: function(v) {
        return !v || /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid Ethereum wallet address format'
    }
  },
  
  // Service Information
  serviceType: { 
    type: String, 
    enum: ['ai_consultation', 'video_consultation', 'home_visit', 'platform_fee', 'subscription', 'penalty'], 
    required: true,
    index: true
  },
  consultation: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Consultation',
    index: true
  },
  
  // Fee Breakdown
  serviceFee: {
    type: Number,
    min: 0,
    required: true
  }, // Base service cost
  platformFee: {
    type: Number,
    min: 0,
    required: true
  }, // Platform commission
  platformFeePercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 5
  },
  doctorEarnings: {
    type: Number,
    min: 0
  }, // Amount doctor receives
  taxAmount: {
    type: Number,
    min: 0,
    default: 0
  },
  discountAmount: {
    type: Number,
    min: 0,
    default: 0
  },
  discountCode: String,
  
  // Payment Method & Processing
  paymentMethod: {
    type: String,
    enum: ['metamask', 'wallet_connect', 'coinbase_wallet', 'trust_wallet', 'other_wallet'],
    required: true
  },
  paymentProcessor: {
    type: String,
    enum: ['polygon', 'ethereum', 'binance_smart_chain'],
    default: 'polygon'
  },
  
  // Payment Status & Flow
  status: { 
    type: String, 
    enum: [
      'pending', 
      'processing', 
      'confirming', 
      'completed', 
      'failed', 
      'cancelled', 
      'refunded', 
      'partially_refunded',
      'disputed',
      'expired'
    ], 
    default: 'pending',
    index: true
  },
  
  // Payment Flow Tracking
  paymentFlow: [{
    status: {
      type: String,
      enum: [
        'initiated', 
        'wallet_connected', 
        'transaction_signed', 
        'transaction_sent', 
        'transaction_confirmed',
        'payment_verified',
        'funds_distributed',
        'completed'
      ]
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    transactionHash: String,
    blockNumber: Number,
    gasUsed: Number,
    notes: String
  }],
  
  // Confirmation Requirements
  confirmationsRequired: {
    type: Number,
    default: 12,
    min: 1,
    max: 64
  },
  confirmationsReceived: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Refund Information
  refund: {
    amount: {
      type: Number,
      min: 0
    },
    reason: {
      type: String,
      enum: [
        'cancellation',
        'no_show',
        'technical_issue',
        'quality_issue',
        'duplicate_payment',
        'fraudulent_activity',
        'other'
      ]
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    refundedAt: Date,
    refundTransactionHash: String,
    refundBlockNumber: Number,
    processingFee: {
      type: Number,
      min: 0,
      default: 0
    },
    notes: String
  },
  
  // Dispute Information
  dispute: {
    reason: String,
    description: {
      type: String,
      maxlength: 1000
    },
    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    raisedAt: Date,
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved', 'closed'],
      default: 'open'
    },
    resolution: String,
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Payment Intent & Session
  paymentIntent: {
    intentId: String,
    clientSecret: String,
    expiresAt: Date
  },
  sessionId: String,
  
  // Smart Contract Information
  smartContract: {
    contractAddress: String,
    contractVersion: String,
    methodCalled: String,
    eventLogs: [mongoose.Schema.Types.Mixed]
  },
  
  // Fraud Prevention
  riskScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  riskFactors: [{
    factor: String,
    score: Number,
    description: String
  }],
  fraudFlags: [{
    flag: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    },
    flaggedAt: {
      type: Date,
      default: Date.now
    },
    resolved: {
      type: Boolean,
      default: false
    }
  }],
  
  // Compliance & Regulatory
  complianceChecks: {
    amlScreening: {
      status: {
        type: String,
        enum: ['pending', 'passed', 'failed'],
        default: 'pending'
      },
      checkedAt: Date,
      provider: String,
      riskLevel: String
    },
    kycVerification: {
      status: {
        type: String,
        enum: ['pending', 'verified', 'failed'],
        default: 'pending'
      },
      verifiedAt: Date,
      provider: String
    },
    sanctionsCheck: {
      status: {
        type: String,
        enum: ['clear', 'flagged'],
        default: 'clear'
      },
      checkedAt: Date
    }
  },
  
  // Metadata & Tracking
  metadata: {
    userAgent: String,
    ipAddress: String,
    deviceFingerprint: String,
    sessionDuration: Number,
    referrer: String,
    countryCode: String,
    timezone: String
  },
  
  // External References
  externalReferences: {
    invoiceNumber: String,
    receiptNumber: String,
    orderNumber: String,
    thirdPartyPaymentId: String,
    merchantTransactionId: String
  },
  
  // Notification Status
  notifications: {
    payerNotified: {
      type: Boolean,
      default: false
    },
    payeeNotified: {
      type: Boolean,
      default: false
    },
    adminNotified: {
      type: Boolean,
      default: false
    },
    emailSent: {
      type: Boolean,
      default: false
    },
    smsSent: {
      type: Boolean,
      default: false
    }
  },
  
  // Retry Logic
  retryAttempts: {
    type: Number,
    default: 0,
    max: 5
  },
  lastRetryAt: Date,
  nextRetryAt: Date,
  
  // Timestamps
  initiatedAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  authorizedAt: Date,
  capturedAt: Date,
  completedAt: Date,
  failedAt: Date,
  cancelledAt: Date,
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    index: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for payment summary
paymentSchema.virtual('summary').get(function() {
  return {
    paymentId: this.paymentId,
    amount: this.amount,
    currency: this.currency,
    status: this.status,
    serviceType: this.serviceType,
    createdAt: this.createdAt,
    isCompleted: this.status === 'completed',
    isFailed: ['failed', 'cancelled', 'expired'].includes(this.status)
  };
});

// Virtual for total fee breakdown
paymentSchema.virtual('feeBreakdown').get(function() {
  const subtotal = this.serviceFee;
  const platformFee = this.platformFee;
  const tax = this.taxAmount || 0;
  const discount = this.discountAmount || 0;
  const total = subtotal + platformFee + tax - discount;
  
  return {
    subtotal,
    platformFee,
    platformFeePercentage: this.platformFeePercentage,
    tax,
    discount,
    total,
    doctorReceives: this.doctorEarnings || (subtotal - discount)
  };
});

// Virtual for payment time analytics
paymentSchema.virtual('timeAnalytics').get(function() {
  const initiated = this.initiatedAt;
  const completed = this.completedAt;
  
  if (!initiated) return null;
  
  const timeToComplete = completed ? (completed - initiated) / 1000 : null; // seconds
  const isExpired = new Date() > this.expiresAt;
  const timeUntilExpiry = this.expiresAt ? (this.expiresAt - new Date()) / 1000 : null;
  
  return {
    timeToComplete,
    isExpired,
    timeUntilExpiry,
    processingTime: timeToComplete ? `${Math.round(timeToComplete)}s` : null
  };
});

// Indexes
paymentSchema.index({ payer: 1, createdAt: -1 });
paymentSchema.index({ payee: 1, createdAt: -1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ transactionHash: 1 });
paymentSchema.index({ paymentId: 1 });
paymentSchema.index({ serviceType: 1 });
paymentSchema.index({ consultation: 1 });
paymentSchema.index({ expiresAt: 1 });
paymentSchema.index({ 'paymentFlow.status': 1 });

// Compound indexes
paymentSchema.index({ payer: 1, status: 1, createdAt: -1 });
paymentSchema.index({ payee: 1, status: 1, completedAt: -1 });
paymentSchema.index({ serviceType: 1, status: 1 });
paymentSchema.index({ status: 1, expiresAt: 1 });

// TTL index for expired payments cleanup
paymentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30 days

// Pre-save middleware
paymentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Calculate doctor earnings if not set
  if (!this.doctorEarnings && this.serviceFee && this.platformFee) {
    this.doctorEarnings = this.serviceFee - this.platformFee - (this.discountAmount || 0);
  }
  
  // Set completion timestamp
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  
  // Set failure timestamp
  if (this.isModified('status') && this.status === 'failed' && !this.failedAt) {
    this.failedAt = new Date();
  }
  
  // Set cancellation timestamp
  if (this.isModified('status') && this.status === 'cancelled' && !this.cancelledAt) {
    this.cancelledAt = new Date();
  }
  
  // Update payment flow
  if (this.isModified('status')) {
    this.addToPaymentFlow(this.status);
  }
  
  next();
});

// Instance methods
paymentSchema.methods.addToPaymentFlow = function(status, transactionHash = null, blockNumber = null, gasUsed = null, notes = null) {
  this.paymentFlow.push({
    status,
    timestamp: new Date(),
    transactionHash,
    blockNumber,
    gasUsed,
    notes
  });
};

paymentSchema.methods.updateTransactionDetails = function(transactionHash, blockNumber, gasUsed, gasFee) {
  this.transactionHash = transactionHash;
  this.blockNumber = blockNumber;
  this.gasUsed = gasUsed;
  this.gasFee = gasFee;
  
  this.addToPaymentFlow('transaction_confirmed', transactionHash, blockNumber, gasUsed);
  return this.save();
};

paymentSchema.methods.processRefund = function(amount, reason, requestedBy, notes = null) {
  this.refund = {
    amount,
    reason,
    requestedBy,
    refundedAt: new Date(),
    notes
  };
  
  if (amount >= this.amount) {
    this.status = 'refunded';
  } else {
    this.status = 'partially_refunded';
  }
  
  return this.save();
};

paymentSchema.methods.raiseDispute = function(reason, description, raisedBy) {
  this.dispute = {
    reason,
    description,
    raisedBy,
    raisedAt: new Date(),
    status: 'open'
  };
  
  this.status = 'disputed';
  return this.save();
};

paymentSchema.methods.resolveDispute = function(resolution, resolvedBy) {
  if (!this.dispute) {
    throw new Error('No dispute exists for this payment');
  }
  
  this.dispute.resolution = resolution;
  this.dispute.resolvedBy = resolvedBy;
  this.dispute.resolvedAt = new Date();
  this.dispute.status = 'resolved';
  
  return this.save();
};

paymentSchema.methods.addFraudFlag = function(flag, severity, description = null) {
  this.fraudFlags.push({
    flag,
    severity,
    description,
    flaggedAt: new Date(),
    resolved: false
  });
  
  // Update risk score based on severity
  const severityScores = { low: 10, medium: 25, high: 50, critical: 100 };
  this.riskScore = Math.min(100, this.riskScore + severityScores[severity]);
  
  return this.save();
};

paymentSchema.methods.incrementConfirmations = function() {
  this.confirmationsReceived += 1;
  
  if (this.confirmationsReceived >= this.confirmationsRequired && this.status === 'confirming') {
    this.status = 'completed';
    this.completedAt = new Date();
  }
  
  return this.save();
};

paymentSchema.methods.retry = function() {
  if (this.retryAttempts >= 5) {
    throw new Error('Maximum retry attempts exceeded');
  }
  
  this.retryAttempts += 1;
  this.lastRetryAt = new Date();
  this.nextRetryAt = new Date(Date.now() + Math.pow(2, this.retryAttempts) * 60 * 1000); // Exponential backoff
  this.status = 'pending';
  
  return this.save();
};

// Static methods
paymentSchema.statics.findByPaymentId = function(paymentId) {
  return this.findOne({ paymentId }).populate('payer payee consultation');
};

paymentSchema.statics.findByTransactionHash = function(transactionHash) {
  return this.findOne({ transactionHash }).populate('payer payee consultation');
};

paymentSchema.statics.findUserPayments = function(userId, status = null, limit = 20) {
  const query = {
    $or: [
      { payer: userId },
      { payee: userId }
    ]
  };
  
  if (status) {
    query.status = status;
  }
  
  return this.find(query)
    .populate('payer payee consultation')
    .sort({ createdAt: -1 })
    .limit(limit);
};

paymentSchema.statics.findDoctorEarnings = function(doctorId, startDate = null, endDate = null) {
  const query = {
    payee: doctorId,
    status: 'completed'
  };
  
  if (startDate || endDate) {
    query.completedAt = {};
    if (startDate) query.completedAt.$gte = startDate;
    if (endDate) query.completedAt.$lte = endDate;
  }
  
  return this.find(query).sort({ completedAt: -1 });
};

paymentSchema.statics.findPendingPayments = function(olderThan = null) {
  const query = {
    status: { $in: ['pending', 'processing', 'confirming'] }
  };
  
  if (olderThan) {
    query.createdAt = { $lt: olderThan };
  }
  
  return this.find(query).populate('payer payee consultation');
};

paymentSchema.statics.getPaymentAnalytics = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        completedAt: {
          $gte: startDate,
          $lte: endDate
        },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: '$serviceType',
        totalAmount: { $sum: '$amount' },
        totalPlatformFees: { $sum: '$platformFee' },
        totalDoctorEarnings: { $sum: '$doctorEarnings' },
        transactionCount: { $sum: 1 },
        averageAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
};

module.exports = mongoose.model('Payment', paymentSchema);
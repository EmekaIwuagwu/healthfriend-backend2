// Email service configuration for HealthFriend
const emailConfig = {
  // SMTP Configuration
  smtp: {
    host: process.env.EMAIL_HOST || 'mail.healthfriend.xyz',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true' || false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER || 'noreply@healthfriend.xyz',
      pass: process.env.EMAIL_PASSWORD
    },
    
    // TLS Configuration
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      ciphers: 'SSLv3',
      minVersion: 'TLSv1.2'
    },
    
    // Connection pooling
    pool: true,
    maxConnections: parseInt(process.env.EMAIL_MAX_CONNECTIONS) || 5,
    maxMessages: parseInt(process.env.EMAIL_MAX_MESSAGES) || 100,
    rateLimit: parseInt(process.env.EMAIL_RATE_LIMIT) || 10, // emails per second
    
    // Timeouts
    connectionTimeout: 60000, // 60 seconds
    socketTimeout: 60000, // 60 seconds
    greetingTimeout: 30000, // 30 seconds
    
    // Retry configuration
    retries: 3,
    retryDelay: 5000, // 5 seconds
    
    // Debug mode
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development'
  },

  // Default sender information
  defaults: {
    from: {
      name: 'HealthFriend',
      address: process.env.EMAIL_FROM || 'noreply@healthfriend.xyz'
    },
    replyTo: process.env.EMAIL_REPLY_TO || 'support@healthfriend.xyz',
    
    // Default headers
    headers: {
      'X-Mailer': 'HealthFriend-API',
      'X-Priority': '3',
      'X-MSMail-Priority': 'Normal',
      'Importance': 'Normal'
    }
  },

  // Email queue configuration
  queue: {
    enabled: process.env.EMAIL_QUEUE_ENABLED === 'true' || true,
    maxSize: parseInt(process.env.EMAIL_QUEUE_MAX_SIZE) || 1000,
    concurrency: parseInt(process.env.EMAIL_QUEUE_CONCURRENCY) || 5,
    retryAttempts: parseInt(process.env.EMAIL_QUEUE_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.EMAIL_QUEUE_RETRY_DELAY) || 30000, // 30 seconds
    
    // Queue cleanup
    cleanupInterval: parseInt(process.env.EMAIL_QUEUE_CLEANUP_INTERVAL) || 3600000, // 1 hour
    maxAge: parseInt(process.env.EMAIL_QUEUE_MAX_AGE) || 86400000 // 24 hours
  },

  // Bulk email configuration
  bulk: {
    batchSize: parseInt(process.env.EMAIL_BULK_BATCH_SIZE) || 50,
    delay: parseInt(process.env.EMAIL_BULK_DELAY) || 1000, // 1 second between batches
    maxRecipients: parseInt(process.env.EMAIL_BULK_MAX_RECIPIENTS) || 1000,
    
    // Rate limiting for bulk emails
    hourlyLimit: parseInt(process.env.EMAIL_BULK_HOURLY_LIMIT) || 1000,
    dailyLimit: parseInt(process.env.EMAIL_BULK_DAILY_LIMIT) || 10000
  },

  // Template configuration
  templates: {
    // Template directories
    directory: process.env.EMAIL_TEMPLATES_DIR || 'templates/email',
    extension: '.hbs', // Handlebars templates
    
    // Template caching
    cache: process.env.NODE_ENV === 'production',
    
    // Default template variables
    globals: {
      appName: 'HealthFriend',
      appUrl: process.env.FRONTEND_URL || 'https://healthfriend.xyz',
      apiUrl: process.env.API_BASE_URL || 'https://api.healthfriend.xyz',
      supportEmail: process.env.EMAIL_SUPPORT || 'support@healthfriend.xyz',
      companyName: 'HealthFriend Inc.',
      companyAddress: '123 Health Street, Medical District, City, State 12345',
      year: new Date().getFullYear(),
      
      // Social media links
      social: {
        twitter: 'https://twitter.com/healthfriend',
        facebook: 'https://facebook.com/healthfriend',
        linkedin: 'https://linkedin.com/company/healthfriend',
        instagram: 'https://instagram.com/healthfriend'
      },
      
      // Legal links
      legal: {
        privacy: `${process.env.FRONTEND_URL}/privacy`,
        terms: `${process.env.FRONTEND_URL}/terms`,
        unsubscribe: `${process.env.FRONTEND_URL}/unsubscribe`
      }
    }
  },

  // Email types and their configurations
  types: {
    // Transactional emails (high priority, immediate delivery)
    transactional: {
      priority: 'high',
      queue: false, // Send immediately
      retries: 3,
      timeout: 30000,
      
      categories: [
        'welcome',
        'email_verification',
        'password_reset',
        'login_notification',
        'security_alert',
        'payment_confirmation',
        'consultation_booked',
        'consultation_reminder',
        'consultation_completed',
        'prescription_ready',
        'emergency_alert'
      ]
    },
    
    // Marketing emails (lower priority, can be queued)
    marketing: {
      priority: 'normal',
      queue: true,
      retries: 2,
      timeout: 60000,
      
      // Unsubscribe handling
      unsubscribeHeader: true,
      listUnsubscribe: `${process.env.FRONTEND_URL}/unsubscribe`,
      
      categories: [
        'newsletter',
        'health_tips',
        'feature_announcement',
        'promotional_offer',
        'survey_invitation',
        'doctor_spotlight',
        'health_awareness'
      ]
    },
    
    // System notifications (medium priority)
    system: {
      priority: 'normal',
      queue: true,
      retries: 2,
      timeout: 45000,
      
      categories: [
        'system_maintenance',
        'service_update',
        'account_suspension',
        'data_export_ready',
        'backup_notification',
        'compliance_notice'
      ]
    }
  },

  // Anti-spam and deliverability settings
  deliverability: {
    // SPF, DKIM, DMARC settings
    authentication: {
      spf: true,
      dkim: {
        enabled: true,
        selector: process.env.DKIM_SELECTOR || 'healthfriend',
        privateKey: process.env.DKIM_PRIVATE_KEY
      },
      dmarc: {
        enabled: true,
        policy: 'quarantine'
      }
    },
    
    // Bounce handling
    bounces: {
      trackBounces: true,
      maxBounces: 3,
      bounceWebhook: `${process.env.API_BASE_URL}/webhooks/email/bounce`
    },
    
    // Complaint handling
    complaints: {
      trackComplaints: true,
      maxComplaints: 1,
      complaintWebhook: `${process.env.API_BASE_URL}/webhooks/email/complaint`
    },
    
    // Suppression lists
    suppression: {
      enabled: true,
      types: ['bounce', 'complaint', 'unsubscribe'],
      autoSuppression: true
    }
  },

  // Analytics and tracking
  analytics: {
    // Open tracking
    openTracking: {
      enabled: process.env.EMAIL_TRACK_OPENS === 'true' || true,
      trackingDomain: process.env.EMAIL_TRACKING_DOMAIN || 'track.healthfriend.xyz'
    },
    
    // Click tracking
    clickTracking: {
      enabled: process.env.EMAIL_TRACK_CLICKS === 'true' || true,
      trackingDomain: process.env.EMAIL_TRACKING_DOMAIN || 'track.healthfriend.xyz'
    },
    
    // Delivery tracking
    deliveryTracking: {
      enabled: true,
      webhookUrl: `${process.env.API_BASE_URL}/webhooks/email/delivery`
    },
    
    // Metrics retention
    metricsRetention: parseInt(process.env.EMAIL_METRICS_RETENTION) || 90 // days
  },

  // Security settings
  security: {
    // Encryption for sensitive emails
    encryption: {
      enabled: process.env.EMAIL_ENCRYPTION_ENABLED === 'true' || false,
      algorithm: 'aes-256-gcm',
      keyDerivation: 'pbkdf2'
    },
    
    // Content scanning
    contentScanning: {
      enabled: true,
      scanAttachments: true,
      malwareScanning: true,
      spamScoring: true
    },
    
    // Rate limiting per recipient
    recipientLimits: {
      perHour: parseInt(process.env.EMAIL_RECIPIENT_HOURLY_LIMIT) || 100,
      perDay: parseInt(process.env.EMAIL_RECIPIENT_DAILY_LIMIT) || 500
    }
  },

  // Attachment settings
  attachments: {
    // File size limits
    maxSize: parseInt(process.env.EMAIL_ATTACHMENT_MAX_SIZE) || 25 * 1024 * 1024, // 25MB
    maxCount: parseInt(process.env.EMAIL_ATTACHMENT_MAX_COUNT) || 10,
    
    // Allowed file types
    allowedTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv'
    ],
    
    // Virus scanning
    virusScanning: {
      enabled: process.env.EMAIL_VIRUS_SCANNING === 'true' || false,
      quarantineInfected: true
    }
  },

  // Localization settings
  localization: {
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'es', 'fr', 'de', 'pt', 'ar', 'zh', 'hi', 'yo', 'ig', 'ha'],
    
    // Timezone handling
    timezone: process.env.DEFAULT_TIMEZONE || 'UTC',
    dateFormat: 'YYYY-MM-DD HH:mm:ss',
    
    // Currency formatting
    currency: process.env.DEFAULT_CURRENCY || 'USD',
    currencyFormat: {
      style: 'currency',
      minimumFractionDigits: 2
    }
  },

  // Testing and development
  testing: {
    // Test mode (prevents actual email sending)
    testMode: process.env.EMAIL_TEST_MODE === 'true' || process.env.NODE_ENV === 'test',
    
    // Test recipients (all emails go here in test mode)
    testRecipients: (process.env.EMAIL_TEST_RECIPIENTS || '').split(',').filter(Boolean),
    
    // Mock email service
    mockService: process.env.EMAIL_MOCK_SERVICE === 'true' || false,
    
    // Email preview
    preview: {
      enabled: process.env.NODE_ENV === 'development',
      port: parseInt(process.env.EMAIL_PREVIEW_PORT) || 1080,
      host: 'localhost'
    }
  },

  // Third-party service configurations
  services: {
    // SendGrid configuration
    sendgrid: {
      enabled: process.env.EMAIL_SERVICE === 'sendgrid',
      apiKey: process.env.SENDGRID_API_KEY,
      webhookUrl: `${process.env.API_BASE_URL}/webhooks/sendgrid`
    },
    
    // AWS SES configuration
    ses: {
      enabled: process.env.EMAIL_SERVICE === 'ses',
      region: process.env.AWS_SES_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      configurationSet: process.env.AWS_SES_CONFIGURATION_SET
    },
    
    // Mailgun configuration
    mailgun: {
      enabled: process.env.EMAIL_SERVICE === 'mailgun',
      apiKey: process.env.MAILGUN_API_KEY,
      domain: process.env.MAILGUN_DOMAIN,
      webhookUrl: `${process.env.API_BASE_URL}/webhooks/mailgun`
    }
  },

  // Backup email service (failover)
  backup: {
    enabled: process.env.EMAIL_BACKUP_SERVICE_ENABLED === 'true' || false,
    service: process.env.EMAIL_BACKUP_SERVICE || 'ses',
    
    // Conditions for failover
    failoverConditions: {
      maxFailures: 3,
      timeWindow: 300000, // 5 minutes
      serviceDowntime: 60000 // 1 minute
    }
  }
};

// Validation function
const validateEmailConfig = () => {
  const errors = [];
  
  // Required environment variables
  const required = ['EMAIL_USER', 'EMAIL_PASSWORD'];
  
  required.forEach(key => {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  });
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailConfig.defaults.from.address && !emailRegex.test(emailConfig.defaults.from.address)) {
    errors.push('Invalid default from email address');
  }
  
  // Validate port
  if (emailConfig.smtp.port < 1 || emailConfig.smtp.port > 65535) {
    errors.push('Invalid SMTP port');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Get configuration for specific email type
const getConfigForType = (type) => {
  const baseConfig = { ...emailConfig };
  const typeConfig = emailConfig.types[type] || emailConfig.types.transactional;
  
  return {
    ...baseConfig,
    ...typeConfig
  };
};

// Export configuration
module.exports = {
  emailConfig,
  validateEmailConfig,
  getConfigForType,
  
  // Helper functions
  isTestMode: () => emailConfig.testing.testMode,
  getDefaultSender: () => emailConfig.defaults.from,
  getSupportEmail: () => emailConfig.templates.globals.supportEmail,
  
  // Dynamic configuration getters
  getSmtpConfig: () => emailConfig.smtp,
  getQueueConfig: () => emailConfig.queue,
  getBulkConfig: () => emailConfig.bulk,
  getTemplateConfig: () => emailConfig.templates,
  getAnalyticsConfig: () => emailConfig.analytics,
  getSecurityConfig: () => emailConfig.security
};
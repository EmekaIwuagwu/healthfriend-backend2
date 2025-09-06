const { body, param, query, validationResult, check } = require('express-validator');
const { AppError, handleValidationError } = require('./errorHandler');
const mongoose = require('mongoose');

// Helper function to handle validation results
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const validationError = handleValidationError(errors.array());
    return next(validationError);
  }
  next();
};

// Custom validators
const customValidators = {
  // Ethereum wallet address validation
  isEthereumAddress: (value) => {
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    return ethAddressRegex.test(value);
  },

  // MongoDB ObjectId validation
  isMongoId: (value) => {
    return mongoose.Types.ObjectId.isValid(value);
  },

  // Phone number validation (international format)
  isPhoneNumber: (value) => {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(value);
  },

  // Strong password validation
  isStrongPassword: (value) => {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(value);
  },

  // Date validation (not in future for birthdate)
  isPastDate: (value) => {
    const date = new Date(value);
    return date < new Date();
  },

  // Medical specialization validation
  isMedicalSpecialization: (value) => {
    const validSpecializations = [
      'General Practice', 'Internal Medicine', 'Pediatrics', 'Cardiology',
      'Dermatology', 'Endocrinology', 'Gastroenterology', 'Neurology',
      'Orthopedics', 'Psychiatry', 'Radiology', 'Surgery', 'Gynecology',
      'Ophthalmology', 'ENT', 'Urology', 'Oncology', 'Emergency Medicine',
      'Family Medicine', 'Anesthesiology'
    ];
    return validSpecializations.includes(value);
  },

  // Consultation type validation
  isConsultationType: (value) => {
    const validTypes = ['ai_chat', 'video_call', 'home_visit'];
    return validTypes.includes(value);
  },

  // Payment status validation
  isPaymentStatus: (value) => {
    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'];
    return validStatuses.includes(value);
  },

  // File type validation
  isAllowedFileType: (value) => {
    const allowedTypes = ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'];
    return allowedTypes.includes(value.toLowerCase());
  },

  // Currency validation
  isCurrency: (value) => {
    const validCurrencies = ['USD', 'NGN', 'EUR', 'GBP'];
    return validCurrencies.includes(value);
  },

  // Blood type validation
  isBloodType: (value) => {
    const validBloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];
    return validBloodTypes.includes(value);
  }
};

// User registration validation
const validateUserRegistration = [
  body('walletAddress')
    .isLength({ min: 42, max: 42 })
    .withMessage('Wallet address must be 42 characters long')
    .custom(customValidators.isEthereumAddress)
    .withMessage('Invalid Ethereum wallet address format'),

  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name can only contain letters and spaces'),

  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Last name can only contain letters and spaces'),

  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('phone')
    .optional()
    .custom(customValidators.isPhoneNumber)
    .withMessage('Please provide a valid phone number'),

  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date')
    .custom(customValidators.isPastDate)
    .withMessage('Date of birth cannot be in the future'),

  body('gender')
    .optional()
    .isIn(['male', 'female', 'other', 'prefer_not_to_say'])
    .withMessage('Invalid gender value'),

  body('role')
    .isIn(['patient', 'doctor'])
    .withMessage('Role must be either patient or doctor'),

  handleValidation
];

// Wallet signature validation
const validateWalletSignature = [
  body('walletAddress')
    .custom(customValidators.isEthereumAddress)
    .withMessage('Invalid Ethereum wallet address'),

  body('signature')
    .isLength({ min: 132, max: 132 })
    .withMessage('Invalid signature format'),

  body('message')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message is required'),

  handleValidation
];

// Profile update validation
const validateProfileUpdate = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),

  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),

  body('phone')
    .optional()
    .custom(customValidators.isPhoneNumber)
    .withMessage('Please provide a valid phone number'),

  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters'),

  body('languages')
    .optional()
    .isArray()
    .withMessage('Languages must be an array'),

  body('languages.*')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Each language must be between 2 and 50 characters'),

  handleValidation
];

// Doctor profile validation
const validateDoctorProfile = [
  body('specialization')
    .isArray({ min: 1 })
    .withMessage('At least one specialization is required'),

  body('specialization.*')
    .custom(customValidators.isMedicalSpecialization)
    .withMessage('Invalid medical specialization'),

  body('licenseNumber')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('License number must be between 3 and 50 characters'),

  body('yearsExperience')
    .isInt({ min: 0, max: 70 })
    .withMessage('Years of experience must be between 0 and 70'),

  body('consultationFee')
    .isFloat({ min: 0, max: 10000 })
    .withMessage('Consultation fee must be between 0 and 10000'),

  body('homeVisitFee')
    .optional()
    .isFloat({ min: 0, max: 10000 })
    .withMessage('Home visit fee must be between 0 and 10000'),

  body('education')
    .optional()
    .isArray()
    .withMessage('Education must be an array'),

  body('education.*.degree')
    .isLength({ min: 2, max: 100 })
    .withMessage('Degree name is required'),

  body('education.*.institution')
    .isLength({ min: 2, max: 200 })
    .withMessage('Institution name is required'),

  body('education.*.year')
    .isInt({ min: 1950, max: new Date().getFullYear() })
    .withMessage('Graduation year must be valid'),

  handleValidation
];

// Consultation booking validation
const validateConsultationBooking = [
  body('type')
    .custom(customValidators.isConsultationType)
    .withMessage('Invalid consultation type'),

  body('doctorId')
    .optional()
    .custom(customValidators.isMongoId)
    .withMessage('Invalid doctor ID'),

  body('symptoms')
    .isArray({ min: 1 })
    .withMessage('At least one symptom is required'),

  body('symptoms.*')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Each symptom must be between 2 and 200 characters'),

  body('chiefComplaint')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Chief complaint must be between 10 and 500 characters'),

  body('scheduledDate')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date')
    .custom((value) => {
      const scheduledDate = new Date(value);
      const now = new Date();
      return scheduledDate > now;
    })
    .withMessage('Scheduled date must be in the future'),

  body('visitAddress')
    .if(body('type').equals('home_visit'))
    .notEmpty()
    .withMessage('Visit address is required for home visits'),

  body('visitAddress.street')
    .if(body('type').equals('home_visit'))
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Street address is required'),

  body('visitAddress.city')
    .if(body('type').equals('home_visit'))
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('City is required'),

  handleValidation
];

// Payment validation
const validatePayment = [
  body('amount')
    .isFloat({ min: 1, max: 100000 })
    .withMessage('Amount must be between 1 and 100000'),

  body('currency')
    .custom(customValidators.isCurrency)
    .withMessage('Invalid currency'),

  body('consultationId')
    .custom(customValidators.isMongoId)
    .withMessage('Invalid consultation ID'),

  body('paymentMethod')
    .isIn(['metamask', 'wallet_connect', 'coinbase_wallet', 'trust_wallet', 'other_wallet'])
    .withMessage('Invalid payment method'),

  handleValidation
];

// Medical record validation
const validateMedicalRecord = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),

  body('recordType')
    .isIn([
      'consultation_note', 'prescription', 'lab_result', 'imaging',
      'vaccination', 'allergy', 'surgery', 'discharge_summary',
      'referral', 'vital_signs', 'progress_note', 'other'
    ])
    .withMessage('Invalid record type'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),

  body('patientId')
    .custom(customValidators.isMongoId)
    .withMessage('Invalid patient ID'),

  handleValidation
];

// Vital signs validation
const validateVitalSigns = [
  body('bloodPressure.systolic')
    .optional()
    .isInt({ min: 50, max: 300 })
    .withMessage('Systolic pressure must be between 50 and 300'),

  body('bloodPressure.diastolic')
    .optional()
    .isInt({ min: 30, max: 200 })
    .withMessage('Diastolic pressure must be between 30 and 200'),

  body('heartRate')
    .optional()
    .isInt({ min: 30, max: 250 })
    .withMessage('Heart rate must be between 30 and 250'),

  body('temperature')
    .optional()
    .isFloat({ min: 30, max: 45 })
    .withMessage('Temperature must be between 30 and 45 celsius'),

  body('oxygenSaturation')
    .optional()
    .isInt({ min: 70, max: 100 })
    .withMessage('Oxygen saturation must be between 70 and 100'),

  body('weight')
    .optional()
    .isFloat({ min: 1, max: 1000 })
    .withMessage('Weight must be between 1 and 1000 kg'),

  body('height')
    .optional()
    .isFloat({ min: 30, max: 300 })
    .withMessage('Height must be between 30 and 300 cm'),

  handleValidation
];

// Prescription validation
const validatePrescription = [
  body('medication')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Medication name is required'),

  body('dosage')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Dosage is required'),

  body('frequency')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Frequency is required'),

  body('duration')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Duration is required'),

  body('instructions')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Instructions cannot exceed 300 characters'),

  handleValidation
];

// Search validation
const validateSearch = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Search query must be between 2 and 100 characters'),

  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Page must be between 1 and 1000'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('sortBy')
    .optional()
    .isIn(['createdAt', 'updatedAt', 'name', 'rating', 'price'])
    .withMessage('Invalid sort field'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),

  handleValidation
];

// ID parameter validation
const validateId = [
  param('id')
    .custom(customValidators.isMongoId)
    .withMessage('Invalid ID format'),

  handleValidation
];

// Date range validation
const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format')
    .custom((value, { req }) => {
      if (req.query.startDate && value) {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(value);
        return endDate >= startDate;
      }
      return true;
    })
    .withMessage('End date must be after start date'),

  handleValidation
];

// File upload validation
const validateFileUpload = [
  body('category')
    .optional()
    .isIn(['avatar', 'medical_record', 'verification_document'])
    .withMessage('Invalid file category'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  handleValidation
];

// Rating validation
const validateRating = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),

  body('feedback')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Feedback cannot exceed 1000 characters'),

  handleValidation
];

// AI chat validation
const validateAIChat = [
  body('message')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message must be between 1 and 2000 characters'),

  body('conversationId')
    .optional()
    .custom(customValidators.isMongoId)
    .withMessage('Invalid conversation ID'),

  handleValidation
];

// Email validation
const validateEmail = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  handleValidation
];

// Password validation
const validatePassword = [
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .custom(customValidators.isStrongPassword)
    .withMessage('Password must contain at least 1 uppercase, 1 lowercase, 1 number, and 1 special character'),

  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match password');
      }
      return true;
    }),

  handleValidation
];

// Notification validation
const validateNotification = [
  body('type')
    .isIn([
      'consultation_request', 'consultation_accepted', 'consultation_cancelled',
      'payment_received', 'payment_failed', 'system_announcement'
    ])
    .withMessage('Invalid notification type'),

  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),

  body('message')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters'),

  handleValidation
];

// Sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Remove any potential script tags and dangerous characters
  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    return value;
  };

  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        } else {
          obj[key] = sanitizeValue(obj[key]);
        }
      }
    }
  };

  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);

  next();
};

module.exports = {
  // User validations
  validateUserRegistration,
  validateWalletSignature,
  validateProfileUpdate,
  validateDoctorProfile,
  validateEmail,
  validatePassword,

  // Consultation validations
  validateConsultationBooking,
  validateRating,
  validateAIChat,

  // Medical validations
  validateMedicalRecord,
  validateVitalSigns,
  validatePrescription,

  // Payment validations
  validatePayment,

  // General validations
  validateId,
  validateSearch,
  validateDateRange,
  validateFileUpload,
  validateNotification,

  // Utility
  handleValidation,
  sanitizeInput,
  customValidators
};
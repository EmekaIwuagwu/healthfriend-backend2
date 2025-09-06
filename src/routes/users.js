const express = require('express');
const { body, query, param } = require('express-validator');
const User = require('../models/User');
const MedicalRecord = require('../models/MedicalRecord');
const Consultation = require('../models/Consultation');
const { 
  authenticateWallet, 
  authorize, 
  requireEmailVerification,
  requireOwnership
} = require('../middleware/auth');
const { 
  validateProfileUpdate, 
  validateId,
  validateSearch,
  handleValidation
} = require('../middleware/validation');
const { uploadAndProcessAvatar } = require('../middleware/upload');
const { userRateLimit } = require('../middleware/rateLimit');
const { sendEmail } = require('../utils/email');
const { logError, logSecurity } = require('../utils/logger');
const { 
  success, 
  error: errorResponse, 
  paginated 
} = require('../utils/helpers').responseUtils;
const { 
  calculateAge, 
  calculateBMI, 
  formatPhoneNumber,
  maskString 
} = require('../utils/helpers');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateWallet);

// Apply rate limiting
router.use(userRateLimit(50, 15 * 60 * 1000)); // 50 requests per 15 minutes

/**
 * @route   GET /api/users/profile
 * @desc    Get current user's profile
 * @access  Private
 */
router.get('/profile', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
    }

    // Prepare profile data with computed fields
    const profileData = {
      id: user._id,
      walletAddress: user.walletAddress,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      dateOfBirth: user.dateOfBirth,
      age: user.age,
      gender: user.gender,
      role: user.role,
      avatar: user.avatar,
      bio: user.bio,
      languages: user.languages,
      address: user.address,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      loginCount: user.loginCount,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      notificationPreferences: user.notificationPreferences,
      privacySettings: user.privacySettings
    };

    // Add role-specific data
    if (user.role === 'patient' && user.medicalInfo) {
      profileData.medicalInfo = {
        ...user.medicalInfo,
        // Calculate BMI if height and weight available
        bmi: user.medicalInfo.height && user.medicalInfo.weight ? 
          calculateBMI(user.medicalInfo.weight, user.medicalInfo.height) : null
      };
    }

    if (user.role === 'doctor' && user.doctorProfile) {
      profileData.doctorProfile = user.doctorProfile;
    }

    res.json(success(profileData, 'Profile retrieved successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Get User Profile',
      userId: req.user.id
    });
    next(err);
  }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', validateProfileUpdate, async (req, res, next) => {
  try {
    const updates = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
    }

    // Check if email is being changed and if it's already in use
    if (updates.email && updates.email.toLowerCase() !== user.email) {
      const existingUser = await User.findOne({ 
        email: updates.email.toLowerCase(),
        _id: { $ne: user._id }
      });
      
      if (existingUser) {
        return res.status(409).json(errorResponse('Email already in use', 'EMAIL_EXISTS'));
      }
      
      // If email is being changed, mark as unverified
      updates.isEmailVerified = false;
    }

    // Update allowed fields
    const allowedUpdates = [
      'firstName', 'lastName', 'phone', 'dateOfBirth', 'gender', 
      'bio', 'languages', 'address', 'notificationPreferences', 'privacySettings'
    ];
    
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        user[field] = updates[field];
      }
    });

    // Handle email separately
    if (updates.email) {
      user.email = updates.email.toLowerCase();
    }

    await user.save();

    // Send email verification if email was changed
    if (updates.email && !user.isEmailVerified) {
      try {
        const emailToken = require('../middleware/auth').generateSecureToken();
        user.emailVerificationToken = emailToken;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();

        await sendEmail(user.email, 'emailVerification', {
          firstName: user.firstName,
          lastName: user.lastName
        }, emailToken);
      } catch (emailError) {
        logError(emailError, { 
          context: 'Profile Update Email Verification',
          userId: user._id
        });
        // Don't fail the update if email fails
      }
    }

    // Return updated profile
    const updatedProfile = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      dateOfBirth: user.dateOfBirth,
      age: user.age,
      gender: user.gender,
      bio: user.bio,
      languages: user.languages,
      address: user.address,
      isEmailVerified: user.isEmailVerified,
      notificationPreferences: user.notificationPreferences,
      privacySettings: user.privacySettings,
      updatedAt: user.updatedAt
    };

    res.json(success(updatedProfile, 'Profile updated successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Update User Profile',
      userId: req.user.id,
      updates: Object.keys(req.body)
    });
    next(err);
  }
});

/**
 * @route   POST /api/users/avatar
 * @desc    Upload user avatar
 * @access  Private
 */
router.post('/avatar', uploadAndProcessAvatar, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json(errorResponse('No image file provided', 'NO_FILE'));
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
    }

    // Update user avatar
    user.avatar = req.file.filename;
    await user.save();

    res.json(success({
      avatar: user.avatar,
      fileId: req.file.id,
      size: req.file.size,
      uploadedAt: new Date()
    }, 'Avatar uploaded successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Upload Avatar',
      userId: req.user.id
    });
    next(err);
  }
});

/**
 * @route   GET /api/users/medical-history
 * @desc    Get user's medical history
 * @access  Private (Patient only)
 */
router.get('/medical-history', authorize('patient'), async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
    }

    // Get medical records
    const medicalRecords = await MedicalRecord.find({
      patient: req.user.id,
      isActive: true,
      isDeleted: false
    })
    .populate('doctor', 'firstName lastName doctorProfile.specialization')
    .populate('consultation', 'consultationId type scheduledDate')
    .sort({ recordDate: -1 })
    .limit(50);

    // Prepare medical history data
    const medicalHistory = {
      personalInfo: {
        bloodType: user.medicalInfo?.bloodType,
        height: user.medicalInfo?.height,
        weight: user.medicalInfo?.weight,
        bmi: user.medicalInfo?.height && user.medicalInfo?.weight ? 
          calculateBMI(user.medicalInfo.weight, user.medicalInfo.height) : null
      },
      medicalHistory: user.medicalInfo?.medicalHistory || [],
      allergies: user.medicalInfo?.allergies || [],
      currentMedications: user.medicalInfo?.currentMedications || [],
      emergencyContact: user.medicalInfo?.emergencyContact,
      records: medicalRecords,
      summary: {
        totalRecords: medicalRecords.length,
        recentConditions: user.medicalInfo?.medicalHistory
          ?.filter(h => h.isActive)
          ?.slice(0, 5) || [],
        activeAllergies: user.medicalInfo?.allergies?.length || 0,
        currentMedications: user.medicalInfo?.currentMedications
          ?.filter(m => m.isActive)?.length || 0
      }
    };

    res.json(success(medicalHistory, 'Medical history retrieved successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Get Medical History',
      userId: req.user.id
    });
    next(err);
  }
});

/**
 * @route   PUT /api/users/medical-history
 * @desc    Update user's medical information
 * @access  Private (Patient only)
 */
router.put('/medical-history', [
  authorize('patient'),
  body('bloodType').optional().isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']),
  body('height').optional().isFloat({ min: 30, max: 300 }),
  body('weight').optional().isFloat({ min: 1, max: 1000 }),
  handleValidation
], async (req, res, next) => {
  try {
    const updates = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
    }

    // Initialize medicalInfo if doesn't exist
    if (!user.medicalInfo) {
      user.medicalInfo = {};
    }

    // Update medical information fields
    const allowedFields = [
      'bloodType', 'height', 'weight', 'medicalHistory', 
      'allergies', 'currentMedications', 'emergencyContact'
    ];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        user.medicalInfo[field] = updates[field];
      }
    });

    await user.save();

    // Calculate BMI if height and weight are available
    const bmi = user.medicalInfo.height && user.medicalInfo.weight ? 
      calculateBMI(user.medicalInfo.weight, user.medicalInfo.height) : null;

    res.json(success({
      medicalInfo: user.medicalInfo,
      bmi,
      updatedAt: user.updatedAt
    }, 'Medical information updated successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Update Medical History',
      userId: req.user.id
    });
    next(err);
  }
});

/**
 * @route   POST /api/users/medical-history/condition
 * @desc    Add medical condition to history
 * @access  Private (Patient only)
 */
router.post('/medical-history/condition', [
  authorize('patient'),
  body('condition').trim().isLength({ min: 2, max: 200 }).withMessage('Condition name is required'),
  body('diagnosedDate').isISO8601().withMessage('Valid diagnosed date is required'),
  body('doctor').optional().trim().isLength({ max: 100 }),
  body('notes').optional().trim().isLength({ max: 500 }),
  body('severity').optional().isIn(['mild', 'moderate', 'severe']),
  handleValidation
], async (req, res, next) => {
  try {
    const { condition, diagnosedDate, doctor, notes, severity } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
    }

    // Add to medical history
    await user.addMedicalHistory(condition, new Date(diagnosedDate), doctor, notes);

    res.json(success({
      condition,
      diagnosedDate,
      addedAt: new Date()
    }, 'Medical condition added successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Add Medical Condition',
      userId: req.user.id
    });
    next(err);
  }
});

/**
 * @route   POST /api/users/medical-history/allergy
 * @desc    Add allergy to medical history
 * @access  Private (Patient only)
 */
router.post('/medical-history/allergy', [
  authorize('patient'),
  body('allergen').trim().isLength({ min: 2, max: 100 }).withMessage('Allergen name is required'),
  body('severity').isIn(['mild', 'moderate', 'severe']).withMessage('Valid severity is required'),
  body('reaction').optional().trim().isLength({ max: 300 }),
  handleValidation
], async (req, res, next) => {
  try {
    const { allergen, severity, reaction } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
    }

    // Add allergy
    await user.addAllergy(allergen, severity, reaction);

    res.json(success({
      allergen,
      severity,
      reaction,
      addedAt: new Date()
    }, 'Allergy added successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Add Allergy',
      userId: req.user.id
    });
    next(err);
  }
});

/**
 * @route   GET /api/users/consultations
 * @desc    Get user's consultations
 * @access  Private
 */
router.get('/consultations', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['pending', 'scheduled', 'ongoing', 'completed', 'cancelled']),
  query('type').optional().isIn(['ai_chat', 'video_call', 'home_visit']),
  handleValidation
], async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query;
    
    // Build query based on user role
    let query = {};
    if (req.user.role === 'patient') {
      query.patient = req.user.id;
    } else if (req.user.role === 'doctor') {
      query.doctor = req.user.id;
    } else {
      // Admin can see all
    }

    if (status) query.status = status;
    if (type) query.type = type;

    const consultations = await Consultation.find(query)
      .populate('patient', 'firstName lastName avatar')
      .populate('doctor', 'firstName lastName doctorProfile.specialization avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Consultation.countDocuments(query);

    res.json(paginated(consultations, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    }));

  } catch (err) {
    logError(err, { 
      context: 'Get User Consultations',
      userId: req.user.id
    });
    next(err);
  }
});

/**
 * @route   GET /api/users/search
 * @desc    Search users (doctors only for patients)
 * @access  Private
 */
router.get('/search', [
  validateSearch,
  query('role').optional().isIn(['patient', 'doctor']),
  query('specialization').optional().trim(),
  query('location').optional().trim(),
  query('verified').optional().isBoolean(),
  handleValidation
], async (req, res, next) => {
  try {
    const { 
      q, 
      page = 1, 
      limit = 20, 
      role, 
      specialization, 
      location, 
      verified,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build search query
    let searchQuery = {
      isActive: true,
      isBanned: false
    };

    // Role filter
    if (role) {
      searchQuery.role = role;
    } else if (req.user.role === 'patient') {
      // Patients can only search for doctors
      searchQuery.role = 'doctor';
    }

    // Text search
    if (q) {
      searchQuery.$text = { $search: q };
    }

    // Doctor-specific filters
    if (searchQuery.role === 'doctor') {
      if (specialization) {
        searchQuery['doctorProfile.specialization'] = { $in: [specialization] };
      }
      if (verified !== undefined) {
        searchQuery['doctorProfile.isVerified'] = verified === 'true';
      }
    }

    // Location filter
    if (location) {
      searchQuery.$or = [
        { 'address.city': new RegExp(location, 'i') },
        { 'address.state': new RegExp(location, 'i') },
        { 'address.country': new RegExp(location, 'i') }
      ];
    }

    // Execute search
    const users = await User.find(searchQuery)
      .select('firstName lastName avatar role doctorProfile.specialization doctorProfile.rating doctorProfile.totalReviews doctorProfile.isVerified doctorProfile.isAvailable doctorProfile.consultationFee address.city address.state')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(searchQuery);

    // Format results
    const results = users.map(user => ({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      avatar: user.avatar,
      role: user.role,
      location: user.address ? `${user.address.city}, ${user.address.state}` : null,
      ...(user.role === 'doctor' && user.doctorProfile ? {
        specialization: user.doctorProfile.specialization,
        rating: user.doctorProfile.rating,
        totalReviews: user.doctorProfile.totalReviews,
        isVerified: user.doctorProfile.isVerified,
        isAvailable: user.doctorProfile.isAvailable,
        consultationFee: user.doctorProfile.consultationFee
      } : {})
    }));

    res.json(paginated(results, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    }));

  } catch (err) {
    logError(err, { 
      context: 'Search Users',
      userId: req.user.id,
      query: req.query
    });
    next(err);
  }
});

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID (public profile)
 * @access  Private
 */
router.get('/:id', validateId, async (req, res, next) => {
  try {
    const userId = req.params.id;
    
    const user = await User.findById(userId)
      .select('firstName lastName avatar role bio languages address.city address.state createdAt doctorProfile.specialization doctorProfile.rating doctorProfile.totalReviews doctorProfile.isVerified doctorProfile.isAvailable doctorProfile.consultationFee doctorProfile.yearsExperience doctorProfile.education')
      .lean();

    if (!user) {
      return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
    }

    // Prepare public profile
    const publicProfile = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      role: user.role,
      bio: user.bio,
      languages: user.languages,
      location: user.address ? `${user.address.city}, ${user.address.state}` : null,
      memberSince: user.createdAt
    };

    // Add doctor-specific public info
    if (user.role === 'doctor' && user.doctorProfile) {
      publicProfile.doctorInfo = {
        specialization: user.doctorProfile.specialization,
        rating: user.doctorProfile.rating,
        totalReviews: user.doctorProfile.totalReviews,
        isVerified: user.doctorProfile.isVerified,
        isAvailable: user.doctorProfile.isAvailable,
        consultationFee: user.doctorProfile.consultationFee,
        yearsExperience: user.doctorProfile.yearsExperience,
        education: user.doctorProfile.education
      };
    }

    res.json(success(publicProfile, 'User profile retrieved successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Get User By ID',
      userId: req.user.id,
      targetUserId: req.params.id
    });
    next(err);
  }
});

/**
 * @route   PUT /api/users/settings/notifications
 * @desc    Update notification preferences
 * @access  Private
 */
router.put('/settings/notifications', [
  body('email').optional().isBoolean(),
  body('sms').optional().isBoolean(),
  body('push').optional().isBoolean(),
  body('consultationReminders').optional().isBoolean(),
  body('paymentNotifications').optional().isBoolean(),
  body('marketingEmails').optional().isBoolean(),
  handleValidation
], async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
    }

    // Update notification preferences
    user.notificationPreferences = {
      ...user.notificationPreferences,
      ...req.body
    };

    await user.save();

    res.json(success(user.notificationPreferences, 'Notification preferences updated successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Update Notification Preferences',
      userId: req.user.id
    });
    next(err);
  }
});

/**
 * @route   PUT /api/users/settings/privacy
 * @desc    Update privacy settings
 * @access  Private
 */
router.put('/settings/privacy', [
  body('shareDataForResearch').optional().isBoolean(),
  body('allowMarketing').optional().isBoolean(),
  body('shareProfileWithDoctors').optional().isBoolean(),
  handleValidation
], async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
    }

    // Update privacy settings
    user.privacySettings = {
      ...user.privacySettings,
      ...req.body
    };

    await user.save();

    res.json(success(user.privacySettings, 'Privacy settings updated successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Update Privacy Settings',
      userId: req.user.id
    });
    next(err);
  }
});

/**
 * @route   DELETE /api/users/account
 * @desc    Deactivate user account
 * @access  Private
 */
router.delete('/account', [
  body('reason').optional().trim().isLength({ max: 500 }),
  body('feedback').optional().trim().isLength({ max: 1000 }),
  handleValidation
], async (req, res, next) => {
  try {
    const { reason, feedback } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
    }

    // Deactivate account
    user.isActive = false;
    user.deactivatedAt = new Date();
    user.deactivationReason = reason;
    user.deactivationFeedback = feedback;
    
    // Generate new nonce to invalidate tokens
    user.nonce = require('../middleware/auth').generateNonce();
    
    await user.save();

    logSecurity(
      'account_deactivated',
      user._id,
      req.ip,
      req.get('User-Agent'),
      'medium',
      { reason, feedback }
    );

    res.json(success(null, 'Account deactivated successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Deactivate Account',
      userId: req.user.id
    });
    next(err);
  }
});

/**
 * @route   GET /api/users/stats
 * @desc    Get user statistics
 * @access  Private
 */
router.get('/stats', async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get consultation stats
    let consultationStats = {};
    if (req.user.role === 'patient') {
      consultationStats = await Consultation.aggregate([
        { $match: { patient: require('mongoose').Types.ObjectId(userId) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
    } else if (req.user.role === 'doctor') {
      consultationStats = await Consultation.aggregate([
        { $match: { doctor: require('mongoose').Types.ObjectId(userId) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
    }

    // Format stats
    const stats = {
      consultations: consultationStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      totalConsultations: consultationStats.reduce((sum, stat) => sum + stat.count, 0)
    };

    res.json(success(stats, 'User statistics retrieved successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Get User Stats',
      userId: req.user.id
    });
    next(err);
  }
});

module.exports = router;
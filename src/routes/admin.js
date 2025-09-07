const express = require('express');
const { body, query, param } = require('express-validator');
const adminController = require('../controllers/adminController');
const { 
  authenticateWallet, 
  authorize 
} = require('../middleware/auth');
const { 
  validateUserManagement,
  validateSystemSettings,
  validateId,
  handleValidation 
} = require('../middleware/validation');
const { adminActionRateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// Apply authentication and admin authorization to all routes
router.use(authenticateWallet);
router.use(authorize('admin'));

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard overview
 * @access  Private (Admin only)
 */
router.get('/dashboard', adminController.getDashboard);

/**
 * @route   POST /api/admin/users/manage
 * @desc    Manage users (verify, suspend, activate, delete)
 * @access  Private (Admin only)
 */
router.post('/users/manage', [
  adminActionRateLimit,
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  body('action')
    .isIn(['verify', 'suspend', 'activate', 'delete', 'reset_password'])
    .withMessage('Action must be verify, suspend, activate, delete, or reset_password'),
  body('reason')
    .optional()
    .isLength({ min: 10, max: 500 })
    .withMessage('Reason must be between 10 and 500 characters'),
  body('notifyUser')
    .optional()
    .isBoolean()
    .withMessage('Notify user must be boolean'),
  handleValidation
], adminController.manageUser);

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with filters and pagination
 * @access  Private (Admin only)
 */
router.get('/users', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('role')
    .optional()
    .isIn(['patient', 'doctor', 'admin'])
    .withMessage('Role must be patient, doctor, or admin'),
  query('status')
    .optional()
    .isIn(['active', 'suspended', 'deleted'])
    .withMessage('Status must be active, suspended, or deleted'),
  query('verificationStatus')
    .optional()
    .isIn(['pending', 'verified', 'rejected'])
    .withMessage('Verification status must be pending, verified, or rejected'),
  query('search')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Search term must be between 2 and 100 characters'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'name', 'email', 'lastActive'])
    .withMessage('Sort by must be createdAt, name, email, or lastActive'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
  handleValidation
], adminController.getUsers);

/**
 * @route   GET /api/admin/users/:userId
 * @desc    Get user details with full information
 * @access  Private (Admin only)
 */
router.get('/users/:userId', [
  param('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  handleValidation
], adminController.getUserDetails);

/**
 * @route   GET /api/admin/analytics
 * @desc    Get platform analytics and reports
 * @access  Private (Admin only)
 */
router.get('/analytics', [
  query('reportType')
    .optional()
    .isIn(['overview', 'user_activity', 'financial', 'consultation', 'ai_usage', 'system_health'])
    .withMessage('Invalid report type'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid ISO date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid ISO date'),
  query('granularity')
    .optional()
    .isIn(['hour', 'day', 'week', 'month'])
    .withMessage('Granularity must be hour, day, week, or month'),
  handleValidation
], adminController.getAnalytics);

/**
 * @route   PUT /api/admin/settings
 * @desc    Update system settings
 * @access  Private (Admin only)
 */
router.put('/settings', [
  adminActionRateLimit,
  body('maintenanceMode')
    .optional()
    .isBoolean()
    .withMessage('Maintenance mode must be boolean'),
  body('maxDailyConsultations')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Max daily consultations must be between 1 and 100'),
  body('platformFeePercentage')
    .optional()
    .isFloat({ min: 0, max: 50 })
    .withMessage('Platform fee percentage must be between 0 and 50'),
  body('emergencyContactInfo')
    .optional()
    .isObject()
    .withMessage('Emergency contact info must be an object'),
  body('aiSettings')
    .optional()
    .isObject()
    .withMessage('AI settings must be an object'),
  body('aiSettings.maxTokensPerRequest')
    .optional()
    .isInt({ min: 100, max: 10000 })
    .withMessage('Max tokens per request must be between 100 and 10000'),
  body('aiSettings.emergencyThreshold')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Emergency threshold must be between 0 and 1'),
  body('emailSettings')
    .optional()
    .isObject()
    .withMessage('Email settings must be an object'),
  handleValidation
], adminController.updateSystemSettings);

/**
 * @route   GET /api/admin/logs
 * @desc    Get system logs with filtering
 * @access  Private (Admin only)
 */
router.get('/logs', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('level')
    .optional()
    .isIn(['error', 'warn', 'info', 'debug'])
    .withMessage('Level must be error, warn, info, or debug'),
  query('category')
    .optional()
    .isIn(['auth', 'payment', 'consultation', 'ai', 'admin', 'security', 'system'])
    .withMessage('Invalid category'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid ISO date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid ISO date'),
  query('userId')
    .optional()
    .isMongoId()
    .withMessage('User ID must be valid'),
  query('search')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Search term must be between 2 and 100 characters'),
  handleValidation
], adminController.getSystemLogs);

/**
 * @route   POST /api/admin/content/moderate
 * @desc    Handle content moderation
 * @access  Private (Admin only)
 */
router.post('/content/moderate', [
  adminActionRateLimit,
  body('contentType')
    .isIn(['consultation', 'medical_record', 'user_profile', 'message'])
    .withMessage('Content type must be consultation, medical_record, user_profile, or message'),
  body('contentId')
    .isMongoId()
    .withMessage('Valid content ID is required'),
  body('action')
    .isIn(['approve', 'remove', 'flag', 'warn'])
    .withMessage('Action must be approve, remove, flag, or warn'),
  body('reason')
    .isLength({ min: 10, max: 500 })
    .withMessage('Reason must be between 10 and 500 characters'),
  handleValidation
], adminController.moderateContent);

/**
 * @route   POST /api/admin/announcements
 * @desc    Send system-wide announcements
 * @access  Private (Admin only)
 */
router.post('/announcements', [
  adminActionRateLimit,
  body('title')
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('message')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Message must be between 10 and 1000 characters'),
  body('targetUsers')
    .isIn(['all', 'doctors', 'patients'])
    .withMessage('Target users must be all, doctors, or patients')
    .custom((value, { req }) => {
      // Allow array of user IDs as well
      if (Array.isArray(value)) {
        return value.every(id => typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/));
      }
      return true;
    }),
  body('priority')
    .optional()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('Priority must be low, normal, high, or urgent'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiry date must be valid ISO date'),
  handleValidation
], adminController.sendAnnouncement);

/**
 * @route   GET /api/admin/doctors/pending-verification
 * @desc    Get doctors pending verification
 * @access  Private (Admin only)
 */
router.get('/doctors/pending-verification', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  handleValidation
], async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const User = require('../models/User');
    const doctors = await User.find({
      role: 'doctor',
      'doctorProfile.verificationStatus': 'pending'
    })
    .select('name email doctorProfile createdAt')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await User.countDocuments({
      role: 'doctor',
      'doctorProfile.verificationStatus': 'pending'
    });

    res.json({
      success: true,
      data: doctors,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve pending verifications'
    });
  }
});

/**
 * @route   POST /api/admin/doctors/:doctorId/verify
 * @desc    Verify or reject doctor
 * @access  Private (Admin only)
 */
router.post('/doctors/:doctorId/verify', [
  adminActionRateLimit,
  param('doctorId')
    .isMongoId()
    .withMessage('Valid doctor ID is required'),
  body('action')
    .isIn(['approve', 'reject', 'request_info'])
    .withMessage('Action must be approve, reject, or request_info'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes must not exceed 1000 characters'),
  body('requiredDocuments')
    .optional()
    .isArray()
    .withMessage('Required documents must be an array'),
  handleValidation
], async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { action, notes, requiredDocuments } = req.body;
    const adminId = req.user.id;

    const User = require('../models/User');
    const doctor = await User.findOne({
      _id: doctorId,
      role: 'doctor'
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    let updateFields = {};
    let notificationMessage = '';

    switch (action) {
      case 'approve':
        updateFields = {
          'doctorProfile.verificationStatus': 'verified',
          'doctorProfile.verifiedAt': new Date(),
          'doctorProfile.verifiedBy': adminId
        };
        notificationMessage = 'Your doctor profile has been verified. You can now accept consultations.';
        break;

      case 'reject':
        updateFields = {
          'doctorProfile.verificationStatus': 'rejected',
          'doctorProfile.rejectedAt': new Date(),
          'doctorProfile.rejectedBy': adminId,
          'doctorProfile.rejectionReason': notes
        };
        notificationMessage = `Your doctor verification has been rejected. ${notes}`;
        break;

      case 'request_info':
        updateFields = {
          'doctorProfile.verificationStatus': 'pending',
          'doctorProfile.additionalInfoRequested': true,
          'doctorProfile.requestedDocuments': requiredDocuments,
          'doctorProfile.infoRequestedAt': new Date(),
          'doctorProfile.infoRequestedBy': adminId
        };
        notificationMessage = `Additional information required for verification. ${notes}`;
        break;
    }

    await User.findByIdAndUpdate(doctorId, updateFields);

    // Send notification to doctor
    const { sendNotificationToUser } = require('../sockets/notifications');
    await sendNotificationToUser(doctorId, {
      type: `verification_${action}`,
      title: `Verification ${action.charAt(0).toUpperCase() + action.slice(1)}`,
      message: notificationMessage,
      data: { notes, requiredDocuments }
    });

    res.json({
      success: true,
      message: `Doctor verification ${action} completed`,
      data: { doctorId, action, status: updateFields['doctorProfile.verificationStatus'] }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process doctor verification'
    });
  }
});

/**
 * @route   GET /api/admin/payments/disputes
 * @desc    Get payment disputes
 * @access  Private (Admin only)
 */
router.get('/payments/disputes', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('status')
    .optional()
    .isIn(['open', 'investigating', 'resolved', 'closed'])
    .withMessage('Status must be open, investigating, resolved, or closed'),
  handleValidation
], async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const Payment = require('../models/Payment');
    const query = { status: 'disputed' };
    if (status) query.disputeStatus = status;

    const disputes = await Payment.find(query)
      .populate('patient', 'name email')
      .populate('doctor', 'name email')
      .populate('consultation', 'type scheduledDateTime')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      data: disputes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve payment disputes'
    });
  }
});

/**
 * @route   POST /api/admin/payments/:paymentId/resolve-dispute
 * @desc    Resolve payment dispute
 * @access  Private (Admin only)
 */
router.post('/payments/:paymentId/resolve-dispute', [
  adminActionRateLimit,
  param('paymentId')
    .isMongoId()
    .withMessage('Valid payment ID is required'),
  body('resolution')
    .isIn(['refund_patient', 'pay_doctor', 'partial_refund', 'no_action'])
    .withMessage('Resolution must be refund_patient, pay_doctor, partial_refund, or no_action'),
  body('notes')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Resolution notes must be between 10 and 1000 characters'),
  body('refundAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Refund amount must be positive'),
  handleValidation
], async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { resolution, notes, refundAmount } = req.body;
    const adminId = req.user.id;

    const Payment = require('../models/Payment');
    const payment = await Payment.findOne({
      _id: paymentId,
      status: 'disputed'
    }).populate('patient doctor');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Disputed payment not found'
      });
    }

    // Update payment with resolution
    payment.disputeStatus = 'resolved';
    payment.disputeResolution = {
      resolution,
      notes,
      refundAmount,
      resolvedBy: adminId,
      resolvedAt: new Date()
    };

    // Apply resolution
    switch (resolution) {
      case 'refund_patient':
        payment.status = 'refunded';
        payment.refundedAt = new Date();
        break;
      case 'partial_refund':
        payment.status = 'partially_refunded';
        payment.refundedAmount = refundAmount;
        payment.refundedAt = new Date();
        break;
      case 'no_action':
        payment.status = 'completed';
        break;
    }

    await payment.save();

    // Notify involved parties
    const { sendNotificationToUser } = require('../sockets/notifications');
    await sendNotificationToUser(payment.patient._id, {
      type: 'dispute_resolved',
      title: 'Payment Dispute Resolved',
      message: `Your payment dispute has been resolved. Resolution: ${resolution}`,
      data: { paymentId, resolution, notes }
    });

    await sendNotificationToUser(payment.doctor._id, {
      type: 'dispute_resolved',
      title: 'Payment Dispute Resolved',
      message: `A payment dispute has been resolved. Resolution: ${resolution}`,
      data: { paymentId, resolution, notes }
    });

    res.json({
      success: true,
      message: 'Payment dispute resolved successfully',
      data: { paymentId, resolution, status: payment.status }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to resolve payment dispute'
    });
  }
});

/**
 * @route   GET /api/admin/stats/quick
 * @desc    Get quick statistics for admin overview
 * @access  Private (Admin only)
 */
router.get('/stats/quick', async (req, res) => {
  try {
    const User = require('../models/User');
    const Consultation = require('../models/Consultation');
    const Payment = require('../models/Payment');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Quick stats
    const [
      totalUsers,
      totalDoctors,
      totalPatients,
      pendingVerifications,
      todayConsultations,
      todayRevenue,
      activeConsultations
    ] = await Promise.all([
      User.countDocuments({ accountStatus: 'active' }),
      User.countDocuments({ role: 'doctor', accountStatus: 'active' }),
      User.countDocuments({ role: 'patient', accountStatus: 'active' }),
      User.countDocuments({ role: 'doctor', 'doctorProfile.verificationStatus': 'pending' }),
      Consultation.countDocuments({ createdAt: { $gte: today } }),
      Payment.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$amount.usd' } } }
      ]),
      Consultation.countDocuments({ status: 'in_progress' })
    ]);

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          doctors: totalDoctors,
          patients: totalPatients
        },
        consultations: {
          today: todayConsultations,
          active: activeConsultations
        },
        revenue: {
          today: todayRevenue[0]?.total || 0
        },
        pending: {
          doctorVerifications: pendingVerifications
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve quick stats'
    });
  }
});

module.exports = router;
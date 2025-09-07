const express = require('express');
const { body, query, param } = require('express-validator');
const doctorController = require('../controllers/doctorController');
const { 
  authenticateWallet, 
  authorize, 
  requireDoctorVerification 
} = require('../middleware/auth');
const { 
  validateDoctorProfile,
  validateAvailability,
  validateConsultationResponse,
  validateId,
  handleValidation 
} = require('../middleware/validation');
const { doctorActionRateLimit } = require('../middleware/rateLimit');
const { uploadProfileDocument } = require('../middleware/upload');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateWallet);

/**
 * @route   POST /api/doctors/profile/complete
 * @desc    Complete doctor profile registration
 * @access  Private (Doctor only)
 */
router.post('/profile/complete', [
  authorize('doctor'),
  doctorActionRateLimit,
  body('specialization')
    .isIn([
      'general_medicine', 'cardiology', 'dermatology', 'neurology', 
      'orthopedics', 'pediatrics', 'psychiatry', 'gynecology',
      'gastroenterology', 'endocrinology', 'oncology', 'radiology'
    ])
    .withMessage('Invalid medical specialization'),
  body('licenseNumber')
    .isLength({ min: 5, max: 50 })
    .withMessage('License number must be between 5 and 50 characters'),
  body('experience')
    .isInt({ min: 0, max: 60 })
    .withMessage('Experience must be between 0 and 60 years'),
  body('education')
    .isArray({ min: 1 })
    .withMessage('At least one education entry is required'),
  body('education.*.institution')
    .isLength({ min: 2, max: 100 })
    .withMessage('Institution name must be between 2 and 100 characters'),
  body('education.*.degree')
    .isLength({ min: 2, max: 100 })
    .withMessage('Degree must be between 2 and 100 characters'),
  body('education.*.year')
    .isInt({ min: 1950, max: new Date().getFullYear() })
    .withMessage('Graduation year must be valid'),
  body('languages')
    .isArray({ min: 1 })
    .withMessage('At least one language is required'),
  body('consultationTypes')
    .isArray({ min: 1 })
    .withMessage('At least one consultation type is required'),
  body('consultationTypes.*')
    .isIn(['video', 'audio', 'chat'])
    .withMessage('Consultation type must be video, audio, or chat'),
  body('hourlyRate')
    .isFloat({ min: 10, max: 1000 })
    .withMessage('Hourly rate must be between $10 and $1000'),
  body('bio')
    .isLength({ min: 50, max: 1000 })
    .withMessage('Bio must be between 50 and 1000 characters'),
  body('certifications')
    .optional()
    .isArray()
    .withMessage('Certifications must be an array'),
  handleValidation,
  uploadProfileDocument
], doctorController.completeProfile);

/**
 * @route   PUT /api/doctors/profile
 * @desc    Update doctor profile
 * @access  Private (Doctor only)
 */
router.put('/profile', [
  authorize('doctor'),
  requireDoctorVerification,
  body('bio')
    .optional()
    .isLength({ min: 50, max: 1000 })
    .withMessage('Bio must be between 50 and 1000 characters'),
  body('hourlyRate')
    .optional()
    .isFloat({ min: 10, max: 1000 })
    .withMessage('Hourly rate must be between $10 and $1000'),
  body('consultationTypes')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one consultation type is required'),
  body('consultationTypes.*')
    .isIn(['video', 'audio', 'chat'])
    .withMessage('Consultation type must be video, audio, or chat'),
  body('languages')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one language is required'),
  body('availability.schedule')
    .optional()
    .isObject()
    .withMessage('Schedule must be an object'),
  body('availability.timeZone')
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage('Time zone must be valid'),
  handleValidation
], doctorController.updateProfile);

/**
 * @route   POST /api/doctors/availability
 * @desc    Set doctor availability status and schedule
 * @access  Private (Doctor only - Verified)
 */
router.post('/availability', [
  authorize('doctor'),
  requireDoctorVerification,
  body('status')
    .isIn(['available', 'busy', 'offline', 'in_consultation'])
    .withMessage('Status must be available, busy, offline, or in_consultation'),
  body('schedule')
    .optional()
    .isObject()
    .withMessage('Schedule must be an object'),
  body('schedule.*.start')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
  body('schedule.*.end')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format'),
  body('timeZone')
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage('Time zone must be valid'),
  handleValidation
], doctorController.setAvailability);

/**
 * @route   GET /api/doctors/dashboard
 * @desc    Get doctor dashboard data
 * @access  Private (Doctor only - Verified)
 */
router.get('/dashboard', [
  authorize('doctor'),
  requireDoctorVerification
], doctorController.getDashboard);

/**
 * @route   GET /api/doctors/consultations
 * @desc    Get doctor consultations
 * @access  Private (Doctor only - Verified)
 */
router.get('/consultations', [
  authorize('doctor'),
  requireDoctorVerification,
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
    .isIn(['pending_doctor_approval', 'confirmed', 'in_progress', 'completed', 'cancelled'])
    .withMessage('Invalid consultation status'),
  query('type')
    .optional()
    .isIn(['video', 'audio', 'chat'])
    .withMessage('Invalid consultation type'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid ISO date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid ISO date'),
  query('search')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Search term must be between 2 and 100 characters'),
  handleValidation
], doctorController.getConsultations);

/**
 * @route   POST /api/doctors/consultations/:consultationId/respond
 * @desc    Respond to consultation request (approve/reject)
 * @access  Private (Doctor only - Verified)
 */
router.post('/consultations/:consultationId/respond', [
  authorize('doctor'),
  requireDoctorVerification,
  param('consultationId')
    .isMongoId()
    .withMessage('Valid consultation ID is required'),
  body('action')
    .isIn(['approve', 'reject'])
    .withMessage('Action must be approve or reject'),
  body('message')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Message must not exceed 500 characters'),
  body('scheduledDateTime')
    .optional()
    .isISO8601()
    .withMessage('Scheduled date time must be valid ISO date'),
  handleValidation
], doctorController.respondToConsultation);

/**
 * @route   POST /api/doctors/consultations/:consultationId/start
 * @desc    Start consultation session
 * @access  Private (Doctor only - Verified)
 */
router.post('/consultations/:consultationId/start', [
  authorize('doctor'),
  requireDoctorVerification,
  param('consultationId')
    .isMongoId()
    .withMessage('Valid consultation ID is required'),
  handleValidation
], doctorController.startConsultation);

/**
 * @route   POST /api/doctors/consultations/:consultationId/end
 * @desc    End consultation and create medical record
 * @access  Private (Doctor only - Verified)
 */
router.post('/consultations/:consultationId/end', [
  authorize('doctor'),
  requireDoctorVerification,
  param('consultationId')
    .isMongoId()
    .withMessage('Valid consultation ID is required'),
  body('diagnosis')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Diagnosis must be between 10 and 1000 characters'),
  body('prescription')
    .optional()
    .isArray()
    .withMessage('Prescription must be an array'),
  body('prescription.*.medication')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Medication name must be between 2 and 100 characters'),
  body('prescription.*.dosage')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Dosage must be between 2 and 50 characters'),
  body('prescription.*.frequency')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Frequency must be between 2 and 50 characters'),
  body('prescription.*.duration')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Duration must be between 2 and 50 characters'),
  body('notes')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Notes must not exceed 2000 characters'),
  body('followUpRequired')
    .optional()
    .isBoolean()
    .withMessage('Follow up required must be boolean'),
  body('followUpDate')
    .optional()
    .isISO8601()
    .withMessage('Follow up date must be valid ISO date'),
  handleValidation
], doctorController.endConsultation);

/**
 * @route   GET /api/doctors/earnings
 * @desc    Get doctor earnings
 * @access  Private (Doctor only - Verified)
 */
router.get('/earnings', [
  authorize('doctor'),
  requireDoctorVerification,
  query('period')
    .optional()
    .isIn(['week', 'month', 'quarter', 'year'])
    .withMessage('Period must be week, month, quarter, or year'),
  query('year')
    .optional()
    .isInt({ min: 2020, max: new Date().getFullYear() + 1 })
    .withMessage('Year must be valid'),
  query('month')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('Month must be between 1 and 12'),
  handleValidation
], doctorController.getEarnings);

/**
 * @route   GET /api/doctors/performance
 * @desc    Get doctor performance metrics
 * @access  Private (Doctor only - Verified)
 */
router.get('/performance', [
  authorize('doctor'),
  requireDoctorVerification,
  query('period')
    .optional()
    .isIn(['week', 'month', 'quarter', 'year'])
    .withMessage('Period must be week, month, quarter, or year'),
  handleValidation
], doctorController.getPerformanceMetrics);

/**
 * @route   GET /api/doctors/patients/:patientId/history
 * @desc    Get patient medical history (for consultation)
 * @access  Private (Doctor only - Verified)
 */
router.get('/patients/:patientId/history', [
  authorize('doctor'),
  requireDoctorVerification,
  param('patientId')
    .isMongoId()
    .withMessage('Valid patient ID is required'),
  handleValidation
], doctorController.getPatientHistory);

/**
 * @route   GET /api/doctors/search
 * @desc    Search for doctors (Public endpoint for patients)
 * @access  Public
 */
router.get('/search', [
  query('specialization')
    .optional()
    .isIn([
      'general_medicine', 'cardiology', 'dermatology', 'neurology', 
      'orthopedics', 'pediatrics', 'psychiatry', 'gynecology',
      'gastroenterology', 'endocrinology', 'oncology', 'radiology'
    ])
    .withMessage('Invalid specialization'),
  query('available')
    .optional()
    .isBoolean()
    .withMessage('Available must be boolean'),
  query('language')
    .optional()
    .isLength({ min: 2, max: 20 })
    .withMessage('Language must be between 2 and 20 characters'),
  query('maxRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Max rate must be positive number'),
  query('minRating')
    .optional()
    .isFloat({ min: 0, max: 5 })
    .withMessage('Min rating must be between 0 and 5'),
  query('consultationType')
    .optional()
    .isIn(['video', 'audio', 'chat'])
    .withMessage('Invalid consultation type'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1 and 20'),
  handleValidation
], async (req, res) => {
  try {
    const {
      specialization,
      available,
      language,
      maxRate,
      minRating,
      consultationType,
      page = 1,
      limit = 10
    } = req.query;

    // Build search query
    const query = {
      role: 'doctor',
      profileComplete: true,
      'doctorProfile.verificationStatus': 'verified',
      accountStatus: 'active'
    };

    if (specialization) {
      query['doctorProfile.specialization'] = specialization;
    }

    if (available === 'true') {
      query['doctorProfile.availability.status'] = 'available';
    }

    if (language) {
      query['doctorProfile.languages'] = { $in: [language] };
    }

    if (maxRate) {
      query['doctorProfile.hourlyRate'] = { $lte: parseFloat(maxRate) };
    }

    if (minRating) {
      query['doctorProfile.stats.averageRating'] = { $gte: parseFloat(minRating) };
    }

    if (consultationType) {
      query['doctorProfile.consultationTypes'] = { $in: [consultationType] };
    }

    const User = require('../models/User');
    const doctors = await User.find(query)
      .select('name profileImage doctorProfile.specialization doctorProfile.experience doctorProfile.hourlyRate doctorProfile.stats doctorProfile.availability doctorProfile.languages doctorProfile.consultationTypes doctorProfile.bio')
      .sort({ 'doctorProfile.stats.averageRating': -1, 'doctorProfile.stats.totalConsultations': -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await User.countDocuments(query);

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
      message: 'Failed to search doctors'
    });
  }
});

/**
 * @route   GET /api/doctors/:doctorId/profile
 * @desc    Get doctor public profile
 * @access  Public
 */
router.get('/:doctorId/profile', [
  param('doctorId')
    .isMongoId()
    .withMessage('Valid doctor ID is required'),
  handleValidation
], async (req, res) => {
  try {
    const { doctorId } = req.params;

    const User = require('../models/User');
    const doctor = await User.findOne({
      _id: doctorId,
      role: 'doctor',
      'doctorProfile.verificationStatus': 'verified',
      accountStatus: 'active'
    }).select('name profileImage doctorProfile createdAt');

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Get recent reviews (if you have a reviews system)
    const reviews = []; // Placeholder for reviews

    res.json({
      success: true,
      data: {
        doctor: {
          id: doctor._id,
          name: doctor.name,
          profileImage: doctor.profileImage,
          specialization: doctor.doctorProfile.specialization,
          experience: doctor.doctorProfile.experience,
          education: doctor.doctorProfile.education,
          bio: doctor.doctorProfile.bio,
          languages: doctor.doctorProfile.languages,
          consultationTypes: doctor.doctorProfile.consultationTypes,
          hourlyRate: doctor.doctorProfile.hourlyRate,
          availability: doctor.doctorProfile.availability,
          stats: doctor.doctorProfile.stats,
          memberSince: doctor.createdAt
        },
        reviews
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve doctor profile'
    });
  }
});

/**
 * @route   GET /api/doctors/specializations/list
 * @desc    Get list of available medical specializations
 * @access  Public
 */
router.get('/specializations/list', (req, res) => {
  const specializations = [
    { value: 'general_medicine', label: 'General Medicine', description: 'Primary care and general health issues' },
    { value: 'cardiology', label: 'Cardiology', description: 'Heart and cardiovascular system' },
    { value: 'dermatology', label: 'Dermatology', description: 'Skin, hair, and nail conditions' },
    { value: 'neurology', label: 'Neurology', description: 'Brain and nervous system disorders' },
    { value: 'orthopedics', label: 'Orthopedics', description: 'Bones, joints, and musculoskeletal system' },
    { value: 'pediatrics', label: 'Pediatrics', description: 'Medical care for infants, children, and adolescents' },
    { value: 'psychiatry', label: 'Psychiatry', description: 'Mental health and psychiatric disorders' },
    { value: 'gynecology', label: 'Gynecology', description: 'Women\'s reproductive health' },
    { value: 'gastroenterology', label: 'Gastroenterology', description: 'Digestive system disorders' },
    { value: 'endocrinology', label: 'Endocrinology', description: 'Hormonal and metabolic disorders' },
    { value: 'oncology', label: 'Oncology', description: 'Cancer diagnosis and treatment' },
    { value: 'radiology', label: 'Radiology', description: 'Medical imaging and diagnostics' }
  ];

  res.json({
    success: true,
    data: specializations
  });
});

module.exports = router;
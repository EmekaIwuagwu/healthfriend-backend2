const express = require('express');
const { body, query, param } = require('express-validator');
const aiController = require('../controllers/aiController');
const { 
  authenticateWallet, 
  authorize 
} = require('../middleware/auth');
const { 
  validateAIConsultation,
  validateAIMessage,
  validateId,
  handleValidation 
} = require('../middleware/validation');
const { aiConsultationRateLimit, aiChatRateLimit } = require('../middleware/rateLimit');
const { uploadConsultationAttachment } = require('../middleware/upload');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateWallet);

/**
 * @route   POST /api/ai/consultation/start
 * @desc    Start new AI consultation
 * @access  Private (Patient only)
 */
router.post('/consultation/start', [
  authorize('patient'),
  aiConsultationRateLimit,
  body('symptoms')
    .isArray({ min: 1 })
    .withMessage('At least one symptom is required'),
  body('symptoms.*')
    .isLength({ min: 2, max: 100 })
    .withMessage('Each symptom must be between 2 and 100 characters'),
  body('medicalHistory')
    .optional()
    .isArray()
    .withMessage('Medical history must be an array'),
  body('currentMedications')
    .optional()
    .isArray()
    .withMessage('Current medications must be an array'),
  body('urgency')
    .optional()
    .isIn(['low', 'normal', 'high', 'critical'])
    .withMessage('Urgency must be low, normal, high, or critical'),
  body('vitalSigns')
    .optional()
    .isObject()
    .withMessage('Vital signs must be an object'),
  body('vitalSigns.bloodPressure.systolic')
    .optional()
    .isInt({ min: 60, max: 250 })
    .withMessage('Systolic BP must be between 60 and 250'),
  body('vitalSigns.bloodPressure.diastolic')
    .optional()
    .isInt({ min: 40, max: 150 })
    .withMessage('Diastolic BP must be between 40 and 150'),
  body('vitalSigns.heartRate')
    .optional()
    .isInt({ min: 30, max: 200 })
    .withMessage('Heart rate must be between 30 and 200'),
  body('vitalSigns.temperature')
    .optional()
    .isFloat({ min: 30, max: 45 })
    .withMessage('Temperature must be between 30 and 45 Celsius'),
  body('vitalSigns.oxygenSaturation')
    .optional()
    .isInt({ min: 70, max: 100 })
    .withMessage('Oxygen saturation must be between 70 and 100'),
  handleValidation
], aiController.startConsultation);

/**
 * @route   POST /api/ai/consultation/:consultationId/continue
 * @desc    Continue AI conversation
 * @access  Private (Patient only - Owner)
 */
router.post('/consultation/:consultationId/continue', [
  authorize('patient'),
  aiChatRateLimit,
  param('consultationId')
    .isMongoId()
    .withMessage('Valid consultation ID is required'),
  body('message')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Message must be between 1 and 1000 characters'),
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Attachments must be an array'),
  handleValidation,
  uploadConsultationAttachment
], aiController.continueConversation);

/**
 * @route   POST /api/ai/consultation/:consultationId/end
 * @desc    End AI consultation
 * @access  Private (Patient only - Owner)
 */
router.post('/consultation/:consultationId/end', [
  authorize('patient'),
  param('consultationId')
    .isMongoId()
    .withMessage('Valid consultation ID is required'),
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('feedback')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Feedback must not exceed 500 characters'),
  handleValidation
], aiController.endConsultation);

/**
 * @route   GET /api/ai/consultations
 * @desc    Get AI consultation history
 * @access  Private (Patient only)
 */
router.get('/consultations', [
  authorize('patient'),
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
    .isIn(['in_progress', 'completed', 'timed_out', 'emergency_detected'])
    .withMessage('Invalid status'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid ISO date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid ISO date'),
  handleValidation
], aiController.getConsultationHistory);

/**
 * @route   GET /api/ai/consultation/:consultationId
 * @desc    Get AI consultation details
 * @access  Private (Patient only - Owner)
 */
router.get('/consultation/:consultationId', [
  authorize('patient'),
  param('consultationId')
    .isMongoId()
    .withMessage('Valid consultation ID is required'),
  handleValidation
], aiController.getConsultationDetails);

/**
 * @route   GET /api/ai/insights/health
 * @desc    Get AI-generated health insights
 * @access  Private (Patient only)
 */
router.get('/insights/health', [
  authorize('patient'),
  query('period')
    .optional()
    .isIn(['week', 'month', 'quarter', 'year'])
    .withMessage('Period must be week, month, quarter, or year'),
  handleValidation
], aiController.getHealthInsights);

/**
 * @route   POST /api/ai/symptoms/analyze
 * @desc    Quick symptom analysis (without creating consultation)
 * @access  Private (Patient only)
 */
router.post('/symptoms/analyze', [
  authorize('patient'),
  aiChatRateLimit,
  body('symptoms')
    .isArray({ min: 1, max: 10 })
    .withMessage('Provide 1-10 symptoms for analysis'),
  body('symptoms.*')
    .isLength({ min: 2, max: 100 })
    .withMessage('Each symptom must be between 2 and 100 characters'),
  body('age')
    .optional()
    .isInt({ min: 1, max: 120 })
    .withMessage('Age must be between 1 and 120'),
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female, or other'),
  handleValidation
], async (req, res) => {
  try {
    const { symptoms, age, gender } = req.body;
    
    // Quick analysis without saving to database
    const analysis = await require('../utils/ai').aiUtils.analyzeSymptoms({
      symptoms,
      age: age || req.user.age,
      gender: gender || req.user.gender,
      quickAnalysis: true
    });

    res.json({
      success: true,
      data: {
        assessment: analysis.assessment,
        riskLevel: analysis.riskLevel,
        recommendations: analysis.recommendations,
        suggestedSpecialization: analysis.suggestedSpecialization,
        requiresUrgentCare: analysis.riskLevel === 'high' || analysis.riskLevel === 'critical',
        disclaimer: 'This is a preliminary analysis. Please consult a healthcare professional for proper diagnosis.'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to analyze symptoms'
    });
  }
});

/**
 * @route   POST /api/ai/emergency/check
 * @desc    Emergency symptoms checker
 * @access  Private (Patient only)
 */
router.post('/emergency/check', [
  authorize('patient'),
  body('symptoms')
    .isArray({ min: 1 })
    .withMessage('At least one symptom is required'),
  body('symptoms.*')
    .isLength({ min: 2, max: 100 })
    .withMessage('Each symptom must be between 2 and 100 characters'),
  handleValidation
], async (req, res) => {
  try {
    const { symptoms } = req.body;
    
    const emergencyCheck = await require('../utils/ai').aiUtils.detectEmergency(symptoms);

    res.json({
      success: true,
      data: {
        isEmergency: emergencyCheck.isEmergency,
        severity: emergencyCheck.severity,
        recommendations: emergencyCheck.recommendations,
        emergencyContacts: emergencyCheck.isEmergency ? [
          { name: 'Emergency Services', number: '911' },
          { name: 'Poison Control', number: '1-800-222-1222' },
          { name: 'Crisis Text Line', number: 'Text HOME to 741741' }
        ] : null,
        disclaimer: 'If you believe this is a medical emergency, call 911 immediately.'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check emergency status'
    });
  }
});

/**
 * @route   GET /api/ai/specializations/suggest
 * @desc    Get suggested medical specializations based on symptoms
 * @access  Private (Patient only)
 */
router.get('/specializations/suggest', [
  authorize('patient'),
  query('symptoms')
    .isArray({ min: 1 })
    .withMessage('At least one symptom is required'),
  handleValidation
], async (req, res) => {
  try {
    const { symptoms } = req.query;
    
    const suggestionMap = {
      'heart, chest, cardiac, palpitations': 'cardiology',
      'skin, rash, acne, mole, eczema': 'dermatology',
      'headache, migraine, neurological': 'neurology',
      'bone, joint, fracture, back pain': 'orthopedics',
      'stomach, digestive, nausea': 'gastroenterology',
      'anxiety, depression, mental': 'psychiatry',
      'pregnancy, gynecological': 'gynecology',
      'child, pediatric, baby': 'pediatrics'
    };

    const symptomText = symptoms.join(' ').toLowerCase();
    let suggestedSpecialization = 'general_medicine';

    for (const [keywords, specialization] of Object.entries(suggestionMap)) {
      if (keywords.split(', ').some(keyword => symptomText.includes(keyword))) {
        suggestedSpecialization = specialization;
        break;
      }
    }

    res.json({
      success: true,
      data: {
        suggested: suggestedSpecialization,
        alternatives: ['general_medicine'],
        confidence: 0.8
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to suggest specializations'
    });
  }
});

/**
 * @route   GET /api/ai/analytics
 * @desc    Get AI usage analytics (Admin only)
 * @access  Private (Admin only)
 */
router.get('/analytics', [
  authorize('admin'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid ISO date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid ISO date'),
  handleValidation
], aiController.getAIAnalytics);

/**
 * @route   GET /api/ai/health
 * @desc    Check AI service health
 * @access  Private (Admin only)
 */
router.get('/health', [
  authorize('admin')
], async (req, res) => {
  try {
    const health = await require('../utils/ai').aiUtils.checkHealth();
    
    res.json({
      success: true,
      data: health
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check AI service health'
    });
  }
});

/**
 * @route   POST /api/ai/feedback
 * @desc    Submit feedback on AI responses
 * @access  Private (Patient only)
 */
router.post('/feedback', [
  authorize('patient'),
  body('consultationId')
    .isMongoId()
    .withMessage('Valid consultation ID is required'),
  body('messageIndex')
    .isInt({ min: 0 })
    .withMessage('Valid message index is required'),
  body('feedback')
    .isIn(['helpful', 'not_helpful', 'inaccurate', 'inappropriate'])
    .withMessage('Invalid feedback type'),
  body('comments')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Comments must not exceed 500 characters'),
  handleValidation
], async (req, res) => {
  try {
    const { consultationId, messageIndex, feedback, comments } = req.body;
    
    // In a real app, you'd save this feedback for AI improvement
    // await AIFeedback.create({ ... });

    res.json({
      success: true,
      message: 'Feedback submitted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback'
    });
  }
});

module.exports = router;
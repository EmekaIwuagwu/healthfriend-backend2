const express = require('express');
const { body, query, param } = require('express-validator');
const mongoose = require('mongoose');
const Consultation = require('../models/Consultation');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { 
  authenticateWallet, 
  authorize, 
  requireDoctorVerification,
  requireOwnership
} = require('../middleware/auth');
const { 
  validateConsultationBooking, 
  validateId,
  validateRating,
  validateAIChat,
  validateVitalSigns,
  validatePrescription,
  handleValidation
} = require('../middleware/validation');
const { uploadConsultationAttachment } = require('../middleware/upload');
const { consultationBookingRateLimit } = require('../middleware/rateLimit');
const { aiUtils } = require('../utils/ai');
const { sendEmail } = require('../utils/email');
const { sendNotificationToUser } = require('../sockets/notifications');
const { logError, logSecurity } = require('../utils/logger');
const { 
  success, 
  error: errorResponse, 
  paginated 
} = require('../utils/helpers').responseUtils;
const { formatDateTime, generateUUID } = require('../utils/helpers');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateWallet);

/**
 * @route   POST /api/consultations/ai/start
 * @desc    Start AI consultation
 * @access  Private (Patient only)
 */
router.post('/ai/start', [
  authorize('patient'),
  body('symptoms').isArray({ min: 1 }).withMessage('At least one symptom is required'),
  body('symptoms.*').trim().isLength({ min: 2, max: 200 }),
  body('chiefComplaint').trim().isLength({ min: 10, max: 500 }),
  body('urgencyLevel').optional().isIn(['low', 'medium', 'high', 'emergency']),
  handleValidation
], async (req, res, next) => {
  try {
    const { symptoms, chiefComplaint, urgencyLevel = 'medium' } = req.body;
    
    // Get patient information for context
    const patient = await User.findById(req.user.id);
    if (!patient) {
      return res.status(404).json(errorResponse('Patient not found', 'PATIENT_NOT_FOUND'));
    }

    // Create consultation record
    const consultation = new Consultation({
      type: 'ai_chat',
      patient: req.user.id,
      symptoms,
      chiefComplaint,
      urgencyLevel,
      status: 'ongoing',
      startedAt: new Date(),
      payment: {
        amount: 0, // AI consultations are free
        currency: 'USD',
        paymentStatus: 'completed'
      }
    });

    await consultation.save();

    // Prepare patient context for AI
    const patientContext = {
      age: patient.age,
      gender: patient.gender,
      medicalHistory: patient.medicalInfo?.medicalHistory?.map(h => h.condition) || [],
      currentMedications: patient.medicalInfo?.currentMedications?.filter(m => m.isActive)?.map(m => m.medication) || [],
      allergies: patient.medicalInfo?.allergies?.map(a => a.allergen) || []
    };

    // Get AI analysis
    const aiAnalysis = await aiUtils.analyzeSymptoms(symptoms, patientContext, consultation._id.toString());

    // Update consultation with AI response
    consultation.aiDiagnosis = {
      conditions: aiAnalysis.possibleConditions || [],
      recommendations: aiAnalysis.recommendedActions || [],
      riskLevel: aiAnalysis.urgencyLevel || 'low',
      requiresDoctorConsultation: aiAnalysis.suggestDoctorConsultation || false,
      confidence: aiAnalysis.confidence || 0.5
    };

    // Add initial AI conversation
    consultation.aiConversation.push({
      role: 'user',
      message: `Symptoms: ${symptoms.join(', ')}. Chief complaint: ${chiefComplaint}`,
      timestamp: new Date()
    });

    consultation.aiConversation.push({
      role: 'assistant',
      message: aiAnalysis.message,
      timestamp: new Date(),
      confidence: aiAnalysis.confidence
    });

    await consultation.save();

    res.json(success({
      consultationId: consultation._id,
      consultation: {
        id: consultation._id,
        consultationId: consultation.consultationId,
        type: consultation.type,
        status: consultation.status,
        symptoms: consultation.symptoms,
        chiefComplaint: consultation.chiefComplaint,
        startedAt: consultation.startedAt
      },
      aiResponse: {
        message: aiAnalysis.message,
        confidence: aiAnalysis.confidence,
        urgencyLevel: aiAnalysis.urgencyLevel,
        suggestDoctorConsultation: aiAnalysis.suggestDoctorConsultation,
        followUpQuestions: aiAnalysis.followUpQuestions || []
      },
      aiDiagnosis: consultation.aiDiagnosis
    }, 'AI consultation started successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Start AI Consultation',
      userId: req.user.id,
      symptoms: req.body.symptoms?.slice(0, 3)
    });
    next(err);
  }
});

/**
 * @route   POST /api/consultations/ai/message
 * @desc    Send message to AI during consultation
 * @access  Private (Patient only)
 */
router.post('/ai/message', [
  authorize('patient'),
  validateAIChat,
  body('consultationId').isMongoId().withMessage('Valid consultation ID required'),
  handleValidation
], async (req, res, next) => {
  try {
    const { consultationId, message } = req.body;
    
    // Find consultation
    const consultation = await Consultation.findOne({
      _id: consultationId,
      patient: req.user.id,
      type: 'ai_chat',
      status: 'ongoing'
    }).populate('patient');

    if (!consultation) {
      return res.status(404).json(errorResponse('AI consultation not found or not active', 'CONSULTATION_NOT_FOUND'));
    }

    // Get patient context
    const patient = consultation.patient;
    const patientContext = {
      age: patient.age,
      gender: patient.gender,
      medicalHistory: patient.medicalInfo?.medicalHistory?.map(h => h.condition) || [],
      currentMedications: patient.medicalInfo?.currentMedications?.filter(m => m.isActive)?.map(m => m.medication) || []
    };

    // Continue AI conversation
    const aiResponse = await aiUtils.continueConversation(message, consultationId, patientContext);

    if (aiResponse.error) {
      return res.status(500).json(errorResponse(aiResponse.error, 'AI_ERROR'));
    }

    // Check if consultation should end
    if (aiResponse.conversationEnded) {
      consultation.status = 'completed';
      consultation.endedAt = new Date();
      consultation.duration = Math.round((consultation.endedAt - consultation.startedAt) / 1000 / 60);
    }

    await consultation.save();

    res.json(success({
      aiResponse: {
        message: aiResponse.message,
        conversationId: aiResponse.conversationId,
        followUpQuestions: aiResponse.followUpQuestions || [],
        suggestDoctorConsultation: aiResponse.suggestDoctorConsultation,
        conversationLength: aiResponse.conversationLength,
        conversationEnded: aiResponse.conversationEnded
      },
      consultation: {
        status: consultation.status,
        endedAt: consultation.endedAt,
        duration: consultation.duration
      }
    }, 'AI response generated successfully'));

  } catch (err) {
    logError(err, { 
      context: 'AI Consultation Message',
      userId: req.user.id,
      consultationId: req.body.consultationId
    });
    next(err);
  }
});

/**
 * @route   POST /api/consultations/ai/end
 * @desc    End AI consultation
 * @access  Private (Patient only)
 */
router.post('/ai/end', [
  authorize('patient'),
  body('consultationId').isMongoId().withMessage('Valid consultation ID required'),
  body('rating').optional().isInt({ min: 1, max: 5 }),
  body('feedback').optional().trim().isLength({ max: 1000 }),
  handleValidation
], async (req, res, next) => {
  try {
    const { consultationId, rating, feedback } = req.body;
    
    const consultation = await Consultation.findOne({
      _id: consultationId,
      patient: req.user.id,
      type: 'ai_chat'
    });

    if (!consultation) {
      return res.status(404).json(errorResponse('AI consultation not found', 'CONSULTATION_NOT_FOUND'));
    }

    // End consultation
    consultation.status = 'completed';
    consultation.endedAt = new Date();
    consultation.duration = Math.round((consultation.endedAt - consultation.startedAt) / 1000 / 60);

    // Add rating if provided
    if (rating) {
      consultation.patientRating = {
        rating,
        feedback,
        ratedAt: new Date()
      };
    }

    await consultation.save();

    // Clear AI conversation history
    aiUtils.clearConversationHistory(consultationId);

    res.json(success({
      consultationId: consultation._id,
      status: consultation.status,
      duration: consultation.duration,
      endedAt: consultation.endedAt,
      summary: {
        symptoms: consultation.symptoms,
        aiDiagnosis: consultation.aiDiagnosis,
        conversationLength: consultation.aiConversation.length,
        rating: consultation.patientRating?.rating
      }
    }, 'AI consultation ended successfully'));

  } catch (err) {
    logError(err, { 
      context: 'End AI Consultation',
      userId: req.user.id,
      consultationId: req.body.consultationId
    });
    next(err);
  }
});

/**
 * @route   POST /api/consultations/video/book
 * @desc    Book video consultation with doctor
 * @access  Private (Patient only)
 */
router.post('/video/book', [
  authorize('patient'),
  consultationBookingRateLimit,
  validateConsultationBooking,
  body('doctorId').isMongoId().withMessage('Valid doctor ID required'),
  handleValidation
], async (req, res, next) => {
  try {
    const { doctorId, symptoms, chiefComplaint, scheduledDate, urgencyLevel = 'medium' } = req.body;
    
    // Validate doctor
    const doctor = await User.findOne({
      _id: doctorId,
      role: 'doctor',
      'doctorProfile.isVerified': true,
      'doctorProfile.isAvailable': true,
      isActive: true
    });

    if (!doctor) {
      return res.status(404).json(errorResponse('Doctor not found or not available', 'DOCTOR_NOT_AVAILABLE'));
    }

    // Check if scheduled time is available (simple check)
    const scheduledDateTime = new Date(scheduledDate);
    const existingConsultation = await Consultation.findOne({
      doctor: doctorId,
      scheduledDate: {
        $gte: new Date(scheduledDateTime.getTime() - 30 * 60 * 1000), // 30 min before
        $lte: new Date(scheduledDateTime.getTime() + 30 * 60 * 1000)  // 30 min after
      },
      status: { $in: ['pending', 'scheduled', 'ongoing'] }
    });

    if (existingConsultation) {
      return res.status(409).json(errorResponse('Doctor is not available at this time', 'TIME_SLOT_TAKEN'));
    }

    // Create consultation
    const consultation = new Consultation({
      type: 'video_call',
      patient: req.user.id,
      doctor: doctorId,
      symptoms,
      chiefComplaint,
      urgencyLevel,
      scheduledDate: scheduledDateTime,
      status: 'pending',
      meetingId: generateUUID(),
      payment: {
        amount: doctor.doctorProfile.consultationFee,
        currency: 'USD',
        paymentStatus: 'pending'
      }
    });

    await consultation.save();

    // Create payment record
    const payment = new Payment({
      payer: req.user.id,
      payee: doctorId,
      consultation: consultation._id,
      serviceType: 'video_consultation',
      amount: doctor.doctorProfile.consultationFee,
      serviceFee: doctor.doctorProfile.consultationFee,
      platformFee: doctor.doctorProfile.consultationFee * 0.05, // 5% platform fee
      doctorEarnings: doctor.doctorProfile.consultationFee * 0.95,
      currency: 'USD',
      status: 'pending'
    });

    await payment.save();

    // Update consultation with payment reference
    consultation.payment.paymentId = payment.paymentId;
    await consultation.save();

    // Send notifications
    try {
      // Notify doctor
      await sendNotificationToUser(doctorId, {
        type: 'consultation_request',
        title: 'New Consultation Request',
        message: `You have a new video consultation request from ${req.user.firstName} ${req.user.lastName}`,
        priority: 'medium',
        relatedConsultation: consultation._id
      });

      // Send emails
      const patient = await User.findById(req.user.id);
      await sendEmail(patient.email, 'consultationBooked', patient, doctor, consultation);
      
    } catch (notificationError) {
      logError(notificationError, { 
        context: 'Consultation Booking Notifications',
        consultationId: consultation._id
      });
    }

    res.status(201).json(success({
      consultation: {
        id: consultation._id,
        consultationId: consultation.consultationId,
        type: consultation.type,
        status: consultation.status,
        scheduledDate: consultation.scheduledDate,
        meetingId: consultation.meetingId,
        symptoms: consultation.symptoms,
        chiefComplaint: consultation.chiefComplaint
      },
      doctor: {
        id: doctor._id,
        name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.doctorProfile.specialization,
        rating: doctor.doctorProfile.rating
      },
      payment: {
        id: payment._id,
        paymentId: payment.paymentId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status
      }
    }, 'Video consultation booked successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Book Video Consultation',
      userId: req.user.id,
      doctorId: req.body.doctorId
    });
    next(err);
  }
});

/**
 * @route   POST /api/consultations/home-visit/book
 * @desc    Book home visit consultation
 * @access  Private (Patient only)
 */
router.post('/home-visit/book', [
  authorize('patient'),
  consultationBookingRateLimit,
  validateConsultationBooking,
  body('doctorId').isMongoId().withMessage('Valid doctor ID required'),
  body('visitAddress.street').trim().isLength({ min: 5, max: 200 }),
  body('visitAddress.city').trim().isLength({ min: 2, max: 100 }),
  body('visitAddress.state').trim().isLength({ min: 2, max: 100 }),
  body('visitAddress.zipCode').trim().isLength({ min: 3, max: 20 }),
  handleValidation
], async (req, res, next) => {
  try {
    const { 
      doctorId, 
      symptoms, 
      chiefComplaint, 
      scheduledDate, 
      visitAddress,
      urgencyLevel = 'medium' 
    } = req.body;
    
    // Validate doctor
    const doctor = await User.findOne({
      _id: doctorId,
      role: 'doctor',
      'doctorProfile.isVerified': true,
      'doctorProfile.isAvailable': true,
      isActive: true
    });

    if (!doctor) {
      return res.status(404).json(errorResponse('Doctor not found or not available', 'DOCTOR_NOT_AVAILABLE'));
    }

    if (!doctor.doctorProfile.homeVisitFee || doctor.doctorProfile.homeVisitFee === 0) {
      return res.status(400).json(errorResponse('Doctor does not offer home visits', 'HOME_VISITS_NOT_AVAILABLE'));
    }

    // Create consultation
    const consultation = new Consultation({
      type: 'home_visit',
      patient: req.user.id,
      doctor: doctorId,
      symptoms,
      chiefComplaint,
      urgencyLevel,
      scheduledDate: new Date(scheduledDate),
      visitAddress,
      status: 'pending',
      payment: {
        amount: doctor.doctorProfile.homeVisitFee,
        currency: 'USD',
        paymentStatus: 'pending'
      }
    });

    await consultation.save();

    // Create payment record
    const payment = new Payment({
      payer: req.user.id,
      payee: doctorId,
      consultation: consultation._id,
      serviceType: 'home_visit',
      amount: doctor.doctorProfile.homeVisitFee,
      serviceFee: doctor.doctorProfile.homeVisitFee,
      platformFee: doctor.doctorProfile.homeVisitFee * 0.05,
      doctorEarnings: doctor.doctorProfile.homeVisitFee * 0.95,
      currency: 'USD',
      status: 'pending'
    });

    await payment.save();

    consultation.payment.paymentId = payment.paymentId;
    await consultation.save();

    // Send notifications
    try {
      await sendNotificationToUser(doctorId, {
        type: 'consultation_request',
        title: 'New Home Visit Request',
        message: `You have a new home visit request from ${req.user.firstName} ${req.user.lastName}`,
        priority: 'medium',
        relatedConsultation: consultation._id
      });
    } catch (notificationError) {
      logError(notificationError, { 
        context: 'Home Visit Booking Notifications',
        consultationId: consultation._id
      });
    }

    res.status(201).json(success({
      consultation: {
        id: consultation._id,
        consultationId: consultation.consultationId,
        type: consultation.type,
        status: consultation.status,
        scheduledDate: consultation.scheduledDate,
        visitAddress: consultation.visitAddress,
        symptoms: consultation.symptoms,
        chiefComplaint: consultation.chiefComplaint
      },
      doctor: {
        id: doctor._id,
        name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.doctorProfile.specialization
      },
      payment: {
        id: payment._id,
        paymentId: payment.paymentId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status
      }
    }, 'Home visit consultation booked successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Book Home Visit',
      userId: req.user.id,
      doctorId: req.body.doctorId
    });
    next(err);
  }
});

/**
 * @route   GET /api/consultations/:id
 * @desc    Get consultation details
 * @access  Private
 */
router.get('/:id', validateId, async (req, res, next) => {
  try {
    const consultationId = req.params.id;
    
    // Build query based on user role
    let query = { _id: consultationId };
    if (req.user.role === 'patient') {
      query.patient = req.user.id;
    } else if (req.user.role === 'doctor') {
      query.doctor = req.user.id;
    }
    // Admin can access any consultation

    const consultation = await Consultation.findOne(query)
      .populate('patient', 'firstName lastName avatar email phone dateOfBirth gender medicalInfo')
      .populate('doctor', 'firstName lastName avatar doctorProfile.specialization doctorProfile.rating')
      .lean();

    if (!consultation) {
      return res.status(404).json(errorResponse('Consultation not found', 'CONSULTATION_NOT_FOUND'));
    }

    // Format response based on user role and consultation type
    let responseData = {
      id: consultation._id,
      consultationId: consultation.consultationId,
      type: consultation.type,
      status: consultation.status,
      symptoms: consultation.symptoms,
      chiefComplaint: consultation.chiefComplaint,
      urgencyLevel: consultation.urgencyLevel,
      createdAt: consultation.createdAt,
      bookedAt: consultation.bookedAt,
      startedAt: consultation.startedAt,
      endedAt: consultation.endedAt,
      duration: consultation.duration,
      payment: {
        amount: consultation.payment.amount,
        currency: consultation.payment.currency,
        status: consultation.payment.paymentStatus
      }
    };

    // Add patient info (for doctors and admins)
    if (req.user.role !== 'patient') {
      responseData.patient = {
        id: consultation.patient._id,
        name: `${consultation.patient.firstName} ${consultation.patient.lastName}`,
        avatar: consultation.patient.avatar,
        email: consultation.patient.email,
        phone: consultation.patient.phone,
        age: consultation.patient.dateOfBirth ? 
          Math.floor((Date.now() - consultation.patient.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null,
        gender: consultation.patient.gender,
        medicalInfo: consultation.patient.medicalInfo
      };
    }

    // Add doctor info (for patients and admins)
    if (consultation.doctor && req.user.role !== 'doctor') {
      responseData.doctor = {
        id: consultation.doctor._id,
        name: `Dr. ${consultation.doctor.firstName} ${consultation.doctor.lastName}`,
        avatar: consultation.doctor.avatar,
        specialization: consultation.doctor.doctorProfile?.specialization,
        rating: consultation.doctor.doctorProfile?.rating
      };
    }

    // Add type-specific data
    if (consultation.type === 'ai_chat') {
      responseData.aiDiagnosis = consultation.aiDiagnosis;
      responseData.aiConversation = consultation.aiConversation;
    } else if (consultation.type === 'video_call') {
      responseData.scheduledDate = consultation.scheduledDate;
      responseData.meetingId = consultation.meetingId;
      responseData.meetingUrl = consultation.meetingUrl;
      responseData.chatMessages = consultation.chatMessages;
    } else if (consultation.type === 'home_visit') {
      responseData.scheduledDate = consultation.scheduledDate;
      responseData.visitAddress = consultation.visitAddress;
      responseData.estimatedArrival = consultation.estimatedArrival;
      responseData.actualArrival = consultation.actualArrival;
    }

    // Add medical assessment (if completed)
    if (consultation.vitals || consultation.diagnosis || consultation.prescription?.length > 0) {
      responseData.medicalAssessment = {
        vitals: consultation.vitals,
        diagnosis: consultation.diagnosis,
        prescription: consultation.prescription,
        followUpRequired: consultation.followUpRequired,
        followUpDate: consultation.followUpDate,
        notes: consultation.notes
      };
    }

    // Add ratings
    if (consultation.patientRating) {
      responseData.patientRating = consultation.patientRating;
    }
    if (consultation.doctorRating) {
      responseData.doctorRating = consultation.doctorRating;
    }

    res.json(success(responseData, 'Consultation details retrieved successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Get Consultation Details',
      userId: req.user.id,
      consultationId: req.params.id
    });
    next(err);
  }
});

/**
 * @route   PUT /api/consultations/:id/accept
 * @desc    Accept consultation request (Doctor only)
 * @access  Private (Doctor only)
 */
router.put('/:id/accept', [
  requireDoctorVerification,
  validateId,
  handleValidation
], async (req, res, next) => {
  try {
    const consultation = await Consultation.findOne({
      _id: req.params.id,
      doctor: req.user.id,
      status: 'pending'
    }).populate('patient');

    if (!consultation) {
      return res.status(404).json(errorResponse('Consultation not found or already processed', 'CONSULTATION_NOT_FOUND'));
    }

    // Accept consultation
    consultation.status = 'scheduled';
    await consultation.save();

    // Send notification to patient
    try {
      await sendNotificationToUser(consultation.patient._id, {
        type: 'consultation_accepted',
        title: 'Consultation Accepted',
        message: `Dr. ${req.user.firstName} ${req.user.lastName} has accepted your consultation request`,
        priority: 'medium',
        relatedConsultation: consultation._id
      });
    } catch (notificationError) {
      logError(notificationError, { 
        context: 'Consultation Accept Notification',
        consultationId: consultation._id
      });
    }

    res.json(success({
      consultationId: consultation._id,
      status: consultation.status,
      scheduledDate: consultation.scheduledDate
    }, 'Consultation accepted successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Accept Consultation',
      userId: req.user.id,
      consultationId: req.params.id
    });
    next(err);
  }
});

/**
 * @route   PUT /api/consultations/:id/decline
 * @desc    Decline consultation request (Doctor only)
 * @access  Private (Doctor only)
 */
router.put('/:id/decline', [
  requireDoctorVerification,
  validateId,
  body('reason').optional().trim().isLength({ max: 500 }),
  handleValidation
], async (req, res, next) => {
  try {
    const { reason } = req.body;
    
    const consultation = await Consultation.findOne({
      _id: req.params.id,
      doctor: req.user.id,
      status: 'pending'
    }).populate('patient');

    if (!consultation) {
      return res.status(404).json(errorResponse('Consultation not found or already processed', 'CONSULTATION_NOT_FOUND'));
    }

    // Decline consultation
    consultation.status = 'cancelled';
    consultation.cancelledAt = new Date();
    consultation.cancellationReason = reason || 'Declined by doctor';
    consultation.cancelledBy = req.user.id;
    await consultation.save();

    // Send notification to patient
    try {
      await sendNotificationToUser(consultation.patient._id, {
        type: 'consultation_cancelled',
        title: 'Consultation Declined',
        message: `Dr. ${req.user.firstName} ${req.user.lastName} has declined your consultation request`,
        priority: 'medium',
        relatedConsultation: consultation._id
      });
    } catch (notificationError) {
      logError(notificationError, { 
        context: 'Consultation Decline Notification',
        consultationId: consultation._id
      });
    }

    res.json(success({
      consultationId: consultation._id,
      status: consultation.status,
      reason: consultation.cancellationReason
    }, 'Consultation declined successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Decline Consultation',
      userId: req.user.id,
      consultationId: req.params.id
    });
    next(err);
  }
});

/**
 * @route   PUT /api/consultations/:id/vitals
 * @desc    Add/update vital signs (Doctor only)
 * @access  Private (Doctor only)
 */
router.put('/:id/vitals', [
  requireDoctorVerification,
  validateId,
  validateVitalSigns,
  handleValidation
], async (req, res, next) => {
  try {
    const consultation = await Consultation.findOne({
      _id: req.params.id,
      doctor: req.user.id,
      status: { $in: ['ongoing', 'completed'] }
    });

    if (!consultation) {
      return res.status(404).json(errorResponse('Consultation not found or not accessible', 'CONSULTATION_NOT_FOUND'));
    }

    // Update vitals
    consultation.vitals = {
      ...consultation.vitals,
      ...req.body,
      recordedAt: new Date()
    };

    await consultation.save();

    res.json(success({
      vitals: consultation.vitals
    }, 'Vital signs updated successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Update Vitals',
      userId: req.user.id,
      consultationId: req.params.id
    });
    next(err);
  }
});

/**
 * @route   POST /api/consultations/:id/prescription
 * @desc    Add prescription (Doctor only)
 * @access  Private (Doctor only)
 */
router.post('/:id/prescription', [
  requireDoctorVerification,
  validateId,
  validatePrescription,
  handleValidation
], async (req, res, next) => {
  try {
    const { medication, dosage, frequency, duration, instructions } = req.body;
    
    const consultation = await Consultation.findOne({
      _id: req.params.id,
      doctor: req.user.id,
      status: { $in: ['ongoing', 'completed'] }
    });

    if (!consultation) {
      return res.status(404).json(errorResponse('Consultation not found or not accessible', 'CONSULTATION_NOT_FOUND'));
    }

    // Add prescription
    await consultation.addPrescription(medication, dosage, frequency, duration, instructions);

    res.json(success({
      prescription: consultation.prescription
    }, 'Prescription added successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Add Prescription',
      userId: req.user.id,
      consultationId: req.params.id
    });
    next(err);
  }
});

/**
 * @route   PUT /api/consultations/:id/rating
 * @desc    Rate consultation
 * @access  Private
 */
router.put('/:id/rating', [
  validateId,
  validateRating,
  handleValidation
], async (req, res, next) => {
  try {
    const { rating, feedback, categories } = req.body;
    
    // Find consultation
    let query = { _id: req.params.id };
    if (req.user.role === 'patient') {
      query.patient = req.user.id;
    } else if (req.user.role === 'doctor') {
      query.doctor = req.user.id;
    }

    const consultation = await Consultation.findOne(query).populate('doctor patient');

    if (!consultation) {
      return res.status(404).json(errorResponse('Consultation not found', 'CONSULTATION_NOT_FOUND'));
    }

    if (consultation.status !== 'completed') {
      return res.status(400).json(errorResponse('Can only rate completed consultations', 'CONSULTATION_NOT_COMPLETED'));
    }

    // Add rating based on user role
    if (req.user.role === 'patient') {
      if (consultation.patientRating) {
        return res.status(400).json(errorResponse('Consultation already rated', 'ALREADY_RATED'));
      }
      
      consultation.patientRating = {
        rating,
        feedback,
        categories,
        ratedAt: new Date()
      };

      // Update doctor's overall rating
      if (consultation.doctor) {
        await consultation.doctor.updateDoctorRating(rating);
      }
    } else if (req.user.role === 'doctor') {
      if (consultation.doctorRating) {
        return res.status(400).json(errorResponse('Consultation already rated', 'ALREADY_RATED'));
      }
      
      consultation.doctorRating = {
        rating,
        feedback,
        categories,
        ratedAt: new Date()
      };
    }

    await consultation.save();

    res.json(success({
      rating: req.user.role === 'patient' ? consultation.patientRating : consultation.doctorRating
    }, 'Rating submitted successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Rate Consultation',
      userId: req.user.id,
      consultationId: req.params.id
    });
    next(err);
  }
});

/**
 * @route   GET /api/consultations
 * @desc    Get user's consultations
 * @access  Private
 */
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['pending', 'scheduled', 'ongoing', 'completed', 'cancelled']),
  query('type').optional().isIn(['ai_chat', 'video_call', 'home_visit']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  handleValidation
], async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      type, 
      startDate, 
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Build query
    let query = {};
    if (req.user.role === 'patient') {
      query.patient = req.user.id;
    } else if (req.user.role === 'doctor') {
      query.doctor = req.user.id;
    }

    if (status) query.status = status;
    if (type) query.type = type;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const consultations = await Consultation.find(query)
      .populate('patient', 'firstName lastName avatar')
      .populate('doctor', 'firstName lastName avatar doctorProfile.specialization')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Consultation.countDocuments(query);

    // Format results
    const formattedConsultations = consultations.map(consultation => ({
      id: consultation._id,
      consultationId: consultation.consultationId,
      type: consultation.type,
      status: consultation.status,
      symptoms: consultation.symptoms?.slice(0, 3), // First 3 symptoms only
      chiefComplaint: consultation.chiefComplaint,
      scheduledDate: consultation.scheduledDate,
      createdAt: consultation.createdAt,
      duration: consultation.duration,
      payment: {
        amount: consultation.payment?.amount,
        currency: consultation.payment?.currency,
        status: consultation.payment?.paymentStatus
      },
      ...(req.user.role !== 'patient' && consultation.patient ? {
        patient: {
          id: consultation.patient._id,
          name: `${consultation.patient.firstName} ${consultation.patient.lastName}`,
          avatar: consultation.patient.avatar
        }
      } : {}),
      ...(req.user.role !== 'doctor' && consultation.doctor ? {
        doctor: {
          id: consultation.doctor._id,
          name: `Dr. ${consultation.doctor.firstName} ${consultation.doctor.lastName}`,
          avatar: consultation.doctor.avatar,
          specialization: consultation.doctor.doctorProfile?.specialization
        }
      } : {}),
      rating: req.user.role === 'patient' ? 
        consultation.patientRating?.rating : 
        consultation.doctorRating?.rating
    }));

    res.json(paginated(formattedConsultations, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    }));

  } catch (err) {
    logError(err, { 
      context: 'Get Consultations',
      userId: req.user.id,
      query: req.query
    });
    next(err);
  }
});

/**
 * @route   POST /api/consultations/:id/attachments
 * @desc    Upload consultation attachments
 * @access  Private
 */
router.post('/:id/attachments', [
  validateId,
  uploadConsultationAttachment,
  handleValidation
], async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json(errorResponse('No files provided', 'NO_FILES'));
    }

    // Find consultation
    let query = { _id: req.params.id };
    if (req.user.role === 'patient') {
      query.patient = req.user.id;
    } else if (req.user.role === 'doctor') {
      query.doctor = req.user.id;
    }

    const consultation = await Consultation.findOne(query);

    if (!consultation) {
      return res.status(404).json(errorResponse('Consultation not found', 'CONSULTATION_NOT_FOUND'));
    }

    // Add attachments
    const attachments = [];
    for (const file of req.files) {
      await consultation.addAttachment(
        file.filename,
        file.filePath,
        file.mimetype,
        file.size,
        req.user.id,
        req.body.category || 'other'
      );
      
      attachments.push({
        fileName: file.filename,
        originalName: file.originalname,
        size: file.size,
        category: req.body.category || 'other'
      });
    }

    res.json(success({
      attachments,
      totalAttachments: consultation.attachments.length
    }, 'Files uploaded successfully'));

  } catch (err) {
    logError(err, { 
      context: 'Upload Consultation Attachments',
      userId: req.user.id,
      consultationId: req.params.id
    });
    next(err);
  }
});

module.exports = router;
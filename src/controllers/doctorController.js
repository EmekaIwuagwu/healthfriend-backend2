const mongoose = require('mongoose');
const User = require('../models/User');
const Consultation = require('../models/Consultation');
const MedicalRecord = require('../models/MedicalRecord');
const Payment = require('../models/Payment');
const { logError, logInfo, logSecurity } = require('../utils/logger');
const { success, error: errorResponse, paginated } = require('../utils/helpers').responseUtils;
const { formatDateTime, formatCurrency } = require('../utils/helpers');
const { sendEmail } = require('../utils/email');
const { sendNotificationToUser } = require('../sockets/notifications');

// Doctor configuration
const DOCTOR_CONFIG = {
  VERIFICATION_STATUS: {
    PENDING: 'pending',
    VERIFIED: 'verified',
    REJECTED: 'rejected',
    SUSPENDED: 'suspended'
  },
  
  CONSULTATION_TYPES: {
    VIDEO: 'video',
    AUDIO: 'audio',
    CHAT: 'chat'
  },
  
  AVAILABILITY_STATUS: {
    AVAILABLE: 'available',
    BUSY: 'busy',
    OFFLINE: 'offline',
    IN_CONSULTATION: 'in_consultation'
  },
  
  SPECIALIZATIONS: [
    'general_medicine', 'cardiology', 'dermatology', 'neurology', 
    'orthopedics', 'pediatrics', 'psychiatry', 'gynecology',
    'gastroenterology', 'endocrinology', 'oncology', 'radiology'
  ],
  
  RATING_THRESHOLDS: {
    EXCELLENT: 4.5,
    GOOD: 4.0,
    AVERAGE: 3.5,
    POOR: 3.0
  }
};

class DoctorController {
  /**
   * Complete doctor profile registration
   */
  async completeProfile(req, res) {
    try {
      const {
        specialization,
        licenseNumber,
        experience,
        education,
        languages,
        consultationTypes,
        hourlyRate,
        bio,
        certifications
      } = req.body;
      
      const userId = req.user.id;

      // Verify user is a doctor
      const user = await User.findById(userId);
      if (!user || user.role !== 'doctor') {
        return res.status(403).json(errorResponse('Access denied. Doctor role required.'));
      }

      if (user.profileComplete) {
        return res.status(400).json(errorResponse('Profile already completed'));
      }

      // Update doctor profile
      user.doctorProfile = {
        specialization,
        licenseNumber,
        experience: parseInt(experience),
        education,
        languages: Array.isArray(languages) ? languages : [languages],
        consultationTypes: Array.isArray(consultationTypes) ? consultationTypes : [consultationTypes],
        hourlyRate: parseFloat(hourlyRate),
        bio,
        certifications: certifications || [],
        verificationStatus: DOCTOR_CONFIG.VERIFICATION_STATUS.PENDING,
        availability: {
          status: DOCTOR_CONFIG.AVAILABILITY_STATUS.OFFLINE,
          schedule: {},
          timeZone: 'UTC'
        },
        stats: {
          totalConsultations: 0,
          totalPatients: 0,
          averageRating: 0,
          totalEarnings: 0
        }
      };

      user.profileComplete = true;
      await user.save();

      // Send verification notification to admin
      await this.notifyAdminForVerification(user);

      logInfo('Doctor profile completed', {
        doctorId: userId,
        specialization,
        experience
      });

      res.json(success({
        profileId: user._id,
        verificationStatus: DOCTOR_CONFIG.VERIFICATION_STATUS.PENDING,
        message: 'Profile submitted for verification'
      }, 'Doctor profile completed successfully'));

    } catch (error) {
      logError(error, { context: 'Complete Doctor Profile', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to complete doctor profile'));
    }
  }

  /**
   * Update doctor profile
   */
  async updateProfile(req, res) {
    try {
      const {
        bio,
        hourlyRate,
        consultationTypes,
        languages,
        availability
      } = req.body;
      
      const userId = req.user.id;

      const user = await User.findById(userId);
      if (!user || user.role !== 'doctor') {
        return res.status(403).json(errorResponse('Access denied'));
      }

      // Update allowed fields
      if (bio !== undefined) user.doctorProfile.bio = bio;
      if (hourlyRate !== undefined) user.doctorProfile.hourlyRate = parseFloat(hourlyRate);
      if (consultationTypes) user.doctorProfile.consultationTypes = consultationTypes;
      if (languages) user.doctorProfile.languages = languages;
      if (availability) {
        user.doctorProfile.availability = {
          ...user.doctorProfile.availability,
          ...availability
        };
      }

      user.updatedAt = new Date();
      await user.save();

      logInfo('Doctor profile updated', { doctorId: userId });

      res.json(success(user.doctorProfile, 'Profile updated successfully'));

    } catch (error) {
      logError(error, { context: 'Update Doctor Profile', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to update profile'));
    }
  }

  /**
   * Set doctor availability
   */
  async setAvailability(req, res) {
    try {
      const { status, schedule, timeZone } = req.body;
      const userId = req.user.id;

      const user = await User.findById(userId);
      if (!user || user.role !== 'doctor') {
        return res.status(403).json(errorResponse('Access denied'));
      }

      // Update availability
      user.doctorProfile.availability = {
        status: status || user.doctorProfile.availability.status,
        schedule: schedule || user.doctorProfile.availability.schedule,
        timeZone: timeZone || user.doctorProfile.availability.timeZone,
        lastUpdated: new Date()
      };

      await user.save();

      // Notify waiting patients if doctor becomes available
      if (status === DOCTOR_CONFIG.AVAILABILITY_STATUS.AVAILABLE) {
        await this.notifyWaitingPatients(userId, user.doctorProfile.specialization);
      }

      logInfo('Doctor availability updated', {
        doctorId: userId,
        status,
        specialization: user.doctorProfile.specialization
      });

      res.json(success(user.doctorProfile.availability, 'Availability updated successfully'));

    } catch (error) {
      logError(error, { context: 'Set Doctor Availability', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to update availability'));
    }
  }

  /**
   * Get doctor dashboard data
   */
  async getDashboard(req, res) {
    try {
      const userId = req.user.id;

      // Get doctor info
      const doctor = await User.findById(userId).select('doctorProfile name email');
      if (!doctor || doctor.role !== 'doctor') {
        return res.status(403).json(errorResponse('Access denied'));
      }

      // Get today's consultations
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayConsultations = await Consultation.find({
        doctor: userId,
        scheduledDateTime: {
          $gte: today,
          $lt: tomorrow
        }
      }).populate('patient', 'name profileImage').sort({ scheduledDateTime: 1 });

      // Get pending consultations
      const pendingConsultations = await Consultation.find({
        doctor: userId,
        status: 'pending_doctor_approval'
      }).populate('patient', 'name profileImage').limit(5);

      // Get recent completed consultations
      const recentConsultations = await Consultation.find({
        doctor: userId,
        status: 'completed'
      }).populate('patient', 'name').sort({ endedAt: -1 }).limit(10);

      // Calculate earnings
      const earnings = await this.calculateEarnings(userId);

      // Get performance metrics
      const metrics = await this.getPerformanceMetrics(userId);

      const dashboardData = {
        doctorInfo: {
          name: doctor.name,
          specialization: doctor.doctorProfile.specialization,
          verificationStatus: doctor.doctorProfile.verificationStatus,
          availability: doctor.doctorProfile.availability
        },
        todayConsultations,
        pendingConsultations,
        recentConsultations,
        earnings,
        metrics
      };

      res.json(success(dashboardData));

    } catch (error) {
      logError(error, { context: 'Get Doctor Dashboard', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to load dashboard'));
    }
  }

  /**
   * Get doctor consultations
   */
  async getConsultations(req, res) {
    try {
      const userId = req.user.id;
      const { 
        page = 1, 
        limit = 20, 
        status, 
        type, 
        startDate, 
        endDate,
        search 
      } = req.query;

      // Build query
      const query = { doctor: userId };
      
      if (status) query.status = status;
      if (type) query.type = type;
      if (startDate || endDate) {
        query.scheduledDateTime = {};
        if (startDate) query.scheduledDateTime.$gte = new Date(startDate);
        if (endDate) query.scheduledDateTime.$lte = new Date(endDate);
      }

      // Search in patient names or consultation notes
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        const patients = await User.find({
          name: searchRegex,
          role: 'patient'
        }).select('_id');
        
        query.$or = [
          { patient: { $in: patients.map(p => p._id) } },
          { notes: searchRegex }
        ];
      }

      const consultations = await Consultation.find(query)
        .populate('patient', 'name email profileImage age gender')
        .populate('payment', 'amount status')
        .sort({ scheduledDateTime: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

      const total = await Consultation.countDocuments(query);

      res.json(paginated(consultations, {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      }));

    } catch (error) {
      logError(error, { context: 'Get Doctor Consultations', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to retrieve consultations'));
    }
  }

  /**
   * Respond to consultation request
   */
  async respondToConsultation(req, res) {
    try {
      const { consultationId, action, message, scheduledDateTime } = req.body;
      const userId = req.user.id;

      const consultation = await Consultation.findOne({
        _id: consultationId,
        doctor: userId,
        status: 'pending_doctor_approval'
      }).populate('patient', 'name email');

      if (!consultation) {
        return res.status(404).json(errorResponse('Consultation request not found'));
      }

      if (action === 'approve') {
        consultation.status = 'confirmed';
        consultation.doctorResponse = {
          approved: true,
          message,
          respondedAt: new Date()
        };
        
        if (scheduledDateTime) {
          consultation.scheduledDateTime = new Date(scheduledDateTime);
        }

        // Send approval notification to patient
        await sendNotificationToUser(consultation.patient._id, {
          type: 'consultation_approved',
          title: 'Consultation Approved',
          message: `Dr. ${req.user.name} has approved your consultation request.`,
          data: { consultationId }
        });

        // Send email notification
        await sendEmail({
          to: consultation.patient.email,
          subject: 'Consultation Approved - HealthFriend',
          template: 'consultation_approved',
          data: {
            patientName: consultation.patient.name,
            doctorName: req.user.name,
            scheduledDateTime: formatDateTime(consultation.scheduledDateTime),
            consultationType: consultation.type
          }
        });

      } else if (action === 'reject') {
        consultation.status = 'cancelled';
        consultation.cancellationReason = 'doctor_rejected';
        consultation.doctorResponse = {
          approved: false,
          message,
          respondedAt: new Date()
        };

        // Send rejection notification to patient
        await sendNotificationToUser(consultation.patient._id, {
          type: 'consultation_rejected',
          title: 'Consultation Request Declined',
          message: message || 'Your consultation request has been declined.',
          data: { consultationId }
        });

        // Process refund if payment was made
        if (consultation.payment) {
          await this.processConsultationRefund(consultation.payment);
        }
      }

      await consultation.save();

      logInfo('Doctor responded to consultation', {
        doctorId: userId,
        consultationId,
        action,
        patientId: consultation.patient._id
      });

      res.json(success({
        consultationId,
        status: consultation.status,
        action
      }, `Consultation ${action}d successfully`));

    } catch (error) {
      logError(error, { context: 'Respond to Consultation', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to respond to consultation'));
    }
  }

  /**
   * Start consultation session
   */
  async startConsultation(req, res) {
    try {
      const { consultationId } = req.body;
      const userId = req.user.id;

      const consultation = await Consultation.findOne({
        _id: consultationId,
        doctor: userId,
        status: 'confirmed'
      }).populate('patient', 'name email');

      if (!consultation) {
        return res.status(404).json(errorResponse('Consultation not found or not ready to start'));
      }

      // Check if consultation time is appropriate
      const now = new Date();
      const scheduledTime = new Date(consultation.scheduledDateTime);
      const timeDiff = Math.abs(now - scheduledTime);
      const fifteenMinutes = 15 * 60 * 1000;

      if (timeDiff > fifteenMinutes && now < scheduledTime) {
        return res.status(400).json(errorResponse('Consultation cannot be started more than 15 minutes early'));
      }

      // Update consultation status
      consultation.status = 'in_progress';
      consultation.startedAt = new Date();
      await consultation.save();

      // Update doctor availability
      await User.findByIdAndUpdate(userId, {
        'doctorProfile.availability.status': DOCTOR_CONFIG.AVAILABILITY_STATUS.IN_CONSULTATION
      });

      // Notify patient
      await sendNotificationToUser(consultation.patient._id, {
        type: 'consultation_started',
        title: 'Consultation Started',
        message: `Dr. ${req.user.name} has started your consultation.`,
        data: { consultationId }
      });

      logInfo('Consultation started by doctor', {
        doctorId: userId,
        consultationId,
        patientId: consultation.patient._id
      });

      res.json(success({
        consultationId,
        patient: consultation.patient,
        startedAt: consultation.startedAt,
        type: consultation.type
      }, 'Consultation started successfully'));

    } catch (error) {
      logError(error, { context: 'Start Consultation', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to start consultation'));
    }
  }

  /**
   * End consultation and create medical record
   */
  async endConsultation(req, res) {
    try {
      const {
        consultationId,
        diagnosis,
        prescription,
        notes,
        followUpRequired,
        followUpDate
      } = req.body;
      
      const userId = req.user.id;

      const consultation = await Consultation.findOne({
        _id: consultationId,
        doctor: userId,
        status: 'in_progress'
      }).populate('patient', 'name email');

      if (!consultation) {
        return res.status(404).json(errorResponse('Active consultation not found'));
      }

      // Calculate consultation duration
      const duration = Date.now() - new Date(consultation.startedAt).getTime();

      // Update consultation
      consultation.status = 'completed';
      consultation.endedAt = new Date();
      consultation.duration = duration;
      consultation.diagnosis = diagnosis;
      consultation.prescription = prescription;
      consultation.notes = notes;
      consultation.followUpRequired = followUpRequired;
      consultation.followUpDate = followUpDate ? new Date(followUpDate) : null;

      await consultation.save();

      // Create medical record
      const medicalRecord = new MedicalRecord({
        patient: consultation.patient._id,
        doctor: userId,
        consultation: consultationId,
        type: 'doctor_consultation',
        diagnosis,
        prescription,
        notes,
        followUpRequired,
        followUpDate: consultation.followUpDate,
        vitalSigns: consultation.vitalSigns,
        attachments: consultation.attachments
      });

      await medicalRecord.save();

      // Update doctor availability
      await User.findByIdAndUpdate(userId, {
        'doctorProfile.availability.status': DOCTOR_CONFIG.AVAILABILITY_STATUS.AVAILABLE,
        $inc: { 'doctorProfile.stats.totalConsultations': 1 }
      });

      // Notify patient
      await sendNotificationToUser(consultation.patient._id, {
        type: 'consultation_completed',
        title: 'Consultation Completed',
        message: 'Your consultation has been completed. Medical record has been created.',
        data: { 
          consultationId,
          medicalRecordId: medicalRecord._id,
          followUpRequired
        }
      });

      logInfo('Consultation completed by doctor', {
        doctorId: userId,
        consultationId,
        duration,
        patientId: consultation.patient._id
      });

      res.json(success({
        consultationId,
        medicalRecordId: medicalRecord._id,
        duration,
        followUpRequired
      }, 'Consultation completed successfully'));

    } catch (error) {
      logError(error, { context: 'End Consultation', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to end consultation'));
    }
  }

  /**
   * Get doctor earnings
   */
  async getEarnings(req, res) {
    try {
      const userId = req.user.id;
      const { period = 'month', year, month } = req.query;

      const earnings = await this.calculateDetailedEarnings(userId, period, year, month);

      res.json(success(earnings));

    } catch (error) {
      logError(error, { context: 'Get Doctor Earnings', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to retrieve earnings'));
    }
  }

  /**
   * Get doctor performance metrics
   */
  async getPerformanceMetrics(req, res) {
    try {
      const userId = req.user.id;
      const { period = 'month' } = req.query;

      const metrics = await this.getDetailedPerformanceMetrics(userId, period);

      res.json(success(metrics));

    } catch (error) {
      logError(error, { context: 'Get Performance Metrics', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to retrieve performance metrics'));
    }
  }

  /**
   * Get patient medical history (for consultation)
   */
  async getPatientHistory(req, res) {
    try {
      const { patientId } = req.params;
      const doctorId = req.user.id;

      // Verify doctor has consulted with this patient before
      const hasConsulted = await Consultation.findOne({
        doctor: doctorId,
        patient: patientId,
        status: { $in: ['completed', 'in_progress'] }
      });

      if (!hasConsulted) {
        return res.status(403).json(errorResponse('Access denied. No consultation history with this patient.'));
      }

      // Get patient's medical records
      const medicalRecords = await MedicalRecord.find({
        patient: patientId
      }).populate('doctor', 'name specialization').sort({ createdAt: -1 });

      // Get patient's consultation history
      const consultationHistory = await Consultation.find({
        patient: patientId,
        status: 'completed'
      }).populate('doctor', 'name specialization').sort({ endedAt: -1 });

      // Get patient basic info
      const patient = await User.findById(patientId).select(
        'name age gender medicalHistory allergies currentMedications'
      );

      res.json(success({
        patient,
        medicalRecords,
        consultationHistory
      }));

    } catch (error) {
      logError(error, { context: 'Get Patient History', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to retrieve patient history'));
    }
  }

  // Helper methods

  /**
   * Notify admin for doctor verification
   */
  async notifyAdminForVerification(doctor) {
    try {
      // In a real app, you'd send this to admin users
      logInfo('Doctor verification required', {
        doctorId: doctor._id,
        name: doctor.name,
        specialization: doctor.doctorProfile.specialization,
        licenseNumber: doctor.doctorProfile.licenseNumber
      });

      // Send email to admin
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: 'New Doctor Verification Required',
        template: 'doctor_verification',
        data: {
          doctorName: doctor.name,
          specialization: doctor.doctorProfile.specialization,
          experience: doctor.doctorProfile.experience,
          licenseNumber: doctor.doctorProfile.licenseNumber
        }
      });

    } catch (error) {
      logError(error, { context: 'Notify Admin for Verification' });
    }
  }

  /**
   * Notify waiting patients when doctor becomes available
   */
  async notifyWaitingPatients(doctorId, specialization) {
    try {
      // Find patients waiting for this specialization
      const waitingConsultations = await Consultation.find({
        doctor: doctorId,
        status: 'pending_doctor_approval',
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      }).populate('patient', '_id');

      for (const consultation of waitingConsultations) {
        await sendNotificationToUser(consultation.patient._id, {
          type: 'doctor_available',
          title: 'Doctor Available',
          message: `A ${specialization} specialist is now available for consultation.`,
          data: { doctorId, specialization }
        });
      }

    } catch (error) {
      logError(error, { context: 'Notify Waiting Patients' });
    }
  }

  /**
   * Calculate doctor earnings
   */
  async calculateEarnings(doctorId) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const earnings = await Payment.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            status: 'completed',
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: { $multiply: ['$amount.usd', 0.85] } }, // 85% to doctor
            totalConsultations: { $sum: 1 },
            averageEarning: { $avg: { $multiply: ['$amount.usd', 0.85] } }
          }
        }
      ]);

      return earnings[0] || {
        totalEarnings: 0,
        totalConsultations: 0,
        averageEarning: 0
      };

    } catch (error) {
      logError(error, { context: 'Calculate Earnings' });
      return { totalEarnings: 0, totalConsultations: 0, averageEarning: 0 };
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(doctorId) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Get consultation stats
      const consultationStats = await Consultation.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get rating stats
      const ratingStats = await Consultation.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            'rating.score': { $exists: true },
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating.score' },
            totalRatings: { $sum: 1 }
          }
        }
      ]);

      return {
        consultationStats,
        rating: ratingStats[0] || { averageRating: 0, totalRatings: 0 }
      };

    } catch (error) {
      logError(error, { context: 'Get Performance Metrics' });
      return { consultationStats: [], rating: { averageRating: 0, totalRatings: 0 } };
    }
  }

  /**
   * Calculate detailed earnings with breakdown
   */
  async calculateDetailedEarnings(doctorId, period, year, month) {
    try {
      let matchCondition = {
        doctor: new mongoose.Types.ObjectId(doctorId),
        status: 'completed'
      };

      // Add date filters based on period
      const now = new Date();
      if (period === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        matchCondition.createdAt = { $gte: startOfMonth };
      } else if (period === 'year') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        matchCondition.createdAt = { $gte: startOfYear };
      } else if (year && month) {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        matchCondition.createdAt = { $gte: startDate, $lte: endDate };
      }

      const earnings = await Payment.aggregate([
        { $match: matchCondition },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            dailyEarnings: { $sum: { $multiply: ['$amount.usd', 0.85] } },
            consultations: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]);

      const totalEarnings = earnings.reduce((sum, day) => sum + day.dailyEarnings, 0);
      const totalConsultations = earnings.reduce((sum, day) => sum + day.consultations, 0);

      return {
        totalEarnings,
        totalConsultations,
        averageEarning: totalConsultations > 0 ? totalEarnings / totalConsultations : 0,
        dailyBreakdown: earnings,
        period
      };

    } catch (error) {
      logError(error, { context: 'Calculate Detailed Earnings' });
      return { totalEarnings: 0, totalConsultations: 0, averageEarning: 0, dailyBreakdown: [] };
    }
  }

  /**
   * Get detailed performance metrics
   */
  async getDetailedPerformanceMetrics(doctorId, period) {
    try {
      let dateFilter = {};
      const now = new Date();

      if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = { $gte: weekAgo };
      } else if (period === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = { $gte: monthAgo };
      } else if (period === 'year') {
        const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        dateFilter = { $gte: yearAgo };
      }

      // Consultation metrics
      const consultationMetrics = await Consultation.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            createdAt: dateFilter
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            averageDuration: { $avg: '$duration' }
          }
        }
      ]);

      // Patient satisfaction
      const satisfactionMetrics = await Consultation.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            'rating.score': { $exists: true },
            createdAt: dateFilter
          }
        },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $gte: ['$rating.score', 4.5] }, then: 'excellent' },
                  { case: { $gte: ['$rating.score', 4.0] }, then: 'good' },
                  { case: { $gte: ['$rating.score', 3.5] }, then: 'average' }
                ],
                default: 'poor'
              }
            },
            count: { $sum: 1 }
          }
        }
      ]);

      // Response time metrics
      const responseMetrics = await Consultation.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            'doctorResponse.respondedAt': { $exists: true },
            createdAt: dateFilter
          }
        },
        {
          $project: {
            responseTime: {
              $subtract: ['$doctorResponse.respondedAt', '$createdAt']
            }
          }
        },
        {
          $group: {
            _id: null,
            averageResponseTime: { $avg: '$responseTime' },
            totalResponses: { $sum: 1 }
          }
        }
      ]);

      return {
        consultationMetrics,
        satisfactionMetrics,
        responseMetrics: responseMetrics[0] || { averageResponseTime: 0, totalResponses: 0 },
        period
      };

    } catch (error) {
      logError(error, { context: 'Get Detailed Performance Metrics' });
      return { consultationMetrics: [], satisfactionMetrics: [], responseMetrics: {} };
    }
  }

  /**
   * Process consultation refund
   */
  async processConsultationRefund(paymentId) {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) return;

      payment.status = 'refunded';
      payment.refundedAt = new Date();
      payment.refundReason = 'consultation_rejected';
      await payment.save();

      logInfo('Consultation refund processed', {
        paymentId,
        amount: payment.amount.usd
      });

    } catch (error) {
      logError(error, { context: 'Process Consultation Refund' });
    }
  }
}

module.exports = new DoctorController();
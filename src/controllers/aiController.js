const mongoose = require('mongoose');
const Consultation = require('../models/Consultation');
const MedicalRecord = require('../models/MedicalRecord');
const User = require('../models/User');
const { aiUtils } = require('../utils/ai');
const { logError, logInfo, logSecurity } = require('../utils/logger');
const { success, error: errorResponse } = require('../utils/helpers').responseUtils;
const { medicalUtils } = require('../utils/helpers');
const { sendNotificationToUser } = require('../sockets/notifications');

// AI Configuration
const AI_CONFIG = {
  MAX_CONVERSATION_LENGTH: 50,
  EMERGENCY_THRESHOLD: 0.8,
  DOCTOR_REFERRAL_THRESHOLD: 0.6,
  MAX_DAILY_AI_CONSULTATIONS: 10,
  CONVERSATION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  
  // AI response categories
  RESPONSE_TYPES: {
    GENERAL_ADVICE: 'general_advice',
    SYMPTOM_ANALYSIS: 'symptom_analysis',
    EMERGENCY_ALERT: 'emergency_alert',
    DOCTOR_REFERRAL: 'doctor_referral',
    MEDICATION_INFO: 'medication_info',
    LIFESTYLE_ADVICE: 'lifestyle_advice',
    FOLLOW_UP: 'follow_up'
  },

  // Specialization mapping
  SPECIALIZATION_KEYWORDS: {
    cardiology: ['heart', 'chest pain', 'palpitations', 'blood pressure', 'cardiac'],
    dermatology: ['skin', 'rash', 'acne', 'mole', 'eczema', 'psoriasis'],
    neurology: ['headache', 'migraine', 'seizure', 'dizziness', 'numbness'],
    orthopedics: ['bone', 'joint', 'fracture', 'sprain', 'back pain', 'arthritis'],
    gastroenterology: ['stomach', 'digestive', 'nausea', 'diarrhea', 'constipation'],
    psychiatry: ['anxiety', 'depression', 'stress', 'mental health', 'mood'],
    pediatrics: ['child', 'baby', 'infant', 'pediatric', 'vaccination'],
    gynecology: ['pregnancy', 'menstrual', 'contraception', 'gynecological']
  }
};

class AIController {
  /**
   * Start new AI consultation
   */
  async startConsultation(req, res) {
    try {
      const { symptoms, medicalHistory, currentMedications, urgency = 'normal' } = req.body;
      const userId = req.user.id;

      // Check daily AI consultation limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayConsultations = await Consultation.countDocuments({
        patient: userId,
        type: 'ai_consultation',
        createdAt: { $gte: today }
      });

      if (todayConsultations >= AI_CONFIG.MAX_DAILY_AI_CONSULTATIONS) {
        return res.status(429).json(errorResponse(
          'Daily AI consultation limit reached. Please try again tomorrow or book a doctor consultation.',
          429
        ));
      }

      // Get user's medical history for context
      const user = await User.findById(userId).select('medicalHistory age gender');
      const recentRecords = await MedicalRecord.find({ patient: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('diagnosis medications allergies');

      // Perform emergency detection
      const emergencyCheck = await aiUtils.detectEmergency(symptoms);
      
      if (emergencyCheck.isEmergency) {
        // Create emergency consultation record
        const consultation = new Consultation({
          patient: userId,
          type: 'ai_consultation',
          subType: 'emergency',
          symptoms,
          urgency: 'critical',
          status: 'emergency_detected',
          aiAnalysis: {
            emergencyScore: emergencyCheck.severity,
            recommendedActions: emergencyCheck.recommendations,
            suggestedSpecialization: emergencyCheck.suggestedSpecialization
          },
          metadata: {
            userAge: user.age,
            userGender: user.gender,
            medicalHistory: user.medicalHistory,
            sessionStart: new Date()
          }
        });

        await consultation.save();

        // Send emergency notification
        await sendNotificationToUser(userId, {
          type: 'emergency_detected',
          title: 'Emergency Detected',
          message: 'Based on your symptoms, you should seek immediate medical attention.',
          data: { consultationId: consultation._id }
        });

        logSecurity('Emergency symptoms detected', {
          userId,
          consultationId: consultation._id,
          symptoms,
          severity: emergencyCheck.severity
        });

        return res.json(success({
          consultationId: consultation._id,
          isEmergency: true,
          severity: emergencyCheck.severity,
          recommendations: emergencyCheck.recommendations,
          message: 'Emergency detected. Please seek immediate medical attention.',
          emergencyContacts: [
            { name: 'Emergency Services', number: '911' },
            { name: 'Poison Control', number: '1-800-222-1222' }
          ]
        }, 'Emergency consultation created'));
      }

      // Perform AI symptom analysis
      const analysis = await aiUtils.analyzeSymptoms({
        symptoms,
        medicalHistory: user.medicalHistory,
        currentMedications,
        age: user.age,
        gender: user.gender,
        recentMedicalRecords: recentRecords
      });

      // Determine recommended specialization
      const suggestedSpecialization = this.determineSuggestedSpecialization(symptoms);

      // Create consultation record
      const consultation = new Consultation({
        patient: userId,
        type: 'ai_consultation',
        symptoms,
        urgency,
        status: 'in_progress',
        aiAnalysis: {
          initialAnalysis: analysis.assessment,
          riskLevel: analysis.riskLevel,
          recommendedActions: analysis.recommendations,
          suggestedSpecialization,
          confidenceScore: analysis.confidence,
          followUpRequired: analysis.requiresFollowUp
        },
        conversationHistory: [{
          role: 'system',
          content: 'AI consultation started',
          timestamp: new Date()
        }, {
          role: 'user',
          content: `Symptoms: ${symptoms.join(', ')}`,
          timestamp: new Date()
        }, {
          role: 'assistant',
          content: analysis.response,
          timestamp: new Date(),
          metadata: {
            responseType: AI_CONFIG.RESPONSE_TYPES.SYMPTOM_ANALYSIS,
            confidence: analysis.confidence
          }
        }],
        metadata: {
          userAge: user.age,
          userGender: user.gender,
          medicalHistory: user.medicalHistory,
          sessionStart: new Date()
        }
      });

      await consultation.save();

      logInfo('AI consultation started', {
        userId,
        consultationId: consultation._id,
        symptoms: symptoms.length,
        riskLevel: analysis.riskLevel
      });

      res.json(success({
        consultationId: consultation._id,
        response: analysis.response,
        riskLevel: analysis.riskLevel,
        recommendations: analysis.recommendations,
        suggestedSpecialization,
        requiresDoctorConsultation: analysis.confidence < AI_CONFIG.DOCTOR_REFERRAL_THRESHOLD,
        followUpRequired: analysis.requiresFollowUp
      }, 'AI consultation started successfully'));

    } catch (error) {
      logError(error, { context: 'Start AI Consultation', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to start AI consultation'));
    }
  }

  /**
   * Continue AI conversation
   */
  async continueConversation(req, res) {
    try {
      const { consultationId, message, attachments = [] } = req.body;
      const userId = req.user.id;

      // Find active consultation
      const consultation = await Consultation.findOne({
        _id: consultationId,
        patient: userId,
        type: 'ai_consultation',
        status: 'in_progress'
      });

      if (!consultation) {
        return res.status(404).json(errorResponse('Active consultation not found'));
      }

      // Check conversation length limit
      if (consultation.conversationHistory.length >= AI_CONFIG.MAX_CONVERSATION_LENGTH) {
        return res.status(400).json(errorResponse(
          'Conversation limit reached. Please start a new consultation or book a doctor appointment.'
        ));
      }

      // Check session timeout
      const lastMessage = consultation.conversationHistory[consultation.conversationHistory.length - 1];
      const timeSinceLastMessage = Date.now() - new Date(lastMessage.timestamp).getTime();
      
      if (timeSinceLastMessage > AI_CONFIG.CONVERSATION_TIMEOUT) {
        consultation.status = 'timed_out';
        await consultation.save();
        
        return res.status(400).json(errorResponse(
          'Consultation session has timed out. Please start a new consultation.'
        ));
      }

      // Add user message to conversation
      consultation.conversationHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date(),
        attachments
      });

      // Get AI response
      const conversationHistory = consultation.conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const aiResponse = await aiUtils.continueConversation(conversationHistory, {
        patientAge: consultation.metadata.userAge,
        patientGender: consultation.metadata.userGender,
        medicalHistory: consultation.metadata.medicalHistory,
        currentSymptoms: consultation.symptoms
      });

      // Safety check on AI response
      const safetyCheck = await aiUtils.performSafetyCheck(aiResponse.content);
      
      if (!safetyCheck.isSafe) {
        logSecurity('Unsafe AI response detected', {
          consultationId,
          userId,
          response: aiResponse.content,
          violations: safetyCheck.violations
        });
        
        return res.status(400).json(errorResponse(
          'Unable to provide response. Please consult with a healthcare professional.'
        ));
      }

      // Add AI response to conversation
      consultation.conversationHistory.push({
        role: 'assistant',
        content: aiResponse.content,
        timestamp: new Date(),
        metadata: {
          responseType: aiResponse.type,
          confidence: aiResponse.confidence,
          requiresFollowUp: aiResponse.requiresFollowUp
        }
      });

      // Update consultation analysis
      if (aiResponse.updatedAssessment) {
        consultation.aiAnalysis.currentAssessment = aiResponse.updatedAssessment;
        consultation.aiAnalysis.riskLevel = aiResponse.riskLevel;
        consultation.aiAnalysis.followUpRequired = aiResponse.requiresFollowUp;
      }

      await consultation.save();

      // Check if doctor referral is needed
      const needsDoctorReferral = aiResponse.confidence < AI_CONFIG.DOCTOR_REFERRAL_THRESHOLD ||
                                  aiResponse.requiresDoctorConsultation;

      if (needsDoctorReferral) {
        await sendNotificationToUser(userId, {
          type: 'doctor_referral_suggested',
          title: 'Doctor Consultation Recommended',
          message: 'Based on our analysis, we recommend booking a consultation with a healthcare professional.',
          data: { consultationId }
        });
      }

      res.json(success({
        response: aiResponse.content,
        responseType: aiResponse.type,
        confidence: aiResponse.confidence,
        needsDoctorReferral,
        suggestedSpecialization: aiResponse.suggestedSpecialization,
        followUpQuestions: aiResponse.followUpQuestions,
        conversationLength: consultation.conversationHistory.length
      }));

    } catch (error) {
      logError(error, { context: 'Continue AI Conversation', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to continue conversation'));
    }
  }

  /**
   * End AI consultation
   */
  async endConsultation(req, res) {
    try {
      const { consultationId, rating, feedback } = req.body;
      const userId = req.user.id;

      const consultation = await Consultation.findOne({
        _id: consultationId,
        patient: userId,
        type: 'ai_consultation'
      });

      if (!consultation) {
        return res.status(404).json(errorResponse('Consultation not found'));
      }

      // Update consultation status
      consultation.status = 'completed';
      consultation.endedAt = new Date();
      consultation.duration = Date.now() - new Date(consultation.createdAt).getTime();

      // Add rating and feedback if provided
      if (rating !== undefined) {
        consultation.rating = {
          score: rating,
          feedback,
          ratedAt: new Date()
        };
      }

      // Generate final summary
      const summary = await this.generateConsultationSummary(consultation);
      consultation.aiAnalysis.finalSummary = summary;

      await consultation.save();

      // Create medical record if significant findings
      if (consultation.aiAnalysis.riskLevel !== 'low') {
        await this.createMedicalRecord(consultation);
      }

      logInfo('AI consultation completed', {
        userId,
        consultationId,
        duration: consultation.duration,
        rating,
        conversationLength: consultation.conversationHistory.length
      });

      res.json(success({
        consultationId,
        summary,
        duration: consultation.duration,
        followUpRecommendations: consultation.aiAnalysis.recommendedActions,
        medicalRecordCreated: consultation.aiAnalysis.riskLevel !== 'low'
      }, 'Consultation ended successfully'));

    } catch (error) {
      logError(error, { context: 'End AI Consultation', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to end consultation'));
    }
  }

  /**
   * Get AI consultation history
   */
  async getConsultationHistory(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, status, startDate, endDate } = req.query;

      // Build query
      const query = { 
        patient: userId,
        type: 'ai_consultation'
      };
      
      if (status) query.status = status;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const consultations = await Consultation.find(query)
        .select('symptoms status aiAnalysis rating createdAt endedAt duration')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

      const total = await Consultation.countDocuments(query);

      res.json(success({
        consultations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }));

    } catch (error) {
      logError(error, { context: 'Get AI Consultation History', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to retrieve consultation history'));
    }
  }

  /**
   * Get AI consultation details
   */
  async getConsultationDetails(req, res) {
    try {
      const { consultationId } = req.params;
      const userId = req.user.id;

      const consultation = await Consultation.findOne({
        _id: consultationId,
        patient: userId,
        type: 'ai_consultation'
      }).select('-metadata.medicalHistory'); // Exclude sensitive data

      if (!consultation) {
        return res.status(404).json(errorResponse('Consultation not found'));
      }

      res.json(success(consultation));

    } catch (error) {
      logError(error, { context: 'Get AI Consultation Details', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to retrieve consultation details'));
    }
  }

  /**
   * Get AI health insights
   */
  async getHealthInsights(req, res) {
    try {
      const userId = req.user.id;

      // Get recent consultations for analysis
      const recentConsultations = await Consultation.find({
        patient: userId,
        type: 'ai_consultation',
        status: 'completed',
        createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } // Last 90 days
      }).select('symptoms aiAnalysis createdAt');

      // Get medical records
      const medicalRecords = await MedicalRecord.find({
        patient: userId
      }).select('diagnosis medications createdAt').limit(10);

      // Generate insights
      const insights = await this.generateHealthInsights(recentConsultations, medicalRecords);

      res.json(success(insights));

    } catch (error) {
      logError(error, { context: 'Get Health Insights', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to generate health insights'));
    }
  }

  /**
   * Get AI usage analytics (Admin only)
   */
  async getAIAnalytics(req, res) {
    try {
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      // Get AI usage statistics
      const analytics = await Consultation.aggregate([
        {
          $match: {
            type: 'ai_consultation',
            createdAt: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            totalConsultations: { $sum: 1 },
            completedConsultations: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            emergencyDetected: {
              $sum: { $cond: [{ $eq: ['$subType', 'emergency'] }, 1, 0] }
            },
            averageRating: { $avg: '$rating.score' },
            averageDuration: { $avg: '$duration' }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
        }
      ]);

      // Get AI service health
      const aiHealth = await aiUtils.checkHealth();

      res.json(success({
        analytics,
        aiHealth,
        period: { start, end }
      }));

    } catch (error) {
      logError(error, { context: 'Get AI Analytics' });
      res.status(500).json(errorResponse('Failed to retrieve AI analytics'));
    }
  }

  // Helper methods

  /**
   * Determine suggested medical specialization
   */
  determineSuggestedSpecialization(symptoms) {
    const symptomText = symptoms.join(' ').toLowerCase();
    
    for (const [specialization, keywords] of Object.entries(AI_CONFIG.SPECIALIZATION_KEYWORDS)) {
      if (keywords.some(keyword => symptomText.includes(keyword))) {
        return specialization;
      }
    }
    
    return 'general_medicine';
  }

  /**
   * Generate consultation summary
   */
  async generateConsultationSummary(consultation) {
    try {
      const summary = {
        mainSymptoms: consultation.symptoms,
        riskAssessment: consultation.aiAnalysis.riskLevel,
        keyFindings: consultation.aiAnalysis.currentAssessment || consultation.aiAnalysis.initialAnalysis,
        recommendations: consultation.aiAnalysis.recommendedActions,
        followUpRequired: consultation.aiAnalysis.followUpRequired,
        suggestedSpecialization: consultation.aiAnalysis.suggestedSpecialization,
        conversationLength: consultation.conversationHistory.length,
        duration: consultation.duration
      };

      return summary;
    } catch (error) {
      logError(error, { context: 'Generate Consultation Summary' });
      return null;
    }
  }

  /**
   * Create medical record from AI consultation
   */
  async createMedicalRecord(consultation) {
    try {
      const medicalRecord = new MedicalRecord({
        patient: consultation.patient,
        consultation: consultation._id,
        type: 'ai_consultation',
        diagnosis: consultation.aiAnalysis.currentAssessment || consultation.aiAnalysis.initialAnalysis,
        symptoms: consultation.symptoms,
        recommendations: consultation.aiAnalysis.recommendedActions,
        riskLevel: consultation.aiAnalysis.riskLevel,
        metadata: {
          aiGenerated: true,
          confidenceScore: consultation.aiAnalysis.confidenceScore,
          specialization: consultation.aiAnalysis.suggestedSpecialization
        }
      });

      await medicalRecord.save();
      
      logInfo('Medical record created from AI consultation', {
        consultationId: consultation._id,
        medicalRecordId: medicalRecord._id,
        patientId: consultation.patient
      });

      return medicalRecord;
    } catch (error) {
      logError(error, { context: 'Create Medical Record from AI Consultation' });
      return null;
    }
  }

  /**
   * Generate health insights from consultation history
   */
  async generateHealthInsights(consultations, medicalRecords) {
    try {
      // Analyze symptom patterns
      const symptomFrequency = {};
      const riskLevels = [];
      
      consultations.forEach(consultation => {
        consultation.symptoms.forEach(symptom => {
          symptomFrequency[symptom] = (symptomFrequency[symptom] || 0) + 1;
        });
        riskLevels.push(consultation.aiAnalysis.riskLevel);
      });

      // Most common symptoms
      const commonSymptoms = Object.entries(symptomFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([symptom, count]) => ({ symptom, count }));

      // Risk level distribution
      const riskDistribution = riskLevels.reduce((acc, level) => {
        acc[level] = (acc[level] || 0) + 1;
        return acc;
      }, {});

      // Health trends
      const trends = {
        totalConsultations: consultations.length,
        averageRiskLevel: this.calculateAverageRiskLevel(riskLevels),
        consultationFrequency: this.calculateConsultationFrequency(consultations),
        healthScore: this.calculateHealthScore(consultations, medicalRecords)
      };

      // Recommendations
      const recommendations = this.generatePersonalizedRecommendations(
        commonSymptoms,
        riskDistribution,
        trends
      );

      return {
        commonSymptoms,
        riskDistribution,
        trends,
        recommendations,
        lastUpdated: new Date()
      };

    } catch (error) {
      logError(error, { context: 'Generate Health Insights' });
      return null;
    }
  }

  /**
   * Calculate average risk level
   */
  calculateAverageRiskLevel(riskLevels) {
    const riskValues = { low: 1, medium: 2, high: 3, critical: 4 };
    const average = riskLevels.reduce((sum, level) => sum + riskValues[level], 0) / riskLevels.length;
    
    if (average <= 1.5) return 'low';
    if (average <= 2.5) return 'medium';
    if (average <= 3.5) return 'high';
    return 'critical';
  }

  /**
   * Calculate consultation frequency
   */
  calculateConsultationFrequency(consultations) {
    if (consultations.length < 2) return 'insufficient_data';
    
    const dates = consultations.map(c => new Date(c.createdAt)).sort();
    const intervals = [];
    
    for (let i = 1; i < dates.length; i++) {
      intervals.push(dates[i] - dates[i-1]);
    }
    
    const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const daysInterval = averageInterval / (1000 * 60 * 60 * 24);
    
    if (daysInterval <= 7) return 'very_frequent';
    if (daysInterval <= 30) return 'frequent';
    if (daysInterval <= 90) return 'moderate';
    return 'infrequent';
  }

  /**
   * Calculate health score
   */
  calculateHealthScore(consultations, medicalRecords) {
    let score = 100; // Start with perfect score
    
    // Deduct points for high-risk consultations
    const highRiskConsultations = consultations.filter(c => 
      ['high', 'critical'].includes(c.aiAnalysis.riskLevel)
    ).length;
    score -= highRiskConsultations * 10;
    
    // Deduct points for frequent consultations
    if (consultations.length > 10) score -= 15;
    else if (consultations.length > 5) score -= 10;
    
    // Deduct points for chronic conditions
    const chronicConditions = medicalRecords.filter(r => 
      r.diagnosis && r.diagnosis.toLowerCase().includes('chronic')
    ).length;
    score -= chronicConditions * 5;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate personalized recommendations
   */
  generatePersonalizedRecommendations(commonSymptoms, riskDistribution, trends) {
    const recommendations = [];
    
    // Based on common symptoms
    if (commonSymptoms.some(s => ['headache', 'migraine'].includes(s.symptom))) {
      recommendations.push({
        type: 'lifestyle',
        title: 'Manage Headaches',
        description: 'Consider stress management techniques and regular sleep schedule',
        priority: 'medium'
      });
    }
    
    // Based on risk levels
    if (riskDistribution.high > 2 || riskDistribution.critical > 0) {
      recommendations.push({
        type: 'medical',
        title: 'Regular Check-ups',
        description: 'Schedule regular consultations with healthcare providers',
        priority: 'high'
      });
    }
    
    // Based on consultation frequency
    if (trends.consultationFrequency === 'very_frequent') {
      recommendations.push({
        type: 'preventive',
        title: 'Preventive Care',
        description: 'Focus on preventive measures and lifestyle improvements',
        priority: 'high'
      });
    }
    
    return recommendations;
  }
}

module.exports = new AIController();
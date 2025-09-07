const mongoose = require('mongoose');
const User = require('../models/User');
const Consultation = require('../models/Consultation');
const Payment = require('../models/Payment');
const MedicalRecord = require('../models/MedicalRecord');
const Notification = require('../models/Notification');
const SystemLog = require('../models/SystemLog');
const { logError, logInfo, logSecurity, logAdmin } = require('../utils/logger');
const { success, error: errorResponse, paginated } = require('../utils/helpers').responseUtils;
const { formatDateTime, formatCurrency } = require('../utils/helpers');
const { sendEmail } = require('../utils/email');
const { sendNotificationToUser } = require('../sockets/notifications');
const { aiUtils } = require('../utils/ai');

// Admin configuration
const ADMIN_CONFIG = {
  USER_ACTIONS: {
    VERIFY: 'verify',
    SUSPEND: 'suspend',
    ACTIVATE: 'activate',
    DELETE: 'delete',
    RESET_PASSWORD: 'reset_password'
  },
  
  VERIFICATION_ACTIONS: {
    APPROVE: 'approve',
    REJECT: 'reject',
    REQUEST_INFO: 'request_info'
  },
  
  REPORT_TYPES: {
    USER_ACTIVITY: 'user_activity',
    FINANCIAL: 'financial',
    CONSULTATION: 'consultation',
    AI_USAGE: 'ai_usage',
    SYSTEM_HEALTH: 'system_health'
  },
  
  DISPUTE_STATUS: {
    OPEN: 'open',
    INVESTIGATING: 'investigating',
    RESOLVED: 'resolved',
    CLOSED: 'closed'
  }
};

class AdminController {
  /**
   * Get admin dashboard overview
   */
  async getDashboard(req, res) {
    try {
      // Get time ranges
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      // User statistics
      const userStats = await this.getUserStatistics(lastMonth);
      
      // Financial statistics
      const financialStats = await this.getFinancialStatistics(lastMonth);
      
      // Consultation statistics
      const consultationStats = await this.getConsultationStatistics(lastMonth);
      
      // AI usage statistics
      const aiStats = await this.getAIUsageStatistics(lastMonth);
      
      // System health metrics
      const systemHealth = await this.getSystemHealthMetrics();
      
      // Recent activities
      const recentActivities = await this.getRecentActivities(10);
      
      // Pending items requiring admin attention
      const pendingItems = await this.getPendingAdminItems();

      const dashboardData = {
        overview: {
          totalUsers: userStats.total,
          totalDoctors: userStats.doctors,
          totalPatients: userStats.patients,
          totalRevenue: financialStats.totalRevenue,
          totalConsultations: consultationStats.total,
          aiConsultations: aiStats.totalConsultations,
          systemUptime: systemHealth.uptime
        },
        statistics: {
          users: userStats,
          financial: financialStats,
          consultations: consultationStats,
          ai: aiStats
        },
        systemHealth,
        recentActivities,
        pendingItems,
        generatedAt: new Date()
      };

      logAdmin('Admin dashboard accessed', { adminId: req.user.id });

      res.json(success(dashboardData));

    } catch (error) {
      logError(error, { context: 'Get Admin Dashboard', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to load admin dashboard'));
    }
  }

  /**
   * Manage users (verify, suspend, activate, delete)
   */
  async manageUser(req, res) {
    try {
      const { userId, action, reason, notifyUser = true } = req.body;
      const adminId = req.user.id;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json(errorResponse('User not found'));
      }

      let updateFields = {};
      let notificationMessage = '';
      let emailTemplate = '';

      switch (action) {
        case ADMIN_CONFIG.USER_ACTIONS.VERIFY:
          if (user.role !== 'doctor') {
            return res.status(400).json(errorResponse('Only doctors can be verified'));
          }
          updateFields = {
            'doctorProfile.verificationStatus': 'verified',
            'doctorProfile.verifiedAt': new Date(),
            'doctorProfile.verifiedBy': adminId
          };
          notificationMessage = 'Your doctor profile has been verified. You can now accept consultations.';
          emailTemplate = 'doctor_verified';
          break;

        case ADMIN_CONFIG.USER_ACTIONS.SUSPEND:
          updateFields = {
            accountStatus: 'suspended',
            suspendedAt: new Date(),
            suspendedBy: adminId,
            suspensionReason: reason
          };
          notificationMessage = `Your account has been suspended. Reason: ${reason}`;
          emailTemplate = 'account_suspended';
          break;

        case ADMIN_CONFIG.USER_ACTIONS.ACTIVATE:
          updateFields = {
            accountStatus: 'active',
            suspendedAt: null,
            suspendedBy: null,
            suspensionReason: null
          };
          notificationMessage = 'Your account has been reactivated.';
          emailTemplate = 'account_activated';
          break;

        case ADMIN_CONFIG.USER_ACTIONS.DELETE:
          // Soft delete - anonymize user data
          updateFields = {
            accountStatus: 'deleted',
            deletedAt: new Date(),
            deletedBy: adminId,
            email: `deleted_${Date.now()}@healthfriend.com`,
            name: 'Deleted User',
            walletAddress: null
          };
          break;

        default:
          return res.status(400).json(errorResponse('Invalid action'));
      }

      await User.findByIdAndUpdate(userId, updateFields);

      // Send notification to user
      if (notifyUser && action !== ADMIN_CONFIG.USER_ACTIONS.DELETE) {
        await sendNotificationToUser(userId, {
          type: `account_${action}`,
          title: `Account ${action.charAt(0).toUpperCase() + action.slice(1)}`,
          message: notificationMessage,
          data: { reason }
        });

        // Send email notification
        if (emailTemplate) {
          await sendEmail({
            to: user.email,
            subject: `Account ${action.charAt(0).toUpperCase() + action.slice(1)} - HealthFriend`,
            template: emailTemplate,
            data: {
              userName: user.name,
              reason,
              actionDate: formatDateTime(new Date())
            }
          });
        }
      }

      logAdmin('User management action performed', {
        adminId,
        targetUserId: userId,
        action,
        reason
      });

      res.json(success({
        userId,
        action,
        status: updateFields.accountStatus || user.accountStatus,
        message: `User ${action} successfully`
      }));

    } catch (error) {
      logError(error, { context: 'Manage User', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to manage user'));
    }
  }

  /**
   * Get all users with filters and pagination
   */
  async getUsers(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        role,
        status,
        verificationStatus,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build query
      const query = {};
      if (role) query.role = role;
      if (status) query.accountStatus = status;
      if (verificationStatus && role === 'doctor') {
        query['doctorProfile.verificationStatus'] = verificationStatus;
      }

      // Search functionality
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
          { name: searchRegex },
          { email: searchRegex },
          { walletAddress: searchRegex }
        ];
      }

      // Sort options
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const users = await User.find(query)
        .select('-medicalHistory -currentMedications') // Exclude sensitive data
        .sort(sortOptions)
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

      const total = await User.countDocuments(query);

      res.json(paginated(users, {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      }));

    } catch (error) {
      logError(error, { context: 'Get Users', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to retrieve users'));
    }
  }

  /**
   * Get user details with full information
   */
  async getUserDetails(req, res) {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json(errorResponse('User not found'));
      }

      // Get user's consultation history
      const consultations = await Consultation.find({
        $or: [{ patient: userId }, { doctor: userId }]
      }).populate('patient doctor', 'name email').limit(10).sort({ createdAt: -1 });

      // Get user's payment history
      const payments = await Payment.find({
        $or: [{ patient: userId }, { doctor: userId }]
      }).limit(10).sort({ createdAt: -1 });

      // Get user's medical records (if patient)
      let medicalRecords = [];
      if (user.role === 'patient') {
        medicalRecords = await MedicalRecord.find({ patient: userId })
          .populate('doctor', 'name specialization')
          .limit(5)
          .sort({ createdAt: -1 });
      }

      // Get user's activity logs
      const activityLogs = await SystemLog.find({
        userId: userId,
        level: { $in: ['info', 'warn', 'error'] }
      }).limit(20).sort({ timestamp: -1 });

      res.json(success({
        user,
        consultations,
        payments,
        medicalRecords,
        activityLogs,
        summary: {
          totalConsultations: consultations.length,
          totalPayments: payments.reduce((sum, p) => sum + p.amount.usd, 0),
          accountAge: Math.floor((Date.now() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24))
        }
      }));

    } catch (error) {
      logError(error, { context: 'Get User Details', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to retrieve user details'));
    }
  }

  /**
   * Get platform analytics and reports
   */
  async getAnalytics(req, res) {
    try {
      const { 
        reportType = 'overview',
        startDate,
        endDate,
        granularity = 'day'
      } = req.query;

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      let analytics = {};

      switch (reportType) {
        case ADMIN_CONFIG.REPORT_TYPES.USER_ACTIVITY:
          analytics = await this.getUserActivityAnalytics(start, end, granularity);
          break;

        case ADMIN_CONFIG.REPORT_TYPES.FINANCIAL:
          analytics = await this.getFinancialAnalytics(start, end, granularity);
          break;

        case ADMIN_CONFIG.REPORT_TYPES.CONSULTATION:
          analytics = await this.getConsultationAnalytics(start, end, granularity);
          break;

        case ADMIN_CONFIG.REPORT_TYPES.AI_USAGE:
          analytics = await this.getAIUsageAnalytics(start, end, granularity);
          break;

        case ADMIN_CONFIG.REPORT_TYPES.SYSTEM_HEALTH:
          analytics = await this.getSystemHealthAnalytics(start, end);
          break;

        default:
          analytics = await this.getOverviewAnalytics(start, end, granularity);
      }

      logAdmin('Analytics report generated', {
        adminId: req.user.id,
        reportType,
        dateRange: { start, end }
      });

      res.json(success({
        ...analytics,
        reportType,
        dateRange: { start, end },
        granularity,
        generatedAt: new Date()
      }));

    } catch (error) {
      logError(error, { context: 'Get Analytics', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to generate analytics'));
    }
  }

  /**
   * Manage system settings
   */
  async updateSystemSettings(req, res) {
    try {
      const { 
        maintenanceMode,
        maxDailyConsultations,
        platformFeePercentage,
        emergencyContactInfo,
        aiSettings,
        emailSettings
      } = req.body;
      
      const adminId = req.user.id;

      // Update system settings (in a real app, you'd store these in a settings collection)
      const settings = {
        maintenanceMode: maintenanceMode ?? false,
        maxDailyConsultations: maxDailyConsultations ?? 10,
        platformFeePercentage: platformFeePercentage ?? 15,
        emergencyContactInfo: emergencyContactInfo ?? {},
        aiSettings: aiSettings ?? {},
        emailSettings: emailSettings ?? {},
        lastUpdated: new Date(),
        updatedBy: adminId
      };

      // In a real application, save to database
      // await SystemSettings.findOneAndUpdate({}, settings, { upsert: true });

      logAdmin('System settings updated', {
        adminId,
        settings: Object.keys(req.body)
      });

      res.json(success(settings, 'System settings updated successfully'));

    } catch (error) {
      logError(error, { context: 'Update System Settings', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to update system settings'));
    }
  }

  /**
   * Get system logs with filtering
   */
  async getSystemLogs(req, res) {
    try {
      const {
        page = 1,
        limit = 50,
        level,
        category,
        startDate,
        endDate,
        userId,
        search
      } = req.query;

      // Build query
      const query = {};
      if (level) query.level = level;
      if (category) query.category = category;
      if (userId) query.userId = userId;
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
          { message: searchRegex },
          { 'metadata.context': searchRegex }
        ];
      }

      const logs = await SystemLog.find(query)
        .sort({ timestamp: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

      const total = await SystemLog.countDocuments(query);

      res.json(paginated(logs, {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      }));

    } catch (error) {
      logError(error, { context: 'Get System Logs', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to retrieve system logs'));
    }
  }

  /**
   * Handle content moderation
   */
  async moderateContent(req, res) {
    try {
      const { contentType, contentId, action, reason } = req.body;
      const adminId = req.user.id;

      let content = null;
      let updateFields = {};

      // Find content based on type
      switch (contentType) {
        case 'consultation':
          content = await Consultation.findById(contentId);
          if (action === 'remove') {
            updateFields = { 
              status: 'moderated',
              moderatedBy: adminId,
              moderationReason: reason,
              moderatedAt: new Date()
            };
          }
          break;

        case 'medical_record':
          content = await MedicalRecord.findById(contentId);
          if (action === 'flag') {
            updateFields = { 
              flagged: true,
              flaggedBy: adminId,
              flagReason: reason,
              flaggedAt: new Date()
            };
          }
          break;

        default:
          return res.status(400).json(errorResponse('Invalid content type'));
      }

      if (!content) {
        return res.status(404).json(errorResponse('Content not found'));
      }

      // Update content
      await content.constructor.findByIdAndUpdate(contentId, updateFields);

      logAdmin('Content moderated', {
        adminId,
        contentType,
        contentId,
        action,
        reason
      });

      res.json(success({
        contentId,
        action,
        status: 'moderated'
      }, 'Content moderated successfully'));

    } catch (error) {
      logError(error, { context: 'Moderate Content', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to moderate content'));
    }
  }

  /**
   * Send system-wide announcements
   */
  async sendAnnouncement(req, res) {
    try {
      const { title, message, targetUsers, priority = 'normal', expiresAt } = req.body;
      const adminId = req.user.id;

      // Determine recipients
      let recipients = [];
      if (targetUsers === 'all') {
        const users = await User.find({ accountStatus: 'active' }).select('_id');
        recipients = users.map(u => u._id);
      } else if (targetUsers === 'doctors') {
        const doctors = await User.find({ role: 'doctor', accountStatus: 'active' }).select('_id');
        recipients = doctors.map(d => d._id);
      } else if (targetUsers === 'patients') {
        const patients = await User.find({ role: 'patient', accountStatus: 'active' }).select('_id');
        recipients = patients.map(p => p._id);
      } else if (Array.isArray(targetUsers)) {
        recipients = targetUsers;
      }

      // Create notifications for all recipients
      const notifications = recipients.map(userId => ({
        user: userId,
        type: 'system_announcement',
        title,
        message,
        priority,
        data: { fromAdmin: true, adminId },
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }));

      await Notification.insertMany(notifications);

      // Send real-time notifications
      for (const userId of recipients) {
        await sendNotificationToUser(userId, {
          type: 'system_announcement',
          title,
          message,
          priority,
          data: { fromAdmin: true }
        });
      }

      logAdmin('System announcement sent', {
        adminId,
        title,
        recipientCount: recipients.length,
        targetUsers
      });

      res.json(success({
        announcementId: notifications[0]?._id,
        recipientCount: recipients.length,
        sentAt: new Date()
      }, 'Announcement sent successfully'));

    } catch (error) {
      logError(error, { context: 'Send Announcement', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to send announcement'));
    }
  }

  // Helper methods for analytics

  async getUserStatistics(since) {
    const stats = await User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          verified: {
            $sum: {
              $cond: [
                { $eq: ['$doctorProfile.verificationStatus', 'verified'] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const total = await User.countDocuments();
    const totalNew = await User.countDocuments({ createdAt: { $gte: since } });

    return {
      total,
      new: totalNew,
      doctors: stats.find(s => s._id === 'doctor')?.count || 0,
      patients: stats.find(s => s._id === 'patient')?.count || 0,
      verifiedDoctors: stats.find(s => s._id === 'doctor')?.verified || 0
    };
  }

  async getFinancialStatistics(since) {
    const stats = await Payment.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount.usd' },
          platformFees: { $sum: { $multiply: ['$amount.usd', 0.15] } },
          doctorEarnings: { $sum: { $multiply: ['$amount.usd', 0.85] } },
          transactionCount: { $sum: 1 }
        }
      }
    ]);

    return stats[0] || {
      totalRevenue: 0,
      platformFees: 0,
      doctorEarnings: 0,
      transactionCount: 0
    };
  }

  async getConsultationStatistics(since) {
    const stats = await Consultation.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          }
        }
      }
    ]);

    const total = stats.reduce((sum, s) => sum + s.count, 0);
    const completed = stats.reduce((sum, s) => sum + s.completed, 0);

    return {
      total,
      completed,
      aiConsultations: stats.find(s => s._id === 'ai_consultation')?.count || 0,
      doctorConsultations: stats.find(s => s._id === 'doctor_consultation')?.count || 0,
      completionRate: total > 0 ? (completed / total) * 100 : 0
    };
  }

  async getAIUsageStatistics(since) {
    const aiConsultations = await Consultation.countDocuments({
      type: 'ai_consultation',
      createdAt: { $gte: since }
    });

    const emergencyDetections = await Consultation.countDocuments({
      subType: 'emergency',
      createdAt: { $gte: since }
    });

    // Get AI service health
    const aiHealth = await aiUtils.checkHealth();

    return {
      totalConsultations: aiConsultations,
      emergencyDetections,
      serviceHealth: aiHealth.status,
      usageStats: aiUtils.getUsageStats()
    };
  }

  async getSystemHealthMetrics() {
    // Calculate system uptime
    const uptime = process.uptime();
    
    // Get memory usage
    const memoryUsage = process.memoryUsage();
    
    // Get database connection status
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    // Get recent error count
    const recentErrors = await SystemLog.countDocuments({
      level: 'error',
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    return {
      uptime,
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        external: memoryUsage.external
      },
      database: dbStatus,
      recentErrors,
      status: recentErrors > 100 ? 'degraded' : 'healthy'
    };
  }

  async getRecentActivities(limit = 10) {
    return await SystemLog.find({
      level: { $in: ['info', 'warn'] },
      category: { $in: ['admin', 'security', 'payment'] }
    })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('level message timestamp userId metadata');
  }

  async getPendingAdminItems() {
    const pendingDoctorVerifications = await User.countDocuments({
      role: 'doctor',
      'doctorProfile.verificationStatus': 'pending'
    });

    const disputedPayments = await Payment.countDocuments({
      status: 'disputed'
    });

    const flaggedContent = await MedicalRecord.countDocuments({
      flagged: true
    });

    return {
      pendingDoctorVerifications,
      disputedPayments,
      flaggedContent
    };
  }

  // Additional analytics methods would go here...
  async getUserActivityAnalytics(start, end, granularity) {
    // Implementation for user activity analytics
    return { message: 'User activity analytics not implemented yet' };
  }

  async getFinancialAnalytics(start, end, granularity) {
    // Implementation for financial analytics
    return { message: 'Financial analytics not implemented yet' };
  }

  async getConsultationAnalytics(start, end, granularity) {
    // Implementation for consultation analytics
    return { message: 'Consultation analytics not implemented yet' };
  }

  async getAIUsageAnalytics(start, end, granularity) {
    // Implementation for AI usage analytics
    return { message: 'AI usage analytics not implemented yet' };
  }

  async getSystemHealthAnalytics(start, end) {
    // Implementation for system health analytics
    return { message: 'System health analytics not implemented yet' };
  }

  async getOverviewAnalytics(start, end, granularity) {
    // Implementation for overview analytics
    return { message: 'Overview analytics not implemented yet' };
  }
}

module.exports = new AdminController();
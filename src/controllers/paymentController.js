const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Consultation = require('../models/Consultation');
const User = require('../models/User');
const { ethers } = require('ethers');
const { logError, logSecurity, logInfo } = require('../utils/logger');
const { success, error: errorResponse } = require('../utils/helpers').responseUtils;
const { sendEmail } = require('../utils/email');
const { sendNotificationToUser } = require('../sockets/notifications');

// Payment configuration
const PAYMENT_CONFIG = {
  // Supported cryptocurrencies
  SUPPORTED_TOKENS: {
    ETH: {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      contractAddress: null // Native token
    },
    USDC: {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      contractAddress: process.env.USDC_CONTRACT_ADDRESS
    },
    USDT: {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      contractAddress: process.env.USDT_CONTRACT_ADDRESS
    },
    HFT: {
      symbol: 'HFT',
      name: 'HealthFriend Token',
      decimals: 18,
      contractAddress: process.env.HFT_CONTRACT_ADDRESS
    }
  },
  
  // Service pricing (in USD)
  SERVICE_PRICES: {
    AI_CONSULTATION: 5.00,
    DOCTOR_CONSULTATION: 50.00,
    SPECIALIST_CONSULTATION: 100.00,
    EMERGENCY_CONSULTATION: 150.00,
    PRESCRIPTION_REVIEW: 25.00,
    MEDICAL_RECORD_ANALYSIS: 15.00
  },

  // Payment status
  STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REFUNDED: 'refunded',
    DISPUTED: 'disputed'
  }
};

class PaymentController {
  /**
   * Create payment intent for consultation
   */
  async createPaymentIntent(req, res) {
    try {
      const { consultationId, paymentMethod, tokenSymbol } = req.body;
      const userId = req.user.id;

      // Validate consultation exists and belongs to user
      const consultation = await Consultation.findOne({
        _id: consultationId,
        patient: userId,
        status: 'pending_payment'
      });

      if (!consultation) {
        return res.status(404).json(errorResponse('Consultation not found or already paid'));
      }

      // Calculate payment amount
      const servicePrice = PAYMENT_CONFIG.SERVICE_PRICES[consultation.type.toUpperCase()] || 50;
      
      // Get token price (in a real app, you'd fetch from an oracle or API)
      const tokenPrice = await this.getTokenPrice(tokenSymbol);
      const tokenAmount = servicePrice / tokenPrice;

      // Create payment record
      const payment = new Payment({
        consultation: consultationId,
        patient: userId,
        doctor: consultation.doctor,
        amount: {
          usd: servicePrice,
          token: tokenAmount,
          symbol: tokenSymbol
        },
        paymentMethod,
        status: PAYMENT_CONFIG.STATUS.PENDING,
        transactionHash: null,
        blockNumber: null,
        metadata: {
          tokenContract: PAYMENT_CONFIG.SUPPORTED_TOKENS[tokenSymbol]?.contractAddress,
          exchangeRate: tokenPrice,
          createdAt: new Date()
        }
      });

      await payment.save();

      // Update consultation with payment reference
      consultation.payment = payment._id;
      await consultation.save();

      logInfo('Payment intent created', { 
        userId, 
        consultationId, 
        paymentId: payment._id,
        amount: servicePrice 
      });

      res.json(success({
        paymentId: payment._id,
        amount: {
          usd: servicePrice,
          token: tokenAmount,
          symbol: tokenSymbol
        },
        recipientAddress: process.env.PAYMENT_WALLET_ADDRESS,
        tokenContract: PAYMENT_CONFIG.SUPPORTED_TOKENS[tokenSymbol]?.contractAddress
      }, 'Payment intent created successfully'));

    } catch (error) {
      logError(error, { context: 'Create Payment Intent', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to create payment intent'));
    }
  }

  /**
   * Verify blockchain payment
   */
  async verifyPayment(req, res) {
    try {
      const { paymentId, transactionHash } = req.body;
      const userId = req.user.id;

      // Find payment record
      const payment = await Payment.findOne({
        _id: paymentId,
        patient: userId,
        status: PAYMENT_CONFIG.STATUS.PENDING
      }).populate('consultation');

      if (!payment) {
        return res.status(404).json(errorResponse('Payment not found'));
      }

      // Verify transaction on blockchain
      const verification = await this.verifyBlockchainTransaction(
        transactionHash,
        payment.amount.token,
        payment.amount.symbol,
        process.env.PAYMENT_WALLET_ADDRESS
      );

      if (!verification.isValid) {
        logSecurity('Invalid payment verification attempted', {
          userId,
          paymentId,
          transactionHash,
          reason: verification.reason
        });
        
        return res.status(400).json(errorResponse('Payment verification failed', 400, {
          reason: verification.reason
        }));
      }

      // Update payment status
      payment.status = PAYMENT_CONFIG.STATUS.COMPLETED;
      payment.transactionHash = transactionHash;
      payment.blockNumber = verification.blockNumber;
      payment.confirmedAt = new Date();
      await payment.save();

      // Update consultation status
      const consultation = payment.consultation;
      consultation.status = 'confirmed';
      consultation.paymentStatus = 'paid';
      await consultation.save();

      // Process doctor payment (85% to doctor, 15% platform fee)
      await this.processDoctorPayment(payment);

      // Send notifications
      await this.sendPaymentNotifications(payment);

      logInfo('Payment verified and processed', {
        userId,
        paymentId,
        transactionHash,
        consultationId: consultation._id
      });

      res.json(success({
        paymentId: payment._id,
        transactionHash,
        status: 'completed',
        consultationId: consultation._id
      }, 'Payment verified successfully'));

    } catch (error) {
      logError(error, { context: 'Verify Payment', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to verify payment'));
    }
  }

  /**
   * Get payment history for user
   */
  async getPaymentHistory(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, status, startDate, endDate } = req.query;

      // Build query
      const query = { patient: userId };
      
      if (status) {
        query.status = status;
      }
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      // Execute query with pagination
      const payments = await Payment.find(query)
        .populate('consultation', 'type scheduledDateTime doctor status')
        .populate('doctor', 'name specialization profileImage')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

      const total = await Payment.countDocuments(query);

      res.json(success({
        payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }));

    } catch (error) {
      logError(error, { context: 'Get Payment History', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to retrieve payment history'));
    }
  }

  /**
   * Get payment details
   */
  async getPaymentDetails(req, res) {
    try {
      const { paymentId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Build query based on user role
      let query = { _id: paymentId };
      if (userRole === 'patient') {
        query.patient = userId;
      } else if (userRole === 'doctor') {
        query.doctor = userId;
      }
      // Admin can view any payment

      const payment = await Payment.findOne(query)
        .populate('patient', 'name email walletAddress')
        .populate('doctor', 'name email specialization')
        .populate('consultation', 'type scheduledDateTime status duration notes');

      if (!payment) {
        return res.status(404).json(errorResponse('Payment not found'));
      }

      res.json(success(payment));

    } catch (error) {
      logError(error, { context: 'Get Payment Details', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to retrieve payment details'));
    }
  }

  /**
   * Process refund
   */
  async processRefund(req, res) {
    try {
      const { paymentId, reason } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Find payment
      let query = { _id: paymentId, status: PAYMENT_CONFIG.STATUS.COMPLETED };
      if (userRole === 'patient') {
        query.patient = userId;
      }

      const payment = await Payment.findOne(query)
        .populate('consultation')
        .populate('patient', 'name email');

      if (!payment) {
        return res.status(404).json(errorResponse('Payment not found or not eligible for refund'));
      }

      // Check refund eligibility (e.g., consultation not started)
      const consultation = payment.consultation;
      const now = new Date();
      const consultationTime = new Date(consultation.scheduledDateTime);
      
      if (consultationTime <= now) {
        return res.status(400).json(errorResponse('Cannot refund after consultation has started'));
      }

      // Process refund (in a real app, you'd initiate blockchain transaction)
      payment.status = PAYMENT_CONFIG.STATUS.REFUNDED;
      payment.refundedAt = new Date();
      payment.refundReason = reason;
      await payment.save();

      // Update consultation status
      consultation.status = 'cancelled';
      consultation.cancellationReason = 'payment_refunded';
      await consultation.save();

      // Send notifications
      await sendNotificationToUser(payment.patient._id, {
        type: 'payment_refunded',
        title: 'Payment Refunded',
        message: `Your payment of $${payment.amount.usd} has been refunded.`,
        data: { paymentId: payment._id }
      });

      logInfo('Payment refunded', {
        paymentId,
        userId,
        reason,
        amount: payment.amount.usd
      });

      res.json(success({
        paymentId: payment._id,
        refundAmount: payment.amount,
        status: 'refunded'
      }, 'Refund processed successfully'));

    } catch (error) {
      logError(error, { context: 'Process Refund', userId: req.user?.id });
      res.status(500).json(errorResponse('Failed to process refund'));
    }
  }

  /**
   * Get payment analytics (Admin only)
   */
  async getPaymentAnalytics(req, res) {
    try {
      const { startDate, endDate, period = 'month' } = req.query;

      // Date range
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      // Aggregate payment data
      const analytics = await Payment.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            status: PAYMENT_CONFIG.STATUS.COMPLETED
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: period === 'day' ? { $dayOfMonth: '$createdAt' } : null
            },
            totalRevenue: { $sum: '$amount.usd' },
            totalTransactions: { $sum: 1 },
            averageTransaction: { $avg: '$amount.usd' },
            uniquePatients: { $addToSet: '$patient' }
          }
        },
        {
          $addFields: {
            uniquePatientCount: { $size: '$uniquePatients' }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
        }
      ]);

      // Token distribution
      const tokenStats = await Payment.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            status: PAYMENT_CONFIG.STATUS.COMPLETED
          }
        },
        {
          $group: {
            _id: '$amount.symbol',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount.token' },
            totalUSD: { $sum: '$amount.usd' }
          }
        }
      ]);

      res.json(success({
        analytics,
        tokenStats,
        period: {
          start,
          end,
          granularity: period
        }
      }));

    } catch (error) {
      logError(error, { context: 'Get Payment Analytics' });
      res.status(500).json(errorResponse('Failed to retrieve payment analytics'));
    }
  }

  // Helper methods

  /**
   * Get token price in USD
   */
  async getTokenPrice(symbol) {
    try {
      // In a real application, you'd fetch from a price oracle or API
      const prices = {
        ETH: 2000,
        USDC: 1,
        USDT: 1,
        HFT: 0.1
      };
      
      return prices[symbol] || 1;
    } catch (error) {
      logError(error, { context: 'Get Token Price' });
      return 1; // Fallback price
    }
  }

  /**
   * Verify blockchain transaction
   */
  async verifyBlockchainTransaction(txHash, expectedAmount, tokenSymbol, recipientAddress) {
    try {
      // Initialize provider
      const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
      
      // Get transaction receipt
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        return { isValid: false, reason: 'Transaction not found' };
      }

      if (!receipt.status) {
        return { isValid: false, reason: 'Transaction failed' };
      }

      // Get transaction details
      const transaction = await provider.getTransaction(txHash);
      
      // Verify recipient address
      if (transaction.to.toLowerCase() !== recipientAddress.toLowerCase()) {
        return { isValid: false, reason: 'Invalid recipient address' };
      }

      // Verify amount (simplified - in real app, handle token transfers properly)
      const actualAmount = parseFloat(ethers.utils.formatEther(transaction.value));
      const tolerance = 0.001; // 0.1% tolerance for gas fees
      
      if (Math.abs(actualAmount - expectedAmount) > tolerance) {
        return { isValid: false, reason: 'Amount mismatch' };
      }

      return {
        isValid: true,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice?.toString()
      };

    } catch (error) {
      logError(error, { context: 'Verify Blockchain Transaction' });
      return { isValid: false, reason: 'Verification failed' };
    }
  }

  /**
   * Process doctor payment
   */
  async processDoctorPayment(payment) {
    try {
      const doctorShare = payment.amount.usd * 0.85; // 85% to doctor
      const platformFee = payment.amount.usd * 0.15; // 15% platform fee

      // In a real application, you'd initiate payment to doctor's wallet
      // For now, we'll just log the transaction
      
      logInfo('Doctor payment processed', {
        paymentId: payment._id,
        doctorId: payment.doctor,
        doctorShare,
        platformFee
      });

      // Update doctor's earnings
      await User.findByIdAndUpdate(payment.doctor, {
        $inc: { 
          'earnings.total': doctorShare,
          'earnings.pending': doctorShare
        }
      });

    } catch (error) {
      logError(error, { context: 'Process Doctor Payment' });
    }
  }

  /**
   * Send payment notifications
   */
  async sendPaymentNotifications(payment) {
    try {
      // Notify patient
      await sendNotificationToUser(payment.patient, {
        type: 'payment_confirmed',
        title: 'Payment Confirmed',
        message: 'Your payment has been confirmed. Your consultation is now scheduled.',
        data: { paymentId: payment._id, consultationId: payment.consultation._id }
      });

      // Notify doctor
      await sendNotificationToUser(payment.doctor, {
        type: 'payment_received',
        title: 'Payment Received',
        message: 'You have received a new consultation booking.',
        data: { paymentId: payment._id, consultationId: payment.consultation._id }
      });

    } catch (error) {
      logError(error, { context: 'Send Payment Notifications' });
    }
  }
}

module.exports = new PaymentController();
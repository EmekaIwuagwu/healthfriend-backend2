const express = require('express');
const { body, query, param } = require('express-validator');
const paymentController = require('../controllers/paymentController');
const { 
  authenticateWallet, 
  authorize, 
  requireOwnership 
} = require('../middleware/auth');
const { 
  validatePaymentCreation,
  validatePaymentVerification,
  validateRefund,
  validateId,
  handleValidation 
} = require('../middleware/validation');
const { paymentRateLimit } = require('../middleware/rateLimit');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateWallet);

/**
 * @route   POST /api/payments/create-intent
 * @desc    Create payment intent for consultation
 * @access  Private (Patient only)
 */
router.post('/create-intent', [
  authorize('patient'),
  paymentRateLimit,
  body('consultationId')
    .isMongoId()
    .withMessage('Valid consultation ID is required'),
  body('paymentMethod')
    .isIn(['crypto', 'wallet'])
    .withMessage('Payment method must be crypto or wallet'),
  body('tokenSymbol')
    .isIn(['ETH', 'USDC', 'USDT', 'HFT'])
    .withMessage('Token symbol must be ETH, USDC, USDT, or HFT'),
  handleValidation
], paymentController.createPaymentIntent);

/**
 * @route   POST /api/payments/verify
 * @desc    Verify blockchain payment
 * @access  Private (Patient only)
 */
router.post('/verify', [
  authorize('patient'),
  body('paymentId')
    .isMongoId()
    .withMessage('Valid payment ID is required'),
  body('transactionHash')
    .isLength({ min: 66, max: 66 })
    .withMessage('Valid transaction hash is required'),
  handleValidation
], paymentController.verifyPayment);

/**
 * @route   GET /api/payments/history
 * @desc    Get payment history for user
 * @access  Private
 */
router.get('/history', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['pending', 'processing', 'completed', 'failed', 'refunded', 'disputed'])
    .withMessage('Invalid payment status'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid ISO date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid ISO date'),
  handleValidation
], paymentController.getPaymentHistory);

/**
 * @route   GET /api/payments/:paymentId
 * @desc    Get payment details
 * @access  Private (Owner or Admin)
 */
router.get('/:paymentId', [
  param('paymentId')
    .isMongoId()
    .withMessage('Valid payment ID is required'),
  handleValidation
], paymentController.getPaymentDetails);

/**
 * @route   POST /api/payments/refund
 * @desc    Process payment refund
 * @access  Private (Patient or Admin)
 */
router.post('/refund', [
  body('paymentId')
    .isMongoId()
    .withMessage('Valid payment ID is required'),
  body('reason')
    .isLength({ min: 10, max: 500 })
    .withMessage('Refund reason must be between 10 and 500 characters'),
  handleValidation
], paymentController.processRefund);

/**
 * @route   GET /api/payments/analytics/overview
 * @desc    Get payment analytics (Admin only)
 * @access  Private (Admin only)
 */
router.get('/analytics/overview', [
  authorize('admin'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid ISO date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid ISO date'),
  query('period')
    .optional()
    .isIn(['day', 'week', 'month', 'year'])
    .withMessage('Period must be day, week, month, or year'),
  handleValidation
], paymentController.getPaymentAnalytics);

/**
 * @route   GET /api/payments/tokens/supported
 * @desc    Get supported payment tokens
 * @access  Public
 */
router.get('/tokens/supported', (req, res) => {
  const supportedTokens = {
    ETH: {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      contractAddress: null,
      icon: '/tokens/eth.png'
    },
    USDC: {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      contractAddress: process.env.USDC_CONTRACT_ADDRESS,
      icon: '/tokens/usdc.png'
    },
    USDT: {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      contractAddress: process.env.USDT_CONTRACT_ADDRESS,
      icon: '/tokens/usdt.png'
    },
    HFT: {
      symbol: 'HFT',
      name: 'HealthFriend Token',
      decimals: 18,
      contractAddress: process.env.HFT_CONTRACT_ADDRESS,
      icon: '/tokens/hft.png'
    }
  };

  res.json({
    success: true,
    data: supportedTokens
  });
});

/**
 * @route   GET /api/payments/rates/current
 * @desc    Get current token exchange rates
 * @access  Public
 */
router.get('/rates/current', async (req, res) => {
  try {
    // In a real app, fetch from price oracle or API
    const rates = {
      ETH: 2000,
      USDC: 1,
      USDT: 1,
      HFT: 0.1,
      lastUpdated: new Date()
    };

    res.json({
      success: true,
      data: rates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch current rates'
    });
  }
});

/**
 * @route   POST /api/payments/webhook/blockchain
 * @desc    Webhook for blockchain payment confirmations
 * @access  Private (Webhook only)
 */
router.post('/webhook/blockchain', [
  body('transactionHash').notEmpty(),
  body('blockNumber').isNumeric(),
  body('status').isIn(['confirmed', 'failed']),
  handleValidation
], async (req, res) => {
  try {
    const { transactionHash, blockNumber, status } = req.body;
    
    // Verify webhook authenticity (implement signature verification)
    const webhookSecret = req.headers['x-webhook-secret'];
    if (webhookSecret !== process.env.BLOCKCHAIN_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized webhook' });
    }

    // Process blockchain confirmation
    // Implementation would depend on your blockchain monitoring service
    
    res.json({ success: true, processed: true });
  } catch (error) {
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * @route   GET /api/payments/dispute/:paymentId
 * @desc    Get payment dispute details
 * @access  Private (Admin only)
 */
router.get('/dispute/:paymentId', [
  authorize('admin'),
  param('paymentId').isMongoId(),
  handleValidation
], async (req, res) => {
  try {
    // Implementation for getting dispute details
    res.json({
      success: true,
      message: 'Dispute details endpoint - implementation pending'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve dispute details'
    });
  }
});

/**
 * @route   POST /api/payments/dispute/:paymentId/resolve
 * @desc    Resolve payment dispute
 * @access  Private (Admin only)
 */
router.post('/dispute/:paymentId/resolve', [
  authorize('admin'),
  param('paymentId').isMongoId(),
  body('resolution').isIn(['refund', 'no_action', 'partial_refund']),
  body('notes').isLength({ min: 10, max: 1000 }),
  handleValidation
], async (req, res) => {
  try {
    // Implementation for resolving disputes
    res.json({
      success: true,
      message: 'Dispute resolution endpoint - implementation pending'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to resolve dispute'
    });
  }
});

module.exports = router;
const User = require('../models/User');
const { 
  generateNonce, 
  verifySignature, 
  generateToken, 
  generateSecureToken
} = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const { logAuth, logSecurity, logError } = require('../utils/logger');
const { success, error: errorResponse } = require('../utils/helpers').responseUtils;
const { isValidEthereumAddress } = require('../utils/helpers').validationUtils;

class AuthController {
  // Get nonce for wallet signature
  async getNonce(req, res, next) {
    try {
      const { walletAddress } = req.body;
      const normalizedAddress = walletAddress.toLowerCase();

      // Check if user exists, if not create a temporary record
      let user = await User.findOne({ walletAddress: normalizedAddress });
      
      if (!user) {
        // Create temporary user record for nonce generation
        user = new User({
          walletAddress: normalizedAddress,
          firstName: 'Temp',
          lastName: 'User',
          email: `temp_${Date.now()}@temp.com`,
          role: 'patient',
          nonce: generateNonce()
        });
        await user.save();
      } else {
        // Generate new nonce for existing user
        user.nonce = generateNonce();
        await user.save();
      }

      // Generate signature message
      const message = `HealthFriend Authentication\n\nWallet: ${normalizedAddress}\nNonce: ${user.nonce}\nTimestamp: ${Date.now()}\n\nSign this message to authenticate with HealthFriend.`;

      logAuth(
        'nonce_generated',
        user._id,
        normalizedAddress,
        req.ip,
        req.get('User-Agent'),
        true
      );

      res.json(success({
        message,
        nonce: user.nonce,
        walletAddress: normalizedAddress
      }, 'Nonce generated successfully'));

    } catch (err) {
      logError(err, { 
        context: 'Nonce Generation',
        walletAddress: req.body.walletAddress,
        ip: req.ip
      });
      next(err);
    }
  }

  // Verify wallet signature and authenticate user
  async verifySignature(req, res, next) {
    try {
      const { walletAddress, signature, message } = req.body;
      const normalizedAddress = walletAddress.toLowerCase();

      // Find user by wallet address
      const user = await User.findOne({ walletAddress: normalizedAddress }).select('+nonce');
      
      if (!user) {
        logSecurity(
          'auth_verify_user_not_found',
          null,
          req.ip,
          req.get('User-Agent'),
          'medium',
          { walletAddress: normalizedAddress }
        );
        return res.status(401).json(errorResponse('User not found. Please register first.', 'USER_NOT_FOUND'));
      }

      // Verify the signature
      const isValidSignature = verifySignature(message, signature, normalizedAddress);
      
      if (!isValidSignature) {
        logSecurity(
          'auth_invalid_signature',
          user._id,
          req.ip,
          req.get('User-Agent'),
          'high',
          { walletAddress: normalizedAddress }
        );
        return res.status(401).json(errorResponse('Invalid signature', 'INVALID_SIGNATURE'));
      }

      // Check if user account is active
      if (!user.isActive) {
        logSecurity(
          'auth_inactive_account',
          user._id,
          req.ip,
          req.get('User-Agent'),
          'medium',
          { walletAddress: normalizedAddress }
        );
        return res.status(403).json(errorResponse('Account is inactive. Please contact support.', 'ACCOUNT_INACTIVE'));
      }

      // Check if user is banned
      if (user.isBanned) {
        logSecurity(
          'auth_banned_account',
          user._id,
          req.ip,
          req.get('User-Agent'),
          'high',
          { 
            walletAddress: normalizedAddress,
            banReason: user.banReason
          }
        );
        return res.status(403).json(errorResponse(
          `Account is banned. Reason: ${user.banReason || 'Terms violation'}`, 
          'ACCOUNT_BANNED'
        ));
      }

      // Update login information
      await user.updateLoginInfo();

      // Generate JWT token
      const token = generateToken(user._id, user.walletAddress, user.role);

      // Generate new nonce for next authentication
      user.nonce = generateNonce();
      await user.save();

      logAuth(
        'auth_success',
        user._id,
        user.walletAddress,
        req.ip,
        req.get('User-Agent'),
        true
      );

      // Prepare user data for response (exclude sensitive fields)
      const userData = {
        id: user._id,
        walletAddress: user.walletAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        avatar: user.avatar,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      };

      // Add role-specific data
      if (user.role === 'doctor' && user.doctorProfile) {
        userData.doctorProfile = {
          specialization: user.doctorProfile.specialization,
          isVerified: user.doctorProfile.isVerified,
          rating: user.doctorProfile.rating,
          totalReviews: user.doctorProfile.totalReviews,
          isAvailable: user.doctorProfile.isAvailable
        };
      }

      res.json(success({
        token,
        user: userData,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }, 'Authentication successful'));

    } catch (err) {
      logAuth(
        'auth_error',
        null,
        req.body.walletAddress,
        req.ip,
        req.get('User-Agent'),
        false,
        err.message
      );
      next(err);
    }
  }

  // Register new user
  async register(req, res, next) {
    try {
      const { walletAddress, firstName, lastName, email, phone, dateOfBirth, gender, role } = req.body;
      const normalizedAddress = walletAddress.toLowerCase();
      const normalizedEmail = email.toLowerCase();

      // Check if user already exists with this wallet or email
      const existingUser = await User.findOne({
        $or: [
          { walletAddress: normalizedAddress },
          { email: normalizedEmail }
        ]
      });

      if (existingUser) {
        let conflictField = 'wallet address';
        if (existingUser.email === normalizedEmail) {
          conflictField = 'email address';
        }
        
        logSecurity(
          'auth_registration_conflict',
          null,
          req.ip,
          req.get('User-Agent'),
          'medium',
          { 
            walletAddress: normalizedAddress,
            email: normalizedEmail,
            conflictField
          }
        );
        
        return res.status(409).json(errorResponse(
          `User already exists with this ${conflictField}`, 
          'USER_EXISTS'
        ));
      }

      // Create new user
      const newUser = new User({
        walletAddress: normalizedAddress,
        firstName,
        lastName,
        email: normalizedEmail,
        phone,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        gender,
        role,
        nonce: generateNonce(),
        isActive: true,
        isEmailVerified: false
      });

      // Initialize role-specific data
      if (role === 'doctor') {
        newUser.doctorProfile = {
          specialization: [],
          isVerified: false,
          isAvailable: false,
          rating: 0,
          totalReviews: 0,
          totalConsultations: 0,
          consultationFee: 0,
          homeVisitFee: 0,
          availability: [],
          totalEarnings: 0,
          pendingPayments: 0
        };
      }

      await newUser.save();

      // Generate email verification token
      const emailToken = generateSecureToken();
      newUser.emailVerificationToken = emailToken;
      newUser.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await newUser.save();

      // Send welcome email
      try {
        await sendEmail(normalizedEmail, 'welcome', {
          firstName,
          lastName,
          email: normalizedEmail,
          walletAddress: normalizedAddress,
          role
        });

        // Send email verification
        await sendEmail(normalizedEmail, 'emailVerification', {
          firstName,
          lastName
        }, emailToken);
        
      } catch (emailError) {
        logError(emailError, { 
          context: 'Registration Email',
          userId: newUser._id,
          email: normalizedEmail
        });
        // Don't fail registration if email fails
      }

      logAuth(
        'user_registered',
        newUser._id,
        normalizedAddress,
        req.ip,
        req.get('User-Agent'),
        true
      );

      // Prepare response data
      const userData = {
        id: newUser._id,
        walletAddress: newUser.walletAddress,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        role: newUser.role,
        isEmailVerified: newUser.isEmailVerified,
        createdAt: newUser.createdAt
      };

      res.status(201).json(success(userData, 'User registered successfully. Please check your email for verification.'));

    } catch (err) {
      logError(err, { 
        context: 'User Registration',
        walletAddress: req.body.walletAddress,
        email: req.body.email,
        ip: req.ip
      });
      next(err);
    }
  }

  // Get current user information
  async getCurrentUser(req, res, next) {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
      }

      // Prepare user data based on role
      let userData = {
        id: user._id,
        walletAddress: user.walletAddress,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth,
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
        notificationPreferences: user.notificationPreferences,
        privacySettings: user.privacySettings
      };

      // Add medical info for patients
      if (user.role === 'patient' && user.medicalInfo) {
        userData.medicalInfo = user.medicalInfo;
      }

      // Add doctor profile for doctors
      if (user.role === 'doctor' && user.doctorProfile) {
        userData.doctorProfile = user.doctorProfile;
      }

      res.json(success(userData, 'User information retrieved successfully'));

    } catch (err) {
      logError(err, { 
        context: 'Get User Info',
        userId: req.user.id
      });
      next(err);
    }
  }

  // Verify email address
  async verifyEmail(req, res, next) {
    try {
      const { token } = req.body;

      // Find user by verification token
      const user = await User.findOne({
        emailVerificationToken: token,
        emailVerificationExpires: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json(errorResponse('Invalid or expired verification token', 'INVALID_TOKEN'));
      }

      // Verify email
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();

      logAuth(
        'email_verified',
        user._id,
        user.walletAddress,
        req.ip,
        req.get('User-Agent'),
        true
      );

      res.json(success({ emailVerified: true }, 'Email verified successfully'));

    } catch (err) {
      logError(err, { 
        context: 'Email Verification',
        token: req.body.token,
        ip: req.ip
      });
      next(err);
    }
  }

  // Resend email verification
  async resendVerification(req, res, next) {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json(errorResponse('User not found', 'USER_NOT_FOUND'));
      }

      if (user.isEmailVerified) {
        return res.status(400).json(errorResponse('Email is already verified', 'EMAIL_ALREADY_VERIFIED'));
      }

      // Generate new verification token
      const emailToken = generateSecureToken();
      user.emailVerificationToken = emailToken;
      user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await user.save();

      // Send verification email
      try {
        await sendEmail(user.email, 'emailVerification', {
          firstName: user.firstName,
          lastName: user.lastName
        }, emailToken);
        
        res.json(success(null, 'Verification email sent successfully'));
      } catch (emailError) {
        logError(emailError, { 
          context: 'Resend Verification Email',
          userId: user._id
        });
        res.status(500).json(errorResponse('Failed to send verification email', 'EMAIL_SEND_FAILED'));
      }

    } catch (err) {
      logError(err, { 
        context: 'Resend Email Verification',
        userId: req.user.id
      });
      next(err);
    }
  }

  // Refresh authentication token
  async refreshToken(req, res, next) {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user || !user.isActive) {
        return res.status(401).json(errorResponse('Invalid user or account inactive', 'INVALID_USER'));
      }

      // Generate new token
      const newToken = generateToken(user._id, user.walletAddress, user.role);

      logAuth(
        'token_refreshed',
        user._id,
        user.walletAddress,
        req.ip,
        req.get('User-Agent'),
        true
      );

      res.json(success({
        token: newToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
      }, 'Token refreshed successfully'));

    } catch (err) {
      logError(err, { 
        context: 'Token Refresh',
        userId: req.user.id
      });
      next(err);
    }
  }

  // Request password reset (backup auth method)
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        return res.status(404).json(errorResponse('No account found with this email address', 'USER_NOT_FOUND'));
      }

      // Generate reset token
      const resetToken = generateSecureToken();
      user.passwordResetToken = resetToken;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();

      // Send reset email
      try {
        await sendEmail(user.email, 'passwordReset', {
          firstName: user.firstName,
          lastName: user.lastName
        }, resetToken);
        
        logAuth(
          'password_reset_requested',
          user._id,
          user.walletAddress,
          req.ip,
          req.get('User-Agent'),
          true
        );

        res.json(success(null, 'Password reset instructions sent to your email'));
      } catch (emailError) {
        logError(emailError, { 
          context: 'Password Reset Email',
          userId: user._id
        });
        res.status(500).json(errorResponse('Failed to send reset email', 'EMAIL_SEND_FAILED'));
      }

    } catch (err) {
      logError(err, { 
        context: 'Forgot Password',
        email: req.body.email,
        ip: req.ip
      });
      next(err);
    }
  }

  // Logout user (mainly for logging purposes)
  async logout(req, res, next) {
    try {
      const user = await User.findById(req.user.id);
      
      if (user) {
        // Generate new nonce to invalidate current signatures
        user.nonce = generateNonce();
        await user.save();
      }

      logAuth(
        'user_logout',
        req.user.id,
        req.user.walletAddress,
        req.ip,
        req.get('User-Agent'),
        true
      );

      res.json(success(null, 'Logged out successfully'));

    } catch (err) {
      logError(err, { 
        context: 'User Logout',
        userId: req.user.id
      });
      next(err);
    }
  }

  // Check if email is already registered
  async checkEmail(req, res, next) {
    try {
      const { email } = req.query;
      const user = await User.findOne({ email: email.toLowerCase() });
      
      res.json(success({
        exists: !!user,
        isVerified: user ? user.isEmailVerified : false
      }, 'Email check completed'));

    } catch (err) {
      logError(err, { 
        context: 'Check Email',
        email: req.query.email
      });
      next(err);
    }
  }

  // Check if wallet is already registered
  async checkWallet(req, res, next) {
    try {
      const { walletAddress } = req.query;
      const user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
      
      res.json(success({
        exists: !!user,
        role: user ? user.role : null
      }, 'Wallet check completed'));

    } catch (err) {
      logError(err, { 
        context: 'Check Wallet',
        walletAddress: req.query.walletAddress
      });
      next(err);
    }
  }
}

module.exports = new AuthController();
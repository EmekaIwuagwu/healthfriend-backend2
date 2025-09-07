const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Wallet & Web3 Authentication
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  nonce: {
    type: String,
    required: true,
    default: () => Math.floor(Math.random() * 1000000).toString()
  },
  
  // Basic Information
  firstName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  lastName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true
  },
  phone: { 
    type: String, 
    trim: true 
  },
  dateOfBirth: { 
    type: Date 
  },
  gender: { 
    type: String, 
    enum: ['male', 'female', 'other', 'prefer_not_to_say'] 
  },
  avatar: { 
    type: String, 
    default: null 
  },
  bio: { 
    type: String, 
    maxlength: 500 
  },
  
  // Role & Permissions
  role: { 
    type: String, 
    enum: ['patient', 'doctor', 'admin'], 
    default: 'patient' 
  },
  
  // Account Status
  isActive: { 
    type: Boolean, 
    default: true 
  },
  emailVerified: { 
    type: Boolean, 
    default: false 
  },
  profileComplete: {
    type: Boolean,
    default: false
  },
  
  // Activity Tracking
  lastLogin: { 
    type: Date, 
    default: null 
  },
  loginCount: { 
    type: Number, 
    default: 0 
  },
  
  // Doctor-specific Profile
  doctorProfile: {
    licenseNumber: { 
      type: String, 
      trim: true 
    },
    specialization: [{
      type: String,
      enum: [
        'general_medicine',
        'cardiology',
        'dermatology',
        'neurology',
        'pediatrics',
        'psychiatry',
        'orthopedics',
        'gynecology',
        'ophthalmology',
        'ent',
        'urology',
        'oncology'
      ]
    }],
    consultationFee: { 
      type: Number, 
      min: 0,
      default: 25
    },
    homeVisitFee: { 
      type: Number, 
      min: 0,
      default: 100
    },
    rating: { 
      type: Number, 
      min: 0, 
      max: 5, 
      default: 0 
    },
    totalReviews: { 
      type: Number, 
      default: 0 
    },
    isVerified: { 
      type: Boolean, 
      default: false 
    },
    isAvailable: { 
      type: Boolean, 
      default: true 
    }
  },
  
  // Medical Information (for patients)
  medicalInfo: {
    bloodType: { 
      type: String, 
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'],
      default: 'unknown'
    },
    allergies: [{
      allergen: String,
      severity: { 
        type: String, 
        enum: ['mild', 'moderate', 'severe'] 
      }
    }]
  },
  
  // Preferences
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    },
    language: { 
      type: String, 
      default: 'en' 
    }
  }
}, {
  timestamps: true
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Simple indexes (no duplicates - walletAddress and email already indexed by unique: true)
userSchema.index({ role: 1 });

// Instance methods
userSchema.methods.generateNewNonce = function() {
  this.nonce = Math.floor(Math.random() * 1000000).toString();
  return this.nonce;
};

userSchema.methods.updateLoginInfo = function() {
  this.lastLogin = new Date();
  this.loginCount += 1;
  return this.save();
};

// Static methods
userSchema.statics.findByWalletAddress = function(walletAddress) {
  return this.findOne({ walletAddress: walletAddress.toLowerCase() });
};

module.exports = mongoose.model('User', userSchema);
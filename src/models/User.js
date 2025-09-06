const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Wallet & Web3 Authentication
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid Ethereum wallet address format'
    }
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
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  lastName: { 
    type: String, 
    required: true, 
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  phone: { 
    type: String, 
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^\+?[1-9]\d{1,14}$/.test(v);
      },
      message: 'Please enter a valid phone number'
    }
  },
  dateOfBirth: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v < new Date();
      },
      message: 'Date of birth cannot be in the future'
    }
  },
  gender: { 
    type: String, 
    enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    default: 'prefer_not_to_say'
  },
  
  // Role Management
  role: { 
    type: String, 
    enum: ['patient', 'doctor', 'admin'], 
    required: true,
    index: true,
    default: 'patient'
  },
  
  // Profile Information
  avatar: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    maxlength: 500,
    trim: true
  },
  languages: [{
    type: String,
    trim: true
  }],
  
  // Address Information
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true },
    zipCode: { type: String, trim: true },
    coordinates: {
      latitude: {
        type: Number,
        min: -90,
        max: 90
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180
      }
    }
  },
  
  // Patient-specific Medical Information
  medicalInfo: {
    bloodType: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']
    },
    height: {
      type: Number,
      min: 30,
      max: 300
    }, // in cm
    weight: {
      type: Number,
      min: 1,
      max: 1000
    }, // in kg
    medicalHistory: [{
      condition: { type: String, required: true, trim: true },
      diagnosedDate: { type: Date, required: true },
      doctor: { type: String, trim: true },
      notes: { type: String, trim: true },
      isActive: { type: Boolean, default: true },
      severity: {
        type: String,
        enum: ['mild', 'moderate', 'severe'],
        default: 'moderate'
      }
    }],
    allergies: [{
      allergen: { type: String, required: true, trim: true },
      severity: { 
        type: String, 
        enum: ['mild', 'moderate', 'severe'],
        required: true
      },
      reaction: { type: String, trim: true },
      diagnosedDate: Date,
      notes: String
    }],
    currentMedications: [{
      medication: { type: String, required: true, trim: true },
      dosage: { type: String, required: true, trim: true },
      frequency: { type: String, required: true, trim: true },
      startDate: { type: Date, required: true },
      endDate: Date,
      prescribedBy: { type: String, trim: true },
      notes: String,
      isActive: { type: Boolean, default: true }
    }],
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      relationship: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true }
    },
    insuranceInfo: {
      provider: String,
      policyNumber: String,
      groupNumber: String,
      expiryDate: Date
    }
  },
  
  // Doctor-specific Information
  doctorProfile: {
    specialization: [{
      type: String,
      trim: true,
      enum: [
        'General Practice',
        'Internal Medicine',
        'Pediatrics',
        'Cardiology',
        'Dermatology',
        'Endocrinology',
        'Gastroenterology',
        'Neurology',
        'Orthopedics',
        'Psychiatry',
        'Radiology',
        'Surgery',
        'Gynecology',
        'Ophthalmology',
        'ENT',
        'Urology',
        'Oncology',
        'Emergency Medicine',
        'Family Medicine',
        'Anesthesiology'
      ]
    }],
    licenseNumber: {
      type: String,
      trim: true,
      sparse: true,
      index: true
    },
    yearsExperience: {
      type: Number,
      min: 0,
      max: 70
    },
    education: [{
      degree: { type: String, required: true, trim: true },
      institution: { type: String, required: true, trim: true },
      year: { 
        type: Number, 
        required: true,
        min: 1950,
        max: new Date().getFullYear()
      },
      country: String
    }],
    certifications: [{
      name: { type: String, required: true, trim: true },
      issuedBy: { type: String, required: true, trim: true },
      issuedDate: { type: Date, required: true },
      expiryDate: Date,
      certificateNumber: String,
      isActive: { type: Boolean, default: true }
    }],
    consultationFee: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 10000
    }, // in USD
    homeVisitFee: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 10000
    },
    isVerified: { type: Boolean, default: false },
    verificationDate: Date,
    verificationDocuments: [{
      fileName: String,
      filePath: String,
      documentType: {
        type: String,
        enum: ['license', 'degree', 'certification', 'id', 'other']
      },
      uploadedAt: { type: Date, default: Date.now },
      verificationStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
      }
    }],
    
    // Availability & Ratings
    isAvailable: { type: Boolean, default: true },
    rating: { 
      type: Number, 
      default: 0, 
      min: 0, 
      max: 5 
    },
    totalReviews: { type: Number, default: 0 },
    totalConsultations: { type: Number, default: 0 },
    
    // Schedule
    availability: [{
      day: { 
        type: String, 
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        required: true
      },
      startTime: { 
        type: String, 
        required: true,
        validate: {
          validator: function(v) {
            return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: 'Please enter time in HH:MM format'
        }
      },
      endTime: { 
        type: String, 
        required: true,
        validate: {
          validator: function(v) {
            return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: 'Please enter time in HH:MM format'
        }
      },
      isAvailable: { type: Boolean, default: true },
      timezone: { type: String, default: 'UTC' }
    }],
    
    // Financial
    totalEarnings: { type: Number, default: 0, min: 0 },
    pendingPayments: { type: Number, default: 0, min: 0 },
    
    // Additional Info
    about: { type: String, maxlength: 1000 },
    servicesOffered: [{
      type: String,
      enum: ['video_consultation', 'home_visit', 'ai_consultation', 'prescription', 'follow_up']
    }],
    acceptsInsurance: { type: Boolean, default: false },
    acceptedInsurances: [String]
  },
  
  // Account Status
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  isBanned: { type: Boolean, default: false },
  banReason: String,
  banDate: Date,
  lastLogin: Date,
  loginCount: { type: Number, default: 0 },
  
  // Password reset (backup authentication)
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Privacy settings
  privacySettings: {
    shareDataForResearch: { type: Boolean, default: false },
    allowMarketing: { type: Boolean, default: false },
    shareProfileWithDoctors: { type: Boolean, default: true }
  },
  
  // Notification preferences
  notificationPreferences: {
    email: { type: Boolean, default: true },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: true },
    consultationReminders: { type: Boolean, default: true },
    paymentNotifications: { type: Boolean, default: true },
    marketingEmails: { type: Boolean, default: false }
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.nonce;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationExpires;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for age
userSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
});

// Virtual for doctor rating summary
userSchema.virtual('doctorProfile.ratingStars').get(function() {
  if (this.role !== 'doctor' || !this.doctorProfile.rating) return 0;
  return Math.round(this.doctorProfile.rating * 2) / 2; // Round to nearest 0.5
});

// Indexes
userSchema.index({ walletAddress: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'doctorProfile.specialization': 1 });
userSchema.index({ 'doctorProfile.isVerified': 1 });
userSchema.index({ 'doctorProfile.isAvailable': 1 });
userSchema.index({ 'doctorProfile.rating': -1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// Text search index
userSchema.index({
  firstName: 'text',
  lastName: 'text',
  'doctorProfile.specialization': 'text',
  bio: 'text'
}, {
  weights: {
    firstName: 10,
    lastName: 10,
    'doctorProfile.specialization': 5,
    bio: 1
  }
});

// Pre-save middleware
userSchema.pre('save', function(next) {
  // Update the updatedAt field
  this.updatedAt = new Date();
  
  // Generate new nonce if wallet address changed
  if (this.isModified('walletAddress') && !this.isNew) {
    this.nonce = Math.floor(Math.random() * 1000000).toString();
  }
  
  // Validate doctor-specific fields
  if (this.role === 'doctor') {
    if (!this.doctorProfile.specialization || this.doctorProfile.specialization.length === 0) {
      return next(new Error('Doctor must have at least one specialization'));
    }
  }
  
  next();
});

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

userSchema.methods.addMedicalHistory = function(condition, diagnosedDate, doctor, notes) {
  this.medicalInfo.medicalHistory.push({
    condition,
    diagnosedDate,
    doctor,
    notes,
    isActive: true
  });
  return this.save();
};

userSchema.methods.addAllergy = function(allergen, severity, reaction) {
  this.medicalInfo.allergies.push({
    allergen,
    severity,
    reaction,
    diagnosedDate: new Date()
  });
  return this.save();
};

userSchema.methods.updateDoctorRating = function(newRating) {
  if (this.role !== 'doctor') {
    throw new Error('Only doctors can have ratings');
  }
  
  const currentTotal = this.doctorProfile.rating * this.doctorProfile.totalReviews;
  this.doctorProfile.totalReviews += 1;
  this.doctorProfile.rating = (currentTotal + newRating) / this.doctorProfile.totalReviews;
  
  return this.save();
};

// Static methods
userSchema.statics.findByWalletAddress = function(walletAddress) {
  return this.findOne({ walletAddress: walletAddress.toLowerCase() });
};

userSchema.statics.findDoctorsBySpecialization = function(specialization) {
  return this.find({
    role: 'doctor',
    'doctorProfile.specialization': { $in: [specialization] },
    'doctorProfile.isVerified': true,
    isActive: true
  }).sort({ 'doctorProfile.rating': -1 });
};

userSchema.statics.findAvailableDoctors = function() {
  return this.find({
    role: 'doctor',
    'doctorProfile.isVerified': true,
    'doctorProfile.isAvailable': true,
    isActive: true
  }).sort({ 'doctorProfile.rating': -1 });
};

module.exports = mongoose.model('User', userSchema);
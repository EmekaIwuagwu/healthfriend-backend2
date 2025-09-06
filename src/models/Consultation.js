const mongoose = require('mongoose');

const consultationSchema = new mongoose.Schema({
  // Consultation Identification
  consultationId: { 
    type: String, 
    unique: true, 
    required: true,
    default: () => 'CONS_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  },
  
  // Consultation Type & Status
  type: { 
    type: String, 
    enum: ['ai_chat', 'video_call', 'home_visit'], 
    required: true,
    index: true
  },
  status: { 
    type: String, 
    enum: ['pending', 'scheduled', 'ongoing', 'completed', 'cancelled', 'failed', 'no_show'], 
    default: 'pending',
    index: true
  },
  
  // Participants
  patient: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  doctor: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    index: true
  }, // null for AI consultations
  
  // Consultation Details
  symptoms: [{
    type: String,
    trim: true,
    maxlength: 200
  }],
  chiefComplaint: {
    type: String,
    trim: true,
    maxlength: 500
  },
  duration: {
    type: Number,
    min: 0,
    max: 480 // max 8 hours
  }, // in minutes
  urgencyLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'emergency'],
    default: 'medium'
  },
  
  // AI Consultation Specific
  aiConversation: [{
    role: { 
      type: String, 
      enum: ['user', 'assistant'],
      required: true
    },
    message: {
      type: String,
      required: true,
      maxlength: 2000
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1
    }, // AI confidence score
    messageId: {
      type: String,
      default: () => Math.random().toString(36).substr(2, 9)
    }
  }],
  aiDiagnosis: {
    conditions: [{
      condition: String,
      probability: {
        type: Number,
        min: 0,
        max: 1
      },
      severity: {
        type: String,
        enum: ['mild', 'moderate', 'severe']
      }
    }],
    recommendations: [{
      type: String,
      maxlength: 300
    }],
    riskLevel: { 
      type: String, 
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low'
    },
    requiresDoctorConsultation: {
      type: Boolean,
      default: false
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1
    }
  },
  
  // Video Call Specific
  meetingId: {
    type: String,
    sparse: true,
    index: true
  },
  meetingUrl: String,
  meetingPassword: String,
  recordingUrl: String,
  recordingPermission: {
    type: Boolean,
    default: false
  },
  chatMessages: [{
    sender: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      required: true
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    },
    messageType: {
      type: String,
      enum: ['text', 'file', 'image'],
      default: 'text'
    },
    isDeleted: {
      type: Boolean,
      default: false
    }
  }],
  
  // Home Visit Specific
  visitAddress: {
    street: {
      type: String,
      trim: true,
      maxlength: 200
    },
    city: {
      type: String,
      trim: true,
      maxlength: 100
    },
    state: {
      type: String,
      trim: true,
      maxlength: 100
    },
    zipCode: {
      type: String,
      trim: true,
      maxlength: 20
    },
    country: {
      type: String,
      trim: true,
      maxlength: 100,
      default: 'Nigeria'
    },
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
    },
    instructions: {
      type: String,
      maxlength: 500
    },
    landmark: {
      type: String,
      maxlength: 200
    }
  },
  scheduledDate: {
    type: Date,
    index: true
  },
  estimatedArrival: Date,
  actualArrival: Date,
  departureTime: Date,
  visitDuration: Number, // in minutes
  travelDistance: Number, // in kilometers
  
  // Medical Assessment
  vitals: {
    bloodPressure: {
      systolic: {
        type: Number,
        min: 50,
        max: 300
      },
      diastolic: {
        type: Number,
        min: 30,
        max: 200
      }
    },
    heartRate: {
      type: Number,
      min: 30,
      max: 250
    }, // bpm
    temperature: {
      type: Number,
      min: 30,
      max: 45
    }, // celsius
    oxygenSaturation: {
      type: Number,
      min: 70,
      max: 100
    }, // percentage
    weight: {
      type: Number,
      min: 1,
      max: 1000
    }, // kg
    height: {
      type: Number,
      min: 30,
      max: 300
    }, // cm
    respiratoryRate: {
      type: Number,
      min: 5,
      max: 50
    }, // breaths per minute
    bmi: Number, // calculated field
    recordedAt: {
      type: Date,
      default: Date.now
    }
  },
  
  // Clinical Assessment
  diagnosis: {
    primary: {
      condition: String,
      icdCode: String,
      severity: {
        type: String,
        enum: ['mild', 'moderate', 'severe']
      }
    },
    secondary: [{
      condition: String,
      icdCode: String,
      severity: {
        type: String,
        enum: ['mild', 'moderate', 'severe']
      }
    }],
    differentialDiagnosis: [String],
    clinicalNotes: {
      type: String,
      maxlength: 2000
    }
  },
  
  // Prescription
  prescription: [{
    medication: {
      type: String,
      required: true,
      trim: true
    },
    genericName: String,
    dosage: {
      type: String,
      required: true,
      trim: true
    },
    frequency: {
      type: String,
      required: true,
      trim: true
    },
    duration: {
      type: String,
      required: true,
      trim: true
    },
    instructions: {
      type: String,
      maxlength: 300
    },
    refills: {
      type: Number,
      min: 0,
      max: 12,
      default: 0
    },
    prescribedAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Follow-up & Referrals
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: Date,
  followUpInstructions: {
    type: String,
    maxlength: 500
  },
  referrals: [{
    specialization: String,
    doctorName: String,
    hospitalName: String,
    reason: String,
    urgency: {
      type: String,
      enum: ['routine', 'urgent', 'emergency'],
      default: 'routine'
    },
    notes: String
  }],
  
  // Additional Notes & Instructions
  notes: {
    doctorNotes: {
      type: String,
      maxlength: 2000
    },
    patientNotes: {
      type: String,
      maxlength: 1000
    },
    adminNotes: {
      type: String,
      maxlength: 1000
    }
  },
  
  // Files & Documents
  attachments: [{
    fileName: {
      type: String,
      required: true
    },
    originalName: String,
    filePath: {
      type: String,
      required: true
    },
    fileType: {
      type: String,
      required: true
    },
    fileSize: Number, // in bytes
    uploadedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      required: true
    },
    uploadedAt: { 
      type: Date, 
      default: Date.now 
    },
    category: {
      type: String,
      enum: ['lab_result', 'prescription', 'image', 'document', 'other'],
      default: 'other'
    },
    isPublic: {
      type: Boolean,
      default: false
    }
  }],
  
  // Payment Information
  payment: {
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: { 
      type: String, 
      default: 'USD',
      enum: ['USD', 'NGN', 'EUR', 'GBP']
    },
    transactionHash: {
      type: String,
      sparse: true,
      index: true
    },
    paymentMethod: {
      type: String,
      enum: ['crypto', 'card', 'bank_transfer', 'cash'],
      default: 'crypto'
    },
    paymentStatus: { 
      type: String, 
      enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'disputed'], 
      default: 'pending',
      index: true
    },
    paidAt: Date,
    platformFee: {
      type: Number,
      min: 0
    },
    doctorEarnings: {
      type: Number,
      min: 0
    },
    paymentId: String,
    refundReason: String,
    refundedAt: Date
  },
  
  // Rating & Feedback
  patientRating: {
    rating: { 
      type: Number, 
      min: 1, 
      max: 5 
    },
    feedback: {
      type: String,
      maxlength: 1000
    },
    ratedAt: Date,
    categories: {
      communication: {
        type: Number,
        min: 1,
        max: 5
      },
      professionalism: {
        type: Number,
        min: 1,
        max: 5
      },
      effectiveness: {
        type: Number,
        min: 1,
        max: 5
      },
      timeliness: {
        type: Number,
        min: 1,
        max: 5
      }
    }
  },
  doctorRating: {
    rating: { 
      type: Number, 
      min: 1, 
      max: 5 
    },
    feedback: {
      type: String,
      maxlength: 1000
    },
    ratedAt: Date,
    categories: {
      cooperation: {
        type: Number,
        min: 1,
        max: 5
      },
      clarity: {
        type: Number,
        min: 1,
        max: 5
      },
      followThrough: {
        type: Number,
        min: 1,
        max: 5
      }
    }
  },
  
  // Quality Assurance
  qualityScore: {
    type: Number,
    min: 0,
    max: 100
  },
  qualityFlags: [{
    flag: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    flaggedAt: {
      type: Date,
      default: Date.now
    },
    resolvedAt: Date,
    notes: String
  }],
  
  // Timestamps
  bookedAt: {
    type: Date,
    default: Date.now
  },
  startedAt: Date,
  endedAt: Date,
  cancelledAt: Date,
  cancellationReason: {
    type: String,
    maxlength: 500
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total consultation time
consultationSchema.virtual('totalDuration').get(function() {
  if (this.startedAt && this.endedAt) {
    return Math.round((this.endedAt - this.startedAt) / (1000 * 60)); // in minutes
  }
  return this.duration || 0;
});

// Virtual for consultation cost breakdown
consultationSchema.virtual('costBreakdown').get(function() {
  if (!this.payment.amount) return null;
  
  const platformFeePercentage = 0.05; // 5%
  const platformFee = this.payment.platformFee || (this.payment.amount * platformFeePercentage);
  const doctorEarnings = this.payment.doctorEarnings || (this.payment.amount - platformFee);
  
  return {
    total: this.payment.amount,
    platformFee,
    doctorEarnings,
    platformFeePercentage: (platformFee / this.payment.amount * 100).toFixed(2)
  };
});

// Virtual for patient age at consultation
consultationSchema.virtual('patientAgeAtConsultation').get(function() {
  if (!this.patient || !this.patient.dateOfBirth || !this.createdAt) return null;
  
  const consultationDate = new Date(this.createdAt);
  const birthDate = new Date(this.patient.dateOfBirth);
  let age = consultationDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = consultationDate.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && consultationDate.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
});

// Indexes
consultationSchema.index({ patient: 1, createdAt: -1 });
consultationSchema.index({ doctor: 1, createdAt: -1 });
consultationSchema.index({ status: 1 });
consultationSchema.index({ type: 1 });
consultationSchema.index({ scheduledDate: 1 });
consultationSchema.index({ consultationId: 1 });
consultationSchema.index({ 'payment.paymentStatus': 1 });
consultationSchema.index({ 'payment.transactionHash': 1 });
consultationSchema.index({ urgencyLevel: 1 });
consultationSchema.index({ meetingId: 1 });

// Compound indexes
consultationSchema.index({ patient: 1, status: 1, createdAt: -1 });
consultationSchema.index({ doctor: 1, status: 1, scheduledDate: 1 });
consultationSchema.index({ type: 1, status: 1 });

// Text search index
consultationSchema.index({
  chiefComplaint: 'text',
  symptoms: 'text',
  'diagnosis.primary.condition': 'text',
  'notes.doctorNotes': 'text'
});

// Pre-save middleware
consultationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Calculate BMI if height and weight are available
  if (this.vitals && this.vitals.height && this.vitals.weight) {
    const heightInMeters = this.vitals.height / 100;
    this.vitals.bmi = (this.vitals.weight / (heightInMeters * heightInMeters)).toFixed(1);
  }
  
  // Set endedAt when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.endedAt) {
    this.endedAt = new Date();
  }
  
  // Set startedAt when status changes to ongoing
  if (this.isModified('status') && this.status === 'ongoing' && !this.startedAt) {
    this.startedAt = new Date();
  }
  
  // Set cancelledAt when status changes to cancelled
  if (this.isModified('status') && this.status === 'cancelled' && !this.cancelledAt) {
    this.cancelledAt = new Date();
  }
  
  next();
});

// Instance methods
consultationSchema.methods.addChatMessage = function(senderId, message, messageType = 'text') {
  this.chatMessages.push({
    sender: senderId,
    message,
    messageType,
    timestamp: new Date()
  });
  return this.save();
};

consultationSchema.methods.addAIMessage = function(role, message, confidence = null) {
  this.aiConversation.push({
    role,
    message,
    confidence,
    timestamp: new Date()
  });
  return this.save();
};

consultationSchema.methods.addPrescription = function(medication, dosage, frequency, duration, instructions) {
  this.prescription.push({
    medication,
    dosage,
    frequency,
    duration,
    instructions,
    prescribedAt: new Date()
  });
  return this.save();
};

consultationSchema.methods.addAttachment = function(fileName, filePath, fileType, fileSize, uploadedBy, category = 'other') {
  this.attachments.push({
    fileName,
    filePath,
    fileType,
    fileSize,
    uploadedBy,
    category,
    uploadedAt: new Date()
  });
  return this.save();
};

consultationSchema.methods.updatePaymentStatus = function(status, transactionHash = null) {
  this.payment.paymentStatus = status;
  if (transactionHash) {
    this.payment.transactionHash = transactionHash;
  }
  if (status === 'completed') {
    this.payment.paidAt = new Date();
  }
  return this.save();
};

consultationSchema.methods.calculateEarnings = function() {
  const platformFeePercentage = 0.05; // 5%
  const platformFee = this.payment.amount * platformFeePercentage;
  const doctorEarnings = this.payment.amount - platformFee;
  
  this.payment.platformFee = platformFee;
  this.payment.doctorEarnings = doctorEarnings;
  
  return { platformFee, doctorEarnings };
};

// Static methods
consultationSchema.statics.findByConsultationId = function(consultationId) {
  return this.findOne({ consultationId }).populate('patient doctor');
};

consultationSchema.statics.findUpcomingConsultations = function(doctorId) {
  return this.find({
    doctor: doctorId,
    status: { $in: ['scheduled', 'pending'] },
    scheduledDate: { $gte: new Date() }
  }).populate('patient').sort({ scheduledDate: 1 });
};

consultationSchema.statics.findPatientHistory = function(patientId, limit = 10) {
  return this.find({
    patient: patientId,
    status: 'completed'
  }).populate('doctor').sort({ createdAt: -1 }).limit(limit);
};

consultationSchema.statics.findDoctorConsultations = function(doctorId, status = null, limit = 20) {
  const query = { doctor: doctorId };
  if (status) query.status = status;
  
  return this.find(query).populate('patient').sort({ createdAt: -1 }).limit(limit);
};

module.exports = mongoose.model('Consultation', consultationSchema);
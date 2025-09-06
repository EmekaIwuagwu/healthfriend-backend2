const mongoose = require('mongoose');

const medicalRecordSchema = new mongoose.Schema({
  // Record Identification
  recordId: { 
    type: String, 
    unique: true, 
    required: true,
    default: () => 'MED_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  },
  
  // Patient Information
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
  },
  consultation: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Consultation',
    index: true
  },
  
  // Record Type & Category
  recordType: { 
    type: String, 
    enum: [
      'consultation_note', 
      'prescription', 
      'lab_result', 
      'imaging', 
      'vaccination', 
      'allergy', 
      'surgery',
      'discharge_summary',
      'referral',
      'vital_signs',
      'progress_note',
      'other'
    ], 
    required: true,
    index: true
  },
  
  // Medical Information
  title: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  
  // Clinical Details
  diagnosis: {
    primary: {
      condition: String,
      icdCode: String,
      severity: {
        type: String,
        enum: ['mild', 'moderate', 'severe']
      },
      diagnosedDate: Date,
      status: {
        type: String,
        enum: ['active', 'resolved', 'chronic', 'recurrent'],
        default: 'active'
      }
    },
    secondary: [{
      condition: String,
      icdCode: String,
      severity: {
        type: String,
        enum: ['mild', 'moderate', 'severe']
      },
      diagnosedDate: Date,
      status: {
        type: String,
        enum: ['active', 'resolved', 'chronic', 'recurrent'],
        default: 'active'
      }
    }],
    differentialDiagnosis: [String]
  },
  
  // Symptoms & Complaints
  symptoms: [{
    symptom: {
      type: String,
      required: true,
      trim: true
    },
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe'],
      default: 'moderate'
    },
    duration: String, // e.g., "3 days", "2 weeks"
    onset: {
      type: String,
      enum: ['sudden', 'gradual', 'intermittent']
    },
    location: String,
    quality: String, // e.g., "sharp", "dull", "throbbing"
    radiationPattern: String,
    alleviatingFactors: [String],
    aggravatingFactors: [String],
    associatedSymptoms: [String],
    firstOccurrence: Date,
    lastOccurrence: Date
  }],
  
  // Vital Signs & Measurements
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
      },
      recordedAt: Date
    },
    heartRate: {
      value: {
        type: Number,
        min: 30,
        max: 250
      },
      rhythm: {
        type: String,
        enum: ['regular', 'irregular', 'arrhythmic']
      },
      recordedAt: Date
    },
    temperature: {
      value: {
        type: Number,
        min: 30,
        max: 45
      },
      unit: {
        type: String,
        enum: ['celsius', 'fahrenheit'],
        default: 'celsius'
      },
      method: {
        type: String,
        enum: ['oral', 'axillary', 'rectal', 'tympanic', 'temporal']
      },
      recordedAt: Date
    },
    respiratoryRate: {
      value: {
        type: Number,
        min: 5,
        max: 60
      },
      quality: {
        type: String,
        enum: ['normal', 'labored', 'shallow', 'deep']
      },
      recordedAt: Date
    },
    oxygenSaturation: {
      value: {
        type: Number,
        min: 70,
        max: 100
      },
      onRoomAir: {
        type: Boolean,
        default: true
      },
      oxygenFlow: Number, // L/min if on oxygen
      recordedAt: Date
    },
    weight: {
      value: {
        type: Number,
        min: 0.5,
        max: 1000
      },
      unit: {
        type: String,
        enum: ['kg', 'lbs'],
        default: 'kg'
      },
      recordedAt: Date
    },
    height: {
      value: {
        type: Number,
        min: 30,
        max: 300
      },
      unit: {
        type: String,
        enum: ['cm', 'inches'],
        default: 'cm'
      },
      recordedAt: Date
    },
    bmi: {
      value: Number,
      category: {
        type: String,
        enum: ['underweight', 'normal', 'overweight', 'obese']
      },
      calculatedAt: Date
    },
    painScale: {
      score: {
        type: Number,
        min: 0,
        max: 10
      },
      location: String,
      recordedAt: Date
    }
  },
  
  // Laboratory Results
  labResults: [{
    testName: {
      type: String,
      required: true,
      trim: true
    },
    testCode: String, // Laboratory test code
    result: {
      value: String, // Can be numeric or text
      unit: String,
      normalRange: String,
      flag: {
        type: String,
        enum: ['normal', 'high', 'low', 'critical', 'abnormal']
      }
    },
    laboratory: String,
    orderedBy: String, // Doctor who ordered the test
    collectedAt: Date,
    reportedAt: Date,
    methodology: String,
    comments: String
  }],
  
  // Imaging Studies
  imagingStudies: [{
    studyType: {
      type: String,
      enum: [
        'X-Ray', 'CT', 'MRI', 'Ultrasound', 'Nuclear Medicine',
        'PET', 'Mammography', 'Fluoroscopy', 'Other'
      ],
      required: true
    },
    bodyPart: String,
    indication: String,
    findings: String,
    impression: String,
    radiologist: String,
    performedAt: Date,
    reportedAt: Date,
    studyId: String,
    dicomImages: [String], // File paths to DICOM images
    reportFile: String // Path to radiology report
  }],
  
  // Medications & Prescriptions
  medications: [{
    medication: {
      type: String,
      required: true,
      trim: true
    },
    genericName: String,
    strength: String,
    dosageForm: {
      type: String,
      enum: ['tablet', 'capsule', 'liquid', 'injection', 'topical', 'inhaler', 'other']
    },
    dosage: {
      type: String,
      required: true
    },
    frequency: {
      type: String,
      required: true
    },
    route: {
      type: String,
      enum: ['oral', 'topical', 'injection', 'inhalation', 'rectal', 'sublingual', 'other']
    },
    duration: String,
    startDate: Date,
    endDate: Date,
    prescribedBy: String,
    indication: String,
    instructions: String,
    sideEffects: [String],
    contraindications: [String],
    interactions: [String],
    refills: Number,
    pharmacyNotes: String,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // Procedures & Treatments
  procedures: [{
    procedureName: {
      type: String,
      required: true,
      trim: true
    },
    procedureCode: String, // CPT or ICD procedure code
    description: String,
    indication: String,
    performedBy: String,
    assistants: [String],
    performedAt: Date,
    duration: Number, // in minutes
    anesthesia: {
      type: String,
      enum: ['none', 'local', 'regional', 'general']
    },
    complications: String,
    postOpInstructions: String,
    followUpRequired: Boolean,
    followUpDate: Date,
    outcome: {
      type: String,
      enum: ['successful', 'complicated', 'failed']
    },
    notes: String
  }],
  
  // Allergies & Adverse Reactions
  allergies: [{
    allergen: {
      type: String,
      required: true,
      trim: true
    },
    allergenType: {
      type: String,
      enum: ['drug', 'food', 'environmental', 'latex', 'other']
    },
    reaction: String,
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe', 'life-threatening'],
      required: true
    },
    onset: Date,
    verificationStatus: {
      type: String,
      enum: ['confirmed', 'suspected', 'unlikely', 'refuted'],
      default: 'confirmed'
    },
    clinicalStatus: {
      type: String,
      enum: ['active', 'inactive', 'resolved'],
      default: 'active'
    },
    notes: String
  }],
  
  // Immunizations & Vaccinations
  immunizations: [{
    vaccine: {
      type: String,
      required: true,
      trim: true
    },
    vaccineCode: String,
    lotNumber: String,
    manufacturer: String,
    administeredAt: Date,
    administeredBy: String,
    site: {
      type: String,
      enum: ['left_arm', 'right_arm', 'left_thigh', 'right_thigh', 'oral', 'nasal', 'other']
    },
    route: {
      type: String,
      enum: ['intramuscular', 'subcutaneous', 'oral', 'intranasal', 'other']
    },
    dose: String,
    reaction: String,
    nextDueDate: Date,
    seriesComplete: Boolean,
    notes: String
  }],
  
  // Files & Documents
  files: [{
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
    category: {
      type: String,
      enum: ['report', 'image', 'document', 'scan', 'other'],
      default: 'document'
    },
    description: String,
    uploadedAt: { 
      type: Date, 
      default: Date.now 
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    isEncrypted: { 
      type: Boolean, 
      default: true 
    },
    encryptionKey: String, // For file-level encryption
    checksumMD5: String,
    checksumSHA256: String
  }],
  
  // Access Control & Privacy
  accessLevel: { 
    type: String, 
    enum: ['private', 'doctor_only', 'emergency_only', 'research_consented'], 
    default: 'doctor_only' 
  },
  sharedWith: [{ 
    user: {
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User'
    },
    accessLevel: {
      type: String,
      enum: ['read', 'write', 'admin']
    },
    sharedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date,
    purpose: String
  }],
  consentForSharing: {
    consented: {
      type: Boolean,
      default: false
    },
    consentedAt: Date,
    consentDocument: String, // File path to signed consent
    withdrawnAt: Date,
    withdrawnReason: String
  },
  
  // Quality & Validation
  validationStatus: {
    type: String,
    enum: ['draft', 'pending_review', 'reviewed', 'approved', 'rejected'],
    default: 'draft'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNotes: String,
  qualityScore: {
    type: Number,
    min: 0,
    max: 100
  },
  
  // Version Control
  version: {
    type: Number,
    default: 1
  },
  previousVersions: [{
    version: Number,
    recordSnapshot: mongoose.Schema.Types.Mixed,
    modifiedAt: Date,
    modifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changeDescription: String
  }],
  
  // Metadata & Tags
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  keywords: [String], // For search optimization
  clinicalTrials: [String], // Associated clinical trial IDs
  researchStudies: [String], // Associated research study IDs
  
  // System Metadata
  sourceSystem: {
    type: String,
    default: 'healthfriend'
  },
  externalId: String, // ID from external system
  importedFrom: String, // Source of imported data
  dataIntegrity: {
    hash: String, // Data integrity hash
    lastVerified: Date,
    verificationStatus: {
      type: String,
      enum: ['verified', 'pending', 'failed'],
      default: 'pending'
    }
  },
  
  // Status & Lifecycle
  isActive: { 
    type: Boolean, 
    default: true 
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletionReason: String,
  retentionPolicy: {
    retainUntil: Date,
    reason: String,
    legalHold: {
      type: Boolean,
      default: false
    }
  },
  
  // Timestamps
  recordDate: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  lastModified: Date,
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
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Remove sensitive fields from JSON output
      delete ret.encryptionKey;
      delete ret.dataIntegrity.hash;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Virtual for record age
medicalRecordSchema.virtual('recordAge').get(function() {
  if (!this.recordDate) return null;
  const now = new Date();
  const recordDate = new Date(this.recordDate);
  const ageInDays = Math.floor((now - recordDate) / (1000 * 60 * 60 * 24));
  
  if (ageInDays < 7) return `${ageInDays} days`;
  if (ageInDays < 30) return `${Math.floor(ageInDays / 7)} weeks`;
  if (ageInDays < 365) return `${Math.floor(ageInDays / 30)} months`;
  return `${Math.floor(ageInDays / 365)} years`;
});

// Virtual for BMI calculation
medicalRecordSchema.virtual('calculatedBMI').get(function() {
  if (this.vitals?.height?.value && this.vitals?.weight?.value) {
    const heightInM = this.vitals.height.unit === 'cm' ? 
      this.vitals.height.value / 100 : 
      this.vitals.height.value * 0.0254;
    
    const weightInKg = this.vitals.weight.unit === 'kg' ? 
      this.vitals.weight.value : 
      this.vitals.weight.value * 0.453592;
    
    const bmi = weightInKg / (heightInM * heightInM);
    
    let category = 'normal';
    if (bmi < 18.5) category = 'underweight';
    else if (bmi >= 25 && bmi < 30) category = 'overweight';
    else if (bmi >= 30) category = 'obese';
    
    return {
      value: Math.round(bmi * 10) / 10,
      category
    };
  }
  return null;
});

// Virtual for critical flags
medicalRecordSchema.virtual('criticalFlags').get(function() {
  const flags = [];
  
  // Check vital signs for critical values
  if (this.vitals?.bloodPressure) {
    const { systolic, diastolic } = this.vitals.bloodPressure;
    if (systolic > 180 || diastolic > 120) flags.push('Hypertensive Crisis');
    if (systolic < 90 || diastolic < 60) flags.push('Hypotension');
  }
  
  if (this.vitals?.heartRate?.value) {
    if (this.vitals.heartRate.value > 100) flags.push('Tachycardia');
    if (this.vitals.heartRate.value < 60) flags.push('Bradycardia');
  }
  
  if (this.vitals?.temperature?.value) {
    if (this.vitals.temperature.value > 39) flags.push('High Fever');
    if (this.vitals.temperature.value < 35) flags.push('Hypothermia');
  }
  
  if (this.vitals?.oxygenSaturation?.value) {
    if (this.vitals.oxygenSaturation.value < 90) flags.push('Low Oxygen Saturation');
  }
  
  // Check for critical lab results
  this.labResults?.forEach(lab => {
    if (lab.result.flag === 'critical') {
      flags.push(`Critical Lab: ${lab.testName}`);
    }
  });
  
  return flags;
});

// Indexes
medicalRecordSchema.index({ patient: 1, recordDate: -1 });
medicalRecordSchema.index({ doctor: 1 });
medicalRecordSchema.index({ consultation: 1 });
medicalRecordSchema.index({ recordType: 1 });
medicalRecordSchema.index({ tags: 1 });
medicalRecordSchema.index({ isActive: 1 });
medicalRecordSchema.index({ validationStatus: 1 });
medicalRecordSchema.index({ 'diagnosis.primary.condition': 1 });

// Compound indexes
medicalRecordSchema.index({ patient: 1, recordType: 1, recordDate: -1 });
medicalRecordSchema.index({ patient: 1, isActive: 1, recordDate: -1 });
medicalRecordSchema.index({ doctor: 1, validationStatus: 1 });

// Text search index
medicalRecordSchema.index({
  title: 'text',
  description: 'text',
  'diagnosis.primary.condition': 'text',
  'symptoms.symptom': 'text',
  tags: 'text',
  keywords: 'text'
}, {
  weights: {
    title: 10,
    'diagnosis.primary.condition': 8,
    description: 5,
    'symptoms.symptom': 3,
    tags: 2,
    keywords: 1
  }
});

// Pre-save middleware
medicalRecordSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.lastModified = new Date();
  
  // Calculate BMI if height and weight are present
  if (this.vitals?.height?.value && this.vitals?.weight?.value && !this.vitals.bmi?.value) {
    const bmiData = this.calculatedBMI;
    if (bmiData) {
      this.vitals.bmi = {
        value: bmiData.value,
        category: bmiData.category,
        calculatedAt: new Date()
      };
    }
  }
  
  // Generate data integrity hash
  this.generateDataHash();
  
  // Auto-increment version on changes
  if (this.isModified() && !this.isNew) {
    this.incrementVersion();
  }
  
  next();
});

// Instance methods
medicalRecordSchema.methods.generateDataHash = function() {
  const crypto = require('crypto');
  const recordData = {
    patient: this.patient,
    recordType: this.recordType,
    title: this.title,
    description: this.description,
    diagnosis: this.diagnosis,
    vitals: this.vitals,
    labResults: this.labResults,
    medications: this.medications
  };
  
  this.dataIntegrity.hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(recordData))
    .digest('hex');
    
  this.dataIntegrity.lastVerified = new Date();
  this.dataIntegrity.verificationStatus = 'verified';
};

medicalRecordSchema.methods.incrementVersion = function() {
  // Save current state as previous version
  this.previousVersions.push({
    version: this.version,
    recordSnapshot: this.toObject(),
    modifiedAt: new Date(),
    modifiedBy: this.doctor || this.patient,
    changeDescription: 'Record updated'
  });
  
  this.version += 1;
  
  // Keep only last 10 versions
  if (this.previousVersions.length > 10) {
    this.previousVersions = this.previousVersions.slice(-10);
  }
};

medicalRecordSchema.methods.addLabResult = function(testName, result, laboratory, orderedBy) {
  this.labResults.push({
    testName,
    result,
    laboratory,
    orderedBy,
    collectedAt: new Date(),
    reportedAt: new Date()
  });
  return this.save();
};

medicalRecordSchema.methods.addMedication = function(medication, dosage, frequency, duration, prescribedBy) {
  this.medications.push({
    medication,
    dosage,
    frequency,
    duration,
    prescribedBy,
    startDate: new Date(),
    isActive: true
  });
  return this.save();
};

medicalRecordSchema.methods.addVitals = function(vitalsData) {
  this.vitals = {
    ...this.vitals,
    ...vitalsData,
    recordedAt: new Date()
  };
  return this.save();
};

medicalRecordSchema.methods.shareWith = function(userId, accessLevel, purpose, expiresAt = null) {
  // Remove existing share with same user
  this.sharedWith = this.sharedWith.filter(share => 
    !share.user.equals(userId)
  );
  
  this.sharedWith.push({
    user: userId,
    accessLevel,
    purpose,
    expiresAt,
    sharedAt: new Date()
  });
  
  return this.save();
};

medicalRecordSchema.methods.revokeAccess = function(userId) {
  this.sharedWith = this.sharedWith.filter(share => 
    !share.user.equals(userId)
  );
  return this.save();
};

medicalRecordSchema.methods.softDelete = function(deletedBy, reason) {
  this.isDeleted = true;
  this.isActive = false;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.deletionReason = reason;
  return this.save();
};

// Static methods
medicalRecordSchema.statics.findByRecordId = function(recordId) {
  return this.findOne({ recordId, isDeleted: false })
    .populate('patient doctor consultation');
};

medicalRecordSchema.statics.findPatientRecords = function(patientId, recordType = null, limit = 20) {
  const query = {
    patient: patientId,
    isActive: true,
    isDeleted: false
  };
  
  if (recordType) {
    query.recordType = recordType;
  }
  
  return this.find(query)
    .populate('doctor consultation')
    .sort({ recordDate: -1 })
    .limit(limit);
};

medicalRecordSchema.statics.findDoctorRecords = function(doctorId, limit = 50) {
  return this.find({
    doctor: doctorId,
    isActive: true,
    isDeleted: false
  })
    .populate('patient consultation')
    .sort({ recordDate: -1 })
    .limit(limit);
};

medicalRecordSchema.statics.searchRecords = function(patientId, searchTerm, recordType = null) {
  const query = {
    patient: patientId,
    isActive: true,
    isDeleted: false,
    $text: { $search: searchTerm }
  };
  
  if (recordType) {
    query.recordType = recordType;
  }
  
  return this.find(query, { score: { $meta: 'textScore' } })
    .populate('doctor consultation')
    .sort({ score: { $meta: 'textScore' }, recordDate: -1 });
};

medicalRecordSchema.statics.findCriticalRecords = function(patientId) {
  return this.find({
    patient: patientId,
    isActive: true,
    isDeleted: false,
    $or: [
      { 'vitals.bloodPressure.systolic': { $gt: 180 } },
      { 'vitals.bloodPressure.diastolic': { $gt: 120 } },
      { 'vitals.heartRate.value': { $gt: 120 } },
      { 'vitals.temperature.value': { $gt: 39 } },
      { 'vitals.oxygenSaturation.value': { $lt: 90 } },
      { 'labResults.result.flag': 'critical' }
    ]
  })
    .populate('doctor consultation')
    .sort({ recordDate: -1 });
};

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema);
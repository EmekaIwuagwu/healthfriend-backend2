const multer = require('multer');
const { GridFSBucket } = require('mongodb');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Upload configuration constants
const UPLOAD_CONFIG = {
  // File size limits (in bytes)
  MAX_FILE_SIZE: {
    AVATAR: 5 * 1024 * 1024,      // 5MB for avatars
    MEDICAL_DOC: 10 * 1024 * 1024, // 10MB for medical documents
    PRESCRIPTION: 5 * 1024 * 1024,  // 5MB for prescriptions
    REPORT: 15 * 1024 * 1024       // 15MB for medical reports
  },

  // Allowed file types
  ALLOWED_TYPES: {
    AVATAR: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'],
    MEDICAL_DOC: [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    PRESCRIPTION: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
    REPORT: [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  },

  // Upload directories
  UPLOAD_DIRS: {
    TEMP: './uploads/temp',
    AVATARS: './uploads/avatars',
    MEDICAL_RECORDS: './uploads/medical-records',
    PRESCRIPTIONS: './uploads/prescriptions',
    REPORTS: './uploads/reports'
  },

  // GridFS bucket names for MongoDB storage
  GRIDFS_BUCKETS: {
    AVATARS: 'avatars',
    MEDICAL_DOCS: 'medical_documents',
    PRESCRIPTIONS: 'prescriptions',
    REPORTS: 'medical_reports'
  }
};

// Ensure upload directories exist
const ensureUploadDirs = () => {
  Object.values(UPLOAD_CONFIG.UPLOAD_DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// File filter function
const createFileFilter = (allowedTypes) => {
  return (req, file, cb) => {
    // Check if file type is allowed
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`), false);
    }
  };
};

// Storage configuration for local uploads
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir;
    
    switch (file.fieldname) {
      case 'avatar':
        uploadDir = UPLOAD_CONFIG.UPLOAD_DIRS.AVATARS;
        break;
      case 'medicalDocument':
        uploadDir = UPLOAD_CONFIG.UPLOAD_DIRS.MEDICAL_RECORDS;
        break;
      case 'prescription':
        uploadDir = UPLOAD_CONFIG.UPLOAD_DIRS.PRESCRIPTIONS;
        break;
      case 'report':
        uploadDir = UPLOAD_CONFIG.UPLOAD_DIRS.REPORTS;
        break;
      default:
        uploadDir = UPLOAD_CONFIG.UPLOAD_DIRS.TEMP;
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const fileExtension = path.extname(file.originalname);
    const fileName = `${file.fieldname}-${Date.now()}-${uniqueSuffix}${fileExtension}`;
    cb(null, fileName);
  }
});

// Memory storage for GridFS uploads
const memoryStorage = multer.memoryStorage();

// Upload configurations for different file types
const uploadConfigs = {
  // Avatar upload configuration
  avatar: multer({
    storage: process.env.USE_GRIDFS === 'true' ? memoryStorage : localStorage,
    limits: { fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE.AVATAR },
    fileFilter: createFileFilter(UPLOAD_CONFIG.ALLOWED_TYPES.AVATAR)
  }),

  // Medical document upload configuration
  medicalDocument: multer({
    storage: process.env.USE_GRIDFS === 'true' ? memoryStorage : localStorage,
    limits: { fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE.MEDICAL_DOC },
    fileFilter: createFileFilter(UPLOAD_CONFIG.ALLOWED_TYPES.MEDICAL_DOC)
  }),

  // Prescription upload configuration
  prescription: multer({
    storage: process.env.USE_GRIDFS === 'true' ? memoryStorage : localStorage,
    limits: { fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE.PRESCRIPTION },
    fileFilter: createFileFilter(UPLOAD_CONFIG.ALLOWED_TYPES.PRESCRIPTION)
  }),

  // Medical report upload configuration
  report: multer({
    storage: process.env.USE_GRIDFS === 'true' ? memoryStorage : localStorage,
    limits: { fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE.REPORT },
    fileFilter: createFileFilter(UPLOAD_CONFIG.ALLOWED_TYPES.REPORT)
  }),

  // Multiple files upload
  multiple: multer({
    storage: process.env.USE_GRIDFS === 'true' ? memoryStorage : localStorage,
    limits: { 
      fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE.MEDICAL_DOC,
      files: 5 // Maximum 5 files at once
    },
    fileFilter: createFileFilter(UPLOAD_CONFIG.ALLOWED_TYPES.MEDICAL_DOC)
  })
};

// GridFS utility functions
const gridFSUtils = {
  // Create GridFS bucket
  createBucket: (db, bucketName) => {
    return new GridFSBucket(db, { bucketName });
  },

  // Upload file to GridFS
  uploadToGridFS: (bucket, file, metadata = {}) => {
    return new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(file.originalname, {
        metadata: {
          ...metadata,
          uploadDate: new Date(),
          contentType: file.mimetype,
          size: file.size
        }
      });

      uploadStream.on('error', reject);
      uploadStream.on('finish', (result) => {
        resolve({
          id: result._id,
          filename: result.filename,
          metadata: result.metadata
        });
      });

      uploadStream.end(file.buffer);
    });
  },

  // Download file from GridFS
  downloadFromGridFS: (bucket, fileId) => {
    return bucket.openDownloadStream(fileId);
  },

  // Delete file from GridFS
  deleteFromGridFS: (bucket, fileId) => {
    return bucket.delete(fileId);
  },

  // Get file info from GridFS
  getFileInfo: async (bucket, fileId) => {
    const files = await bucket.find({ _id: fileId }).toArray();
    return files.length > 0 ? files[0] : null;
  }
};

// File validation utilities
const fileValidation = {
  // Validate file size
  validateFileSize: (file, maxSize) => {
    return file.size <= maxSize;
  },

  // Validate file type
  validateFileType: (file, allowedTypes) => {
    return allowedTypes.includes(file.mimetype);
  },

  // Validate file extension
  validateFileExtension: (filename, allowedExtensions) => {
    const ext = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(ext);
  },

  // Sanitize filename
  sanitizeFilename: (filename) => {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  }
};

// Initialize upload directories
ensureUploadDirs();

module.exports = {
  UPLOAD_CONFIG,
  uploadConfigs,
  gridFSUtils,
  fileValidation,
  ensureUploadDirs,
  createFileFilter
};
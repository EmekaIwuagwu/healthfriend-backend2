const multer = require('multer');
const GridFSBucket = require('mongodb').GridFSBucket;
const { GridFSBucketWriteStream } = require('mongodb');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');
const { AppError } = require('./errorHandler');
const { logError } = require('../utils/logger');

// File type configurations
const FILE_TYPES = {
  AVATAR: {
    allowedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif'],
    maxSize: 5 * 1024 * 1024, // 5MB
    bucket: 'avatars'
  },
  MEDICAL_DOCUMENT: {
    allowedMimes: [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
      'application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.txt'],
    maxSize: 10 * 1024 * 1024, // 10MB
    bucket: 'medical_documents'
  },
  VERIFICATION_DOCUMENT: {
    allowedMimes: [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
      'application/pdf'
    ],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.pdf'],
    maxSize: 10 * 1024 * 1024, // 10MB
    bucket: 'verification_documents'
  },
  CONSULTATION_ATTACHMENT: {
    allowedMimes: [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx'],
    maxSize: 15 * 1024 * 1024, // 15MB
    bucket: 'consultation_attachments'
  }
};

// GridFS setup
let gridFSBuckets = {};

const initializeGridFS = () => {
  try {
    const db = mongoose.connection.db;
    
    Object.keys(FILE_TYPES).forEach(type => {
      const bucketName = FILE_TYPES[type].bucket;
      gridFSBuckets[bucketName] = new GridFSBucket(db, { bucketName });
    });
    
    console.log('GridFS buckets initialized successfully');
  } catch (error) {
    console.error('Error initializing GridFS:', error);
    logError(error, { context: 'GridFS Initialization' });
  }
};

// Initialize GridFS when database connects
mongoose.connection.once('open', initializeGridFS);

// File filter function
const createFileFilter = (fileType) => {
  return (req, file, cb) => {
    try {
      const config = FILE_TYPES[fileType];
      const fileExtension = path.extname(file.originalname).toLowerCase();
      
      // Check MIME type
      if (!config.allowedMimes.includes(file.mimetype)) {
        return cb(new AppError(`Invalid file type. Allowed types: ${config.allowedMimes.join(', ')}`, 400), false);
      }
      
      // Check file extension
      if (!config.allowedExtensions.includes(fileExtension)) {
        return cb(new AppError(`Invalid file extension. Allowed extensions: ${config.allowedExtensions.join(', ')}`, 400), false);
      }
      
      // Additional security checks
      if (file.originalname.includes('..')) {
        return cb(new AppError('Invalid file name', 400), false);
      }
      
      cb(null, true);
    } catch (error) {
      cb(new AppError('File validation error', 400), false);
    }
  };
};

// Custom storage engine for GridFS
const createGridFSStorage = (bucketName) => {
  return {
    _handleFile: (req, file, callback) => {
      const filename = `${Date.now()}_${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname)}`;
      const bucket = gridFSBuckets[bucketName];
      
      if (!bucket) {
        return callback(new AppError('Storage bucket not available', 500));
      }
      
      const metadata = {
        originalName: file.originalname,
        uploadedBy: req.user?.id,
        uploadedAt: new Date(),
        mimeType: file.mimetype,
        fileSize: 0,
        encrypted: true,
        checksum: crypto.createHash('md5')
      };
      
      const uploadStream = bucket.openUploadStream(filename, {
        metadata,
        chunkSizeBytes: 1024 * 1024 // 1MB chunks
      });
      
      let fileSize = 0;
      const hash = crypto.createHash('md5');
      
      file.stream.on('data', (chunk) => {
        fileSize += chunk.length;
        hash.update(chunk);
      });
      
      file.stream.on('end', () => {
        metadata.fileSize = fileSize;
        metadata.checksum = hash.digest('hex');
      });
      
      file.stream.on('error', (error) => {
        uploadStream.destroy();
        callback(error);
      });
      
      uploadStream.on('error', (error) => {
        callback(error);
      });
      
      uploadStream.on('finish', (file) => {
        callback(null, {
          id: file._id,
          filename: file.filename,
          originalName: metadata.originalName,
          mimeType: file.metadata.mimeType,
          size: metadata.fileSize,
          uploadDate: file.uploadDate,
          bucket: bucketName,
          checksum: metadata.checksum
        });
      });
      
      file.stream.pipe(uploadStream);
    },
    
    _removeFile: (req, file, callback) => {
      const bucket = gridFSBuckets[file.bucket];
      if (bucket && file.id) {
        bucket.delete(file.id, callback);
      } else {
        callback();
      }
    }
  };
};

// Create multer instances for different file types
const createUploadMiddleware = (fileType, fieldName = 'file', multiple = false) => {
  const config = FILE_TYPES[fileType];
  
  if (!config) {
    throw new Error(`Invalid file type: ${fileType}`);
  }
  
  const storage = createGridFSStorage(config.bucket);
  
  const upload = multer({
    storage,
    fileFilter: createFileFilter(fileType),
    limits: {
      fileSize: config.maxSize,
      files: multiple ? 5 : 1,
      fields: 10,
      fieldNameSize: 100,
      fieldSize: 1024 * 1024 // 1MB for field values
    }
  });
  
  return multiple ? upload.array(fieldName, 5) : upload.single(fieldName);
};

// Image processing middleware
const processImage = (options = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.file || !req.file.filename) {
        return next();
      }
      
      const { resize, quality = 80, format = 'jpeg' } = options;
      
      // Only process images
      if (!req.file.mimeType.startsWith('image/')) {
        return next();
      }
      
      const bucket = gridFSBuckets[req.file.bucket];
      const downloadStream = bucket.openDownloadStreamByName(req.file.filename);
      
      let sharpInstance = sharp();
      
      // Apply transformations
      if (resize) {
        sharpInstance = sharpInstance.resize(resize.width, resize.height, {
          fit: resize.fit || 'cover',
          position: resize.position || 'center'
        });
      }
      
      // Set format and quality
      if (format === 'jpeg') {
        sharpInstance = sharpInstance.jpeg({ quality });
      } else if (format === 'png') {
        sharpInstance = sharpInstance.png({ quality });
      } else if (format === 'webp') {
        sharpInstance = sharpInstance.webp({ quality });
      }
      
      // Create new processed file
      const processedFilename = `processed_${req.file.filename}`;
      const uploadStream = bucket.openUploadStream(processedFilename, {
        metadata: {
          ...req.file.metadata,
          processed: true,
          originalFile: req.file.filename,
          transformations: { resize, quality, format }
        }
      });
      
      downloadStream
        .pipe(sharpInstance)
        .pipe(uploadStream);
      
      uploadStream.on('finish', (file) => {
        // Delete original file
        bucket.delete(req.file.id, (err) => {
          if (err) console.error('Error deleting original file:', err);
        });
        
        // Update req.file with processed file info
        req.file = {
          ...req.file,
          id: file._id,
          filename: file.filename,
          processed: true
        };
        
        next();
      });
      
      uploadStream.on('error', (error) => {
        logError(error, { context: 'Image Processing', filename: req.file.filename });
        next(error);
      });
      
    } catch (error) {
      logError(error, { context: 'Image Processing Middleware' });
      next(error);
    }
  };
};

// File encryption middleware
const encryptFile = () => {
  return async (req, res, next) => {
    try {
      if (!req.file || !req.file.filename) {
        return next();
      }
      
      const bucket = gridFSBuckets[req.file.bucket];
      const downloadStream = bucket.openDownloadStreamByName(req.file.filename);
      
      // Generate encryption key
      const encryptionKey = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
      
      const encryptedFilename = `encrypted_${req.file.filename}`;
      const uploadStream = bucket.openUploadStream(encryptedFilename, {
        metadata: {
          ...req.file.metadata,
          encrypted: true,
          originalFile: req.file.filename,
          encryptionAlgorithm: 'aes-256-cbc'
        }
      });
      
      downloadStream
        .pipe(cipher)
        .pipe(uploadStream);
      
      uploadStream.on('finish', (file) => {
        // Delete original file
        bucket.delete(req.file.id, (err) => {
          if (err) console.error('Error deleting original file:', err);
        });
        
        // Store encryption key securely (in practice, use a key management service)
        req.file = {
          ...req.file,
          id: file._id,
          filename: file.filename,
          encrypted: true,
          encryptionKey: encryptionKey.toString('hex')
        };
        
        next();
      });
      
      uploadStream.on('error', (error) => {
        logError(error, { context: 'File Encryption', filename: req.file.filename });
        next(error);
      });
      
    } catch (error) {
      logError(error, { context: 'File Encryption Middleware' });
      next(error);
    }
  };
};

// Virus scanning middleware (placeholder - integrate with actual antivirus)
const virusScan = () => {
  return async (req, res, next) => {
    try {
      if (!req.file) {
        return next();
      }
      
      // Placeholder for virus scanning
      // In production, integrate with ClamAV, VirusTotal API, etc.
      
      // Simple file name and content checks
      const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.com'];
      const fileExtension = path.extname(req.file.originalName).toLowerCase();
      
      if (suspiciousExtensions.includes(fileExtension)) {
        const bucket = gridFSBuckets[req.file.bucket];
        if (bucket && req.file.id) {
          bucket.delete(req.file.id);
        }
        return next(new AppError('File type not allowed for security reasons', 400));
      }
      
      // Check file size anomalies
      if (req.file.size > 50 * 1024 * 1024) { // 50MB
        const bucket = gridFSBuckets[req.file.bucket];
        if (bucket && req.file.id) {
          bucket.delete(req.file.id);
        }
        return next(new AppError('File too large', 400));
      }
      
      req.file.virusScanned = true;
      req.file.scanDate = new Date();
      
      next();
    } catch (error) {
      logError(error, { context: 'Virus Scan' });
      next(error);
    }
  };
};

// File download helper
const downloadFile = async (fileId, bucketName) => {
  try {
    const bucket = gridFSBuckets[bucketName];
    if (!bucket) {
      throw new AppError('Invalid bucket', 400);
    }
    
    const downloadStream = bucket.openDownloadStream(mongoose.Types.ObjectId(fileId));
    return downloadStream;
  } catch (error) {
    throw new AppError('File not found', 404);
  }
};

// File deletion helper
const deleteFile = async (fileId, bucketName) => {
  try {
    const bucket = gridFSBuckets[bucketName];
    if (!bucket) {
      throw new AppError('Invalid bucket', 400);
    }
    
    await bucket.delete(mongoose.Types.ObjectId(fileId));
    return true;
  } catch (error) {
    throw new AppError('Failed to delete file', 500);
  }
};

// Get file metadata
const getFileMetadata = async (fileId, bucketName) => {
  try {
    const bucket = gridFSBuckets[bucketName];
    if (!bucket) {
      throw new AppError('Invalid bucket', 400);
    }
    
    const files = await bucket.find({ _id: mongoose.Types.ObjectId(fileId) }).toArray();
    if (files.length === 0) {
      throw new AppError('File not found', 404);
    }
    
    return files[0];
  } catch (error) {
    throw new AppError('Failed to get file metadata', 500);
  }
};

// List files in bucket
const listFiles = async (bucketName, filter = {}, options = {}) => {
  try {
    const bucket = gridFSBuckets[bucketName];
    if (!bucket) {
      throw new AppError('Invalid bucket', 400);
    }
    
    const { limit = 20, skip = 0, sort = { uploadDate: -1 } } = options;
    
    const files = await bucket
      .find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();
    
    return files;
  } catch (error) {
    throw new AppError('Failed to list files', 500);
  }
};

// Create specific upload middlewares
const uploadAvatar = createUploadMiddleware('AVATAR', 'avatar');
const uploadMedicalDocument = createUploadMiddleware('MEDICAL_DOCUMENT', 'document');
const uploadVerificationDocument = createUploadMiddleware('VERIFICATION_DOCUMENT', 'document');
const uploadConsultationAttachment = createUploadMiddleware('CONSULTATION_ATTACHMENT', 'attachment', true);

// Combined middleware for avatar upload with processing
const uploadAndProcessAvatar = [
  uploadAvatar,
  processImage({ 
    resize: { width: 300, height: 300, fit: 'cover' }, 
    quality: 85, 
    format: 'jpeg' 
  }),
  virusScan()
];

// Combined middleware for medical documents with encryption
const uploadAndEncryptMedicalDocument = [
  uploadMedicalDocument,
  encryptFile(),
  virusScan()
];

// Error handling middleware for upload errors
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('File too large', 400));
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return next(new AppError('Too many files', 400));
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new AppError('Unexpected file field', 400));
    }
  }
  next(error);
};

module.exports = {
  // Upload middlewares
  uploadAvatar,
  uploadMedicalDocument,
  uploadVerificationDocument,
  uploadConsultationAttachment,
  
  // Combined middlewares
  uploadAndProcessAvatar,
  uploadAndEncryptMedicalDocument,
  
  // Processing middlewares
  processImage,
  encryptFile,
  virusScan,
  
  // Utility functions
  downloadFile,
  deleteFile,
  getFileMetadata,
  listFiles,
  
  // Error handling
  handleUploadError,
  
  // Configuration
  FILE_TYPES,
  
  // GridFS utilities
  initializeGridFS,
  gridFSBuckets
};
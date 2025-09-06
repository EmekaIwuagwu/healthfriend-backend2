const crypto = require('crypto');
const moment = require('moment');
const { logError } = require('./logger');

// Date and time utilities
const dateUtils = {
  // Format date for display
  formatDate: (date, format = 'YYYY-MM-DD') => {
    try {
      return moment(date).format(format);
    } catch (error) {
      return null;
    }
  },

  // Format date and time for display
  formatDateTime: (date, format = 'YYYY-MM-DD HH:mm:ss') => {
    try {
      return moment(date).format(format);
    } catch (error) {
      return null;
    }
  },

  // Get relative time (e.g., "2 hours ago")
  getRelativeTime: (date) => {
    try {
      return moment(date).fromNow();
    } catch (error) {
      return 'Unknown time';
    }
  },

  // Check if date is today
  isToday: (date) => {
    try {
      return moment(date).isSame(moment(), 'day');
    } catch (error) {
      return false;
    }
  },

  // Check if date is in the past
  isPast: (date) => {
    try {
      return moment(date).isBefore(moment());
    } catch (error) {
      return false;
    }
  },

  // Check if date is in the future
  isFuture: (date) => {
    try {
      return moment(date).isAfter(moment());
    } catch (error) {
      return false;
    }
  },

  // Add time to date
  addTime: (date, amount, unit = 'hours') => {
    try {
      return moment(date).add(amount, unit).toDate();
    } catch (error) {
      return null;
    }
  },

  // Subtract time from date
  subtractTime: (date, amount, unit = 'hours') => {
    try {
      return moment(date).subtract(amount, unit).toDate();
    } catch (error) {
      return null;
    }
  },

  // Get start of day
  startOfDay: (date = new Date()) => {
    try {
      return moment(date).startOf('day').toDate();
    } catch (error) {
      return null;
    }
  },

  // Get end of day
  endOfDay: (date = new Date()) => {
    try {
      return moment(date).endOf('day').toDate();
    } catch (error) {
      return null;
    }
  },

  // Calculate age from date of birth
  calculateAge: (dateOfBirth) => {
    try {
      return moment().diff(moment(dateOfBirth), 'years');
    } catch (error) {
      return null;
    }
  },

  // Get timezone offset
  getTimezoneOffset: () => {
    return new Date().getTimezoneOffset();
  },

  // Convert timezone
  convertTimezone: (date, timezone) => {
    try {
      return moment(date).tz(timezone).toDate();
    } catch (error) {
      return null;
    }
  }
};

// String utilities
const stringUtils = {
  // Capitalize first letter
  capitalize: (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  // Convert to title case
  toTitleCase: (str) => {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  },

  // Convert to snake_case
  toSnakeCase: (str) => {
    if (!str) return '';
    return str.replace(/\W+/g, ' ')
      .split(/ |\B(?=[A-Z])/)
      .map(word => word.toLowerCase())
      .join('_');
  },

  // Convert to camelCase
  toCamelCase: (str) => {
    if (!str) return '';
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  },

  // Generate slug from string
  generateSlug: (str) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/[^\w ]+/g, '')
      .replace(/ +/g, '-');
  },

  // Truncate string with ellipsis
  truncate: (str, length = 100, suffix = '...') => {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length) + suffix;
  },

  // Remove HTML tags
  stripHtml: (str) => {
    if (!str) return '';
    return str.replace(/<[^>]*>/g, '');
  },

  // Mask sensitive information
  maskString: (str, visibleChars = 4, maskChar = '*') => {
    if (!str) return '';
    if (str.length <= visibleChars) return maskChar.repeat(str.length);
    
    const visible = str.slice(-visibleChars);
    const masked = maskChar.repeat(str.length - visibleChars);
    return masked + visible;
  },

  // Generate random string
  generateRandomString: (length = 10, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') => {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  },

  // Extract initials from name
  getInitials: (firstName, lastName) => {
    const first = firstName ? firstName.charAt(0).toUpperCase() : '';
    const last = lastName ? lastName.charAt(0).toUpperCase() : '';
    return first + last;
  },

  // Format phone number
  formatPhoneNumber: (phone) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    
    return phone; // Return original if can't format
  }
};

// Validation utilities
const validationUtils = {
  // Email validation
  isValidEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Phone number validation
  isValidPhone: (phone) => {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/\D/g, ''));
  },

  // Ethereum address validation
  isValidEthereumAddress: (address) => {
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    return ethAddressRegex.test(address);
  },

  // Password strength validation
  validatePasswordStrength: (password) => {
    const strength = {
      score: 0,
      requirements: {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        numbers: /\d/.test(password),
        symbols: /[!@#$%^&*(),.?":{}|<>]/.test(password)
      },
      feedback: []
    };

    // Calculate score
    Object.values(strength.requirements).forEach(req => {
      if (req) strength.score++;
    });

    // Generate feedback
    if (!strength.requirements.length) strength.feedback.push('Password must be at least 8 characters long');
    if (!strength.requirements.uppercase) strength.feedback.push('Add uppercase letters');
    if (!strength.requirements.lowercase) strength.feedback.push('Add lowercase letters');
    if (!strength.requirements.numbers) strength.feedback.push('Add numbers');
    if (!strength.requirements.symbols) strength.feedback.push('Add special characters');

    // Set strength level
    if (strength.score < 3) strength.level = 'weak';
    else if (strength.score < 5) strength.level = 'medium';
    else strength.level = 'strong';

    return strength;
  },

  // URL validation
  isValidUrl: (url) => {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  },

  // Credit card validation (basic Luhn algorithm)
  isValidCreditCard: (cardNumber) => {
    const cleaned = cardNumber.replace(/\D/g, '');
    if (cleaned.length < 13 || cleaned.length > 19) return false;

    let sum = 0;
    let isEven = false;

    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned[i]);

      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }
};

// Encryption and security utilities
const securityUtils = {
  // Generate secure random token
  generateSecureToken: (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
  },

  // Generate UUID
  generateUUID: () => {
    return crypto.randomUUID();
  },

  // Hash password with salt
  hashPassword: async (password, saltRounds = 12) => {
    const bcrypt = require('bcryptjs');
    return await bcrypt.hash(password, saltRounds);
  },

  // Compare password with hash
  comparePassword: async (password, hash) => {
    const bcrypt = require('bcryptjs');
    return await bcrypt.compare(password, hash);
  },

  // Generate hash for data
  generateHash: (data, algorithm = 'sha256') => {
    return crypto.createHash(algorithm).update(data).digest('hex');
  },

  // Generate HMAC
  generateHMAC: (data, secret, algorithm = 'sha256') => {
    return crypto.createHmac(algorithm, secret).update(data).digest('hex');
  },

  // Encrypt data
  encrypt: (text, password) => {
    try {
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(password, 'salt', 32);
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipher(algorithm, key);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      logError(error, { context: 'Data Encryption' });
      throw new Error('Encryption failed');
    }
  },

  // Decrypt data
  decrypt: (encryptedData, password) => {
    try {
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(password, 'salt', 32);
      
      const [ivHex, encrypted] = encryptedData.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      
      const decipher = crypto.createDecipher(algorithm, key);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logError(error, { context: 'Data Decryption' });
      throw new Error('Decryption failed');
    }
  },

  // Generate OTP
  generateOTP: (length = 6) => {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += digits[Math.floor(Math.random() * digits.length)];
    }
    return otp;
  }
};

// Array and object utilities
const dataUtils = {
  // Remove duplicates from array
  removeDuplicates: (array) => {
    return [...new Set(array)];
  },

  // Chunk array into smaller arrays
  chunkArray: (array, size) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  },

  // Shuffle array
  shuffleArray: (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  },

  // Group array by property
  groupBy: (array, property) => {
    return array.reduce((groups, item) => {
      const key = item[property];
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
      return groups;
    }, {});
  },

  // Sort array by property
  sortBy: (array, property, order = 'asc') => {
    return array.sort((a, b) => {
      const aVal = a[property];
      const bVal = b[property];
      
      if (order === 'desc') {
        return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
      } else {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      }
    });
  },

  // Deep clone object
  deepClone: (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => dataUtils.deepClone(item));
    if (typeof obj === 'object') {
      const cloned = {};
      Object.keys(obj).forEach(key => {
        cloned[key] = dataUtils.deepClone(obj[key]);
      });
      return cloned;
    }
  },

  // Merge objects deeply
  deepMerge: (target, source) => {
    const output = { ...target };
    
    if (dataUtils.isObject(target) && dataUtils.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (dataUtils.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = dataUtils.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  },

  // Check if value is object
  isObject: (item) => {
    return item && typeof item === 'object' && !Array.isArray(item);
  },

  // Pick properties from object
  pick: (obj, keys) => {
    return keys.reduce((result, key) => {
      if (obj.hasOwnProperty(key)) {
        result[key] = obj[key];
      }
      return result;
    }, {});
  },

  // Omit properties from object
  omit: (obj, keys) => {
    const result = { ...obj };
    keys.forEach(key => delete result[key]);
    return result;
  },

  // Get nested property value safely
  get: (obj, path, defaultValue = undefined) => {
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
      if (result == null || typeof result !== 'object') {
        return defaultValue;
      }
      result = result[key];
    }
    
    return result !== undefined ? result : defaultValue;
  },

  // Set nested property value
  set: (obj, path, value) => {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
    return obj;
  }
};

// Formatting utilities
const formatUtils = {
  // Format currency
  formatCurrency: (amount, currency = 'USD', locale = 'en-US') => {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency
      }).format(amount);
    } catch (error) {
      return `${amount} ${currency}`;
    }
  },

  // Format number with commas
  formatNumber: (number, decimals = 0) => {
    try {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(number);
    } catch (error) {
      return number.toString();
    }
  },

  // Format percentage
  formatPercentage: (value, decimals = 1) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value);
    } catch (error) {
      return `${(value * 100).toFixed(decimals)}%`;
    }
  },

  // Format file size
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // Format duration
  formatDuration: (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
};

// Medical utilities
const medicalUtils = {
  // Calculate BMI
  calculateBMI: (weight, height) => {
    try {
      // weight in kg, height in cm
      const heightInMeters = height / 100;
      const bmi = weight / (heightInMeters * heightInMeters);
      
      let category = 'Normal';
      if (bmi < 18.5) category = 'Underweight';
      else if (bmi >= 25 && bmi < 30) category = 'Overweight';
      else if (bmi >= 30) category = 'Obese';
      
      return {
        value: Math.round(bmi * 10) / 10,
        category
      };
    } catch (error) {
      return null;
    }
  },

  // Format blood pressure
  formatBloodPressure: (systolic, diastolic) => {
    if (!systolic || !diastolic) return '';
    return `${systolic}/${diastolic} mmHg`;
  },

  // Categorize blood pressure
  categorizeBloodPressure: (systolic, diastolic) => {
    if (systolic < 90 || diastolic < 60) return 'Low';
    if (systolic < 120 && diastolic < 80) return 'Normal';
    if (systolic < 130 && diastolic < 80) return 'Elevated';
    if (systolic < 140 || diastolic < 90) return 'High Stage 1';
    if (systolic < 180 || diastolic < 120) return 'High Stage 2';
    return 'Hypertensive Crisis';
  },

  // Calculate ideal weight range
  calculateIdealWeight: (height, gender) => {
    try {
      // height in cm, using Devine formula
      const heightInches = height / 2.54;
      
      let baseWeight;
      if (gender === 'male') {
        baseWeight = 50 + 2.3 * (heightInches - 60);
      } else {
        baseWeight = 45.5 + 2.3 * (heightInches - 60);
      }
      
      const min = baseWeight * 0.9;
      const max = baseWeight * 1.1;
      
      return {
        min: Math.round(min),
        max: Math.round(max),
        ideal: Math.round(baseWeight)
      };
    } catch (error) {
      return null;
    }
  },

  // Age category
  getAgeCategory: (age) => {
    if (age < 2) return 'Infant';
    if (age < 12) return 'Child';
    if (age < 18) return 'Adolescent';
    if (age < 65) return 'Adult';
    return 'Senior';
  }
};

// API response utilities
const responseUtils = {
  // Success response
  success: (data = null, message = 'Success', meta = {}) => {
    return {
      success: true,
      message,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    };
  },

  // Error response
  error: (message = 'An error occurred', code = 'INTERNAL_ERROR', details = null) => {
    return {
      success: false,
      error: {
        message,
        code,
        details,
        timestamp: new Date().toISOString()
      }
    };
  },

  // Paginated response
  paginated: (data, pagination) => {
    return {
      success: true,
      data,
      pagination: {
        page: pagination.page || 1,
        limit: pagination.limit || 10,
        total: pagination.total || 0,
        pages: Math.ceil((pagination.total || 0) / (pagination.limit || 10)),
        hasNext: pagination.page < Math.ceil((pagination.total || 0) / (pagination.limit || 10)),
        hasPrev: pagination.page > 1
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    };
  }
};

// Performance utilities
const performanceUtils = {
  // Measure execution time
  measureTime: async (fn, label = 'Operation') => {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      console.log(`${label} completed in ${duration}ms`);
      return { result, duration };
    } catch (error) {
      const duration = Date.now() - start;
      console.log(`${label} failed after ${duration}ms`);
      throw error;
    }
  },

  // Debounce function
  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Throttle function
  throttle: (func, limit) => {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  // Memory usage
  getMemoryUsage: () => {
    const usage = process.memoryUsage();
    return {
      rss: formatUtils.formatFileSize(usage.rss),
      heapTotal: formatUtils.formatFileSize(usage.heapTotal),
      heapUsed: formatUtils.formatFileSize(usage.heapUsed),
      external: formatUtils.formatFileSize(usage.external)
    };
  }
};

module.exports = {
  // Export all utility modules
  dateUtils,
  stringUtils,
  validationUtils,
  securityUtils,
  dataUtils,
  formatUtils,
  medicalUtils,
  responseUtils,
  performanceUtils,
  
  // Export individual commonly used functions
  formatDate: dateUtils.formatDate,
  formatDateTime: dateUtils.formatDateTime,
  getRelativeTime: dateUtils.getRelativeTime,
  calculateAge: dateUtils.calculateAge,
  
  capitalize: stringUtils.capitalize,
  toTitleCase: stringUtils.toTitleCase,
  truncate: stringUtils.truncate,
  maskString: stringUtils.maskString,
  generateRandomString: stringUtils.generateRandomString,
  
  isValidEmail: validationUtils.isValidEmail,
  isValidPhone: validationUtils.isValidPhone,
  isValidEthereumAddress: validationUtils.isValidEthereumAddress,
  
  generateSecureToken: securityUtils.generateSecureToken,
  generateUUID: securityUtils.generateUUID,
  generateHash: securityUtils.generateHash,
  generateOTP: securityUtils.generateOTP,
  
  formatCurrency: formatUtils.formatCurrency,
  formatNumber: formatUtils.formatNumber,
  formatFileSize: formatUtils.formatFileSize,
  
  calculateBMI: medicalUtils.calculateBMI,
  formatBloodPressure: medicalUtils.formatBloodPressure,
  
  success: responseUtils.success,
  error: responseUtils.error,
  paginated: responseUtils.paginated,
  
  measureTime: performanceUtils.measureTime,
  debounce: performanceUtils.debounce,
  throttle: performanceUtils.throttle
};
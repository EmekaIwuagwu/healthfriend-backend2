const nodemailer = require('nodemailer');
const { logError } = require('./logger');

// Email configuration
const emailConfig = {
  host: process.env.EMAIL_HOST || 'mail.healthfriend.xyz',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER || 'noreply@healthfriend.xyz',
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateLimit: 10 // max 10 emails per second
};

// Create reusable transporter
const createTransporter = () => {
  try {
    return nodemailer.createTransporter(emailConfig);
  } catch (error) {
    logError(error, { context: 'Email Transporter Creation' });
    throw new Error('Failed to create email transporter');
  }
};

let transporter = createTransporter();

// Verify transporter connection
const verifyConnection = async () => {
  try {
    await transporter.verify();
    console.log('✅ Email service ready');
    return true;
  } catch (error) {
    console.error('❌ Email service error:', error.message);
    logError(error, { context: 'Email Service Verification' });
    return false;
  }
};

// Initialize email service
const initializeEmailService = async () => {
  const isReady = await verifyConnection();
  if (!isReady) {
    // Retry connection
    setTimeout(async () => {
      transporter = createTransporter();
      await verifyConnection();
    }, 5000);
  }
};

// Email templates
const emailTemplates = {
  // Welcome email for new users
  welcome: (userData) => ({
    subject: '🎉 Welcome to HealthFriend - Your Digital Health Companion',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to HealthFriend</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #4CAF50; }
          .logo { font-size: 28px; font-weight: bold; color: #4CAF50; }
          .content { padding: 30px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #4CAF50; color: #fff; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px 0; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">HealthFriend</div>
            <p>Your Trusted Digital Health Companion</p>
          </div>
          <div class="content">
            <h2>Welcome, ${userData.firstName}! 👋</h2>
            <p>Thank you for joining HealthFriend, the future of telemedicine and digital healthcare.</p>
            <p>Your account has been successfully created with the following details:</p>
            <ul>
              <li><strong>Name:</strong> ${userData.firstName} ${userData.lastName}</li>
              <li><strong>Email:</strong> ${userData.email}</li>
              <li><strong>Wallet:</strong> ${userData.walletAddress}</li>
              <li><strong>Role:</strong> ${userData.role.charAt(0).toUpperCase() + userData.role.slice(1)}</li>
            </ul>
            <p>With HealthFriend, you can:</p>
            <ul>
              <li>💬 Chat with AI for instant health insights</li>
              <li>📹 Book video consultations with verified doctors</li>
              <li>🏠 Schedule home visits from healthcare professionals</li>
              <li>💊 Manage your medical records securely</li>
              <li>💳 Pay with cryptocurrency seamlessly</li>
            </ul>
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Get Started</a>
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} HealthFriend. All rights reserved.</p>
            <p>This email was sent to ${userData.email}</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Welcome to HealthFriend, ${userData.firstName}! Your account has been created successfully. Visit ${process.env.FRONTEND_URL}/dashboard to get started.`
  }),

  // Email verification
  emailVerification: (userData, verificationToken) => ({
    subject: '📧 Verify Your HealthFriend Email Address',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #2196F3; }
          .logo { font-size: 28px; font-weight: bold; color: #2196F3; }
          .content { padding: 30px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #2196F3; color: #fff; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .code { font-size: 24px; font-weight: bold; color: #2196F3; letter-spacing: 2px; padding: 15px; background: #f0f8ff; border-radius: 5px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">HealthFriend</div>
            <p>Email Verification Required</p>
          </div>
          <div class="content">
            <h2>Verify Your Email Address</h2>
            <p>Hi ${userData.firstName},</p>
            <p>Please verify your email address to activate your HealthFriend account and access all features.</p>
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}" class="button">Verify Email Address</a>
            </div>
            <p>Or enter this verification code manually:</p>
            <div class="code">${verificationToken.substring(0, 6).toUpperCase()}</div>
            <p><strong>This verification link expires in 24 hours.</strong></p>
            <p>If you didn't create a HealthFriend account, please ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Hi ${userData.firstName}, please verify your email address by visiting: ${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`
  }),

  // Consultation booking confirmation
  consultationBooked: (patientData, doctorData, consultationData) => ({
    subject: '📅 Consultation Confirmed - HealthFriend',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Consultation Confirmed</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #4CAF50; }
          .consultation-card { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50; }
          .doctor-info { display: flex; align-items: center; margin: 15px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #4CAF50; color: #fff; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Consultation Confirmed</h1>
          </div>
          <div class="content">
            <p>Hi ${patientData.firstName},</p>
            <p>Your consultation has been confirmed! Here are the details:</p>
            
            <div class="consultation-card">
              <h3>Consultation Details</h3>
              <p><strong>Type:</strong> ${consultationData.type.replace('_', ' ').toUpperCase()}</p>
              <p><strong>Date:</strong> ${new Date(consultationData.scheduledDate).toLocaleDateString()}</p>
              <p><strong>Time:</strong> ${new Date(consultationData.scheduledDate).toLocaleTimeString()}</p>
              <p><strong>Consultation ID:</strong> ${consultationData.consultationId}</p>
              
              ${doctorData ? `
                <div class="doctor-info">
                  <div>
                    <h4>Your Doctor</h4>
                    <p><strong>Dr. ${doctorData.firstName} ${doctorData.lastName}</strong></p>
                    <p>${doctorData.doctorProfile.specialization.join(', ')}</p>
                    <p>⭐ ${doctorData.doctorProfile.rating}/5 (${doctorData.doctorProfile.totalReviews} reviews)</p>
                  </div>
                </div>
              ` : ''}
              
              ${consultationData.type === 'home_visit' && consultationData.visitAddress ? `
                <p><strong>Visit Address:</strong><br>
                ${consultationData.visitAddress.street}<br>
                ${consultationData.visitAddress.city}, ${consultationData.visitAddress.state}</p>
              ` : ''}
            </div>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/consultations/${consultationData._id}" class="button">View Consultation</a>
              ${consultationData.type === 'video_call' ? `<a href="${consultationData.meetingUrl}" class="button">Join Video Call</a>` : ''}
            </div>
            
            <p><strong>Important Reminders:</strong></p>
            <ul>
              <li>Please be ready 5 minutes before your scheduled time</li>
              <li>Have your medical history and current medications ready</li>
              <li>Ensure stable internet connection for video consultations</li>
              <li>Payment will be processed after consultation completion</li>
            </ul>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Consultation confirmed with Dr. ${doctorData?.firstName} ${doctorData?.lastName} on ${new Date(consultationData.scheduledDate).toLocaleString()}. Consultation ID: ${consultationData.consultationId}`
  }),

  // Payment confirmation
  paymentConfirmation: (userData, paymentData, consultationData) => ({
    subject: '💳 Payment Confirmed - HealthFriend',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Confirmed</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #4CAF50; }
          .payment-card { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50; }
          .amount { font-size: 24px; font-weight: bold; color: #4CAF50; text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Payment Successful</h1>
          </div>
          <div class="content">
            <p>Hi ${userData.firstName},</p>
            <p>Your payment has been successfully processed!</p>
            
            <div class="amount">$${paymentData.amount} ${paymentData.currency}</div>
            
            <div class="payment-card">
              <h3>Payment Details</h3>
              <p><strong>Payment ID:</strong> ${paymentData.paymentId}</p>
              <p><strong>Transaction Hash:</strong> ${paymentData.transactionHash || 'Processing...'}</p>
              <p><strong>Service:</strong> ${paymentData.serviceType.replace('_', ' ').toUpperCase()}</p>
              <p><strong>Date:</strong> ${new Date(paymentData.completedAt || paymentData.createdAt).toLocaleString()}</p>
              <p><strong>Payment Method:</strong> ${paymentData.paymentMethod}</p>
              
              ${consultationData ? `
                <p><strong>Consultation ID:</strong> ${consultationData.consultationId}</p>
              ` : ''}
            </div>
            
            <p>You will receive a receipt and any relevant documentation within the next few minutes.</p>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/payments/${paymentData._id}" class="button">View Receipt</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Payment of $${paymentData.amount} ${paymentData.currency} has been successfully processed. Payment ID: ${paymentData.paymentId}`
  }),

  // Doctor verification status update
  doctorVerification: (doctorData, status, reason = null) => ({
    subject: `🩺 Doctor Verification ${status.charAt(0).toUpperCase() + status.slice(1)} - HealthFriend`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Status Update</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          .header { text-align: center; padding: 20px 0; border-bottom: 2px solid ${status === 'approved' ? '#4CAF50' : '#FF9800'}; }
          .status-card { background: ${status === 'approved' ? '#e8f5e8' : '#fff3e0'}; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${status === 'approved' ? '#4CAF50' : '#FF9800'}; }
          .button { display: inline-block; padding: 12px 30px; background: ${status === 'approved' ? '#4CAF50' : '#FF9800'}; color: #fff; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${status === 'approved' ? '✅' : '⏳'} Verification ${status.charAt(0).toUpperCase() + status.slice(1)}</h1>
          </div>
          <div class="content">
            <p>Dear Dr. ${doctorData.firstName} ${doctorData.lastName},</p>
            
            <div class="status-card">
              <h3>Verification Status Update</h3>
              <p>Your doctor verification status has been updated to: <strong>${status.toUpperCase()}</strong></p>
              
              ${status === 'approved' ? `
                <p>🎉 Congratulations! You are now a verified doctor on HealthFriend and can start accepting patient consultations.</p>
                <p>You can now:</p>
                <ul>
                  <li>Accept video consultation requests</li>
                  <li>Offer home visit services</li>
                  <li>Set your consultation fees</li>
                  <li>Manage your availability schedule</li>
                  <li>Access patient medical records (with consent)</li>
                </ul>
              ` : `
                <p>Your verification is currently under review. Our medical team is carefully examining your submitted documents.</p>
                ${reason ? `<p><strong>Additional Information:</strong> ${reason}</p>` : ''}
                <p>We will notify you once the review is complete. This typically takes 2-3 business days.</p>
              `}
            </div>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/doctor/dashboard" class="button">Access Doctor Dashboard</a>
            </div>
            
            <p>If you have any questions about the verification process, please contact our support team.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Dr. ${doctorData.firstName} ${doctorData.lastName}, your verification status has been updated to: ${status.toUpperCase()}. ${reason ? 'Note: ' + reason : ''}`
  }),

  // Appointment reminder
  appointmentReminder: (userData, consultationData, doctorData, reminderTime) => ({
    subject: '⏰ Consultation Reminder - HealthFriend',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Consultation Reminder</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #FF9800; }
          .reminder-card { background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FF9800; }
          .button { display: inline-block; padding: 12px 30px; background: #FF9800; color: #fff; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Consultation Reminder</h1>
          </div>
          <div class="content">
            <p>Hi ${userData.firstName},</p>
            <p>This is a friendly reminder about your upcoming consultation.</p>
            
            <div class="reminder-card">
              <h3>Consultation in ${reminderTime}</h3>
              <p><strong>Date:</strong> ${new Date(consultationData.scheduledDate).toLocaleDateString()}</p>
              <p><strong>Time:</strong> ${new Date(consultationData.scheduledDate).toLocaleTimeString()}</p>
              <p><strong>Type:</strong> ${consultationData.type.replace('_', ' ').toUpperCase()}</p>
              
              ${doctorData ? `
                <p><strong>Doctor:</strong> Dr. ${doctorData.firstName} ${doctorData.lastName}</p>
                <p><strong>Specialization:</strong> ${doctorData.doctorProfile.specialization.join(', ')}</p>
              ` : ''}
              
              <p><strong>Consultation ID:</strong> ${consultationData.consultationId}</p>
            </div>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/consultations/${consultationData._id}" class="button">View Details</a>
              ${consultationData.type === 'video_call' && consultationData.meetingUrl ? `<a href="${consultationData.meetingUrl}" class="button">Join Now</a>` : ''}
            </div>
            
            <p><strong>Preparation Checklist:</strong></p>
            <ul>
              <li>✅ Test your internet connection</li>
              <li>✅ Prepare your medical history</li>
              <li>✅ List current medications</li>
              <li>✅ Write down your symptoms/concerns</li>
              <li>✅ Ensure quiet, private environment</li>
            </ul>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Reminder: You have a consultation with Dr. ${doctorData?.firstName} ${doctorData?.lastName} ${reminderTime} at ${new Date(consultationData.scheduledDate).toLocaleString()}`
  }),

  // Password reset
  passwordReset: (userData, resetToken) => ({
    subject: '🔐 Password Reset Request - HealthFriend',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #f44336; }
          .button { display: inline-block; padding: 12px 30px; background: #f44336; color: #fff; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .warning { background: #fff3e0; padding: 15px; border-radius: 5px; border-left: 4px solid #ff9800; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hi ${userData.firstName},</p>
            <p>We received a request to reset your HealthFriend account password.</p>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/reset-password?token=${resetToken}" class="button">Reset Password</a>
            </div>
            
            <div class="warning">
              <p><strong>⚠️ Important Security Information:</strong></p>
              <ul>
                <li>This link expires in 1 hour for security</li>
                <li>If you didn't request this reset, please ignore this email</li>
                <li>Never share this link with anyone</li>
                <li>Contact support if you suspect unauthorized access</li>
              </ul>
            </div>
            
            <p>For your security, we recommend using a strong password that includes:</p>
            <ul>
              <li>At least 8 characters</li>
              <li>Mix of uppercase and lowercase letters</li>
              <li>At least one number</li>
              <li>At least one special character</li>
            </ul>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Password reset requested for ${userData.email}. Reset link: ${process.env.FRONTEND_URL}/reset-password?token=${resetToken} (expires in 1 hour)`
  })
};

// Main email sending function
const sendEmail = async (to, template, data = {}, options = {}) => {
  try {
    // Validate required parameters
    if (!to || !template) {
      throw new Error('Recipient email and template are required');
    }

    // Get template content
    let emailContent;
    if (typeof template === 'string' && emailTemplates[template]) {
      emailContent = emailTemplates[template](data);
    } else if (typeof template === 'object') {
      emailContent = template;
    } else {
      throw new Error('Invalid email template');
    }

    // Prepare email options
    const mailOptions = {
      from: options.from || process.env.EMAIL_FROM || 'HealthFriend <noreply@healthfriend.xyz>',
      to: Array.isArray(to) ? to.join(', ') : to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text || emailContent.html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      ...options
    };

    // Add reply-to if specified
    if (options.replyTo) {
      mailOptions.replyTo = options.replyTo;
    }

    // Add attachments if specified
    if (options.attachments) {
      mailOptions.attachments = options.attachments;
    }

    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`✅ Email sent to ${to}: ${emailContent.subject}`);
    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected
    };

  } catch (error) {
    console.error(`❌ Email failed to ${to}:`, error.message);
    logError(error, { 
      context: 'Email Sending',
      recipient: to,
      template: typeof template === 'string' ? template : 'custom',
      data: data
    });
    
    return {
      success: false,
      error: error.message
    };
  }
};

// Bulk email sending with rate limiting
const sendBulkEmails = async (recipients, template, data = {}, options = {}) => {
  const results = [];
  const batchSize = options.batchSize || 10;
  const delay = options.delay || 1000; // 1 second delay between batches
  
  try {
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (recipient) => {
        const recipientEmail = typeof recipient === 'string' ? recipient : recipient.email;
        const recipientData = typeof recipient === 'object' ? { ...data, ...recipient } : data;
        
        const result = await sendEmail(recipientEmail, template, recipientData, options);
        return {
          email: recipientEmail,
          ...result
        };
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value || { success: false, error: r.reason }));
      
      // Delay between batches to avoid overwhelming the server
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`📧 Bulk email completed: ${successful} sent, ${failed} failed`);
    
    return {
      total: recipients.length,
      successful,
      failed,
      results
    };
    
  } catch (error) {
    logError(error, { context: 'Bulk Email Sending', recipientCount: recipients.length });
    throw error;
  }
};

// Email queue for background processing
const emailQueue = [];
let isProcessingQueue = false;

const addToQueue = (to, template, data = {}, options = {}) => {
  emailQueue.push({ to, template, data, options, timestamp: Date.now() });
  if (!isProcessingQueue) {
    processQueue();
  }
};

const processQueue = async () => {
  if (isProcessingQueue || emailQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (emailQueue.length > 0) {
    const emailJob = emailQueue.shift();
    try {
      await sendEmail(emailJob.to, emailJob.template, emailJob.data, emailJob.options);
      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
    } catch (error) {
      logError(error, { context: 'Email Queue Processing', emailJob });
    }
  }
  
  isProcessingQueue = false;
};

// Utility functions
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const generateEmailTemplate = (subject, htmlContent, textContent = null) => {
  return {
    subject,
    html: htmlContent,
    text: textContent || htmlContent.replace(/<[^>]*>/g, '')
  };
};

// Initialize email service
initializeEmailService();

module.exports = {
  // Core functions
  sendEmail,
  sendBulkEmails,
  
  // Queue management
  addToQueue,
  processQueue,
  
  // Templates
  emailTemplates,
  generateEmailTemplate,
  
  // Utilities
  validateEmail,
  verifyConnection,
  initializeEmailService,
  
  // Transporter (for advanced usage)
  getTransporter: () => transporter
};
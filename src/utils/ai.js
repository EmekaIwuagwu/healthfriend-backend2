const OpenAI = require('openai');
const { logError, logSecurity } = require('./logger');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000, // 30 seconds timeout
  maxRetries: 3
});

// AI Configuration
const AI_CONFIG = {
  maxTokens: 1000,
  temperature: 0.3, // Lower temperature for more consistent medical responses
  model: 'gpt-4', // Use GPT-4 for better medical reasoning
  maxConversationLength: 50,
  confidenceThreshold: 0.7,
  safetyFilters: {
    harmfulContent: true,
    medicalAdvice: true,
    emergencyDetection: true
  }
};

// Medical specializations for context
const MEDICAL_SPECIALIZATIONS = [
  'General Practice', 'Internal Medicine', 'Pediatrics', 'Cardiology',
  'Dermatology', 'Endocrinology', 'Gastroenterology', 'Neurology',
  'Orthopedics', 'Psychiatry', 'Radiology', 'Surgery', 'Gynecology',
  'Ophthalmology', 'ENT', 'Urology', 'Oncology', 'Emergency Medicine'
];

// Emergency keywords that require immediate medical attention
const EMERGENCY_KEYWORDS = [
  'chest pain', 'heart attack', 'stroke', 'seizure', 'unconscious',
  'severe bleeding', 'difficulty breathing', 'poisoning', 'overdose',
  'severe allergic reaction', 'anaphylaxis', 'severe trauma',
  'suicidal thoughts', 'suicide', 'self harm', 'overdose'
];

// Prohibited medical advice categories
const PROHIBITED_ADVICE = [
  'prescription medications', 'surgery recommendations', 'cancer diagnosis',
  'psychiatric medication', 'controlled substances', 'abortion',
  'euthanasia', 'illegal substances'
];

// System prompts for different AI functions
const SYSTEM_PROMPTS = {
  symptomAnalysis: `You are HealthFriend AI, a helpful medical assistant that provides preliminary health information and guidance. 

IMPORTANT GUIDELINES:
- You are NOT a replacement for professional medical care
- Always recommend consulting a healthcare provider for proper diagnosis
- Never provide specific medication recommendations or dosages
- Immediately flag emergency situations requiring urgent care
- Be empathetic and supportive while maintaining medical accuracy
- Ask clarifying questions to better understand symptoms
- Provide general health education and wellness tips
- Suggest when to seek different levels of care (urgent care, ER, specialist)

Your role is to:
1. Gather symptom information through thoughtful questions
2. Provide general health education about possible conditions
3. Recommend appropriate level of medical care
4. Offer general wellness and prevention advice
5. Connect users with verified doctors on the platform when needed

Always end responses with appropriate medical disclaimers and encourage professional consultation.`,

  emergencyDetection: `You are an emergency detection system for a medical platform. Analyze the user's message for signs of medical emergencies that require immediate professional attention.

Look for indicators of:
- Life-threatening conditions (chest pain, difficulty breathing, stroke signs)
- Severe mental health crises (suicidal ideation, self-harm)
- Serious injuries or trauma
- Poisoning or overdose
- Severe allergic reactions

Respond with a JSON object containing:
{
  "isEmergency": boolean,
  "urgencyLevel": "low|medium|high|critical",
  "keywords": ["detected emergency keywords"],
  "recommendation": "specific action to take",
  "confidence": 0.0-1.0
}`,

  followUpQuestions: `Generate relevant follow-up questions to better understand the user's medical symptoms and concerns. Ask 2-3 focused questions that would help a healthcare provider assess the situation better.

Consider:
- Symptom duration and progression
- Associated symptoms
- Severity and impact on daily activities
- Previous similar episodes
- Current medications or treatments tried
- Relevant medical history

Format as a JSON array of question strings.`
};

// AI utility class
class AIUtils {
  constructor() {
    this.conversationHistory = new Map();
    this.usageStats = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      dailyUsage: new Map()
    };
  }

  // Main symptom analysis function
  async analyzeSymptoms(symptoms, patientInfo = {}, conversationId = null) {
    try {
      this.usageStats.totalRequests++;
      
      // Input validation and safety checks
      const safetyCheck = await this.performSafetyCheck(symptoms.join(' '));
      if (!safetyCheck.isSafe) {
        return {
          error: 'Content safety violation detected',
          safetyIssue: safetyCheck.issue,
          recommendation: 'Please contact emergency services if this is urgent'
        };
      }

      // Emergency detection
      const emergencyCheck = await this.detectEmergency(symptoms.join(' '));
      if (emergencyCheck.isEmergency) {
        return {
          isEmergency: true,
          urgencyLevel: emergencyCheck.urgencyLevel,
          recommendation: emergencyCheck.recommendation,
          message: 'This appears to be an emergency situation. Please seek immediate medical attention.',
          emergencyNumber: '911'
        };
      }

      // Prepare conversation context
      const conversationContext = conversationId ? 
        this.getConversationHistory(conversationId) : [];

      // Build comprehensive prompt
      const prompt = this.buildSymptomAnalysisPrompt(symptoms, patientInfo, conversationContext);

      // Call OpenAI API
      const response = await openai.chat.completions.create({
        model: AI_CONFIG.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.symptomAnalysis },
          { role: 'user', content: prompt }
        ],
        max_tokens: AI_CONFIG.maxTokens,
        temperature: AI_CONFIG.temperature,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const aiResponse = response.choices[0].message.content;
      
      // Track usage
      this.trackUsage(response.usage);
      
      // Process and format response
      const analysis = await this.processSymptomAnalysis(aiResponse, symptoms, patientInfo);
      
      // Store conversation if ID provided
      if (conversationId) {
        this.updateConversationHistory(conversationId, {
          role: 'user',
          content: `Symptoms: ${symptoms.join(', ')}`,
          timestamp: new Date()
        });
        this.updateConversationHistory(conversationId, {
          role: 'assistant',
          content: aiResponse,
          timestamp: new Date()
        });
      }

      return analysis;

    } catch (error) {
      logError(error, { 
        context: 'AI Symptom Analysis',
        symptoms: symptoms.slice(0, 3), // Log only first 3 symptoms for privacy
        patientInfo: { age: patientInfo.age, gender: patientInfo.gender }
      });
      
      return {
        error: 'AI analysis temporarily unavailable',
        fallbackRecommendation: 'Please consult with a healthcare provider about your symptoms.',
        suggestDoctorConsultation: true
      };
    }
  }

  // Continue AI conversation
  async continueConversation(message, conversationId, patientInfo = {}) {
    try {
      // Safety check
      const safetyCheck = await this.performSafetyCheck(message);
      if (!safetyCheck.isSafe) {
        return {
          error: 'Content safety violation detected',
          message: 'Please rephrase your question and avoid harmful content.'
        };
      }

      // Emergency detection
      const emergencyCheck = await this.detectEmergency(message);
      if (emergencyCheck.isEmergency) {
        return {
          isEmergency: true,
          urgencyLevel: emergencyCheck.urgencyLevel,
          recommendation: emergencyCheck.recommendation,
          message: 'This appears to be an emergency. Please seek immediate medical attention.'
        };
      }

      // Get conversation history
      const conversationHistory = this.getConversationHistory(conversationId) || [];
      
      // Check conversation length limit
      if (conversationHistory.length >= AI_CONFIG.maxConversationLength) {
        return {
          message: 'This conversation has reached its limit. For continued care, please book a consultation with one of our verified doctors.',
          suggestDoctorConsultation: true,
          conversationEnded: true
        };
      }

      // Build messages array for OpenAI
      const messages = [
        { role: 'system', content: SYSTEM_PROMPTS.symptomAnalysis },
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: message }
      ];

      // Call OpenAI API
      const response = await openai.chat.completions.create({
        model: AI_CONFIG.model,
        messages,
        max_tokens: AI_CONFIG.maxTokens,
        temperature: AI_CONFIG.temperature,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const aiResponse = response.choices[0].message.content;
      
      // Track usage
      this.trackUsage(response.usage);

      // Update conversation history
      this.updateConversationHistory(conversationId, {
        role: 'user',
        content: message,
        timestamp: new Date()
      });
      this.updateConversationHistory(conversationId, {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date()
      });

      // Generate follow-up questions
      const followUpQuestions = await this.generateFollowUpQuestions(
        message, 
        conversationHistory, 
        patientInfo
      );

      return {
        message: aiResponse,
        conversationId,
        followUpQuestions,
        conversationLength: conversationHistory.length + 2,
        suggestDoctorConsultation: this.shouldSuggestDoctor(conversationHistory.length + 2, aiResponse)
      };

    } catch (error) {
      logError(error, { 
        context: 'AI Conversation',
        conversationId,
        messageLength: message.length
      });
      
      return {
        error: 'AI temporarily unavailable',
        message: 'I apologize, but I\'m having technical difficulties. Please try again or consult with a healthcare provider.',
        suggestDoctorConsultation: true
      };
    }
  }

  // Emergency detection
  async detectEmergency(text) {
    try {
      const lowerText = text.toLowerCase();
      
      // Quick keyword check
      const foundKeywords = EMERGENCY_KEYWORDS.filter(keyword => 
        lowerText.includes(keyword)
      );
      
      if (foundKeywords.length > 0) {
        return {
          isEmergency: true,
          urgencyLevel: 'critical',
          keywords: foundKeywords,
          recommendation: 'Call emergency services immediately (911)',
          confidence: 0.9
        };
      }

      // AI-based emergency detection for more nuanced cases
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo', // Use faster model for emergency detection
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.emergencyDetection },
          { role: 'user', content: text }
        ],
        max_tokens: 200,
        temperature: 0.1 // Very low temperature for consistent emergency detection
      });

      try {
        const emergencyInfo = JSON.parse(response.choices[0].message.content);
        return emergencyInfo;
      } catch (parseError) {
        // Fallback if JSON parsing fails
        return {
          isEmergency: false,
          urgencyLevel: 'low',
          keywords: [],
          recommendation: 'Monitor symptoms and consult healthcare provider if concerned',
          confidence: 0.5
        };
      }

    } catch (error) {
      logError(error, { context: 'Emergency Detection', textLength: text.length });
      
      // Conservative approach - suggest caution if detection fails
      return {
        isEmergency: false,
        urgencyLevel: 'medium',
        recommendation: 'Unable to assess urgency - please consult healthcare provider if concerned',
        confidence: 0.0
      };
    }
  }

  // Safety content filtering
  async performSafetyCheck(content) {
    try {
      const lowerContent = content.toLowerCase();
      
      // Check for prohibited content
      const harmfulPatterns = [
        /self\s*harm/, /suicide/, /kill\s*(myself|self)/, /end\s*my\s*life/,
        /illegal\s*drugs/, /drug\s*dealing/, /violence/, /abuse/
      ];
      
      const foundHarmful = harmfulPatterns.some(pattern => pattern.test(lowerContent));
      
      if (foundHarmful) {
        logSecurity(
          'ai_harmful_content_detected',
          null,
          null,
          null,
          'high',
          { contentLength: content.length, patterns: 'harmful_patterns_detected' }
        );
        
        return {
          isSafe: false,
          issue: 'harmful_content',
          action: 'blocked'
        };
      }

      // Check for prohibited medical advice requests
      const prohibitedRequests = PROHIBITED_ADVICE.some(advice => 
        lowerContent.includes(advice)
      );
      
      if (prohibitedRequests) {
        return {
          isSafe: false,
          issue: 'prohibited_medical_advice',
          action: 'redirect_to_doctor'
        };
      }

      return {
        isSafe: true,
        confidence: 0.9
      };

    } catch (error) {
      logError(error, { context: 'AI Safety Check' });
      
      // Default to safe if check fails
      return {
        isSafe: true,
        confidence: 0.5,
        note: 'safety_check_failed'
      };
    }
  }

  // Generate follow-up questions
  async generateFollowUpQuestions(message, conversationHistory, patientInfo) {
    try {
      const context = {
        currentMessage: message,
        conversationLength: conversationHistory.length,
        patientAge: patientInfo.age,
        patientGender: patientInfo.gender
      };

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.followUpQuestions },
          { role: 'user', content: `Context: ${JSON.stringify(context)}\n\nGenerate relevant follow-up questions.` }
        ],
        max_tokens: 300,
        temperature: 0.4
      });

      try {
        const questions = JSON.parse(response.choices[0].message.content);
        return Array.isArray(questions) ? questions.slice(0, 3) : [];
      } catch (parseError) {
        return []; // Return empty array if parsing fails
      }

    } catch (error) {
      logError(error, { context: 'Generate Follow-up Questions' });
      return [];
    }
  }

  // Build symptom analysis prompt
  buildSymptomAnalysisPrompt(symptoms, patientInfo, conversationHistory) {
    const patientContext = `
Patient Information:
- Age: ${patientInfo.age || 'Not provided'}
- Gender: ${patientInfo.gender || 'Not provided'}
- Medical History: ${patientInfo.medicalHistory || 'None provided'}
- Current Medications: ${patientInfo.currentMedications || 'None provided'}
- Allergies: ${patientInfo.allergies || 'None provided'}
`;

    const symptomText = `Current Symptoms: ${symptoms.join(', ')}`;
    
    const conversationText = conversationHistory.length > 0 ? 
      `Previous Conversation:\n${conversationHistory.map(msg => 
        `${msg.role}: ${msg.content}`
      ).join('\n')}\n` : '';

    return `${patientContext}\n${symptomText}\n${conversationText}

Please provide:
1. A compassionate acknowledgment of their concerns
2. Possible conditions that could cause these symptoms (with confidence levels)
3. Recommended next steps for care (self-care, urgent care, ER, specialist)
4. General health advice and prevention tips
5. When to seek immediate medical attention
6. Suggestion to book a consultation with our verified doctors if needed

Remember to include appropriate medical disclaimers and maintain an empathetic, supportive tone.`;
  }

  // Process and format AI response
  async processSymptomAnalysis(aiResponse, symptoms, patientInfo) {
    try {
      // Extract key information from AI response
      const analysis = {
        message: aiResponse,
        symptoms: symptoms,
        timestamp: new Date(),
        disclaimer: 'This is not a medical diagnosis. Please consult with a healthcare provider for proper medical advice.',
        
        // Parse structured information from response
        possibleConditions: this.extractConditions(aiResponse),
        recommendedActions: this.extractRecommendations(aiResponse),
        urgencyLevel: this.assessUrgencyLevel(aiResponse),
        suggestDoctorConsultation: this.shouldSuggestDoctor(0, aiResponse),
        
        // Additional metadata
        confidence: this.calculateConfidence(aiResponse, symptoms),
        tags: this.generateTags(symptoms, aiResponse),
        followUpRecommended: true
      };

      return analysis;

    } catch (error) {
      logError(error, { context: 'Process Symptom Analysis' });
      throw error;
    }
  }

  // Extract possible conditions from AI response
  extractConditions(response) {
    try {
      const conditions = [];
      const lines = response.split('\n');
      
      lines.forEach(line => {
        // Look for patterns like "possible conditions:", "might be:", etc.
        if (line.toLowerCase().includes('condition') || 
            line.toLowerCase().includes('possible') ||
            line.toLowerCase().includes('might be')) {
          const condition = line.replace(/^\d+\.?\s*/, '').trim();
          if (condition.length > 5 && condition.length < 100) {
            conditions.push({
              name: condition,
              confidence: 'medium' // Default confidence
            });
          }
        }
      });
      
      return conditions.slice(0, 5); // Limit to 5 conditions
    } catch (error) {
      return [];
    }
  }

  // Extract recommendations from AI response
  extractRecommendations(response) {
    try {
      const recommendations = [];
      const lines = response.split('\n');
      
      lines.forEach(line => {
        if (line.toLowerCase().includes('recommend') || 
            line.toLowerCase().includes('suggest') ||
            line.toLowerCase().includes('should') ||
            line.toLowerCase().includes('consider')) {
          const recommendation = line.replace(/^\d+\.?\s*/, '').trim();
          if (recommendation.length > 10 && recommendation.length < 200) {
            recommendations.push(recommendation);
          }
        }
      });
      
      return recommendations.slice(0, 5); // Limit to 5 recommendations
    } catch (error) {
      return [];
    }
  }

  // Assess urgency level from response
  assessUrgencyLevel(response) {
    const lowerResponse = response.toLowerCase();
    
    if (lowerResponse.includes('emergency') || 
        lowerResponse.includes('immediately') ||
        lowerResponse.includes('urgent')) {
      return 'high';
    } else if (lowerResponse.includes('soon') || 
               lowerResponse.includes('within') ||
               lowerResponse.includes('promptly')) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  // Calculate confidence score
  calculateConfidence(response, symptoms) {
    try {
      let confidence = 0.5; // Base confidence
      
      // Increase confidence based on response quality indicators
      if (response.length > 200) confidence += 0.1;
      if (response.includes('possible') || response.includes('might')) confidence += 0.1;
      if (response.includes('recommend') || response.includes('suggest')) confidence += 0.1;
      if (symptoms.length >= 3) confidence += 0.1;
      
      // Decrease confidence for uncertainty indicators
      if (response.includes('unclear') || response.includes('uncertain')) confidence -= 0.2;
      
      return Math.max(0.1, Math.min(0.9, confidence));
    } catch (error) {
      return 0.5;
    }
  }

  // Generate tags for categorization
  generateTags(symptoms, response) {
    const tags = new Set();
    
    // Add symptom-based tags
    symptoms.forEach(symptom => {
      const lowerSymptom = symptom.toLowerCase();
      if (lowerSymptom.includes('pain')) tags.add('pain');
      if (lowerSymptom.includes('fever')) tags.add('fever');
      if (lowerSymptom.includes('headache')) tags.add('neurological');
      if (lowerSymptom.includes('cough')) tags.add('respiratory');
      if (lowerSymptom.includes('nausea')) tags.add('gastrointestinal');
    });
    
    // Add response-based tags
    const lowerResponse = response.toLowerCase();
    MEDICAL_SPECIALIZATIONS.forEach(spec => {
      if (lowerResponse.includes(spec.toLowerCase())) {
        tags.add(spec.toLowerCase().replace(' ', '_'));
      }
    });
    
    return Array.from(tags).slice(0, 5);
  }

  // Determine if should suggest doctor consultation
  shouldSuggestDoctor(conversationLength, response = '') {
    const lowerResponse = response.toLowerCase();
    
    // Always suggest after 5+ messages
    if (conversationLength >= 5) return true;
    
    // Suggest for concerning content
    if (lowerResponse.includes('serious') || 
        lowerResponse.includes('concerning') ||
        lowerResponse.includes('specialist') ||
        lowerResponse.includes('examination')) {
      return true;
    }
    
    return false;
  }

  // Conversation history management
  getConversationHistory(conversationId) {
    return this.conversationHistory.get(conversationId) || [];
  }

  updateConversationHistory(conversationId, message) {
    const history = this.getConversationHistory(conversationId);
    history.push(message);
    
    // Keep only last 20 messages to prevent context overflow
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
    
    this.conversationHistory.set(conversationId, history);
  }

  clearConversationHistory(conversationId) {
    this.conversationHistory.delete(conversationId);
  }

  // Usage tracking and analytics
  trackUsage(usage) {
    if (usage) {
      this.usageStats.totalTokens += usage.total_tokens || 0;
      
      // Estimate cost (approximate GPT-4 pricing)
      const estimatedCost = (usage.total_tokens || 0) * 0.00003; // $0.03 per 1K tokens
      this.usageStats.totalCost += estimatedCost;
      
      // Track daily usage
      const today = new Date().toISOString().split('T')[0];
      const dailyUsage = this.usageStats.dailyUsage.get(today) || { requests: 0, tokens: 0, cost: 0 };
      dailyUsage.requests += 1;
      dailyUsage.tokens += usage.total_tokens || 0;
      dailyUsage.cost += estimatedCost;
      this.usageStats.dailyUsage.set(today, dailyUsage);
    }
  }

  // Get usage statistics
  getUsageStats() {
    return {
      ...this.usageStats,
      dailyUsage: Object.fromEntries(this.usageStats.dailyUsage)
    };
  }

  // Validate AI service health
  async checkHealth() {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Health check' }],
        max_tokens: 10
      });
      
      return {
        status: 'healthy',
        model: response.model,
        responseTime: Date.now()
      };
    } catch (error) {
      logError(error, { context: 'AI Health Check' });
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

// Create singleton instance
const aiUtils = new AIUtils();

// Export utilities
module.exports = {
  // Main AI utilities
  aiUtils,
  
  // Direct function exports
  analyzeSymptoms: aiUtils.analyzeSymptoms.bind(aiUtils),
  continueConversation: aiUtils.continueConversation.bind(aiUtils),
  detectEmergency: aiUtils.detectEmergency.bind(aiUtils),
  performSafetyCheck: aiUtils.performSafetyCheck.bind(aiUtils),
  
  // Configuration and constants
  AI_CONFIG,
  EMERGENCY_KEYWORDS,
  MEDICAL_SPECIALIZATIONS,
  
  // Utility functions
  getUsageStats: aiUtils.getUsageStats.bind(aiUtils),
  checkHealth: aiUtils.checkHealth.bind(aiUtils),
  clearConversationHistory: aiUtils.clearConversationHistory.bind(aiUtils)
};
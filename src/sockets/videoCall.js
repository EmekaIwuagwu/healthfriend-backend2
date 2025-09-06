const { logError, logAuth, logSecurity } = require('../utils/logger');
const Consultation = require('../models/Consultation');
const User = require('../models/User');
const { roomAuth } = require('../middleware/socketAuth');

// Video call state management
const callSessions = new Map();
const participantConnections = new Map();

// Call states
const CALL_STATES = {
  WAITING: 'waiting',
  CONNECTING: 'connecting', 
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ENDED: 'ended',
  FAILED: 'failed'
};

// WebRTC signaling types
const SIGNALING_TYPES = {
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
  PEER_DISCONNECTED: 'peer-disconnected'
};

// Video call quality metrics
class CallQualityMonitor {
  constructor(consultationId) {
    this.consultationId = consultationId;
    this.metrics = {
      startTime: Date.now(),
      endTime: null,
      participants: new Map(),
      qualityIssues: [],
      networkStats: {
        avgLatency: 0,
        packetLoss: 0,
        bandwidth: 0
      }
    };
  }

  addParticipant(userId, userInfo) {
    this.metrics.participants.set(userId, {
      userId,
      userInfo,
      joinTime: Date.now(),
      leaveTime: null,
      qualityScore: 100,
      issues: []
    });
  }

  removeParticipant(userId) {
    const participant = this.metrics.participants.get(userId);
    if (participant) {
      participant.leaveTime = Date.now();
    }
  }

  reportQualityIssue(userId, issue) {
    const participant = this.metrics.participants.get(userId);
    if (participant) {
      participant.issues.push({
        type: issue.type,
        severity: issue.severity,
        timestamp: Date.now(),
        details: issue.details
      });
      
      // Adjust quality score
      const severityPenalty = { low: 5, medium: 15, high: 30 };
      participant.qualityScore = Math.max(0, 
        participant.qualityScore - (severityPenalty[issue.severity] || 10)
      );
    }

    this.metrics.qualityIssues.push({
      userId,
      ...issue,
      timestamp: Date.now()
    });
  }

  updateNetworkStats(stats) {
    this.metrics.networkStats = {
      ...this.metrics.networkStats,
      ...stats,
      lastUpdated: Date.now()
    };
  }

  getCallSummary() {
    this.metrics.endTime = Date.now();
    const duration = this.metrics.endTime - this.metrics.startTime;
    
    return {
      consultationId: this.consultationId,
      duration,
      participantCount: this.metrics.participants.size,
      averageQuality: this.calculateAverageQuality(),
      issueCount: this.metrics.qualityIssues.length,
      networkStats: this.metrics.networkStats,
      participants: Array.from(this.metrics.participants.values())
    };
  }

  calculateAverageQuality() {
    const participants = Array.from(this.metrics.participants.values());
    if (participants.length === 0) return 0;
    
    const totalQuality = participants.reduce((sum, p) => sum + p.qualityScore, 0);
    return Math.round(totalQuality / participants.length);
  }
}

// Setup video call socket handlers
const setupVideoCall = (io) => {
  const videoNamespace = io.of('/video-calls');
  
  videoNamespace.on('connection', (socket) => {
    console.log(`Video call socket connected: ${socket.id} (User: ${socket.userId})`);
    
    // Log connection
    logAuth(
      'video_socket_connected',
      socket.userId,
      socket.walletAddress,
      socket.handshake.address,
      socket.handshake.headers['user-agent'],
      true,
      null,
      { socketId: socket.id }
    );

    // Join consultation room
    socket.on('join-consultation', async (data, callback) => {
      try {
        await roomAuth.consultationRoom(socket, data.consultationId, async (error, result) => {
          if (error) {
            return callback({ error: error.message });
          }

          const consultation = await Consultation.findById(data.consultationId)
            .populate('patient doctor');

          if (!consultation) {
            return callback({ error: 'Consultation not found' });
          }

          // Initialize call session if not exists
          if (!callSessions.has(data.consultationId)) {
            callSessions.set(data.consultationId, {
              consultationId: data.consultationId,
              state: CALL_STATES.WAITING,
              participants: new Map(),
              startTime: null,
              endTime: null,
              qualityMonitor: new CallQualityMonitor(data.consultationId),
              chatMessages: [],
              recording: {
                isRecording: false,
                recordingId: null,
                startTime: null
              }
            });
          }

          const callSession = callSessions.get(data.consultationId);
          
          // Add participant to session
          const participantInfo = {
            userId: socket.userId,
            socketId: socket.id,
            role: socket.userRole,
            name: socket.userName,
            joinTime: Date.now(),
            isReady: false,
            mediaState: {
              audio: true,
              video: true,
              screen: false
            }
          };

          callSession.participants.set(socket.userId, participantInfo);
          callSession.qualityMonitor.addParticipant(socket.userId, participantInfo);
          
          // Track participant connection
          participantConnections.set(socket.id, {
            userId: socket.userId,
            consultationId: data.consultationId
          });

          // Notify other participants
          socket.to(`consultation_${data.consultationId}`).emit('participant-joined', {
            participant: {
              userId: socket.userId,
              name: socket.userName,
              role: socket.userRole,
              joinTime: participantInfo.joinTime
            }
          });

          // Send current session state to new participant
          callback({
            success: true,
            consultation: {
              id: consultation._id,
              type: consultation.type,
              status: consultation.status,
              scheduledDate: consultation.scheduledDate
            },
            callState: callSession.state,
            participants: Array.from(callSession.participants.values()).map(p => ({
              userId: p.userId,
              name: p.name,
              role: p.role,
              isReady: p.isReady,
              mediaState: p.mediaState
            })),
            chatMessages: callSession.chatMessages.slice(-50) // Last 50 messages
          });

          console.log(`User ${socket.userId} joined consultation ${data.consultationId}`);
        });
      } catch (error) {
        logError(error, { 
          context: 'Join Video Consultation',
          userId: socket.userId,
          consultationId: data.consultationId
        });
        callback({ error: 'Failed to join consultation' });
      }
    });

    // Participant ready state
    socket.on('participant-ready', (data) => {
      const connection = participantConnections.get(socket.id);
      if (!connection) return;

      const callSession = callSessions.get(connection.consultationId);
      if (!callSession) return;

      const participant = callSession.participants.get(socket.userId);
      if (participant) {
        participant.isReady = true;
        
        // Notify all participants
        socket.to(`consultation_${connection.consultationId}`).emit('participant-ready', {
          userId: socket.userId,
          name: participant.name
        });

        // Check if all participants are ready to start call
        const allParticipants = Array.from(callSession.participants.values());
        const allReady = allParticipants.length >= 2 && allParticipants.every(p => p.isReady);
        
        if (allReady && callSession.state === CALL_STATES.WAITING) {
          startCall(connection.consultationId);
        }
      }
    });

    // WebRTC signaling
    socket.on('signal', (data) => {
      const connection = participantConnections.get(socket.id);
      if (!connection) return;

      // Forward signaling data to target peer
      socket.to(`consultation_${connection.consultationId}`).emit('signal', {
        from: socket.userId,
        signal: data.signal,
        type: data.type,
        targetPeer: data.targetPeer
      });

      console.log(`WebRTC signal from ${socket.userId}: ${data.type}`);
    });

    // Media state changes (audio/video mute/unmute)
    socket.on('media-state-change', (data) => {
      const connection = participantConnections.get(socket.id);
      if (!connection) return;

      const callSession = callSessions.get(connection.consultationId);
      if (!callSession) return;

      const participant = callSession.participants.get(socket.userId);
      if (participant) {
        participant.mediaState = { ...participant.mediaState, ...data.mediaState };

        // Notify other participants
        socket.to(`consultation_${connection.consultationId}`).emit('participant-media-change', {
          userId: socket.userId,
          mediaState: participant.mediaState
        });

        console.log(`Media state change from ${socket.userId}:`, data.mediaState);
      }
    });

    // Screen sharing
    socket.on('screen-share-start', (data) => {
      const connection = participantConnections.get(socket.id);
      if (!connection) return;

      socket.to(`consultation_${connection.consultationId}`).emit('screen-share-started', {
        userId: socket.userId,
        name: socket.userName
      });

      console.log(`Screen sharing started by ${socket.userId}`);
    });

    socket.on('screen-share-stop', (data) => {
      const connection = participantConnections.get(socket.id);
      if (!connection) return;

      socket.to(`consultation_${connection.consultationId}`).emit('screen-share-stopped', {
        userId: socket.userId
      });

      console.log(`Screen sharing stopped by ${socket.userId}`);
    });

    // Chat messages during call
    socket.on('chat-message', async (data) => {
      try {
        const connection = participantConnections.get(socket.id);
        if (!connection) return;

        const callSession = callSessions.get(connection.consultationId);
        if (!callSession) return;

        const message = {
          id: require('crypto').randomUUID(),
          userId: socket.userId,
          name: socket.userName,
          message: data.message,
          timestamp: new Date(),
          type: data.type || 'text'
        };

        // Store message in call session
        callSession.chatMessages.push(message);

        // Persist to database
        await Consultation.findByIdAndUpdate(connection.consultationId, {
          $push: {
            chatMessages: {
              sender: socket.userId,
              message: data.message,
              timestamp: message.timestamp,
              messageType: message.type
            }
          }
        });

        // Broadcast to all participants
        videoNamespace.to(`consultation_${connection.consultationId}`).emit('chat-message', message);

        console.log(`Chat message from ${socket.userId} in consultation ${connection.consultationId}`);
      } catch (error) {
        logError(error, { 
          context: 'Video Call Chat Message',
          userId: socket.userId
        });
      }
    });

    // Call quality reporting
    socket.on('quality-report', (data) => {
      const connection = participantConnections.get(socket.id);
      if (!connection) return;

      const callSession = callSessions.get(connection.consultationId);
      if (!callSession) return;

      if (data.issue) {
        callSession.qualityMonitor.reportQualityIssue(socket.userId, data.issue);
      }

      if (data.networkStats) {
        callSession.qualityMonitor.updateNetworkStats(data.networkStats);
      }
    });

    // Recording controls (doctor only)
    socket.on('start-recording', async (data) => {
      try {
        if (socket.userRole !== 'doctor' && socket.userRole !== 'admin') {
          socket.emit('error', { message: 'Only doctors can start recording' });
          return;
        }

        const connection = participantConnections.get(socket.id);
        if (!connection) return;

        const callSession = callSessions.get(connection.consultationId);
        if (!callSession) return;

        if (!callSession.recording.isRecording) {
          callSession.recording = {
            isRecording: true,
            recordingId: require('crypto').randomUUID(),
            startTime: new Date(),
            initiatedBy: socket.userId
          };

          // Update consultation in database
          await Consultation.findByIdAndUpdate(connection.consultationId, {
            recordingUrl: callSession.recording.recordingId,
            'recording.startTime': callSession.recording.startTime
          });

          // Notify all participants
          videoNamespace.to(`consultation_${connection.consultationId}`).emit('recording-started', {
            recordingId: callSession.recording.recordingId,
            startTime: callSession.recording.startTime
          });

          console.log(`Recording started by ${socket.userId} for consultation ${connection.consultationId}`);
        }
      } catch (error) {
        logError(error, { 
          context: 'Start Recording',
          userId: socket.userId
        });
        socket.emit('error', { message: 'Failed to start recording' });
      }
    });

    socket.on('stop-recording', async (data) => {
      try {
        if (socket.userRole !== 'doctor' && socket.userRole !== 'admin') {
          socket.emit('error', { message: 'Only doctors can stop recording' });
          return;
        }

        const connection = participantConnections.get(socket.id);
        if (!connection) return;

        const callSession = callSessions.get(connection.consultationId);
        if (!callSession) return;

        if (callSession.recording.isRecording) {
          const endTime = new Date();
          const duration = endTime - callSession.recording.startTime;

          callSession.recording.isRecording = false;
          callSession.recording.endTime = endTime;
          callSession.recording.duration = duration;

          // Notify all participants
          videoNamespace.to(`consultation_${connection.consultationId}`).emit('recording-stopped', {
            recordingId: callSession.recording.recordingId,
            duration: duration
          });

          console.log(`Recording stopped by ${socket.userId} for consultation ${connection.consultationId}`);
        }
      } catch (error) {
        logError(error, { 
          context: 'Stop Recording',
          userId: socket.userId
        });
        socket.emit('error', { message: 'Failed to stop recording' });
      }
    });

    // End call
    socket.on('end-call', async (data) => {
      try {
        const connection = participantConnections.get(socket.id);
        if (!connection) return;

        // Only doctors or admins can end the call
        if (socket.userRole !== 'doctor' && socket.userRole !== 'admin') {
          socket.emit('error', { message: 'Only doctors can end the consultation' });
          return;
        }

        await endCall(connection.consultationId, socket.userId);
      } catch (error) {
        logError(error, { 
          context: 'End Call',
          userId: socket.userId
        });
      }
    });

    // Handle participant disconnect
    socket.on('disconnect', async (reason) => {
      try {
        const connection = participantConnections.get(socket.id);
        if (connection) {
          await handleParticipantDisconnect(socket, connection, reason);
        }

        logAuth(
          'video_socket_disconnected',
          socket.userId,
          socket.walletAddress,
          socket.handshake.address,
          socket.handshake.headers['user-agent'],
          true,
          null,
          { 
            socketId: socket.id,
            reason,
            consultationId: connection?.consultationId
          }
        );

        console.log(`Video call socket disconnected: ${socket.id} (${reason})`);
      } catch (error) {
        logError(error, { 
          context: 'Video Socket Disconnect',
          userId: socket.userId,
          reason
        });
      }
    });

    // Error handling
    socket.on('error', (error) => {
      logError(error, { 
        context: 'Video Socket Error',
        userId: socket.userId,
        socketId: socket.id
      });
    });
  });

  // Helper function to start call
  const startCall = async (consultationId) => {
    try {
      const callSession = callSessions.get(consultationId);
      if (!callSession) return;

      callSession.state = CALL_STATES.CONNECTED;
      callSession.startTime = new Date();

      // Update consultation status in database
      await Consultation.findByIdAndUpdate(consultationId, {
        status: 'ongoing',
        startedAt: callSession.startTime
      });

      // Notify all participants
      videoNamespace.to(`consultation_${consultationId}`).emit('call-started', {
        startTime: callSession.startTime,
        state: callSession.state
      });

      console.log(`Call started for consultation ${consultationId}`);
    } catch (error) {
      logError(error, { context: 'Start Call', consultationId });
    }
  };

  // Helper function to end call
  const endCall = async (consultationId, endedBy) => {
    try {
      const callSession = callSessions.get(consultationId);
      if (!callSession) return;

      callSession.state = CALL_STATES.ENDED;
      callSession.endTime = new Date();
      
      // Get call summary
      const callSummary = callSession.qualityMonitor.getCallSummary();

      // Update consultation in database
      await Consultation.findByIdAndUpdate(consultationId, {
        status: 'completed',
        endedAt: callSession.endTime,
        duration: Math.round((callSession.endTime - callSession.startTime) / 1000 / 60), // minutes
        qualityScore: callSummary.averageQuality
      });

      // Notify all participants
      videoNamespace.to(`consultation_${consultationId}`).emit('call-ended', {
        endTime: callSession.endTime,
        endedBy: endedBy,
        duration: callSession.endTime - callSession.startTime,
        summary: callSummary
      });

      // Clean up participant connections
      callSession.participants.forEach((participant) => {
        const socketIds = Array.from(participantConnections.keys()).filter(
          socketId => participantConnections.get(socketId).consultationId === consultationId
        );
        socketIds.forEach(socketId => participantConnections.delete(socketId));
      });

      // Remove call session after delay to allow final messages
      setTimeout(() => {
        callSessions.delete(consultationId);
      }, 30000); // 30 seconds

      console.log(`Call ended for consultation ${consultationId} by ${endedBy}`);
    } catch (error) {
      logError(error, { context: 'End Call', consultationId, endedBy });
    }
  };

  // Helper function to handle participant disconnect
  const handleParticipantDisconnect = async (socket, connection, reason) => {
    try {
      const { userId, consultationId } = connection;
      const callSession = callSessions.get(consultationId);
      
      if (callSession) {
        // Remove participant from session
        callSession.participants.delete(userId);
        callSession.qualityMonitor.removeParticipant(userId);

        // Notify other participants
        socket.to(`consultation_${consultationId}`).emit('participant-left', {
          userId: userId,
          reason: reason,
          timestamp: new Date()
        });

        // If this was the last participant or a critical participant, end the call
        const remainingParticipants = callSession.participants.size;
        
        if (remainingParticipants === 0) {
          await endCall(consultationId, userId);
        } else if (remainingParticipants === 1 && callSession.state === CALL_STATES.CONNECTED) {
          // If only one participant remains, mark call as pending
          callSession.state = CALL_STATES.WAITING;
          
          socket.to(`consultation_${consultationId}`).emit('call-state-change', {
            state: CALL_STATES.WAITING,
            message: 'Waiting for other participant to rejoin'
          });
        }
      }

      // Clean up connection tracking
      participantConnections.delete(socket.id);
    } catch (error) {
      logError(error, { 
        context: 'Handle Participant Disconnect',
        userId: connection.userId,
        consultationId: connection.consultationId
      });
    }
  };

  // Periodic cleanup of inactive sessions
  setInterval(() => {
    const now = Date.now();
    const timeout = 60 * 60 * 1000; // 1 hour

    for (const [consultationId, session] of callSessions.entries()) {
      const lastActivity = session.startTime || session.participants.values().next().value?.joinTime || 0;
      
      if (now - lastActivity > timeout && session.participants.size === 0) {
        callSessions.delete(consultationId);
        console.log(`Cleaned up inactive call session: ${consultationId}`);
      }
    }
  }, 15 * 60 * 1000); // Run every 15 minutes

  console.log('✅ Video call socket handlers initialized');
};

// Utility functions for external use
const getActiveCallSessions = () => {
  const sessions = {};
  for (const [consultationId, session] of callSessions.entries()) {
    sessions[consultationId] = {
      state: session.state,
      participantCount: session.participants.size,
      startTime: session.startTime,
      isRecording: session.recording.isRecording
    };
  }
  return sessions;
};

const getCallSession = (consultationId) => {
  return callSessions.get(consultationId);
};

const forceEndCall = async (consultationId, reason = 'Administrative action') => {
  const callSession = callSessions.get(consultationId);
  if (callSession) {
    await endCall(consultationId, 'system');
    
    // Notify participants of forced termination
    videoNamespace.to(`consultation_${consultationId}`).emit('call-force-ended', {
      reason: reason,
      timestamp: new Date()
    });
  }
};

module.exports = {
  setupVideoCall,
  getActiveCallSessions,
  getCallSession,
  forceEndCall,
  CALL_STATES,
  SIGNALING_TYPES
};
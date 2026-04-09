import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken, isAuthenticated } from '@/lib/api';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost';

export function useWebSocket() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [onlineStatus, setOnlineStatus] = useState({}); // { [userId]: { online, lastSeen } }
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(new Set()); // Set of conversationId:userId strings
  const [muteInfo, setMuteInfo] = useState({}); // { [conversationId]: { mutedUntil, durationMinutes } }
  const [bannedFrom, setBannedFrom] = useState(null); // conversationId that user was just banned from
  const [removedFrom, setRemovedFrom] = useState(null); // conversationId that user was just removed from
  const [groupOnlineMembers, setGroupOnlineMembers] = useState([]); // array of online member IDs for current group
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef({});

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!isAuthenticated() || socketRef.current?.connected) return;

    const token = getAccessToken();
    if (!token) return;

    const newSocket = io(SOCKET_URL, {
      path: '/ws/socket.io/',
      transports: ['websocket', 'polling'],
      auth: {
        token: token
      },
      forceNew: true
    });

    // Connection events
    newSocket.on('connect', () => {
      console.log('✅ WebSocket connected:', newSocket.id);
      setConnected(true);
      setSocket(newSocket);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
      setConnected(false);
      setSocket(null);
    });

    newSocket.on('connect_error', (error) => {
      console.error('🔌 WebSocket connection error:', error);
      setConnected(false);
    });

    // Online / offline presence
    newSocket.on('user:online', ({ userId, userName }) => {
      setOnlineStatus(prev => ({
        ...prev,
        [userId]: { online: true, lastSeen: null }
      }));
      setOnlineUsers(prev => prev.includes(userId) ? prev : [...prev, userId]);
    });

    newSocket.on('user:offline', ({ userId, lastSeen }) => {
      setOnlineStatus(prev => ({
        ...prev,
        [userId]: { online: false, lastSeen: lastSeen || new Date().toISOString() }
      }));
      setOnlineUsers(prev => prev.filter(id => id !== userId));
    });

    newSocket.on('user:onlineStatus', ({ userId, online, lastSeen }) => {
      setOnlineStatus(prev => ({ ...prev, [userId]: { online, lastSeen } }));
    });

    // Chat events
    newSocket.on('message:new', (message) => {
      console.log('📨 Received new message:', message);
      setMessages(prev => {
        // Skip if we already have a message with the same _id (optimistic temp or true duplicate)
        if (message._id && prev.some(m => m._id === message._id || m.tempId === message._id)) {
          return prev;
        }
        return [...prev, message];
      });
    });

    newSocket.on('message:ack', (data) => {
      console.log('✅ Message acknowledgment:', data);
      const { tempId, messageId, status } = data;
      setMessages(prev => 
        prev.map(msg => 
          msg.tempId === tempId || msg._id === messageId 
            ? { ...msg, _id: messageId, status: status || 'delivered' } 
            : msg
        )
      );
    });

    newSocket.on('message:error', (data) => {
      console.warn('⚠️ Message send error:', data);
      if (!data) return;
      const { tempId, error } = data;
      setMessages(prev => 
        prev.map(msg => 
          msg.tempId === tempId 
            ? { ...msg, status: 'failed', error } 
            : msg
        )
      );
    });

    newSocket.on('message:sent', (data) => {
      console.log('📤 Message sent confirmation:', data);
      const { messageId, status } = data;
      setMessages(prev => 
        prev.map(msg => 
          msg._id === messageId || msg.tempId === messageId
            ? { ...msg, status: status || 'sent' } 
            : msg
        )
      );
    });

    // Typing events — keyed by conversationId:userId
    newSocket.on('user:typing', ({ userId, username: uname, conversationId, isTyping }) => {
      console.log('[WS] user:typing received', { userId, conversationId, isTyping });
      const key = `${conversationId}:${userId}`;
      setTyping(prev => {
        const next = new Set(prev);
        if (isTyping) next.add(key); else next.delete(key);
        return next;
      });

      if (isTyping) {
        if (typingTimeoutRef.current[key]) clearTimeout(typingTimeoutRef.current[key]);
        typingTimeoutRef.current[key] = setTimeout(() => {
          setTyping(prev => { const n = new Set(prev); n.delete(key); return n; });
          delete typingTimeoutRef.current[key];
        }, 3000);
      } else {
        clearTimeout(typingTimeoutRef.current[key]);
        delete typingTimeoutRef.current[key];
      }
    });

    // Online users
    newSocket.on('users:online', (users) => {
      setOnlineUsers(users);
    });

    // Member moderation events
    newSocket.on('member:banned', ({ conversationId }) => {
      console.log('🚫 You were banned from conversation:', conversationId);
      setBannedFrom(conversationId);
    });

    newSocket.on('member:removed', ({ conversationId }) => {
      console.log('👢 You were removed from conversation:', conversationId);
      setRemovedFrom(conversationId);
    });

    newSocket.on('member:muted', ({ conversationId, mutedUntil, durationMinutes }) => {
      console.log('🔇 You were muted in conversation:', conversationId, 'until', mutedUntil);
      setMuteInfo(prev => ({
        ...prev,
        [conversationId]: { mutedUntil, durationMinutes }
      }));
    });

    newSocket.on('member:unmuted', ({ conversationId }) => {
      console.log('🔊 You were unmuted in conversation:', conversationId);
      setMuteInfo(prev => {
        const next = { ...prev };
        delete next[conversationId];
        return next;
      });
    });

    // Group online members response
    newSocket.on('group:onlineMembers', ({ onlineIds }) => {
      setGroupOnlineMembers(onlineIds || []);
    });

    socketRef.current = newSocket;
    return newSocket;
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setSocket(null);
    setConnected(false);
    setOnlineUsers([]);
    setTyping(new Set());
  }, []);

  // Send message — also stops typing
  const sendMessage = useCallback((conversationId, content, type = 'text') => {
    if (!socket || !connected) return false;

    // Stop typing before sending
    socket.emit('typing:stop', conversationId);

    const tempId = Date.now().toString();
    const tempMessage = {
      tempId,
      conversationId,
      content,
      type,
      sender: { username: 'You' },
      timestamp: new Date().toISOString(),
      status: 'sending'
    };

    setMessages(prev => [...prev, tempMessage]);

    socket.emit('message:send', {
      conversationId,
      content,
      type,
      tempId
    });

    return tempId;
  }, [socket, connected]);

  // Check online status of a user (emits user:onlineStatus response)
  const checkOnline = useCallback((targetUserId) => {
    if (!socket || !connected) return;
    socket.emit('user:checkOnline', { targetUserId });
  }, [socket, connected]);

  // Join conversation
  const joinConversation = useCallback((conversationId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join:conversation', conversationId);
    }
  }, []);

  // Request online members for a group
  const getGroupOnlineMembers = useCallback((memberIds) => {
    if (socketRef.current?.connected && memberIds?.length) {
      socketRef.current.emit('group:getOnlineMembers', { memberIds });
    } else {
      setGroupOnlineMembers([]);
    }
  }, []);

  // Leave conversation
  const leaveConversation = useCallback((conversationId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave:conversation', conversationId);
    }
  }, []);

  // Typing indicators
  const startTyping = useCallback((conversationId, targetUserId) => {
    console.log('[WS] startTyping', { conversationId, targetUserId, socketConnected: socketRef.current?.connected });
    if (socketRef.current?.connected) {
      socketRef.current.emit('typing:start', { conversationId, targetUserId });
    }
  }, []);

  const stopTyping = useCallback((conversationId, targetUserId) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('typing:stop', { conversationId, targetUserId });
    }
  }, []);

  // Get online users
  const getOnlineUsers = useCallback(() => {
    if (socket && connected) {
      socket.emit('users:getOnline');
    }
  }, [socket, connected]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
      // Clean up typing timeouts
      Object.values(typingTimeoutRef.current).forEach(clearTimeout);
    };
  }, [connect, disconnect]);

  return {
    socket,
    connected,
    onlineUsers,
    onlineStatus,
    messages,
    typing, // Raw Set of "conversationId:userId" — filter in components
    muteInfo,
    bannedFrom,
    removedFrom,
    clearBannedFrom: () => setBannedFrom(null),
    clearRemovedFrom: () => setRemovedFrom(null),
    clearMuteInfo: (convId) => setMuteInfo(prev => { const n = { ...prev }; delete n[convId]; return n; }),
    groupOnlineMembers,
    getGroupOnlineMembers,
    connect,
    disconnect,
    sendMessage,
    checkOnline,
    joinConversation,
    leaveConversation,
    startTyping,
    stopTyping,
    getOnlineUsers,
    clearMessages: () => setMessages([])
  };
}
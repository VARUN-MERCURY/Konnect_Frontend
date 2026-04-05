'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getAccessToken, getConversations, getCurrentUser, authenticatedRequest, getMessages } from '@/lib/api';
import { useWebSocket } from '@/lib/websocket';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProfileModal from '@/components/ProfileModal';
import SettingsModal from '@/components/SettingsModal';
import AddContactModal from '@/components/AddContactModal';
import GroupInfoModal from '@/components/GroupInfoModal';
import JoinGroupModal from '@/components/JoinGroupModal';

export default function ChatPage() {
  const router = useRouter();
  const { 
    connected, 
    onlineUsers,
    onlineStatus,
    messages, 
    typing, 
    sendMessage, 
    joinConversation,
    leaveConversation,
    startTyping,
    stopTyping,
    checkOnline,
    clearMessages 
  } = useWebSocket();

  // UI State
  const [selectedChat, setSelectedChat] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [username, setUsername] = useState('User');
  const [userInitial, setUserInitial] = useState('U');
  const [currentUserCode, setCurrentUserCode] = useState('Loading...');
  const [currentUser, setCurrentUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showJoinGroup, setShowJoinGroup] = useState(false);
  
  // Chat data and loading states
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [conversationsError, setConversationsError] = useState('');

  // Per-conversation message history (fetched from DB)
  const [historyByConv, setHistoryByConv] = useState({}); // { [convId]: Message[] }
  const [historyPage, setHistoryPage] = useState({}); // { [convId]: number }
  const [historyHasMore, setHistoryHasMore] = useState({}); // { [convId]: bool }
  const [loadingHistory, setLoadingHistory] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const prevChatIdRef = useRef(null);

  const HISTORY_LIMIT = 30;

  // Auto-scroll to bottom only for new messages (not history loads)
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]); // only for real-time messages

  // Fetch a page of history for the current conversation
  const fetchHistory = useCallback(async (convId, page, prepend = false) => {
    if (loadingHistory) return;
    setLoadingHistory(true);

    // Remember scroll position if prepending (loading older messages)
    const container = messagesContainerRef.current;
    const prevScrollHeight = container ? container.scrollHeight : 0;

    try {
      const fetched = await getMessages(convId, page, HISTORY_LIMIT);
      setHistoryByConv(prev => {
        const existing = prev[convId] || [];
        return {
          ...prev,
          [convId]: prepend ? [...fetched, ...existing] : fetched
        };
      });
      setHistoryPage(prev => ({ ...prev, [convId]: page }));
      setHistoryHasMore(prev => ({
        ...prev,
        [convId]: fetched.length === HISTORY_LIMIT
      }));

      if (prepend && container) {
        // Restore scroll position so view doesn't jump
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        });
      } else {
        // First load — scroll to bottom immediately
        requestAnimationFrame(() => scrollToBottom('instant'));
      }
    } catch (err) {
      console.error('Error loading message history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [loadingHistory, scrollToBottom]);

  // Handle scroll-up to load older messages
  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || !selectedChat) return;
    if (container.scrollTop < 80 && !loadingHistory && historyHasMore[selectedChat.id]) {
      const nextPage = (historyPage[selectedChat.id] || 1) + 1;
      fetchHistory(selectedChat.id, nextPage, true);
    }
  }, [selectedChat, loadingHistory, historyHasMore, historyPage, fetchHistory]);

  // Load user info from API on component mount
  useEffect(() => {
    const loadUserInfo = async () => {
      console.log('loadUserInfo called, checking authentication...');
      
      if (!isAuthenticated()) {
        console.log('Not authenticated, redirecting to login');
        router.push('/login');
        return;
      }

      try {
        console.log('Fetching current user data...');
        const currentUser = await getCurrentUser();  
        console.log('Current user data received:', currentUser);
        
        if (currentUser && typeof currentUser === 'object') {
          setCurrentUser(currentUser); // Store full user data
          
          const displayName = currentUser.name || currentUser.username || 'User';
          const initial = (currentUser.name && currentUser.name[0]) || 
                         (currentUser.username && currentUser.username[0]) || 'U';
          
          setUsername(displayName);
          setUserInitial(initial.toUpperCase());
          
          // Store user code from database
          setCurrentUserCode(currentUser.userCode);
          
          console.log('User info updated:', { displayName, initial, userCode: currentUser.userCode });
        } else {
          console.error('getCurrentUser returned invalid data:', currentUser);
          throw new Error('Invalid user data received');
        }
      } catch (error) {
        console.error('Error loading user info:', error);
        
        // Check if it's an auth error
        if (error.message === 'Authentication expired' || 
            error.message === 'No access token available') {
          console.log('Authentication error, redirecting to login');
          router.push('/login');
          return;
        }
        
        // Fallback to session storage if API fails
        console.log('Using fallback user info from session storage');
        const email = sessionStorage.getItem('pendingEmail') || 'user@konnect.com';
        const name = email.split('@')[0];
        setUsername(name);
        setUserInitial(name[0]?.toUpperCase() || 'U');
        setCurrentUserCode('KC000000'); // Temporary fallback
      }
    };

    if (typeof window !== 'undefined') {
      loadUserInfo();
    }
  }, []);

  // Load conversations from API
  useEffect(() => {
    const loadConversations = async () => {
      if (!isAuthenticated()) {
        router.push('/login');
        return;
      }

      setLoadingConversations(true);
      setConversationsError('');
      
      try {
        const apiConversations = await getConversations();
        
        // Transform API data to frontend format
        const transformedConversations = apiConversations.map(conv => ({
          id: conv.conversationId,
          name: conv.displayInfo.name,
          type: conv.type,
          avatar: conv.displayInfo.avatar || (conv.type === 'group' ? '👥' : conv.displayInfo.name[0]?.toUpperCase()),
          lastMessage: conv.lastMessage ? conv.lastMessage.content : '',
          lastTime: conv.lastMessage ? conv.lastMessage.timestamp : conv.updatedAt,
          unread: conv.unreadCount || 0,
          online: conv.displayInfo.isOnline || false,
          otherUserId: conv.displayInfo.otherUserId || null,
          participants: conv.displayInfo.participantCount || 2,
          userRole: conv.userRole,
          isPremium: conv.isPremium
        }));
        
        setConversations(transformedConversations);
        
        // If no conversations exist, show empty state (don't create fake ones)
        if (transformedConversations.length === 0) {
          console.log('No conversations found - user can create new ones');
        }
      } catch (error) {
        console.error('Error loading conversations:', error);
        setConversationsError('Failed to load conversations. Please try again.');
        
        // Fallback: create a welcome message if no conversations can be loaded
        setConversations([]);
      } finally {
        setLoadingConversations(false);
      }
    };

    loadConversations();
  }, [router]);

  // Auto-select first conversation
  useEffect(() => {
    if (!selectedChat && conversations.length > 0 && !loadingConversations) {
      setSelectedChat(conversations[0]);
    }
  }, [selectedChat, conversations, loadingConversations]);

  // Join conversation when selected
  useEffect(() => {
    if (selectedChat && connected) {
      joinConversation(selectedChat.id);
    }
  }, [selectedChat, connected, joinConversation]);

  // Load message history when conversation is selected for the first time
  useEffect(() => {
    if (!selectedChat) return;
    const convId = selectedChat.id;
    // Only fetch if we haven't loaded this conversation before
    if (!historyByConv[convId]) {
      fetchHistory(convId, 1, false);
    } else {
      // Already loaded, just scroll to bottom
      requestAnimationFrame(() => scrollToBottom('instant'));
    }
    clearMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?.id]);

  // Join/leave conversation rooms and check online status when chat changes
  useEffect(() => {
    if (!connected) return;

    // Leave previous conversation room
    if (prevChatIdRef.current && prevChatIdRef.current !== selectedChat?.id) {
      leaveConversation(prevChatIdRef.current);
    }

    if (!selectedChat) {
      prevChatIdRef.current = null;
      return;
    }

    // Join new conversation room (needed to receive typing events)
    joinConversation(selectedChat.id);
    prevChatIdRef.current = selectedChat.id;

    // Check online status for direct chats
    if (selectedChat.type !== 'group' && selectedChat.otherUserId) {
      checkOnline(selectedChat.otherUserId);
    }
  }, [selectedChat?.id, connected, joinConversation, leaveConversation, checkOnline]);

  // Handle message send
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !connected || !selectedChat) return;

    sendMessage(selectedChat.id, messageInput.trim());
    setMessageInput('');
    handleStopTyping();

    // Update last message in conversation
    setConversations(prev => 
      prev.map(conv => 
        conv.id === selectedChat.id 
          ? { ...conv, lastMessage: messageInput.trim(), lastTime: new Date().toISOString() }
          : conv
      )
    );
  };

  // Typing indicators
  const handleStartTyping = () => {
    if (!selectedChat) return;
    startTyping(selectedChat.id, selectedChat.otherUserId);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      handleStopTyping();
    }, 3000);
  };

  const handleStopTyping = () => {
    if (!selectedChat) return;
    stopTyping(selectedChat.id, selectedChat.otherUserId);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  const handleInputChange = (e) => {
    setMessageInput(e.target.value);
    if (e.target.value.trim()) {
      handleStartTyping();
    } else {
      handleStopTyping();
    }
  };

  // Format time for display
  const formatTime = (timestamp) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatMessageTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return 'last seen recently';
    const now = new Date();
    const date = new Date(lastSeen);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'last seen just now';
    if (diffMins < 60) return `last seen ${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `last seen ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'last seen yesterday';
    return `last seen ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  // Add new contact/conversation
  const handleAddContact = async (newConversation) => {
    try {
      // Create conversation in database
      const response = await authenticatedRequest('/api/conversations/direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          participantId: newConversation.userId,
          name: newConversation.name
        })
      });

      if (response.ok) {
        const conversationData = response.data;
        console.log('✅ Conversation created in database:', conversationData);
        
        // Update the conversation with real database ID
        const updatedConversation = {
          ...newConversation,
          id: conversationData.conversationId || conversationData._id,
          otherUserId: newConversation.userId || newConversation.otherUserId,
        };
        
        setConversations(prev => [updatedConversation, ...prev]);
        setSelectedChat(updatedConversation);
        
        // Join the conversation room in WebSocket
        joinConversation(updatedConversation.id);
      } else {
        console.error('❌ Failed to create conversation:', response.data);
        throw new Error(response.data?.error || 'Failed to create conversation');
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
      // Fallback to local-only conversation for now
      setConversations(prev => [newConversation, ...prev]);
      setSelectedChat(newConversation);
    }
  };

  // Join new group
  const handleJoinGroup = (newGroup) => {
    setConversations(prev => [newGroup, ...prev]);
    setSelectedChat(newGroup);
  };

  // Filter conversations based on search
  const filteredConversations = conversations.filter(conv =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get message status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'sending':
        return <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />;
      case 'delivered':
        return (
          <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L9 11.586 6.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l7-7a1 1 0 000-1.414z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <ProtectedRoute>
      {/* Profile Modal */}
      <ProfileModal 
        show={showProfile} 
        onClose={() => setShowProfile(false)} 
        username={username} 
        userInitial={userInitial} 
        userCode={currentUserCode}
      />
      
      {/* Settings Modal */}
      <SettingsModal 
        show={showSettings} 
        onClose={() => setShowSettings(false)} 
      />

      {/* Add Contact Modal */}
      <AddContactModal 
        show={showAddContact} 
        onClose={() => setShowAddContact(false)}
        onAddContact={handleAddContact}
        currentUser={currentUser}
      />

      {/* Group Info Modal */}
      <GroupInfoModal 
        show={showGroupInfo} 
        onClose={() => setShowGroupInfo(false)}
        group={selectedChat}
      />

      {/* Join Group Modal */}
      <JoinGroupModal 
        show={showJoinGroup} 
        onClose={() => setShowJoinGroup(false)}
        onJoinGroup={handleJoinGroup}
      />

      <div className="h-screen bg-gray-100 flex overflow-hidden">
        {/* Left Sidebar - Chat List */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center cursor-pointer"
                     onClick={() => setShowProfile(!showProfile)}>
                  <span className="text-white font-semibold text-sm">{userInitial}</span>
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">{username}</h2>
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    <span className="text-xs text-gray-500">{connected ? 'Connected' : 'Offline'}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => setShowAddContact(true)}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                  title="Add Contact"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </button>
                <button 
                  onClick={() => setShowJoinGroup(true)}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                  title="Join Group"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </button>
                <button className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <button 
                  onClick={() => router.push('/dashboard')}
                  className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                  title="Back to Dashboard"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {loadingConversations ? (
              // Loading State - WhatsApp-style loading animation
              <div className="p-4">
                <div className="space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="animate-pulse flex items-center space-x-3 p-3">
                      <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                      <div className="flex-1 space-y-2">
                        <div className="flex justify-between">
                          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                          <div className="h-3 bg-gray-200 rounded w-12"></div>
                        </div>
                        <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-center mt-6">
                  <div className="inline-flex items-center space-x-2 text-gray-500">
                    <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></div>
                    <span className="text-sm">Loading your chats...</span>
                  </div>
                </div>
              </div>
            ) : conversationsError ? (
              // Error State
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <svg className="w-12 h-12 text-red-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-600 mb-4">{conversationsError}</p>
                <button 
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : filteredConversations.length === 0 ? (
              // Empty State
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No conversations yet</h3>
                <p className="text-gray-600 mb-6">Start chatting by adding contacts or joining groups!</p>
                <div className="flex space-x-3">
                  <button 
                    onClick={() => setShowAddContact(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Add Contact
                  </button>
                  <button 
                    onClick={() => setShowJoinGroup(true)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Join Group
                  </button>
                </div>
              </div>
            ) : (
              // Conversations List
              filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => {
                    setSelectedChat(conversation);
                  }}
                  className={`px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50 ${
                    selectedChat?.id === conversation.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {/* Avatar */}
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-lg font-semibold">
                        {conversation.avatar}
                      </div>
                      {conversation.online && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-400 border-2 border-white rounded-full"></div>
                      )}
                    </div>
                    
                    {/* Chat Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900 truncate">{conversation.name}</h3>
                        <div className="flex items-center space-x-1">
                          <span className="text-xs text-gray-500">{formatTime(conversation.lastTime)}</span>
                          {conversation.unread > 0 && (
                            <div className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-medium">
                              {conversation.unread}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-600 truncate mt-0.5">{conversation.lastMessage}</p>
                        {conversation.type === 'group' && (
                          <span className="text-xs text-gray-400" title={`${conversation.participants} participants`}>
                            {conversation.participants}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        {selectedChat ? (
          <div className="flex-1 flex flex-col bg-gray-50">
            {/* Chat Header */}
            <div className="px-6 py-4 bg-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-lg font-semibold">
                    {selectedChat.avatar}
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900">{selectedChat.name}</h2>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      {selectedChat.type === 'group' ? (
                        <>
                          <span>{selectedChat.participants} participants</span>
                          <span>•</span>
                          <span>{onlineUsers.length} online</span>
                        </>
                      ) : (() => {
                        const status = onlineStatus[selectedChat.otherUserId];
                        if (status?.online) return <span className="text-green-500 font-medium">online</span>;
                        if (status?.lastSeen) return <span>{formatLastSeen(status.lastSeen)}</span>;
                        return <span>last seen recently</span>;
                      })()}
                      {Array.from(typing).some(k => k.startsWith(`${selectedChat.id}:`)) && (
                        <>
                          <span>•</span>
                          <span className="text-indigo-600">typing...</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                  {selectedChat?.type === 'group' && (
                    <button 
                      onClick={() => setShowGroupInfo(true)}
                      className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                      title="Group Info"
                    >
                      <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  )}
                  <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Messages Area */}
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-y-auto px-6 py-4 space-y-4" 
                 style={{ backgroundImage: "url('data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\" viewBox=\"0 0 100 100\"><defs><pattern id=\"grain\" width=\"100\" height=\"100\" patternUnits=\"userSpaceOnUse\"><circle cx=\"50\" cy=\"50\" r=\"0.5\" fill=\"%23000\" fill-opacity=\"0.02\"/></pattern></defs><rect width=\"100\" height=\"100\" fill=\"url(%23grain)\"/></svg>')" }}>
              {/* Load more spinner at top */}
              {loadingHistory && (
                <div className="flex justify-center py-2">
                  <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              )}
              {historyHasMore[selectedChat.id] && !loadingHistory && (
                <div className="text-center text-xs text-gray-400 py-1">Scroll up to load older messages</div>
              )}

              {/* Combined history + realtime messages */}
              {(() => {
                const history = historyByConv[selectedChat.id] || [];
                // Merge: history first, then real-time messages that aren't already in history
                const historyIds = new Set(history.map(m => m._id));
                const realtimeOnly = messages.filter(
                  m => m.conversationId === selectedChat.id && (!m._id || !historyIds.has(m._id))
                );
                const allMessages = [...history, ...realtimeOnly];

                if (allMessages.length === 0 && !loadingHistory) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm">
                        <div className="text-3xl">{selectedChat.avatar}</div>
                      </div>
                      <h3 className="text-xl font-semibold text-gray-700 mb-2">Welcome to {selectedChat.name}!</h3>
                      <p className="text-gray-500 max-w-md">
                        {selectedChat.type === 'group'
                          ? `Start chatting with ${selectedChat.participants} participants in this group.`
                          : 'Start your conversation by sending a message below.'
                        }
                      </p>
                    </div>
                  );
                }

                return allMessages.map((message, index) => {
                  const isMyMessage =
                    message.senderId?._id === currentUser?._id ||
                    message.senderId === currentUser?._id ||
                    message.sender?.username === 'You' ||
                    message.senderId?.toString() === currentUser?._id?.toString();
                  const senderName = message.senderId?.name || message.senderInfo?.name || message.sender?.username || 'Unknown';
                  const showAvatar = !isMyMessage && (index === 0 || allMessages[index - 1]?.senderId?._id?.toString() !== message.senderId?._id?.toString());

                  return (
                    <div key={message._id || message.tempId || index}
                         className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-4' : 'mt-1'}`}>
                      {!isMyMessage && (
                        <div className={`w-8 h-8 mr-2 ${showAvatar ? '' : 'opacity-0'}`}>
                          {showAvatar && (
                            <div className="w-8 h-8 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-medium">
                                {senderName[0]?.toUpperCase() || 'U'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className={`max-w-md group ${isMyMessage ? 'items-end' : 'items-start'} flex flex-col`}>
                        {!isMyMessage && showAvatar && selectedChat.type === 'group' && (
                          <div className="text-xs font-medium text-gray-600 mb-1 px-1">{senderName}</div>
                        )}
                        <div className={`${
                          isMyMessage
                            ? 'bg-indigo-600 text-white rounded-l-2xl rounded-tr-md rounded-br-2xl'
                            : 'bg-white text-gray-900 rounded-r-2xl rounded-tl-md rounded-bl-2xl shadow-sm'
                        } px-4 py-2 relative`}>
                          <div className="text-sm leading-relaxed">{message.content}</div>
                          <div className={`flex items-center justify-end space-x-1 mt-1 text-xs ${
                            isMyMessage ? 'text-indigo-200' : 'text-gray-500'
                          }`}>
                            <span>{formatMessageTime(message.timestamp || message.createdAt)}</span>
                            {isMyMessage && getStatusIcon(message.status)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="px-6 py-4 bg-white border-t border-gray-200">
              <form onSubmit={handleSendMessage} className="flex items-end space-x-3">
                {/* Emoji Button */}
                <button
                  type="button"
                  className="p-3 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                
                {/* Message Input */}
                <div className="flex-1 relative">
                  <textarea
                    value={messageInput}
                    onChange={handleInputChange}
                    placeholder={connected ? "Type a message..." : "Connecting..."}
                    disabled={!connected}
                    rows={1}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent max-h-32"
                    style={{ minHeight: '48px' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                </div>
                
                {/* Attach Button */}
                <button
                  type="button"
                  className="p-3 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                
                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!connected || !messageInput.trim()}
                  className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Welcome Screen */
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
            <div className="text-center max-w-md">
              <div className="w-32 h-32 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-8">
                <div className="text-6xl text-white">💬</div>
              </div>
              {loadingConversations ? (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Loading your chats...</h2>
                  <div className="inline-flex items-center space-x-2 text-gray-600">
                    <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></div>
                    <span>Getting everything ready for you</span>
                  </div>
                </>
              ) : conversations.length === 0 ? (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Konnect Chat</h2>
                  <p className="text-gray-600 leading-relaxed mb-6">
                    You don't have any conversations yet. Start chatting by adding contacts or joining groups!
                  </p>
                  <div className="flex space-x-3 justify-center">
                    <button 
                      onClick={() => setShowAddContact(true)}
                      className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Add Contact
                    </button>
                    <button 
                      onClick={() => setShowJoinGroup(true)}
                      className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Join Group
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Konnect Chat</h2>
                  <p className="text-gray-600 leading-relaxed">
                    Select a conversation from the sidebar to start chatting with your contacts and groups. 
                    Stay connected with real-time messaging, typing indicators, and more.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Mobile responsive overlay for smaller screens */}
      <style jsx global>{`
        @media (max-width: 768px) {
          .w-80 {
            width: 100% !important;
          }
          .flex-1 {
            display: ${selectedChat ? 'flex' : 'none'} !important;
          }
        }
      `}</style>
    </ProtectedRoute>
  );
}
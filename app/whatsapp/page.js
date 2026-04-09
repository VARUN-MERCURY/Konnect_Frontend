'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getAccessToken, getConversations, getCurrentUser, authenticatedRequest, getMessages, leaveGroup } from '@/lib/api';
import { useWebSocket } from '@/lib/websocket';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProfileModal from '@/components/ProfileModal';
import SettingsModal from '@/components/SettingsModal';
import AddContactModal from '@/components/AddContactModal';
import GroupInfoModal from '@/components/GroupInfoModal';
import JoinGroupModal from '@/components/JoinGroupModal';
import CreateGroupModal from '@/components/CreateGroupModal';

export default function ChatPage() {
  const router = useRouter();
  const { 
    connected, 
    onlineUsers,
    onlineStatus,
    messages, 
    typing, 
    muteInfo,
    bannedFrom,
    removedFrom,
    clearBannedFrom,
    clearRemovedFrom,
    clearMuteInfo,
    groupOnlineMembers,
    getGroupOnlineMembers,
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
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  
  // Chat data and loading states
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [conversationsError, setConversationsError] = useState('');

  // Per-conversation message history (fetched from DB)
  const [historyByConv, setHistoryByConv] = useState({}); // { [convId]: Message[] }
  const [historyPage, setHistoryPage] = useState({}); // { [convId]: number }
  const [historyHasMore, setHistoryHasMore] = useState({}); // { [convId]: bool }
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Mute countdown state
  const [muteCountdown, setMuteCountdown] = useState(''); // display string like "4:32"

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

  // Handle ban: deselect chat and mark as banned in conversations list
  useEffect(() => {
    if (bannedFrom) {
      if (selectedChat?.id === bannedFrom) {
        setSelectedChat(prev => prev ? { ...prev, isBanned: true } : null);
      }
      setConversations(prev => prev.map(c =>
        c.id === bannedFrom ? { ...c, isBanned: true, lastMessage: 'You were banned from this group' } : c
      ));
      clearBannedFrom();
    }
  }, [bannedFrom]);

  // Handle remove: deselect chat and remove from conversations list
  useEffect(() => {
    if (removedFrom) {
      if (selectedChat?.id === removedFrom) {
        setSelectedChat(null);
      }
      setConversations(prev => prev.filter(c => c.id !== removedFrom));
      clearRemovedFrom();
    }
  }, [removedFrom]);

  // Mute countdown timer
  useEffect(() => {
    if (!selectedChat || !muteInfo[selectedChat.id]) {
      setMuteCountdown('');
      return;
    }
    const mInfo = muteInfo[selectedChat.id];
    const endTime = new Date(mInfo.mutedUntil).getTime();

    const tick = () => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        setMuteCountdown('');
        clearMuteInfo(selectedChat.id);
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setMuteCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [selectedChat?.id, muteInfo]);

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
          participantIds: conv.displayInfo.participantIds || [],
          userRole: conv.userRole,
          isPremium: conv.isPremium,
          isBanned: conv.isBanned || false
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

  // Auto-select first non-banned conversation
  useEffect(() => {
    if (!selectedChat && conversations.length > 0 && !loadingConversations) {
      const firstUsable = conversations.find(c => !c.isBanned);
      if (firstUsable) setSelectedChat(firstUsable);
    }
  }, [selectedChat, conversations, loadingConversations]);

  // When a WebSocket message arrives, update the sidebar.
  // If the conversation is new (User B never saw it), fetch it from the API.
  const handledConvIds = useRef(new Set());

  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const latest = messages[messages.length - 1];
    // Ignore temp messages (our own sends) — handleSendMessage already updates lastMessage
    if (!latest || !latest.conversationId || latest.tempId) return;

    const convId = latest.conversationId?.toString();
    const preview = latest.content
      ? latest.content.length > 80 ? latest.content.substring(0, 80) + '...' : latest.content
      : '';
    const timestamp = latest.timestamp || latest.createdAt || new Date().toISOString();

    setConversations(prev => {
      const existingIndex = prev.findIndex(c => c.id?.toString() === convId);

      if (existingIndex !== -1) {
        // Conversation already in sidebar — update preview and bubble it to the top
        // Only increment unread if this conversation is NOT the one currently open
        const isActiveConv = selectedChat?.id?.toString() === convId;
        const prevUnread = prev[existingIndex].unread || 0;
        const updated = {
          ...prev[existingIndex],
          lastMessage: preview,
          lastTime: timestamp,
          unread: isActiveConv ? 0 : prevUnread + 1
        };
        return [updated, ...prev.filter((_, i) => i !== existingIndex)];
      }

      // Conversation is brand-new for this user — fetch it from the API once
      if (!handledConvIds.current.has(convId)) {
        handledConvIds.current.add(convId);
        getConversations().then(apiConversations => {
          const newConv = apiConversations.find(
            c => c.conversationId?.toString() === convId
          );
          if (!newConv) return;

          const transformed = {
            id: newConv.conversationId,
            name: newConv.displayInfo.name,
            type: newConv.type,
            avatar: newConv.displayInfo.avatar ||
              (newConv.type === 'group' ? '👥' : newConv.displayInfo.name[0]?.toUpperCase()),
            lastMessage: preview,
            lastTime: timestamp,
            unread: 1,
            online: newConv.displayInfo.isOnline || false,
            otherUserId: newConv.displayInfo.otherUserId || null,
            participants: newConv.displayInfo.participantCount || 2,
            userRole: newConv.userRole,
            isPremium: newConv.isPremium
          };

          setConversations(prev2 => {
            if (prev2.some(c => c.id?.toString() === convId)) return prev2;
            return [transformed, ...prev2];
          });
        }).catch(err => {
          console.error('Failed to fetch new conversation for sidebar:', err);
          handledConvIds.current.delete(convId); // allow retry on next message
        });
      }

      return prev; // unchanged until fetch completes
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

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

    // Always reset unread count when a conversation is opened
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread: 0 } : c));

    if (!historyByConv[convId]) {
      fetchHistory(convId, 1, false);
    } else {
      // Merge any real-time messages that arrived while this chat was in the background
      const incoming = messages.filter(
        m => m.conversationId?.toString() === convId?.toString() && !m.tempId
      );
      if (incoming.length > 0) {
        setHistoryByConv(prev => {
          const existing = prev[convId] || [];
          const existingIds = new Set(existing.map(m => m._id?.toString()).filter(Boolean));
          const toAdd = incoming.filter(m => !m._id || !existingIds.has(m._id?.toString()));
          return toAdd.length > 0 ? { ...prev, [convId]: [...existing, ...toAdd] } : prev;
        });
      }
      requestAnimationFrame(() => scrollToBottom('instant'));
    }
    clearMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?.id]);

  // Close group menu when chat changes
  useEffect(() => { setShowGroupMenu(false); }, [selectedChat?.id]);

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

    // Request online members for group chats
    if (selectedChat.type === 'group' && selectedChat.participantIds?.length) {
      getGroupOnlineMembers(selectedChat.participantIds);
    }
  }, [selectedChat?.id, connected, joinConversation, leaveConversation, checkOnline, getGroupOnlineMembers]);

  // Re-fetch group online members when someone comes online/offline
  useEffect(() => {
    if (selectedChat?.type === 'group' && selectedChat.participantIds?.length && connected) {
      getGroupOnlineMembers(selectedChat.participantIds);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(onlineUsers)]);

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

  const handleCreateGroupDone = async (conversationId) => {
    try {
      const apiConversations = await getConversations();
      const transformed = apiConversations.map(conv => ({
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
      setConversations(transformed);
      const newGroup = transformed.find(c => c.id === conversationId);
      if (newGroup) setSelectedChat(newGroup);
    } catch (err) {
      console.error('Error reloading conversations after group creation:', err);
    }
  };

  // Filter conversations based on search
  const filteredConversations = conversations.filter(conv =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get message status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'sending':
        return <div className="w-4 h-4 border-2 border-violet-700 border-t-violet-300 rounded-full animate-spin" />;
      case 'delivered':
        return (
          <svg className="w-4 h-4 text-violet-300" fill="currentColor" viewBox="0 0 20 20">
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
        currentUserId={currentUser?.id || currentUser?._id}
        onGroupDeleted={(deletedId) => {
          setConversations(prev => prev.filter(c => c.id !== deletedId));
          if (selectedChat?.id === deletedId) setSelectedChat(null);
          setShowGroupInfo(false);
        }}
        onGroupLeft={(leftId) => {
          setConversations(prev => prev.filter(c => c.id !== leftId));
          if (selectedChat?.id === leftId) setSelectedChat(null);
          setShowGroupInfo(false);
        }}
      />

      {/* Join Group Modal */}
      <JoinGroupModal 
        show={showJoinGroup} 
        onClose={() => setShowJoinGroup(false)}
        onJoinGroup={handleJoinGroup}
      />

      {/* Create Group Modal */}
      <CreateGroupModal
        show={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        onGroupCreated={handleCreateGroupDone}
      />

      <div className="h-screen flex overflow-hidden" style={{ background: '#13111C' }}>
        {/* Left Sidebar - Chat List */}
        <div className="w-80 flex flex-col border-r" style={{ background: '#1D1B2E', borderColor: '#302D50' }}>
          {/* Header */}
          <div className="px-4 py-3 border-b" style={{ background: '#1D1B2E', borderColor: '#302D50' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer"
                     style={{ background: 'linear-gradient(135deg, #7C3AED, #a855f7)' }}
                     onClick={() => setShowProfile(!showProfile)}>
                  <span className="text-white font-semibold text-sm">{userInitial}</span>
                </div>
                <div>
                  <h2 className="font-semibold" style={{ color: '#E2DEFF' }}>{username}</h2>
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                    <span className="text-xs" style={{ color: '#8A84A3' }}>{connected ? 'Connected' : 'Offline'}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-1">
                {/* Add / Groups dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowGroupMenu(prev => !prev)}
                    className="p-2 rounded-full transition-colors hover:bg-[#2D2847]"
                    title="New"
                  >
                    <svg className="w-5 h-5" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {showGroupMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowGroupMenu(false)} />
                      <div className="absolute right-0 mt-1 w-44 rounded-xl shadow-lg z-20 overflow-hidden border" style={{ background: '#252341', borderColor: '#302D50' }}>
                        <button
                          className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-[#2D2847] transition-colors"
                          style={{ color: '#E2DEFF' }}
                          onClick={() => { setShowAddContact(true); setShowGroupMenu(false); }}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                          Add Contact
                        </button>
                        <button
                          className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-[#2D2847] transition-colors"
                          style={{ color: '#E2DEFF' }}
                          onClick={() => { setShowCreateGroup(true); setShowGroupMenu(false); }}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          Create Group
                        </button>
                        <button
                          className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-[#2D2847] transition-colors"
                          style={{ color: '#E2DEFF' }}
                          onClick={() => { setShowJoinGroup(true); setShowGroupMenu(false); }}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                          </svg>
                          Join Group
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 rounded-full transition-colors hover:bg-[#2D2847]"
                  title="Settings"
                >
                  <svg className="w-5 h-5" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <button 
                  onClick={() => router.push('/dashboard')}
                  className="p-2 rounded-full transition-colors hover:bg-[#2D2847]"
                  title="Back to Dashboard"
                >
                  <svg className="w-5 h-5" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b" style={{ borderColor: '#302D50' }}>
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{ background: '#252341', border: '1px solid #302D50', color: '#E2DEFF' }}
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {loadingConversations ? (
              <div className="p-4">
                <div className="space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="animate-pulse flex items-center space-x-3 p-3">
                      <div className="w-12 h-12 rounded-full" style={{ background: '#252341' }}></div>
                      <div className="flex-1 space-y-2">
                        <div className="flex justify-between">
                          <div className="h-4 rounded w-1/3" style={{ background: '#252341' }}></div>
                          <div className="h-3 rounded w-12" style={{ background: '#252341' }}></div>
                        </div>
                        <div className="h-3 rounded w-2/3" style={{ background: '#252341' }}></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-center mt-6">
                  <div className="inline-flex items-center space-x-2" style={{ color: '#8A84A3' }}>
                    <div className="w-4 h-4 border-2 border-violet-700 border-t-violet-400 rounded-full animate-spin"></div>
                    <span className="text-sm">Loading your chats...</span>
                  </div>
                </div>
              </div>
            ) : conversationsError ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <svg className="w-12 h-12 text-red-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="mb-4" style={{ color: '#8A84A3' }}>{conversationsError}</p>
                <button 
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 text-white rounded-lg transition-colors"
                  style={{ background: '#7C3AED' }}
                >
                  Try Again
                </button>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <svg className="w-16 h-16 mb-4" style={{ color: '#302D50' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <h3 className="text-lg font-semibold mb-2" style={{ color: '#E2DEFF' }}>No conversations yet</h3>
                <p className="mb-6" style={{ color: '#8A84A3' }}>Start chatting by adding contacts or joining groups!</p>
                <div className="flex space-x-3">
                  <button 
                    onClick={() => setShowAddContact(true)}
                    className="px-4 py-2 text-white rounded-lg transition-colors"
                    style={{ background: '#7C3AED' }}
                  >
                    Add Contact
                  </button>
                  <button 
                    onClick={() => setShowJoinGroup(true)}
                    className="px-4 py-2 rounded-lg transition-colors"
                    style={{ border: '1px solid #302D50', color: '#E2DEFF' }}
                  >
                    Join Group
                  </button>
                </div>
              </div>
            ) : (
              filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => setSelectedChat(conversation)}
                  className="px-4 py-3 cursor-pointer transition-colors border-b"
                  style={{
                    borderColor: '#302D50',
                    background: selectedChat?.id === conversation.id ? '#2D2847' : 'transparent',
                    borderLeft: selectedChat?.id === conversation.id ? '3px solid #7C3AED' : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (selectedChat?.id !== conversation.id) e.currentTarget.style.background = '#252341'; }}
                  onMouseLeave={e => { if (selectedChat?.id !== conversation.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="flex items-center space-x-3">
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-semibold"
                           style={{ background: 'linear-gradient(135deg, #7C3AED, #a855f7)' }}>
                        {conversation.avatar}
                      </div>
                      {conversation.online && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-400 border-2 rounded-full" style={{ borderColor: '#1D1B2E' }}></div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold truncate" style={{ color: '#E2DEFF' }}>{conversation.name}</h3>
                        <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                          <span className="text-xs" style={{ color: '#8A84A3' }}>{formatTime(conversation.lastTime)}</span>
                          {conversation.unread > 0 && (
                            <div className="min-w-5 h-5 px-1 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-medium">
                              {conversation.unread >= 99 ? '99+' : conversation.unread}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm truncate mt-0.5" style={{ color: conversation.isBanned ? '#f87171' : '#8A84A3' }}>
                          {conversation.isBanned ? '🚫 Banned' : conversation.lastMessage}
                        </p>
                        {conversation.type === 'group' && (
                          <span className="text-xs ml-2 flex-shrink-0" style={{ color: '#8A84A3' }} title={`${conversation.participants} participants`}>
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
          <div className="flex-1 flex flex-col" style={{ background: '#13111C' }}>
            {/* Chat Header */}
            <div className="px-6 py-4 border-b" style={{ background: '#1D1B2E', borderColor: '#302D50' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-semibold"
                       style={{ background: 'linear-gradient(135deg, #7C3AED, #a855f7)' }}>
                    {selectedChat.avatar}
                  </div>
                  <div>
                    <h2 className="font-semibold" style={{ color: '#E2DEFF' }}>{selectedChat.name}</h2>
                    <div className="flex items-center space-x-2 text-sm" style={{ color: '#8A84A3' }}>
                      {selectedChat.isBanned ? (
                        <span className="text-red-400 font-medium">Banned</span>
                      ) : selectedChat.type === 'group' ? (
                        <>
                          <span>{selectedChat.participants} participants</span>
                          <span>•</span>
                          <span>{groupOnlineMembers.length} online</span>
                        </>
                      ) : (() => {
                        const status = onlineStatus[selectedChat.otherUserId];
                        if (status?.online) return <span className="text-green-400 font-medium">online</span>;
                        if (status?.lastSeen) return <span>{formatLastSeen(status.lastSeen)}</span>;
                        return <span>last seen recently</span>;
                      })()}
                      {!selectedChat.isBanned && Array.from(typing).some(k => k.startsWith(`${selectedChat.id}:`)) && (
                        <>
                          <span>•</span>
                          <span style={{ color: '#a78bfa' }}>typing...</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {!selectedChat.isBanned && (
                    <button className="p-2 rounded-full transition-colors hover:bg-[#2D2847]">
                      <svg className="w-5 h-5" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>
                  )}
                  {selectedChat?.type === 'group' && !selectedChat.isBanned && (
                    <button 
                      onClick={() => setShowGroupInfo(true)}
                      className="p-2 rounded-full transition-colors hover:bg-[#2D2847]"
                      title="Group Info"
                    >
                      <svg className="w-5 h-5" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  )}
                  <div className="relative">
                    <button
                      onClick={() => setShowGroupMenu(prev => !prev)}
                      className="p-2 rounded-full transition-colors hover:bg-[#2D2847]"
                    >
                      <svg className="w-5 h-5" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                    {showGroupMenu && (
                      <div className="absolute right-0 top-10 w-48 rounded-xl shadow-lg border py-1 z-50"
                           style={{ background: '#1D1B2E', borderColor: '#302D50' }}>
                        {selectedChat.type === 'group' && !selectedChat.isBanned && (
                          <button
                            onClick={async () => {
                              setShowGroupMenu(false);
                              if (!confirm('Leave this group?')) return;
                              try {
                                await leaveGroup(selectedChat.id);
                                setConversations(prev => prev.filter(c => c.id !== selectedChat.id));
                                setSelectedChat(null);
                              } catch (err) {
                                console.error('Error leaving group:', err);
                              }
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-[#252341] transition-colors"
                            style={{ color: '#f87171' }}
                          >
                            🚪 Leave Group
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setShowGroupMenu(false);
                            setConversations(prev => prev.filter(c => c.id !== selectedChat.id));
                            setSelectedChat(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-[#252341] transition-colors"
                          style={{ color: '#f87171' }}
                        >
                          🗑️ Delete Chat
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Banned Overlay — replaces messages + input for banned users */}
            {selectedChat.isBanned ? (
              <div className="flex-1 flex flex-col items-center justify-center" style={{ background: '#13111C' }}>
                <div className="text-center max-w-md px-6">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
                       style={{ background: '#252341' }}>
                    <span className="text-4xl">🚫</span>
                  </div>
                  <h3 className="text-xl font-semibold mb-2" style={{ color: '#f87171' }}>You are banned from this group</h3>
                  <p className="mb-6" style={{ color: '#8A84A3' }}>
                    You can no longer send or receive messages in <strong style={{ color: '#E2DEFF' }}>{selectedChat.name}</strong>.
                  </p>
                  <button
                    onClick={() => {
                      setConversations(prev => prev.filter(c => c.id !== selectedChat.id));
                      setSelectedChat(null);
                    }}
                    className="px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: '#dc2626', color: '#fff' }}
                  >
                    🗑️ Delete Chat
                  </button>
                </div>
              </div>
            ) : (
            <>
            {/* Messages Area */}
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
              style={{ background: '#13111C' }}>
              {loadingHistory && (
                <div className="flex justify-center py-2">
                  <div className="w-5 h-5 border-2 border-violet-700 border-t-violet-400 rounded-full animate-spin" />
                </div>
              )}
              {historyHasMore[selectedChat.id] && !loadingHistory && (
                <div className="text-center text-xs py-1" style={{ color: '#8A84A3' }}>Scroll up to load older messages</div>
              )}

              {(() => {
                const history = historyByConv[selectedChat.id] || [];
                const historyIds = new Set(history.map(m => m._id));
                // Dedup realtimeOnly: skip messages already in history AND deduplicate by _id within realtime
                const seenRealtime = new Set();
                const realtimeOnly = messages.filter(m => {
                  if (m.conversationId !== selectedChat.id) return false;
                  if (m._id) {
                    if (historyIds.has(m._id)) return false;
                    if (seenRealtime.has(m._id)) return false;
                    seenRealtime.add(m._id);
                  }
                  return true;
                });
                const allMessages = [...history, ...realtimeOnly];

                if (allMessages.length === 0 && !loadingHistory) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
                           style={{ background: '#252341' }}>
                        <div className="text-3xl">{selectedChat.avatar}</div>
                      </div>
                      <h3 className="text-xl font-semibold mb-2" style={{ color: '#E2DEFF' }}>Welcome to {selectedChat.name}!</h3>
                      <p className="max-w-md" style={{ color: '#8A84A3' }}>
                        {selectedChat.type === 'group'
                          ? `Start chatting with ${selectedChat.participants} participants in this group.`
                          : 'Start your conversation by sending a message below.'
                        }
                      </p>
                    </div>
                  );
                }

                return allMessages.map((message, index) => {
                  // Render system messages (join, ban, remove) as centered notices
                  if (message.messageType === 'system') {
                    return (
                      <div key={message._id || message.tempId || index} className="flex justify-center my-2">
                        <div className="px-4 py-1.5 rounded-full text-xs" style={{ background: '#252341', color: '#8A84A3' }}>
                          {message.content}
                        </div>
                      </div>
                    );
                  }

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
                            <div className="w-8 h-8 rounded-full flex items-center justify-center"
                                 style={{ background: 'linear-gradient(135deg, #4c1d95, #7C3AED)' }}>
                              <span className="text-white text-xs font-medium">
                                {senderName[0]?.toUpperCase() || 'U'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className={`max-w-md group ${isMyMessage ? 'items-end' : 'items-start'} flex flex-col`}>
                        {!isMyMessage && showAvatar && selectedChat.type === 'group' && (
                          <div className="text-xs font-medium mb-1 px-1" style={{ color: '#a78bfa' }}>{senderName}</div>
                        )}
                        <div className="px-4 py-2 relative"
                             style={isMyMessage ? {
                               background: 'linear-gradient(135deg, #7C3AED, #a855f7)',
                               color: '#fff',
                               borderRadius: '18px 18px 4px 18px',
                             } : {
                               background: '#252341',
                               color: '#E2DEFF',
                               borderRadius: '18px 18px 18px 4px',
                             }}>
                          <div className="text-sm leading-relaxed">{message.content}</div>
                          <div className="flex items-center justify-end space-x-1 mt-1 text-xs"
                               style={{ color: isMyMessage ? 'rgba(255,255,255,0.6)' : '#8A84A3' }}>
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
            <div className="px-6 py-4 border-t" style={{ background: '#1D1B2E', borderColor: '#302D50' }}>
              {muteInfo[selectedChat.id] && muteCountdown ? (
                <div className="flex items-center justify-center py-3 px-4 rounded-2xl" style={{ background: '#252341', border: '1px solid #302D50' }}>
                  <svg className="w-5 h-5 mr-2 flex-shrink-0" style={{ color: '#f87171' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                  <span className="text-sm" style={{ color: '#f87171' }}>
                    You are muted for <span className="font-mono font-semibold">{muteCountdown}</span>
                  </span>
                </div>
              ) : (
              <form onSubmit={handleSendMessage} className="flex items-end space-x-3">
                <button type="button" className="p-3 rounded-full transition-colors hover:bg-[#2D2847]">
                  <svg className="w-6 h-6" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                
                <div className="flex-1 relative">
                  <textarea
                    value={messageInput}
                    onChange={handleInputChange}
                    placeholder={connected ? "Type a message..." : "Connecting..."}
                    disabled={!connected}
                    rows={1}
                    className="w-full px-4 py-3 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 max-h-32"
                    style={{
                      minHeight: '48px',
                      background: '#252341',
                      border: '1px solid #302D50',
                      color: '#E2DEFF',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                </div>
                
                <button type="button" className="p-3 rounded-full transition-colors hover:bg-[#2D2847]">
                  <svg className="w-6 h-6" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                
                <button
                  type="submit"
                  disabled={!connected || !messageInput.trim()}
                  className="p-3 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105"
                  style={{ background: 'linear-gradient(135deg, #7C3AED, #a855f7)' }}
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
              )}
            </div>
            </>
            )}
          </div>
        ) : (
          /* Welcome Screen */
          <div className="flex-1 flex flex-col items-center justify-center" style={{ background: '#13111C' }}>
            <div className="text-center max-w-md">
              <div className="w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-8"
                   style={{ background: 'linear-gradient(135deg, #7C3AED, #a855f7)' }}>
                <div className="text-6xl">💬</div>
              </div>
              {loadingConversations ? (
                <>
                  <h2 className="text-2xl font-bold mb-4" style={{ color: '#E2DEFF' }}>Loading your chats...</h2>
                  <div className="inline-flex items-center space-x-2" style={{ color: '#8A84A3' }}>
                    <div className="w-5 h-5 border-2 border-violet-700 border-t-violet-400 rounded-full animate-spin"></div>
                    <span>Getting everything ready for you</span>
                  </div>
                </>
              ) : conversations.length === 0 ? (
                <>
                  <h2 className="text-2xl font-bold mb-4" style={{ color: '#E2DEFF' }}>Welcome to Konnect Chat</h2>
                  <p className="leading-relaxed mb-6" style={{ color: '#8A84A3' }}>
                    You don&apos;t have any conversations yet. Start chatting by adding contacts or joining groups!
                  </p>
                  <div className="flex space-x-3 justify-center">
                    <button 
                      onClick={() => setShowAddContact(true)}
                      className="px-6 py-2 text-white rounded-lg transition-colors"
                      style={{ background: '#7C3AED' }}
                    >
                      Add Contact
                    </button>
                    <button 
                      onClick={() => setShowJoinGroup(true)}
                      className="px-6 py-2 rounded-lg transition-colors"
                      style={{ border: '1px solid #302D50', color: '#E2DEFF' }}
                    >
                      Join Group
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold mb-4" style={{ color: '#E2DEFF' }}>Welcome to Konnect Chat</h2>
                  <p className="leading-relaxed" style={{ color: '#8A84A3' }}>
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
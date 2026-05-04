'use client';

import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { isAuthenticated, getAccessToken, getConversations, getCurrentUser, authenticatedRequest, getMessages, leaveGroup, getModerationStats, getGroupMembers } from '@/lib/api';
import ModerationDashboard from '@/components/ModerationDashboard';
import StarsBackground from '@/components/StarsBackground';
import { useWebSocket } from '@/lib/websocket';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProfileModal from '@/components/ProfileModal';
import SettingsModal from '@/components/SettingsModal';
import AddContactModal from '@/components/AddContactModal';
import GroupInfoModal from '@/components/GroupInfoModal';
import JoinGroupModal from '@/components/JoinGroupModal';
import CreateGroupModal from '@/components/CreateGroupModal';

// --- Utility: Render message content with clickable links ---
function renderMessageContent(text) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[\w.-]+(?:\.[\w\.-]+)+(?:[\w\-\._~:/?#[\]@!$&'()*+,;=]+)?)/gi;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline break-all">{part}</a>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

// --- Toast for feature coming soon ---
  const [featureToast, setFeatureToast] = useState("");
  useEffect(() => {
    if (featureToast) {
      const t = setTimeout(() => setFeatureToast(""), 1800);
      return () => clearTimeout(t);
    }
  }, [featureToast]);

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
    groupSentiment,
    moderationAlert,
    clearModerationAlert,
    groupLocked,
    flaggedMessages,
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
  const [showModerationDashboard, setShowModerationDashboard] = useState(false);
  const [moderationToast, setModerationToast] = useState(null);
  const [revealedMessages, setRevealedMessages] = useState({}); // { [messageId]: true }
  
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
  const inputRef = useRef(null);
  const lastSendRef = useRef(0);
  const [flying, setFlying] = useState([]); // [{ id, text, fromRect, toRect }]
  // Increment to trigger a meteor-shower burst in StarsBackground
  const [meteorKey, setMeteorKey] = useState(0);

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

  // Moderation toast from WebSocket alerts
  useEffect(() => {
    if (!moderationAlert) return;
    const labels = { flagged: '⚠️ Toxic message flagged', locked: '🔒 Group locked by moderation', unlocked: '🔓 Group unlocked', reset: '🔄 Moderation window reset' };
    setModerationToast(labels[moderationAlert.type] || 'Moderation event');
    const timer = setTimeout(() => { setModerationToast(null); clearModerationAlert(); }, 4000);
    return () => clearTimeout(timer);
  }, [moderationAlert]);

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

        // Transform API data to frontend format. Be defensive: a malformed row from
        // the backend should be skipped, not crash the whole list render.
        const transformedConversations = (apiConversations || []).map(conv => {
          try {
            const di = conv.displayInfo || {};
            const name = di.name || (conv.type === 'group' ? 'Group' : 'Conversation');
            return {
              id: conv.conversationId,
              name,
              type: conv.type,
              avatar: di.avatar || (conv.type === 'group' ? '👥' : (name[0] || '?').toUpperCase()),
              lastMessage: conv.lastMessage ? conv.lastMessage.content : '',
              lastTime: conv.lastMessage ? conv.lastMessage.timestamp : conv.updatedAt,
              unread: conv.unreadCount || 0,
              online: di.isOnline || false,
              otherUserId: di.otherUserId || null,
              // For groups we leave participants undefined so the header doesn't briefly
              // render a stale cached count and then update — getGroupMembers fills it in.
              participants: conv.type === 'group' ? undefined : (di.participantCount || 2),
              participantIds: di.participantIds || [],
              userRole: conv.userRole,
              isPremium: conv.isPremium,
              isBanned: conv.isBanned || false,
            };
          } catch (e) {
            console.warn('[conversations] skipped malformed row', conv, e);
            return null;
          }
        }).filter(Boolean);

        setConversations(transformedConversations);

        // Subscribe to ALL conversation rooms so we receive realtime updates
        // (sidebar previews, unread bumps, message:new) for inactive chats too.
        if (connected) {
          transformedConversations.forEach(c => joinConversation(c.id));
        }

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

  // Auto-select first non-banned conversation (desktop only, and only on first load).
  // On mobile we want the user to land on the conversation list, not auto-jump into a chat
  // (otherwise the "back to conversations" button would just re-open the same chat).
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (selectedChat || conversations.length === 0 || loadingConversations) return;
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      autoSelectedRef.current = true; // mobile: never auto-select
      return;
    }
    const firstUsable = conversations.find(c => !c.isBanned);
    if (firstUsable) {
      autoSelectedRef.current = true;
      setSelectedChat(firstUsable);
    }
  }, [selectedChat, conversations, loadingConversations]);

  // Resolve authoritative participant counts for groups missing one.
  // Done in the background so the sidebar shows real numbers without flicker.
  const resolvedCountsRef = useRef(new Set());
  useEffect(() => {
    const groupsNeedingCount = conversations.filter(
      c => c.type === 'group' && typeof c.participants !== 'number' && !resolvedCountsRef.current.has(c.id)
    );
    if (groupsNeedingCount.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const g of groupsNeedingCount) {
        resolvedCountsRef.current.add(g.id);
        try {
          const data = await getGroupMembers(g.id);
          const count = Array.isArray(data?.members) ? data.members.length : null;
          if (cancelled || count == null) continue;
          setConversations(prev =>
            prev.map(c => (c.id === g.id ? { ...c, participants: count } : c))
          );
          setSelectedChat(prev =>
            prev && prev.id === g.id ? { ...prev, participants: count } : prev
          );
        } catch (err) {
          // Non-fatal — leave participants undefined; header just hides the count
          resolvedCountsRef.current.delete(g.id);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [conversations]);

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

    // System events (member left/joined/removed/banned) carry the new
    // participant count from the backend — sync it into local state so the
    // group header shows the correct number without a manual refresh.
    const hasParticipantUpdate =
      latest.messageType === 'system' && typeof latest.participantCount === 'number';

    if (hasParticipantUpdate && selectedChat?.id?.toString() === convId) {
      setSelectedChat(prev => prev ? { ...prev, participants: latest.participantCount } : prev);
    }

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
          unread: isActiveConv ? 0 : prevUnread + 1,
          ...(hasParticipantUpdate ? { participants: latest.participantCount } : {})
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

  // Re-join every conversation room whenever the socket (re)connects, so background
  // messages keep arriving even after a reconnect.
  useEffect(() => {
    if (!connected || conversations.length === 0) return;
    conversations.forEach(c => joinConversation(c.id));
  }, [connected, conversations, joinConversation]);

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
    // NOTE: Do NOT call clearMessages() here. We keep the global realtime queue alive
    // so background messages for OTHER conversations still update the sidebar/unread.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?.id]);

  // Close group menu when chat changes
  useEffect(() => { setShowGroupMenu(false); }, [selectedChat?.id]);

  // Refresh authoritative participant count whenever a group is opened, so a
  // stale cached number (e.g. someone left while we were offline) is corrected.
  useEffect(() => {
    if (!selectedChat?.id || selectedChat.type !== 'group') return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getGroupMembers(selectedChat.id);
        const activeCount = Array.isArray(data?.members) ? data.members.length : null;
        if (cancelled || activeCount == null) return;
        setSelectedChat(prev =>
          prev && prev.id === selectedChat.id && prev.participants !== activeCount
            ? { ...prev, participants: activeCount }
            : prev
        );
        setConversations(prev =>
          prev.map(c => (c.id === selectedChat.id ? { ...c, participants: activeCount } : c))
        );
      } catch (err) {
        // Non-fatal — just keep the cached count
        console.warn('Failed to refresh group members:', err?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedChat?.id, selectedChat?.type]);

  // Join/leave conversation rooms and check online status when chat changes
  useEffect(() => {
    if (!connected) return;

    // NOTE: We intentionally do NOT leave the previous conversation room.
    // Staying joined to all rooms is what allows background messages to update the
    // sidebar (last-message preview + unread count) and arrive instantly when the
    // user opens that chat — without needing a hard reload.

    if (!selectedChat) {
      prevChatIdRef.current = null;
      return;
    }

    // (Re-)join the selected room defensively in case it wasn't joined yet.
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
  }, [selectedChat?.id, connected, joinConversation, checkOnline, getGroupOnlineMembers]);

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
    const text = messageInput.trim();
    if (!text || !connected || !selectedChat) return;

    // Guard against rapid double-fires (Enter+click, mobile touch repeats, etc.)
    const now = Date.now();
    if (lastSendRef.current && now - lastSendRef.current < 400) return;
    lastSendRef.current = now;

    sendMessage(selectedChat.id, text);
    setMessageInput('');
    handleStopTyping();

    // Fire a meteor-shower burst across the chat background
    setMeteorKey((k) => k + 1);

    // Update last message in conversation
    setConversations(prev =>
      prev.map(conv =>
        conv.id === selectedChat.id
          ? { ...conv, lastMessage: text, lastTime: new Date().toISOString() }
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

  // Filter conversations based on search.
  // Defensive: skip rows missing a name (a bad backend record shouldn't blank the list).
  const filteredConversations = conversations.filter(conv => {
    if (!conv || typeof conv.name !== 'string') return false;
    const q = (searchQuery || '').toLowerCase();
    return q === '' || conv.name.toLowerCase().includes(q);
  });

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

      <div className="h-screen-dvh flex overflow-hidden items-stretch" style={{ background: '#06040f' }}>
        {/* Left Sidebar - Chat List */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r min-h-0`} style={{ background: '#0d0b1a', borderColor: '#362A60', height: '100dvh' }}>
          {/* Header */}
          <div className="px-4 py-3 border-b" style={{ background: '#0d0b1a', borderColor: '#362A60' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer"
                     style={{ background: 'linear-gradient(135deg, #9668F5, #6E4FEF)' }}
                     onClick={() => setShowProfile(!showProfile)}>
                  <span className="text-white font-semibold text-sm">{userInitial}</span>
                </div>
                <div>
                  <h2 className="font-semibold" style={{ color: '#ffffff' }}>{username}</h2>
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
                    className="p-2 rounded-full transition-colors hover:bg-[#1c1538]"
                    title="New"
                  >
                    <svg className="w-5 h-5" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  {showGroupMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowGroupMenu(false)} />
                      <div className="absolute right-0 mt-1 w-44 rounded-xl shadow-lg z-20 overflow-hidden border" style={{ background: '#15102b', borderColor: '#362A60' }}>
                        <button
                          className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-[#1c1538] transition-colors"
                          style={{ color: '#ffffff' }}
                          onClick={() => { setShowAddContact(true); setShowGroupMenu(false); }}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                          </svg>
                          Add Contact
                        </button>
                        <button
                          className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-[#1c1538] transition-colors"
                          style={{ color: '#ffffff' }}
                          onClick={() => { setShowCreateGroup(true); setShowGroupMenu(false); }}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          Create Group
                        </button>
                        <button
                          className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-[#1c1538] transition-colors"
                          style={{ color: '#ffffff' }}
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
                  className="p-2 rounded-full transition-colors hover:bg-[#1c1538]"
                  title="Settings"
                >
                  <svg className="w-5 h-5" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <button 
                  onClick={() => router.push('/dashboard')}
                  className="p-2 rounded-full transition-colors hover:bg-[#1c1538]"
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
          <div className="px-4 py-3 border-b" style={{ borderColor: '#362A60' }}>
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
                style={{ background: '#15102b', border: '1px solid #362A60', color: '#ffffff' }}
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="overflow-y-auto" style={{ flex: '1 1 0%', minHeight: 0 }}>
            {loadingConversations ? (
              <div className="p-4">
                <div className="space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="animate-pulse flex items-center space-x-3 p-3">
                      <div className="w-12 h-12 rounded-full" style={{ background: '#15102b' }}></div>
                      <div className="flex-1 space-y-2">
                        <div className="flex justify-between">
                          <div className="h-4 rounded w-1/3" style={{ background: '#15102b' }}></div>
                          <div className="h-3 rounded w-12" style={{ background: '#15102b' }}></div>
                        </div>
                        <div className="h-3 rounded w-2/3" style={{ background: '#15102b' }}></div>
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
                  style={{ background: '#9668F5' }}
                >
                  Try Again
                </button>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <svg className="w-16 h-16 mb-4" style={{ color: '#362A60' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <h3 className="text-lg font-semibold mb-2" style={{ color: '#ffffff' }}>No conversations yet</h3>
                <p className="mb-6" style={{ color: '#8A84A3' }}>Start chatting by adding contacts or joining groups!</p>
                <div className="flex space-x-3">
                  <button 
                    onClick={() => setShowAddContact(true)}
                    className="px-4 py-2 text-white rounded-lg transition-colors"
                    style={{ background: '#9668F5' }}
                  >
                    Add Contact
                  </button>
                  <button 
                    onClick={() => setShowJoinGroup(true)}
                    className="px-4 py-2 rounded-lg transition-colors"
                    style={{ border: '1px solid #362A60', color: '#ffffff' }}
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
                    borderColor: '#362A60',
                    background: selectedChat?.id === conversation.id ? '#1c1538' : 'transparent',
                    borderLeft: selectedChat?.id === conversation.id ? '3px solid #9668F5' : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (selectedChat?.id !== conversation.id) e.currentTarget.style.background = '#15102b'; }}
                  onMouseLeave={e => { if (selectedChat?.id !== conversation.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                    <div className="relative" style={{ flexShrink: 0 }}>
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-semibold"
                           style={{ background: 'linear-gradient(135deg, #9668F5, #6E4FEF)' }}>
                        {conversation.avatar}
                      </div>
                      {conversation.online && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-400 border-2 rounded-full" style={{ borderColor: '#0d0b1a' }}></div>
                      )}
                    </div>
                    
                    <div style={{ flex: '1 1 0%', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h3 style={{ color: '#ffffff', fontWeight: 600, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{conversation.name}</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px', flexShrink: 0 }}>
                          <span style={{ color: '#8A84A3', fontSize: '11px' }}>{formatTime(conversation.lastTime)}</span>
                          {conversation.unread > 0 && (
                            <div className="min-w-5 h-5 px-1 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-medium">
                              {conversation.unread >= 99 ? '99+' : conversation.unread}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                        <p style={{ color: conversation.isBanned ? '#f87171' : '#8A84A3', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                          {conversation.isBanned ? '🚫 Banned' : conversation.lastMessage}
                        </p>
                        {conversation.type === 'group' && typeof conversation.participants === 'number' && (
                          <span style={{ color: '#8A84A3', fontSize: '11px', marginLeft: '8px', flexShrink: 0 }} title={`${conversation.participants} participants`}>
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
          <div className="flex-1 flex flex-col min-w-0" style={{ background: '#06040f' }}>
            {/* Chat Header */}
            <div className="px-2 md:px-6 py-2 md:py-4 border-b safe-top" style={{ background: 'linear-gradient(180deg, rgba(150,104,245,0.18) 0%, rgba(110,79,239,0.10) 50%, rgba(13,11,26,0.95) 100%)', borderColor: '#362A60', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 md:space-x-3 min-w-0 flex-1">
                  {/* Mobile back button */}
                  <button
                    onClick={() => setSelectedChat(null)}
                    className="md:hidden p-2 rounded-full active:bg-[#1c1538] flex-shrink-0"
                    style={{ background: 'rgba(54,42,96,0.55)' }}
                    aria-label="Back to chats"
                  >
                    <svg className="w-5 h-5" style={{ color: '#ffffff' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white text-sm md:text-lg font-semibold flex-shrink-0"
                       style={{ background: 'linear-gradient(135deg, #9668F5, #6E4FEF)' }}>
                    {selectedChat.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold truncate text-sm md:text-base" style={{ color: '#ffffff' }}>{selectedChat.name}</h2>
                    <div className="flex items-center space-x-1.5 md:space-x-2 text-[11px] md:text-sm overflow-hidden whitespace-nowrap" style={{ color: '#8A84A3' }}>
                      {selectedChat.isBanned ? (
                        <span className="text-red-400 font-medium">Banned</span>
                      ) : selectedChat.type === 'group' ? (
                        <>
                          {typeof selectedChat.participants === 'number' && (
                            <>
                              <span>{selectedChat.participants} participants</span>
                              <span>•</span>
                            </>
                          )}
                          <span>{groupOnlineMembers.length} online</span>
                          {/* Sentiment indicator — compact pill on mobile, full meter on desktop */}
                          {groupSentiment[selectedChat.id] && (() => {
                            const s = groupSentiment[selectedChat.id];
                            const moodEmoji = { positive: '😊', negative: '😠', neutral: '😐', mixed: '🤔' };
                            const statusColor = { normal: '#22c55e', warning: '#eab308', notify_moderator: '#f97316', auto_lock: '#ef4444' };
                            const statusBg = { normal: 'rgba(34,197,94,0.15)', warning: 'rgba(234,179,8,0.15)', notify_moderator: 'rgba(249,115,22,0.18)', auto_lock: 'rgba(239,68,68,0.18)' };
                            const dot = statusColor[s.status] || '#22c55e';
                            const bg = statusBg[s.status] || 'rgba(34,197,94,0.15)';
                            const tox = Math.round((s.avg_toxicity || 0) * 100);
                            return (
                              <>
                                {/* Mobile: structured pill — colored dot + toxicity % */}
                                <span
                                  className="md:hidden inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ml-1 flex-shrink-0"
                                  style={{ background: bg, border: `1px solid ${dot}40` }}
                                  title={`Mood: ${s.mood} • Toxicity ${tox}% • ${s.status}`}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                                  <span className="text-[10px] font-medium leading-none" style={{ color: dot }}>{tox}%</span>
                                </span>
                                {/* Desktop: emoji + slim toxicity bar */}
                                <span className="hidden md:inline" title={`Mood: ${s.mood} | Status: ${s.status}`}>•</span>
                                <span className="hidden md:inline" title={`Mood: ${s.mood} | Status: ${s.status}`}>
                                  {moodEmoji[s.mood] || '😐'}
                                </span>
                                <div className="hidden md:flex items-center space-x-1" title={`Toxicity: ${tox}%`}>
                                  <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: '#362A60' }}>
                                    <div
                                      className="h-full rounded-full transition-all duration-500"
                                      style={{ width: `${tox}%`, background: dot }}
                                    />
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </>
                      ) : (() => {
                        const status = onlineStatus[selectedChat.otherUserId];
                        if (status?.online) return <span className="text-green-400 font-medium">online</span>;
                        if (status?.lastSeen) return <span>{formatLastSeen(status.lastSeen)}</span>;
                        return <span>last seen recently</span>;
                      })()}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1 md:space-x-2 flex-shrink-0">
                  {!selectedChat.isBanned && (
                    <button className="hidden md:inline-flex p-2 rounded-full transition-colors hover:bg-[#1c1538]">
                      <svg className="w-5 h-5" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>
                  )}
                  {selectedChat?.type === 'group' && !selectedChat.isBanned && ['moderator','admin','owner'].includes(selectedChat.userRole) && (
                    <button 
                      onClick={() => setShowModerationDashboard(true)}
                      className="p-2 rounded-full transition-colors hover:bg-[#1c1538]"
                      title="Moderation Dashboard"
                    >
                      <svg className="w-5 h-5" style={{ color: groupSentiment[selectedChat.id]?.status === 'auto_lock' ? '#ef4444' : groupSentiment[selectedChat.id]?.status === 'warning' ? '#eab308' : '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </button>
                  )}
                  {selectedChat?.type === 'group' && !selectedChat.isBanned && (
                    <button 
                      onClick={() => setShowGroupInfo(true)}
                      className="p-2 rounded-full transition-colors hover:bg-[#1c1538]"
                      title="Group Info"
                    >
                      <svg className="w-5 h-5" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  )}
                  {/* three-dots menu removed */}
                </div>
              </div>
            </div>

            {/* Banned Overlay — replaces messages + input for banned users */}
            {selectedChat.isBanned ? (
              <div className="flex-1 flex flex-col items-center justify-center" style={{ background: '#06040f' }}>
                <div className="text-center max-w-md px-6">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
                       style={{ background: '#15102b' }}>
                    <span className="text-4xl">🚫</span>
                  </div>
                  <h3 className="text-xl font-semibold mb-2" style={{ color: '#f87171' }}>You are banned from this group</h3>
                  <p className="mb-6" style={{ color: '#8A84A3' }}>
                    You can no longer send or receive messages in <strong style={{ color: '#ffffff' }}>{selectedChat.name}</strong>.
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
            {/* Messages Area — wrapped in a relative container so the
                StarsBackground sits behind the scrolling list and never
                scrolls away or disappears on resize. */}
            <div className="flex-1 relative overflow-hidden" style={{ background: '#06040f' }}>
              <StarsBackground density={70} meteorTrigger={meteorKey} />
              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="absolute inset-0 overflow-y-auto px-3 md:px-6 py-3 md:py-4 pb-16 space-y-4"
                style={{ zIndex: 1 }}>
              <div className="relative">
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
                  if (m.conversationId?.toString() !== selectedChat.id?.toString()) return false;
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
                           style={{ background: '#15102b' }}>
                        <div className="text-3xl">{selectedChat.avatar}</div>
                      </div>
                      <h3 className="text-xl font-semibold mb-2" style={{ color: '#ffffff' }}>Welcome to {selectedChat.name}!</h3>
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
                        <div className="px-4 py-1.5 rounded-full text-xs" style={{ background: '#15102b', color: '#8A84A3' }}>
                          {message.content}
                        </div>
                      </div>
                    );
                  }

                  // Normalize senderId — can be populated object {_id, name, ...} (history)
                  // or plain ObjectId string (real-time WS messages)
                  const getSenderIdStr = (m) =>
                    (m?.senderId?._id || m?.senderId || '')?.toString();
                  const currentSenderIdStr = getSenderIdStr(message);
                  const prevSenderIdStr = getSenderIdStr(allMessages[index - 1]);

                  const isMyMessage =
                    currentSenderIdStr === currentUser?._id?.toString() ||
                    message.sender?.username === 'You';
                  const senderName = message.senderId?.name || message.senderInfo?.name || message.sender?.username || 'Unknown';
                  // Guard: if senderName accidentally became a 24-char hex ObjectId, hide it
                  const safeSenderName = /^[a-f0-9]{24}$/i.test(senderName) ? 'Unknown' : senderName;
                  const senderLeft = message.senderLeft === true;
                  const showAvatar = !isMyMessage && (index === 0 || prevSenderIdStr !== currentSenderIdStr);
                  const msgId = (message._id || message.messageId)?.toString();
                  const isFlagged = msgId && flaggedMessages[msgId];
                  const isRevealed = msgId && revealedMessages[msgId];

                  return (
                    <motion.div key={message._id || message.tempId || index}
                         initial={isMyMessage ? { opacity: 0, y: 4 } : false}
                         animate={{ opacity: 1, y: 0 }}
                         transition={{ duration: 0.28, ease: 'easeOut' }}
                         className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-4' : 'mt-1'}`}>
                      {!isMyMessage && (
                        <div className={`w-8 h-8 mr-2 ${showAvatar ? '' : 'opacity-0'}`}>
                          {showAvatar && (
                            <div className="w-8 h-8 rounded-full flex items-center justify-center"
                                 style={{ background: senderLeft
                                   ? 'linear-gradient(135deg, #4b5563, #6b7280)'
                                   : 'linear-gradient(135deg, #4c1d95, #9668F5)' }}>
                              <span className="text-white text-xs font-medium">
                                {safeSenderName[0]?.toUpperCase() || 'U'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className={`max-w-[78%] sm:max-w-md group ${isMyMessage ? 'items-end' : 'items-start'} flex flex-col min-w-0`}>
                        {!isMyMessage && selectedChat.type === 'group' && (
                          <div className="text-xs font-medium mb-1 px-1 flex items-center gap-1.5"
                               style={{ color: senderLeft ? '#9ca3af' : '#c4a8ff' }}>
                            <span>{safeSenderName}</span>
                            {senderLeft && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-normal"
                                    style={{ background: '#1f2937', color: '#9ca3af' }}>
                                former member
                              </span>
                            )}
                          </div>
                        )}
                        {isFlagged && !isRevealed ? (
                          /* Flagged message — hidden until clicked */
                          <div
                            className="px-4 py-2 cursor-pointer select-none transition-all hover:opacity-80"
                            style={{
                              background: '#3b1c1c',
                              border: '1px solid #7f1d1d',
                              borderRadius: isMyMessage ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                            }}
                            onClick={() => setRevealedMessages(prev => ({ ...prev, [msgId]: true }))}
                            title="Click to reveal flagged message"
                          >
                            <div className="flex items-center space-x-2">
                              <span className="text-base">⚠️</span>
                              <div>
                                <div className="text-sm font-medium" style={{ color: '#fca5a5' }}>Flagged as toxic</div>
                                <div className="text-xs" style={{ color: '#8A84A3' }}>Click to reveal message</div>
                              </div>
                            </div>
                            <div className="flex items-center justify-end mt-1 text-xs" style={{ color: '#8A84A3' }}>
                              <span>{formatMessageTime(message.timestamp || message.createdAt)}</span>
                            </div>
                          </div>
                        ) : (
                        <div className="px-4 py-2 relative backdrop-blur-xl"
                             style={isMyMessage ? {
                               background: 'linear-gradient(135deg, rgba(150,104,245,0.78), rgba(110,79,239,0.62))',
                               color: '#fff',
                               borderRadius: '18px 18px 4px 18px',
                               border: '1px solid rgba(255,255,255,0.28)',
                               boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15), 0 10px 30px -8px rgba(110,79,239,0.7), 0 0 32px -8px rgba(150,104,245,0.6)',
                               WebkitBackdropFilter: 'blur(24px) saturate(200%)',
                             } : {
                               background: isFlagged
                                 ? 'linear-gradient(135deg, rgba(127,29,29,0.45), rgba(42,21,37,0.55))'
                                 : 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(150,104,245,0.16))',
                               color: '#ffffff',
                               borderRadius: '18px 18px 18px 4px',
                               border: isFlagged
                                 ? '1px solid rgba(127,29,29,0.7)'
                                 : '1px solid rgba(255,255,255,0.22)',
                               boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.2), 0 8px 24px -8px rgba(0,0,0,0.7), 0 0 24px -10px rgba(150,104,245,0.35)',
                               WebkitBackdropFilter: 'blur(24px) saturate(200%)',
                             }}>
                          {isFlagged && (
                            <div className="flex items-center space-x-1 mb-1">
                              <span className="text-xs">⚠️</span>
                              <span className="text-xs font-medium" style={{ color: '#f87171' }}>Flagged</span>
                              <button
                                className="ml-auto text-xs hover:underline"
                                style={{ color: '#8A84A3' }}
                                onClick={() => setRevealedMessages(prev => { const n = { ...prev }; delete n[msgId]; return n; })}
                              >
                                Hide
                              </button>
                            </div>
                          )}
                          <div className="text-sm leading-relaxed">{renderMessageContent(message.content)}</div>
                          <div className="flex items-center justify-end space-x-1 mt-1 text-xs"
                               style={{ color: isMyMessage ? 'rgba(255,255,255,0.6)' : '#8A84A3' }}>
                            <span>{formatMessageTime(message.timestamp || message.createdAt)}</span>
                            {isMyMessage && getStatusIcon(message.status)}
                          </div>
                        </div>
                        )}
                      </div>
                    </motion.div>
                  );
                });
              })()}
              {/* end of messages list */}
              <div ref={messagesEndRef} />
              </div>{/* /relative content wrapper above stars */}
              </div>{/* /scroll container */}
            </div>{/* /relative messages area wrapper */}

            {/* WhatsApp-style typing bubble — transparent strip above input */}
            {!selectedChat.isBanned && (() => {
              const typers = Array.from(typing.entries ? typing.entries() : [])
                .filter(([key]) => key.startsWith(`${selectedChat.id}:`))
                .map(([key, name]) => ({
                  userId: key.split(':')[1],
                  name: name || 'Someone',
                }));
              if (typers.length === 0) return null;
              const isGroup = selectedChat.type === 'group';
              return (
                <div className="px-6 pt-1 pb-4 typing-enter pointer-events-none" style={{ background: '#06040f' }}>
                  <div className="flex items-end gap-2">
                    {isGroup && (
                      <div className="flex -space-x-2">
                        {typers.slice(0, 3).map(t => (
                          <div
                            key={t.userId}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 shadow-lg"
                            style={{
                              background: 'linear-gradient(135deg, #9668F5, #6E4FEF)',
                              borderColor: '#06040f',
                            }}
                            title={t.name}
                          >
                            {t.name.charAt(0).toUpperCase()}
                          </div>
                        ))}
                      </div>
                    )}
                    <div
                      className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-md backdrop-blur-xl"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(150,104,245,0.10))',
                        border: '1px solid rgba(255,255,255,0.12)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 24px -6px rgba(110,79,239,0.45), 0 0 24px -8px rgba(150,104,245,0.5)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                      }}
                    >
                      <span className="typing-dot" style={{ animationDelay: '0s' }} />
                      <span className="typing-dot" style={{ animationDelay: '0.18s' }} />
                      <span className="typing-dot" style={{ animationDelay: '0.36s' }} />
                    </div>
                    {isGroup && (
                      <span className="text-[11px] ml-1 mb-2 truncate max-w-[180px]" style={{ color: '#c4a8ff' }}>
                        {typers.length === 1
                          ? `${typers[0].name} is typing…`
                          : typers.length === 2
                            ? `${typers[0].name} & ${typers[1].name} are typing…`
                            : `${typers[0].name} & ${typers.length - 1} others typing…`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Message Input */}
            <div className="px-3 md:px-6 py-3 md:py-4 border-t safe-bottom" style={{ background: '#0d0b1a', borderColor: '#362A60' }}>
              {/* Lock banner — group is locked by moderation (non-privileged users see this INSTEAD of input) */}
              {selectedChat.type === 'group' && groupLocked[selectedChat.id] && !['moderator','admin','owner'].includes(selectedChat.userRole) ? (
                <div className="flex items-center justify-center py-3 px-4 rounded-2xl" style={{ background: '#3b1c1c', border: '1px solid #7f1d1d' }}>
                  <span className="mr-2">🔒</span>
                  <span className="text-sm" style={{ color: '#fca5a5' }}>
                    This group is locked by moderation. Messaging is temporarily disabled.
                  </span>
                </div>
              ) : muteInfo[selectedChat.id] && muteCountdown ? (
                <div className="flex items-center justify-center py-3 px-4 rounded-2xl" style={{ background: '#15102b', border: '1px solid #362A60' }}>
                  <svg className="w-5 h-5 mr-2 flex-shrink-0" style={{ color: '#f87171' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                  <span className="text-sm" style={{ color: '#f87171' }}>
                    You are muted for <span className="font-mono font-semibold">{muteCountdown}</span>
                  </span>
                </div>
              ) : (
              <form onSubmit={handleSendMessage} className="flex items-end space-x-2 md:space-x-3">
                <button type="button" className="hidden md:inline-flex p-3 rounded-full transition-colors hover:bg-[#1c1538]">
                  <svg className="w-6 h-6" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                
                <div className="flex-1 relative min-w-0">
                  <textarea
                    ref={inputRef}
                    value={messageInput}
                    onChange={handleInputChange}
                    placeholder={connected ? "Type a message..." : "Connecting..."}
                    disabled={!connected}
                    rows={1}
                    className="w-full px-3 md:px-4 py-3 rounded-2xl text-base md:text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 max-h-32"
                    style={{
                      minHeight: '48px',
                      background: '#15102b',
                      border: '1px solid #362A60',
                      color: '#ffffff',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                </div>
                
                <button type="button" className="hidden md:inline-flex p-3 rounded-full transition-colors hover:bg-[#1c1538]">
                  <svg className="w-6 h-6" style={{ color: '#8A84A3' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                
                <button
                  type="submit"
                  disabled={!connected || !messageInput.trim()}
                  className="p-2.5 md:p-3 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #9668F5, #6E4FEF)' }}
                >
                  <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          /* Welcome Screen — hidden on mobile (sidebar takes full width when no chat is selected) */
          <div className="hidden md:flex flex-1 flex-col items-center justify-center" style={{ background: '#06040f' }}>
            <div className="text-center max-w-md px-6">
              <div className="w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-8"
                   style={{ background: 'linear-gradient(135deg, #9668F5, #6E4FEF)' }}>
                <div className="text-6xl">💬</div>
              </div>
              {loadingConversations ? (
                <>
                  <h2 className="text-2xl font-bold mb-4" style={{ color: '#ffffff' }}>Loading your chats...</h2>
                  <div className="inline-flex items-center space-x-2" style={{ color: '#8A84A3' }}>
                    <div className="w-5 h-5 border-2 border-violet-700 border-t-violet-400 rounded-full animate-spin"></div>
                    <span>Getting everything ready for you</span>
                  </div>
                </>
              ) : conversations.length === 0 ? (
                <>
                  <h2 className="text-2xl font-bold mb-4" style={{ color: '#ffffff' }}>Welcome to Konnect Chat</h2>
                  <p className="leading-relaxed mb-6" style={{ color: '#8A84A3' }}>
                    You don&apos;t have any conversations yet. Start chatting by adding contacts or joining groups!
                  </p>
                  <div className="flex space-x-3 justify-center">
                    <button 
                      onClick={() => setShowAddContact(true)}
                      className="px-6 py-2 text-white rounded-lg transition-colors"
                      style={{ background: '#9668F5' }}
                    >
                      Add Contact
                    </button>
                    <button 
                      onClick={() => setShowJoinGroup(true)}
                      className="px-6 py-2 rounded-lg transition-colors"
                      style={{ border: '1px solid #362A60', color: '#ffffff' }}
                    >
                      Join Group
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold mb-4" style={{ color: '#ffffff' }}>Welcome to Konnect Chat</h2>
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
      
      {/* Moderation Toast */}
      {moderationToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in"
             style={{ background: '#15102b', border: '1px solid #362A60', color: '#ffffff' }}>
          {moderationToast}
        </div>
      )}

      {/* Feature Coming Soon Toast */}
      {featureToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in"
             style={{ background: '#15102b', border: '1px solid #362A60', color: '#ffffff' }}>
          {featureToast}
        </div>
      )}

      {/* Moderation Dashboard — slides in from the right over the chat area */}
      <AnimatePresence>
        {showModerationDashboard && selectedChat?.type === 'group' && (
          <ModerationDashboard
            groupId={selectedChat.id}
            groupName={selectedChat.name}
            userRole={selectedChat.userRole}
            sentiment={groupSentiment[selectedChat.id]}
            locked={!!groupLocked[selectedChat.id]}
            moderationAlert={moderationAlert}
            onClose={() => setShowModerationDashboard(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile responsive overlay for smaller screens */}
      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translate(-50%, -12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
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
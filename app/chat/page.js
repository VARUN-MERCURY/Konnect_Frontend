'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getAccessToken } from '@/lib/api';
import { useWebSocket } from '@/lib/websocket';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function ChatPage() {
  const router = useRouter();
  const { 
    connected, 
    onlineUsers, 
    messages, 
    typing, 
    sendMessage, 
    joinConversation,
    startTyping,
    stopTyping,
    clearMessages 
  } = useWebSocket();

  const [currentConversation, setCurrentConversation] = useState('general');
  const [messageInput, setMessageInput] = useState('');
  const [username, setUsername] = useState('Anonymous');
  const [userInitial, setUserInitial] = useState('A');
  const [isTyping, setIsTyping] = useState(false);
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Get username from token or session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const email = sessionStorage.getItem('pendingEmail') || 'anonymous@example.com';
      const name = email.split('@')[0];
      setUsername(name);
      setUserInitial(name[0]?.toUpperCase() || 'A');
    }
  }, []);

  // Join general conversation on mount
  useEffect(() => {
    if (connected) {
      joinConversation(currentConversation);
    }
  }, [connected, currentConversation, joinConversation]);

  // Handle message send
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !connected) return;

    sendMessage(currentConversation, messageInput.trim());
    setMessageInput('');
    handleStopTyping();
  };

  // Handle typing indicators
  const handleStartTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      startTyping(currentConversation);
    }
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      handleStopTyping();
    }, 3000);
  };

  const handleStopTyping = () => {
    if (isTyping) {
      setIsTyping(false);
      stopTyping(currentConversation);
    }
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

  // Format timestamp
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get message status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'sending':
        return (
          <div className="animate-spin rounded-full h-3 w-3 border border-gray-400 border-t-transparent" />
        );
      case 'delivered':
        return (
          <svg className="h-3 w-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Logo & Back Navigation */}
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="flex items-center space-x-2 text-gray-500 hover:text-gray-700 transition-colors duration-200"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span className="text-sm font-medium">Dashboard</span>
                </button>
                
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-sm"></div>
                  </div>
                  <div>
                    <span className="text-xl font-bold text-gray-900">Konnect Chat</span>
                    <div className="flex items-center space-x-2 mt-1">
                      <div className={`w-2 h-2 rounded-full ${
                        connected ? 'bg-green-400' : 'bg-red-400'
                      }`}></div>
                      <span className={`text-xs font-medium ${
                        connected ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* User & Online Count */}
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span>{onlineUsers.length} online</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-indigo-700">{userInitial}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-700">{username}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Chat Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - Online Users */}
          <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Online Users</h3>
              <div className="text-sm text-gray-600">
                {onlineUsers.length} user{onlineUsers.length !== 1 ? 's' : ''} online
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {onlineUsers.map((user, index) => (
                  <div key={user.id || index} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50">
                    <div className="relative">
                      <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-white">
                          {user.username?.[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user.username || 'Anonymous'}
                        {user.username === username && (
                          <span className="text-indigo-600 ml-1">(You)</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">Active now</p>
                    </div>
                  </div>
                ))}
                
                {onlineUsers.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    <svg className="h-8 w-8 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                    <p className="text-sm">No users online</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Welcome to Konnect Chat!</h3>
                  <p className="text-gray-600">Start a conversation with online users. Your messages will appear here.</p>
                </div>
              )}
              
              {messages.map((message, index) => {
                const isMyMessage = message.sender?.username === 'You' || message.sender?.username === username;
                return (
                  <div key={message._id || message.tempId || index} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md ${
                      isMyMessage 
                        ? 'bg-indigo-600 text-white rounded-l-lg rounded-tr-lg'
                        : 'bg-white text-gray-900 rounded-r-lg rounded-tl-lg shadow-sm border border-gray-200'
                    } px-4 py-3`}>
                      {!isMyMessage && (
                        <div className="text-xs font-medium mb-1 text-gray-600">
                          {message.sender?.username || 'Anonymous'}
                        </div>
                      )}
                      <div className="text-sm mb-1">{message.content}</div>
                      <div className={`text-xs flex items-center space-x-1 ${
                        isMyMessage ? 'text-indigo-200 justify-end' : 'text-gray-500'
                      }`}>
                        <span>{formatTime(message.timestamp)}</span>
                        {isMyMessage && getStatusIcon(message.status)}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Typing indicators */}
              {typing.length > 0 && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-600 rounded-lg px-4 py-2 max-w-xs">
                    <div className="text-sm">
                      {typing.length === 1 
                        ? `${typing[0]} is typing...`
                        : `${typing.length} users are typing...`
                      }
                    </div>
                    <div className="flex space-x-1 mt-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="border-t border-gray-200 bg-white p-4">
              <form onSubmit={handleSendMessage} className="flex space-x-4">
                <div className="flex-1">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={handleInputChange}
                    placeholder={connected ? "Type your message..." : "Connecting..."}
                    disabled={!connected}
                    className="input-field"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!connected || !messageInput.trim()}
                  className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg
                           transition-all duration-200 ease-in-out
                           hover:bg-indigo-700 hover:shadow-lg hover:-translate-y-0.5
                           focus:outline-none focus:ring-4 focus:ring-indigo-500/50
                           disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                           shadow-md hover:shadow-xl flex items-center space-x-2"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <span>Send</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
import { useState, useEffect } from 'react';
import { searchUsers as apiSearchUsers } from '@/lib/api';

export default function AddContactModal({ show, onClose, onAddContact, currentUser }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState('username'); // 'username', 'email', 'usercode'
  const [error, setError] = useState('');

  // Real search function using API
  const searchUsers = async (query, type) => {
    if (!query.trim()) {
      setSearchResults([]);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      // Map frontend search types to API types
      const apiType = type === 'code' ? 'usercode' : type;
      const results = await apiSearchUsers(query, apiType);
      setSearchResults(results);
      
      if (results.length === 0) {
        setError('No users found matching your search');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search users. Please try again.');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers(searchQuery, searchType);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchType]);

  const handleAddContact = (user) => {
    // Create new conversation with this user
    const newConversation = {
      id: `dm_${user._id}`, // Use MongoDB _id
      name: user.name || user.username,
      type: 'direct',
      avatar: user.name ? user.name[0]?.toUpperCase() : user.username[0]?.toUpperCase(),
      lastMessage: 'Contact added',
      lastTime: new Date().toISOString(),
      unread: 0,
      online: false, // Will be updated by WebSocket
      userId: user._id,
      username: user.username,
      email: user.email,
      userCode: user.userCode
    };

    onAddContact(newConversation);
    onClose();
    setSearchQuery('');
    setSearchResults([]);
    setError('');
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 max-w-full max-h-[80vh] mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add New Contact</h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Type Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { key: 'username', label: 'Username' },
            { key: 'email', label: 'Email' },
            { key: 'code', label: 'User Code' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSearchType(tab.key)}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                searchType === tab.key
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="p-4">
          <div className="relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={`Search by ${searchType}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Search Results */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <span className="ml-3 text-gray-600">Searching...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="w-12 h-12 text-red-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-600">{error}</p>
              <button 
                onClick={() => searchUsers(searchQuery, searchType)}
                className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-2 p-4">
              {searchResults.map((user) => (
                <div
                  key={user._id}
                  className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                  onClick={() => handleAddContact(user)}
                >
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-lg">
                        {user.name ? user.name[0]?.toUpperCase() : user.username[0]?.toUpperCase()}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{user.name || user.username}</h3>
                      <div className="text-sm text-gray-500 space-y-0.5">
                        <div>@{user.username}</div>
                        <div>📧 {user.email}</div>
                        <div>🔢 {user.userCode}</div>
                      </div>
                    </div>
                  </div>
                  
                  <button className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : searchQuery.trim() ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
              <p className="text-gray-500">
                Try searching with a different {searchType} or check the spelling.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Find Your Friends</h3>
              <p className="text-gray-500 max-w-sm">
                Search for users by their username, email, or unique user code to start chatting.
              </p>
            </div>
          )}
        </div>

        {/* Your User Code Display */}
        <div className="border-t border-gray-200 p-4">
          <div className="bg-indigo-50 rounded-lg p-3">
            <h4 className="text-sm font-medium text-indigo-900 mb-1">Your User Code</h4>
            <div className="flex items-center justify-between">
              <code className="text-indigo-600 font-mono font-semibold">
                {currentUser?.userCode || 'Loading...'}
              </code>
              <button 
                onClick={() => {
                  const userCode = currentUser?.userCode || '';
                  if (userCode) {
                    navigator.clipboard.writeText(userCode);
                    // TODO: Show toast: "Copied to clipboard"
                  }
                }}
                disabled={!currentUser?.userCode}
                className="text-indigo-600 hover:text-indigo-700 text-sm disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-indigo-600 mt-1">
              Share this code with friends so they can find you!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
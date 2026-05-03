import { useState, useEffect } from 'react';
import { searchUsers as apiSearchUsers } from '@/lib/api';

export default function AddContactModal({ show, onClose, onAddContact, currentUser }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState('username'); // 'username', 'email', 'code'
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

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
      const apiType = type === 'code' ? 'usercode' : type;
      const results = await apiSearchUsers(query, apiType);
      setSearchResults(results);

      if (results.length === 0) {
        setError(`No users found for "${query}". Try another ${type}.`);
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

  // Reset transient state when modal closes
  useEffect(() => {
    if (!show) {
      setSearchQuery('');
      setSearchResults([]);
      setError('');
      setCopied(false);
    }
  }, [show]);

  const handleAddContact = (user) => {
    const newConversation = {
      id: `dm_${user._id}`,
      name: user.name || user.username,
      type: 'direct',
      avatar: user.name ? user.name[0]?.toUpperCase() : user.username[0]?.toUpperCase(),
      lastMessage: 'Contact added',
      lastTime: new Date().toISOString(),
      unread: 0,
      online: false,
      userId: user._id,
      username: user.username,
      email: user.email,
      userCode: user.userCode,
    };

    onAddContact(newConversation);
    onClose();
  };

  const handleCopyCode = () => {
    const userCode = currentUser?.userCode || '';
    if (!userCode) return;
    try {
      navigator.clipboard.writeText(userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {}
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: 'rgba(6, 4, 15, 0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md flex flex-col rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: '#0d0b1a',
          border: '1px solid #362A60',
          // Use dynamic viewport height (dvh) so the modal shrinks with the
          // mobile keyboard instead of having tabs/results pushed off-screen.
          height: '100dvh',
          maxHeight: '92dvh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid #362A60' }}
        >
          <h2 className="text-base font-semibold" style={{ color: '#ffffff' }}>
            Add New Contact
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full transition-colors"
            style={{ color: '#8A84A3' }}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Your User Code (compact, on top so it's never hidden by keyboard) */}
        <div className="px-4 py-2 shrink-0">
          <div
            className="flex items-center justify-between rounded-lg px-3 py-2"
            style={{ background: '#15102b', border: '1px solid #362A60' }}
          >
            <div className="min-w-0 mr-3">
              <div
                className="text-[10px] uppercase tracking-wider"
                style={{ color: '#8A84A3' }}
              >
                Your code
              </div>
              <code
                className="font-mono font-semibold text-sm truncate"
                style={{ color: '#c4a8ff' }}
              >
                {currentUser?.userCode || '—'}
              </code>
            </div>
            <button
              onClick={handleCopyCode}
              disabled={!currentUser?.userCode}
              className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 shrink-0"
              style={{ background: '#362A60', color: '#c4a8ff' }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Search Type Tabs */}
        <div
          className="flex shrink-0 px-2"
          style={{ borderBottom: '1px solid #362A60' }}
        >
          {[
            { key: 'username', label: 'Username' },
            { key: 'email', label: 'Email' },
            { key: 'code', label: 'Code' },
          ].map((tab) => {
            const active = searchType === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setSearchType(tab.key)}
                className="flex-1 py-2.5 text-sm font-medium transition-colors"
                style={{
                  color: active ? '#c4a8ff' : '#8A84A3',
                  borderBottom: active ? '2px solid #9668F5' : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <svg
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: '#8A84A3' }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder={`Search by ${searchType}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{
                background: '#15102b',
                border: '1px solid #362A60',
                color: '#ffffff',
              }}
              autoFocus
            />
          </div>
        </div>

        {/* Search Results — flex-1 with min-h-0 so it scrolls instead of pushing tabs off */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div
                className="animate-spin rounded-full h-7 w-7 border-2"
                style={{ borderColor: '#362A60', borderTopColor: '#9668F5' }}
              />
              <span className="ml-3 text-sm" style={{ color: '#8A84A3' }}>
                Searching...
              </span>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-1.5">
              {searchResults.map((user) => (
                <button
                  key={user._id}
                  onClick={() => handleAddContact(user)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors text-left"
                  style={{ background: 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#15102b')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-semibold shrink-0"
                    style={{ background: 'linear-gradient(135deg, #6E4FEF, #9668F5)' }}
                  >
                    {(user.name || user.username || '?')[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate" style={{ color: '#ffffff' }}>
                      {user.name || user.username}
                    </div>
                    <div className="text-xs truncate" style={{ color: '#8A84A3' }}>
                      @{user.username} · {user.userCode}
                    </div>
                  </div>
                  <div
                    className="p-2 rounded-full shrink-0"
                    style={{ background: '#362A60', color: '#c4a8ff' }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          ) : error && searchQuery.trim() ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-6">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                style={{ background: '#15102b' }}
              >
                <svg
                  className="w-7 h-7"
                  style={{ color: '#8A84A3' }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <p className="text-sm mb-3" style={{ color: '#c4a8ff' }}>
                {error}
              </p>
              <p className="text-xs" style={{ color: '#8A84A3' }}>
                Tip: switch the tab above to search by{' '}
                {searchType === 'username'
                  ? 'email or code'
                  : searchType === 'email'
                  ? 'username or code'
                  : 'username or email'}
                .
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center px-6">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                style={{ background: '#15102b' }}
              >
                <svg
                  className="w-7 h-7"
                  style={{ color: '#8A84A3' }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-medium mb-1" style={{ color: '#ffffff' }}>
                Find your friends
              </h3>
              <p className="text-xs" style={{ color: '#8A84A3' }}>
                Search by username, email, or unique user code.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

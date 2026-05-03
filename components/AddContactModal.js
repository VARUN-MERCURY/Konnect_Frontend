'use client';

import { useState, useEffect } from 'react';
import { searchUsers as apiSearchUsers } from '@/lib/api';

// ─── Shared visual tokens (locked palette) ──────────────────────
const C = {
  overlay: 'rgba(6, 4, 15, 0.72)',
  sheet: '#0d0b1a',
  surface: '#15102b',
  surface2: '#1a1535',
  border: '#362A60',
  accent: '#9668F5',
  accentHover: '#6E4FEF',
  text: '#ffffff',
  textMuted: '#8A84A3',
  textAccent: '#c4a8ff',
};

// Inline styles below intentionally bypass global label/input CSS rules in
// app/globals.css so the modal body never collapses or inherits unexpected
// width/padding from those global rules.

const modalSheetStyle = {
  background: C.sheet,
  border: `1px solid ${C.border}`,
  // svh = stable mobile viewport (handles browser chrome). dvh = dynamic
  // viewport that shrinks with the keyboard. Fallback to vh for older WebKit.
  height: '100vh',
  maxHeight: '100vh',
};

// Apply taller modal on big screens via a CSS variable trick using style only
const sheetClassName =
  'w-full sm:max-w-md flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl';

export default function AddContactModal({ show, onClose, onAddContact, currentUser }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState('username');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!show) return;
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setError('');
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const apiType = searchType === 'code' ? 'usercode' : searchType;
        const results = await apiSearchUsers(searchQuery, apiType);
        setSearchResults(results || []);
        if (!results || results.length === 0) {
          setError(`No users found for "${searchQuery}".`);
        }
      } catch (err) {
        console.error('Search error:', err);
        setError('Search failed. Please try again.');
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchType, show]);

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
      name: user.name || user.username || 'User',
      type: 'direct',
      avatar: (user.name || user.username || '?')[0]?.toUpperCase(),
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
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: C.overlay,
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={sheetClassName}
        style={modalSheetStyle}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: `1px solid ${C.border}`,
            flexShrink: 0,
          }}
        >
          <h2 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: 0 }}>
            Add New Contact
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: C.textMuted,
              padding: 6,
              cursor: 'pointer',
              borderRadius: 999,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Your Code (compact, on top) */}
        <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: 10,
              background: C.surface,
              border: `1px solid ${C.border}`,
            }}
          >
            <div style={{ minWidth: 0, marginRight: 12 }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: C.textMuted,
                }}
              >
                Your code
              </div>
              <code
                style={{
                  display: 'block',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontWeight: 700,
                  fontSize: 14,
                  color: C.textAccent,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {currentUser?.userCode || '—'}
              </code>
            </div>
            <button
              onClick={handleCopyCode}
              disabled={!currentUser?.userCode}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '8px 14px',
                borderRadius: 8,
                background: C.border,
                color: C.textAccent,
                border: 'none',
                cursor: 'pointer',
                opacity: currentUser?.userCode ? 1 : 0.4,
                flexShrink: 0,
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Search type pills — always visible, large enough to tap */}
        <div style={{ padding: '8px 16px 4px', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: 4,
              borderRadius: 12,
              background: C.surface,
              border: `1px solid ${C.border}`,
            }}
          >
            {[
              { key: 'username', label: 'Username' },
              { key: 'email', label: 'Email' },
              { key: 'code', label: 'User Code' },
            ].map((tab) => {
              const active = searchType === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setSearchType(tab.key)}
                  style={{
                    flex: 1,
                    minHeight: 36,
                    padding: '8px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 8,
                    background: active ? C.accent : 'transparent',
                    color: active ? '#fff' : C.textAccent,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Input — explicit overrides to defeat global input{} rule */}
        <div style={{ padding: '10px 16px 8px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.textMuted}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={`Search by ${searchType}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '12px 12px 12px 38px',
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.text,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Results — flex:1 with min-height:0 so it scrolls inside the sheet */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '4px 8px 16px',
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  border: `2px solid ${C.border}`,
                  borderTopColor: C.accent,
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <span style={{ marginLeft: 12, fontSize: 14, color: C.textMuted }}>Searching...</span>
            </div>
          ) : searchResults.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {searchResults.map((user) => (
                <button
                  key={user._id}
                  onClick={() => handleAddContact(user)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 10,
                    borderRadius: 10,
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.surface)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 16,
                      background: `linear-gradient(135deg, ${C.accentHover}, ${C.accent})`,
                      flexShrink: 0,
                    }}
                  >
                    {(user.name || user.username || '?')[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                        color: C.text,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {user.name || user.username || 'User'}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.textMuted,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {user.username ? `@${user.username}` : user.email || ''}
                      {user.userCode ? ` · ${user.userCode}` : ''}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: 8,
                      borderRadius: '50%',
                      background: C.border,
                      color: C.textAccent,
                      flexShrink: 0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          ) : error && searchQuery.trim() ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ color: C.textAccent, fontSize: 14, marginBottom: 8 }}>{error}</p>
              <p style={{ color: C.textMuted, fontSize: 12 }}>
                Tip: switch the chips above to search by{' '}
                {searchType === 'username'
                  ? 'email or user code'
                  : searchType === 'email'
                  ? 'username or user code'
                  : 'username or email'}
                .
              </p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <h3 style={{ color: C.text, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                Find your friends
              </h3>
              <p style={{ color: C.textMuted, fontSize: 12 }}>
                Search by username, email, or unique user code.
              </p>
            </div>
          )}
        </div>

        <style jsx>{`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
          @media (min-width: 640px) {
            div[role='dialog-sheet'] {
              max-height: 90vh !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

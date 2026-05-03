'use client';

import { useState, useEffect } from 'react';
import { previewGroupByCode, joinGroupByCode } from '@/lib/api';

const C = {
  overlay: 'rgba(6, 4, 15, 0.72)',
  sheet: '#0d0b1a',
  surface: '#15102b',
  border: '#362A60',
  accent: '#9668F5',
  accentHover: '#6E4FEF',
  text: '#ffffff',
  textMuted: '#8A84A3',
  textAccent: '#c4a8ff',
};

export default function JoinGroupModal({ show, onClose, onJoinGroup }) {
  const [joinMethod, setJoinMethod] = useState('code');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupPreview, setGroupPreview] = useState(null);

  useEffect(() => {
    if (!show) return;
    if (!inviteCode.trim()) {
      setGroupPreview(null);
      setError('');
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const preview = await previewGroupByCode(inviteCode);
        setGroupPreview(preview);
      } catch (err) {
        if (err.message?.includes('404')) setError('Invalid invite code.');
        else setError('Failed to load group preview.');
        setGroupPreview(null);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [inviteCode, show]);

  useEffect(() => {
    if (!show) {
      setInviteCode('');
      setGroupPreview(null);
      setError('');
      setLoading(false);
      setJoinMethod('code');
    }
  }, [show]);

  const join = async () => {
    if (!groupPreview || !inviteCode) return;
    setLoading(true);
    setError('');
    try {
      const conv = await joinGroupByCode(inviteCode);
      onJoinGroup({
        id: conv.id,
        name: conv.name,
        type: conv.type,
        avatar: conv.avatar || '👥',
        lastMessage: conv.lastMessage || 'Welcome to the group!',
        lastTime: conv.lastTime || new Date().toISOString(),
        unread: 0,
        online: true,
        participants: conv.participants || 1,
      });
      onClose();
    } catch (err) {
      if (err.message?.includes('409')) setError('You are already a member of this group.');
      else if (err.message?.includes('404')) setError('Group not found or invite expired.');
      else setError('Failed to join group.');
    } finally {
      setLoading(false);
    }
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
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl"
        style={{
          background: C.sheet,
          border: `1px solid ${C.border}`,
          height: '100vh',
          maxHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
        }}
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
          <h2 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: 0 }}>Join Group</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: C.textMuted,
              padding: 6,
              cursor: 'pointer',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Method pills */}
        <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
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
              { key: 'code', label: 'Enter Code' },
              { key: 'qr', label: 'Scan QR' },
            ].map((tab) => {
              const active = joinMethod === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setJoinMethod(tab.key)}
                  style={{
                    flex: 1,
                    minHeight: 36,
                    padding: '8px 10px',
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 8,
                    background: active ? C.accent : 'transparent',
                    color: active ? '#fff' : C.textAccent,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 16px 20px' }}>
          {joinMethod === 'code' ? (
            <div>
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: C.textMuted,
                  marginTop: 8,
                  marginBottom: 6,
                }}
              >
                Group invite code
              </div>
              <input
                type="text"
                placeholder="e.g. KGGENERAL2024"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                autoFocus
                style={{
                  width: '100%',
                  padding: '14px',
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  color: C.text,
                  fontSize: 16,
                  textAlign: 'center',
                  letterSpacing: '0.15em',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  textTransform: 'uppercase',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />

              {loading && !groupPreview && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      border: `2px solid ${C.border}`,
                      borderTopColor: C.accent,
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  <span style={{ marginLeft: 12, fontSize: 14, color: C.textMuted }}>Validating...</span>
                </div>
              )}

              {error && (
                <div
                  style={{
                    marginTop: 14,
                    padding: '10px 12px',
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    color: C.textAccent,
                    borderRadius: 10,
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}

              {groupPreview && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 14,
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 22,
                      background: `linear-gradient(135deg, ${C.accentHover}, ${C.accent})`,
                      flexShrink: 0,
                    }}
                  >
                    {groupPreview.avatar || '👥'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3
                      style={{
                        color: C.text,
                        fontWeight: 600,
                        fontSize: 14,
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {groupPreview.name}
                    </h3>
                    {groupPreview.description && (
                      <p
                        style={{
                          color: C.textMuted,
                          fontSize: 12,
                          margin: '4px 0',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {groupPreview.description}
                      </p>
                    )}
                    <div style={{ color: C.textMuted, fontSize: 11, display: 'flex', gap: 12 }}>
                      <span>👥 {groupPreview.memberCount} members</span>
                      <span>{groupPreview.isPublic ? '🌍 Public' : '🔒 Private'}</span>
                    </div>
                  </div>
                </div>
              )}

              {groupPreview && (
                <button
                  onClick={join}
                  disabled={loading}
                  style={{
                    width: '100%',
                    marginTop: 14,
                    padding: '14px',
                    background: C.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? 'Joining...' : 'Join Group'}
                </button>
              )}

              {!inviteCode && !groupPreview && !error && (
                <div
                  style={{
                    marginTop: 18,
                    padding: 12,
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textAccent, marginBottom: 6 }}>
                    How to join a group
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, color: C.textMuted, fontSize: 12, lineHeight: 1.6 }}>
                    <li>Ask a group member for the invite code</li>
                    <li>Scan a QR code shared by group admins</li>
                    <li>Follow an invite link sent to you</li>
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', paddingTop: 16 }}>
              <div
                style={{
                  width: 176,
                  height: 176,
                  margin: '0 auto 18px',
                  borderRadius: 12,
                  background: C.surface,
                  border: `1px dashed ${C.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                }}
              >
                <div style={{ fontSize: 44 }}>📸</div>
                <p style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>
                  Camera view appears here
                </p>
              </div>
              <button
                onClick={() => alert('QR Scanner would open here!')}
                style={{
                  width: '100%',
                  padding: 14,
                  background: C.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginBottom: 10,
                }}
              >
                Start QR Scanner
              </button>
              <button
                onClick={() => setJoinMethod('code')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: C.textAccent,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                or enter code manually
              </button>
            </div>
          )}
        </div>

        <style jsx>{`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    </div>
  );
}

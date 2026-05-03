'use client';

import { useState } from 'react';
import { createGroup, generateGroupQR } from '@/lib/api';

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

export default function CreateGroupModal({ show, onClose, onGroupCreated }) {
  const [stage, setStage] = useState('create');
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qrData, setQrData] = useState(null);
  const [newConversationId, setNewConversationId] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!show) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { conversationId } = await createGroup(groupName.trim(), description.trim());
      setNewConversationId(conversationId);
      try {
        const qr = await generateGroupQR(conversationId);
        setQrData(qr);
      } catch (qrErr) {
        console.warn('QR generation failed, continuing without QR', qrErr);
      }
      setStage('share');
    } catch (err) {
      setError(err.message || 'Failed to create group.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (qrData?.inviteLink) {
      navigator.clipboard.writeText(qrData.inviteLink).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setStage('create');
    setGroupName('');
    setDescription('');
    setError('');
    setQrData(null);
    setNewConversationId(null);
    setCopied(false);
    onClose();
  };

  const handleGoToChat = () => {
    onGroupCreated?.(newConversationId);
    handleClose();
  };

  return (
    <div
      onClick={handleClose}
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
          <h2 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: 0 }}>
            {stage === 'create' ? 'Create Group' : 'Group Created!'}
          </h2>
          <button
            onClick={handleClose}
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

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>
          {stage === 'create' ? (
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: C.textMuted,
                    marginBottom: 6,
                  }}
                >
                  Group name
                </div>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Enter group name"
                  maxLength={50}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 14px',
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

              <div>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: C.textMuted,
                    marginBottom: 6,
                  }}
                >
                  Description <span style={{ opacity: 0.6 }}>(optional)</span>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this group about?"
                  maxLength={200}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    color: C.text,
                    fontSize: 14,
                    outline: 'none',
                    resize: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {error && (
                <div
                  style={{
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

              <button
                type="submit"
                disabled={loading || !groupName.trim()}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: C.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: loading || !groupName.trim() ? 'not-allowed' : 'pointer',
                  opacity: loading || !groupName.trim() ? 0.55 : 1,
                  marginTop: 4,
                }}
              >
                {loading ? 'Creating...' : 'Create Group'}
              </button>
            </form>
          ) : (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <p style={{ color: C.textMuted, fontSize: 14, margin: 0 }}>
                Share the QR code or link to invite people to your group
              </p>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {qrData?.qrCode ? (
                  <img
                    src={qrData.qrCode}
                    alt="Group invite QR code"
                    style={{
                      width: 192,
                      height: 192,
                      borderRadius: 12,
                      background: '#fff',
                      padding: 8,
                      border: `1px solid ${C.border}`,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 192,
                      height: 192,
                      borderRadius: 12,
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: C.textMuted,
                      fontSize: 13,
                    }}
                  >
                    QR unavailable
                  </div>
                )}
              </div>

              <button
                onClick={handleCopyLink}
                disabled={!qrData?.inviteLink}
                style={{
                  width: '100%',
                  padding: 14,
                  background: C.surface,
                  color: C.textAccent,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: qrData?.inviteLink ? 1 : 0.5,
                }}
              >
                {copied ? 'Link copied!' : 'Copy invite link'}
              </button>

              <button
                onClick={handleGoToChat}
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
                }}
              >
                Go to Group Chat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

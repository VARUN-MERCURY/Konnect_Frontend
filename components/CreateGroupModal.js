'use client';

import { useState } from 'react';
import { createGroup, generateGroupQR } from '@/lib/api';

export default function CreateGroupModal({ show, onClose, onGroupCreated }) {
  const [stage, setStage] = useState('create'); // 'create' | 'share'
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
      const qr = await generateGroupQR(conversationId);
      setQrData(qr);
      setStage('share');
    } catch (err) {
      setError(err.message || 'Failed to create group. Please try again.');
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

  const handleGoToChat = () => {
    onGroupCreated?.(newConversationId);
    handleClose();
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: 'rgba(6, 4, 15, 0.7)', backdropFilter: 'blur(4px)' }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md flex flex-col rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: '#0d0b1a',
          border: '1px solid #362A60',
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
            {stage === 'create' ? 'Create Group' : 'Group Created!'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full"
            style={{ color: '#8A84A3' }}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          {stage === 'create' && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label
                  className="block text-xs uppercase tracking-wider mb-1.5"
                  style={{ color: '#8A84A3' }}
                >
                  Group Name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Enter group name"
                  maxLength={50}
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  style={{
                    background: '#15102b',
                    border: '1px solid #362A60',
                    color: '#ffffff',
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label
                  className="block text-xs uppercase tracking-wider mb-1.5"
                  style={{ color: '#8A84A3' }}
                >
                  Description <span className="opacity-60 normal-case tracking-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this group about?"
                  maxLength={200}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  style={{
                    background: '#15102b',
                    border: '1px solid #362A60',
                    color: '#ffffff',
                  }}
                />
              </div>

              {error && (
                <div
                  className="px-3 py-2.5 rounded-lg text-sm"
                  style={{ background: '#15102b', border: '1px solid #362A60', color: '#c4a8ff' }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !groupName.trim()}
                className="w-full py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: '#9668F5', color: '#ffffff' }}
              >
                {loading ? 'Creating...' : 'Create Group'}
              </button>
            </form>
          )}

          {stage === 'share' && (
            <div className="space-y-5 text-center">
              <p className="text-sm" style={{ color: '#8A84A3' }}>
                Share the QR code or link to invite people to your group
              </p>

              <div className="flex justify-center">
                {qrData?.qrCode ? (
                  <img
                    src={qrData.qrCode}
                    alt="Group invite QR code"
                    className="w-48 h-48 rounded-xl"
                    style={{ background: '#ffffff', padding: 8, border: '1px solid #362A60' }}
                  />
                ) : (
                  <div
                    className="w-48 h-48 rounded-xl flex items-center justify-center"
                    style={{ background: '#15102b', border: '1px solid #362A60' }}
                  >
                    <span className="text-sm" style={{ color: '#8A84A3' }}>
                      QR unavailable
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={handleCopyLink}
                className="w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                style={{
                  background: '#15102b',
                  border: '1px solid #362A60',
                  color: '#c4a8ff',
                }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                {copied ? 'Link copied!' : 'Copy invite link'}
              </button>

              <button
                onClick={handleGoToChat}
                className="w-full py-3 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: '#9668F5', color: '#ffffff' }}
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

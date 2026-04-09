'use client';

import { useState } from 'react';
import { createGroup, generateGroupQR } from '@/lib/api';

export default function CreateGroupModal({ show, onClose, onGroupCreated }) {
  const [stage, setStage] = useState('create'); // 'create' | 'share'
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qrData, setQrData] = useState(null); // { qrCode, inviteLink }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            {stage === 'create' ? 'Create Group' : 'Group Created!'}
          </h2>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stage 1 — Create form */}
        {stage === 'create' && (
          <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name"
                maxLength={50}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this group about?"
                maxLength={200}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading || !groupName.trim()}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        )}

        {/* Stage 2 — Share QR + link */}
        {stage === 'share' && (
          <div className="px-6 py-5 space-y-5 text-center">
            <p className="text-sm text-gray-600">Share the QR code or link to invite people to your group</p>

            {/* QR Code */}
            <div className="flex justify-center">
              {qrData?.qrCode ? (
                <img
                  src={qrData.qrCode}
                  alt="Group invite QR code"
                  className="w-48 h-48 rounded-lg border border-gray-200"
                />
              ) : (
                <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-gray-400 text-sm">QR unavailable</span>
                </div>
              )}
            </div>

            {/* Copy invite link */}
            <button
              onClick={handleCopyLink}
              className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copied ? 'Link copied!' : 'Copy invite link'}
            </button>

            {/* Go to group chat */}
            <button
              onClick={handleGoToChat}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Go to Group Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

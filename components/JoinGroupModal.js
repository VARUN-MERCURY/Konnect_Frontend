import { useState, useEffect } from 'react';
import { previewGroupByCode, joinGroupByCode } from '@/lib/api';

export default function JoinGroupModal({ show, onClose, onJoinGroup }) {
  const [joinMethod, setJoinMethod] = useState('code'); // 'code' | 'qr'
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupPreview, setGroupPreview] = useState(null);

  // Auto-validate code with debounce
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
        if (err.message?.includes('404')) {
          setError('Invalid invite code. Please check and try again.');
        } else {
          setError('Failed to load group preview. Please try again.');
        }
        setGroupPreview(null);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [inviteCode, show]);

  // Reset on close
  useEffect(() => {
    if (!show) {
      setInviteCode('');
      setGroupPreview(null);
      setError('');
      setLoading(false);
      setJoinMethod('code');
    }
  }, [show]);

  const handleCodeChange = (e) => {
    setInviteCode(e.target.value.toUpperCase());
  };

  const joinGroup = async () => {
    if (!groupPreview || !inviteCode) return;
    setLoading(true);
    setError('');
    try {
      const conversation = await joinGroupByCode(inviteCode);
      const newConversation = {
        id: conversation.id,
        name: conversation.name,
        type: conversation.type,
        avatar: conversation.avatar || '👥',
        lastMessage: conversation.lastMessage || 'Welcome to the group!',
        lastTime: conversation.lastTime || new Date().toISOString(),
        unread: 0,
        online: true,
        participants: conversation.participants || 1,
      };
      onJoinGroup(newConversation);
      onClose();
    } catch (err) {
      if (err.message?.includes('409')) {
        setError('You are already a member of this group.');
      } else if (err.message?.includes('404')) {
        setError('Group not found or invite code expired.');
      } else {
        setError('Failed to join group. Please try again.');
      }
    } finally {
      setLoading(false);
    }
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
            Join Group
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full"
            style={{ color: '#8A84A3' }}
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Method pills */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#8A84A3' }}>
            How will you join?
          </div>
          <div className="flex gap-2">
            {[
              { key: 'code', label: 'Enter Code' },
              { key: 'qr', label: 'Scan QR' },
            ].map((tab) => {
              const active = joinMethod === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setJoinMethod(tab.key)}
                  className="flex-1 py-2 text-xs font-semibold rounded-full transition-colors"
                  style={{
                    background: active ? '#9668F5' : '#15102b',
                    color: active ? '#ffffff' : '#c4a8ff',
                    border: active ? '1px solid #9668F5' : '1px solid #362A60',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-5">
          {joinMethod === 'code' ? (
            <div className="pt-2">
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: '#8A84A3' }}>
                Group Invite Code
              </label>
              <input
                type="text"
                placeholder="e.g. KGGENERAL2024"
                value={inviteCode}
                onChange={handleCodeChange}
                className="w-full px-4 py-3 rounded-lg text-center font-mono text-base tracking-wider focus:outline-none focus:ring-2 focus:ring-violet-500 uppercase"
                style={{
                  background: '#15102b',
                  border: '1px solid #362A60',
                  color: '#ffffff',
                }}
                autoFocus
              />

              {loading && !groupPreview && (
                <div className="flex items-center justify-center py-8">
                  <div
                    className="animate-spin rounded-full h-7 w-7 border-2"
                    style={{ borderColor: '#362A60', borderTopColor: '#9668F5' }}
                  />
                  <span className="ml-3 text-sm" style={{ color: '#8A84A3' }}>
                    Validating code...
                  </span>
                </div>
              )}

              {error && (
                <div
                  className="mt-4 px-3 py-2.5 rounded-lg text-sm"
                  style={{ background: '#15102b', border: '1px solid #362A60', color: '#c4a8ff' }}
                >
                  {error}
                </div>
              )}

              {groupPreview && (
                <div
                  className="mt-4 p-4 rounded-xl"
                  style={{ background: '#15102b', border: '1px solid #362A60' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl shrink-0"
                      style={{ background: 'linear-gradient(135deg, #6E4FEF, #9668F5)' }}
                    >
                      {groupPreview.avatar || '👥'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate" style={{ color: '#ffffff' }}>
                        {groupPreview.name}
                      </h3>
                      {groupPreview.description && (
                        <p className="text-xs mb-1 line-clamp-2" style={{ color: '#8A84A3' }}>
                          {groupPreview.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-[11px]" style={{ color: '#8A84A3' }}>
                        <span>👥 {groupPreview.memberCount} members</span>
                        <span>{groupPreview.isPublic ? '🌍 Public' : '🔒 Private'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {groupPreview && (
                <button
                  onClick={joinGroup}
                  disabled={loading}
                  className="w-full mt-4 py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{ background: '#9668F5', color: '#ffffff' }}
                >
                  {loading ? 'Joining...' : 'Join Group'}
                </button>
              )}

              {!inviteCode && !groupPreview && !error && (
                <div
                  className="mt-5 p-3 rounded-lg"
                  style={{ background: '#15102b', border: '1px solid #362A60' }}
                >
                  <h4 className="text-xs font-semibold mb-1.5" style={{ color: '#c4a8ff' }}>
                    How to join a group
                  </h4>
                  <ul className="text-xs space-y-1" style={{ color: '#8A84A3' }}>
                    <li>• Ask a group member for the invite code</li>
                    <li>• Scan a QR code shared by group admins</li>
                    <li>• Follow an invite link sent to you</li>
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center pt-4">
              <div
                className="w-44 h-44 mx-auto mb-5 rounded-xl flex items-center justify-center"
                style={{ background: '#15102b', border: '1px dashed #362A60' }}
              >
                <div>
                  <div className="text-5xl mb-2">📸</div>
                  <p className="text-xs" style={{ color: '#8A84A3' }}>
                    Camera view appears here
                  </p>
                </div>
              </div>
              <button
                onClick={() => alert('QR Scanner would open here!')}
                className="w-full py-3 rounded-lg text-sm font-semibold mb-3"
                style={{ background: '#9668F5', color: '#ffffff' }}
              >
                Start QR Scanner
              </button>
              <button
                onClick={() => setJoinMethod('code')}
                className="text-sm font-medium"
                style={{ color: '#c4a8ff' }}
              >
                or enter code manually
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

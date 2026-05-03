import { useState } from 'react';
import { previewGroupByCode, joinGroupByCode } from '@/lib/api';

export default function JoinGroupModal({ show, onClose, onJoinGroup }) {
  const [joinMethod, setJoinMethod] = useState('code'); // 'code' or 'qr'
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupPreview, setGroupPreview] = useState(null);

  // Real group validation using API
  const validateInviteCode = async (code) => {
    if (!code.trim()) {
      setGroupPreview(null);
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const preview = await previewGroupByCode(code);
      setGroupPreview(preview);
    } catch (err) {
      console.error('Preview error:', err);
      if (err.message?.includes('404')) {
        setError('Invalid invite code. Please check and try again.');
      } else {
        setError('Failed to load group preview. Please try again.');
      }
      setGroupPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (e) => {
    const code = e.target.value.toUpperCase();
    setInviteCode(code);
    
    // Auto-validate after typing
    const timer = setTimeout(() => {
      validateInviteCode(code);
    }, 500);

    return () => clearTimeout(timer);
  };

  const joinGroup = async () => {
    if (!groupPreview || !inviteCode) return;

    setLoading(true);
    setError('');
    
    try {
      const conversation = await joinGroupByCode(inviteCode);
      
      // Convert API response to frontend format
      const newConversation = {
        id: conversation.id,
        name: conversation.name,
        type: conversation.type,
        avatar: conversation.avatar || '👥',
        lastMessage: conversation.lastMessage || 'Welcome to the group!',
        lastTime: conversation.lastTime || new Date().toISOString(),
        unread: 0,
        online: true,
        participants: conversation.participants || 1
      };

      onJoinGroup(newConversation);
      onClose();
      
      // Reset state
      setInviteCode('');
      setGroupPreview(null);
      setError('');
    } catch (err) {
      console.error('Join group error:', err);
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

  const startQRScan = () => {
    // In a real app, you'd start camera and QR scanning
    alert('QR Scanner would open here!\nFor demo: try entering code "KGGENERAL2024"');
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Join Group</h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Method Selection */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setJoinMethod('code')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              joinMethod === 'code'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
              <span>Enter Code</span>
            </div>
          </button>
          <button
            onClick={() => setJoinMethod('qr')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              joinMethod === 'qr'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m0 0v9m0 0h9m-9 0H3m9 0a9 9 0 01-9 9m9-9a9 9 0 019-9" />
              </svg>
              <span>Scan QR</span>
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {joinMethod === 'code' ? (
            <div>
              {/* Code Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Group Invite Code
                </label>
                <input
                  type="text"
                  placeholder="Enter invite code (e.g. KGGENERAL2024)"
                  value={inviteCode}
                  onChange={handleCodeChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center font-mono text-lg tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent uppercase"
                  autoFocus
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Loading State */}
              {loading && !groupPreview && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  <span className="ml-3 text-gray-600">Validating code...</span>
                </div>
              )}

              {/* Group Preview */}
              {groupPreview && (
                <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-2xl">
                      {groupPreview.avatar}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{groupPreview.name}</h3>
                      <p className="text-sm text-gray-600 mb-1">{groupPreview.description}</p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>👥 {groupPreview.memberCount} members</span>
                        <span>🌍 {groupPreview.isPublic ? 'Public' : 'Private'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Join Button */}
              {groupPreview && (
                <button
                  onClick={joinGroup}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Joining...' : 'Join Group'}
                </button>
              )}
            </div>
          ) : (
            /* QR Scanner */
            <div className="text-center">
              <div className="w-48 h-48 mx-auto mb-6 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                <div>
                  <div className="text-6xl mb-4">📸</div>
                  <p className="text-sm text-gray-500">Camera view would appear here</p>
                </div>
              </div>

              <button
                onClick={startQRScan}
                className="w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors mb-4"
              >
                Start QR Scanner
              </button>

              <div className="text-center">
                <p className="text-sm text-gray-500 mb-2">or</p>
                <button
                  onClick={() => setJoinMethod('code')}
                  className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                >
                  Enter code manually
                </button>
              </div>
            </div>
          )}

          {/* Help Text */}
          <div className="mt-6 p-3 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-1">How to join a group:</h4>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Ask a group member for the invite code</li>
              <li>• Scan a QR code shared by group admins</li>
              <li>• Follow an invite link sent to you</li>
            </ul>
          </div>

          {/* Demo Codes */}
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="text-sm font-medium text-yellow-800 mb-1">Demo Codes:</h4>
            <div className="text-xs text-yellow-700 space-y-1">
              <div 
                className="cursor-pointer hover:bg-yellow-100 px-2 py-1 rounded"
                onClick={() => setInviteCode('KGGENERAL2024')}
              >
                📱 KGGENERAL2024 - General Chat
              </div>
              <div 
                className="cursor-pointer hover:bg-yellow-100 px-2 py-1 rounded"
                onClick={() => setInviteCode('KGTECH2024')}
              >
                ⚡ KGTECH2024 - Tech Talk  
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
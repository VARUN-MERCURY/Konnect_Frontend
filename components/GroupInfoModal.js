import { useState, useEffect } from 'react';
import { generateGroupQR, regenerateInviteCode } from '@/lib/api';

export default function GroupInfoModal({ show, onClose, group, isAdmin = true }) {
  const [inviteCode, setInviteCode] = useState('');
  const [qrCodeData, setQrCodeData] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load group data and generate QR code
  useEffect(() => {
    if (show && group && group.id) {
      loadGroupData();
    }
  }, [show, group]);

  const loadGroupData = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Generate QR code and get invite details
      const qrData = await generateGroupQR(group.id);
      setInviteCode(qrData.inviteCode);
      setQrCodeData(qrData.qrCode);
      
      // Set mock participants for now - in real app, fetch from API
      setParticipants([
        {
          id: '1',
          username: 'you',
          avatar: '👤',
          role: 'admin',
          online: true,
          joinDate: new Date(Date.now() - 86400000 * 30) // 30 days ago
        },
        {
          id: '2', 
          username: 'john_doe',
          avatar: '👨',
          role: 'member',
          online: true,
          joinDate: new Date(Date.now() - 86400000 * 15) // 15 days ago
        },
        {
          id: '3',
          username: 'jane_smith', 
          avatar: '👩',
          role: 'member',
          online: false,
          joinDate: new Date(Date.now() - 86400000 * 7) // 7 days ago
        }
      ]);
    } catch (err) {
      console.error('Error loading group data:', err);
      setError('Failed to load group information.');
      // Use fallback invite code
      setInviteCode(`KG${group.id?.toUpperCase() || 'GROUP'}${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
    } finally {
      setLoading(false);
    }
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode);
    // Show toast notification
    alert('Invite code copied to clipboard!');
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(qrCodeData);
    alert('Invite link copied to clipboard!');
  };

  const shareInvite = () => {
    if (navigator.share) {
      navigator.share({
        title: `Join ${group?.name} on Konnect`,
        text: `Join our group chat: ${group?.name}`,
        url: qrCodeData
      });
    } else {
      copyInviteLink();
    }
  };

  const handleRegenerateCode = async () => {
    if (!group?.id) return;
    
    setLoading(true);
    setError('');
    
    try {
      const newCode = await regenerateInviteCode(group.id);
      setInviteCode(newCode);
      
      // Regenerate QR code with new invite code
      const qrData = await generateGroupQR(group.id);
      setQrCodeData(qrData.qrCode);
      
      alert('New invite code generated successfully!');
    } catch (err) {
      console.error('Error regenerating invite code:', err);
      setError('Failed to generate new invite code. You may not have permission.');
    } finally {
      setLoading(false);
    }
  };

  if (!show || !group) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 max-w-full max-h-[90vh] mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Group Info</h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Group Header */}
        <div className="p-6 text-center border-b border-gray-200">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
            {group.avatar}
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">{group.name}</h3>
          <p className="text-sm text-gray-500">
            {group.participants} participants • Created {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Invite Section */}
          <div className="p-4 border-b border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3">Invite to Group</h4>
            
            {/* Invite Code */}
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Invite Code</label>
                <div className="flex space-x-2">
                  <button 
                    onClick={copyInviteCode}
                    className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                  >
                    Copy
                  </button>
                  {isAdmin && (
                    <button 
                      onClick={handleRegenerateCode}
                      disabled={loading}
                      className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                    >
                      {loading ? 'Regenerating...' : 'New Code'}
                    </button>
                  )}
                </div>
              </div>
              <code className="text-indigo-600 font-mono text-lg font-semibold">{inviteCode}</code>
              <p className="text-xs text-gray-500 mt-1">
                Share this code with people you want to add to the group
              </p>
              {error && (
                <p className="text-xs text-red-600 mt-1">{error}</p>
              )}
            </div>

            {/* Invite Link */}
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Invite Link</label>
                <button 
                  onClick={copyInviteLink}
                  className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                >
                  Copy
                </button>
              </div>
              <div className="text-sm text-gray-600 bg-white rounded p-2 border break-all">
                {qrCodeData}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setShowQR(!showQR)}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m0 0v9m0 0h9m-9 0H3m9 0a9 9 0 01-9 9m9-9a9 9 0 019-9" />
                </svg>
                <span className="text-sm">QR Code</span>
              </button>
              <button 
                onClick={shareInvite}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                </svg>
                <span className="text-sm">Share</span>
              </button>
            </div>

            {/* QR Code Display */}
            {showQR && (
              <div className="mt-4 p-4 bg-white border-2 border-gray-200 rounded-lg text-center">
                {qrCodeData ? (
                  <div className="w-32 h-32 mx-auto mb-3">
                    <img 
                      src={qrCodeData} 
                      alt="Group QR Code" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-32 h-32 mx-auto mb-3 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-4xl mb-2">📱</div>
                      <div className="text-xs text-gray-500">Loading QR...</div>
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  Scan this QR code to join the group instantly
                </p>
              </div>
            )}
          </div>

          {/* Participants Section */}
          <div className="p-4">
            <h4 className="font-semibold text-gray-900 mb-3">
              Participants ({participants.length})
            </h4>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {participants.map((participant) => (
                <div key={participant.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white">
                        {participant.avatar}
                      </div>
                      {participant.online && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h5 className="font-medium text-gray-900">
                          {participant.username}
                          {participant.username === 'you' && (
                            <span className="text-indigo-600 ml-1">(You)</span>
                          )}
                        </h5>
                        {participant.role === 'admin' && (
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 text-xs font-medium rounded-full">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {participant.online ? 'Online' : 'Offline'} • 
                        Joined {participant.joinDate.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  {isAdmin && participant.username !== 'you' && (
                    <div className="flex items-center space-x-1">
                      <button className="p-1 hover:bg-gray-200 rounded transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add Participants Button */}
            {isAdmin && (
              <button className="w-full mt-4 px-4 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                <div className="flex items-center justify-center space-x-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  <span className="text-sm font-medium">Add Participants</span>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        {isAdmin && (
          <div className="border-t border-gray-200 p-4">
            <div className="grid grid-cols-2 gap-2">
              <button className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm">
                Edit Group
              </button>
              <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm">
                Delete Group
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
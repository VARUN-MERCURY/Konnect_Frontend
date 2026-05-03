import { useState, useEffect, useRef } from 'react';
import {
  generateGroupQR,
  regenerateInviteCode,
  getGroupMembers,
  updateMemberRole,
  removeMember,
  muteMember,
  banMember,
  unbanMember,
  leaveGroup,
  deleteGroup
} from '@/lib/api';

// ─── constants ──────────────────────────────────────────────────────────────
const ROLE_RANK = { member: 0, moderator: 1, admin: 2, owner: 3 };

const ROLE_BADGE = {
  owner:     { label: 'Owner',     emoji: '👑', color: 'bg-yellow-100 text-yellow-700 border border-yellow-300' },
  admin:     { label: 'Admin',     emoji: '🛡️', color: 'bg-blue-100 text-blue-700 border border-blue-300' },
  moderator: { label: 'Moderator', emoji: '🔧', color: 'bg-purple-100 text-purple-700 border border-purple-300' },
  member:    { label: 'Member',    emoji: '',   color: '' }
};

function RoleBadge({ role }) {
  const badge = ROLE_BADGE[role] || ROLE_BADGE.member;
  if (!badge.label || role === 'member') return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
      {badge.emoji} {badge.label}
    </span>
  );
}

// ─── main component ──────────────────────────────────────────────────────────
export default function GroupInfoModal({ show, onClose, group, currentUserId, onGroupDeleted, onGroupLeft }) {
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [qrCodeData, setQrCodeData] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [members, setMembers] = useState([]);
  const [bannedMembers, setBannedMembers] = useState([]);
  const [myRole, setMyRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');      // memberId being acted on
  const [openMenuId, setOpenMenuId] = useState(null);           // member context menu
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (show && group?.id) {
      loadGroupData();
    }
    // Reset state when modal closes
    if (!show) {
      setConfirmDelete(false);
      setOpenMenuId(null);
      setError('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, group?.id]);

  const loadGroupData = async () => {
    setLoading(true);
    setError('');
    try {
      const [qrData, groupData] = await Promise.all([
        generateGroupQR(group.id),
        getGroupMembers(group.id)
      ]);
      setInviteCode(qrData.inviteCode);
      setQrCodeData(qrData.qrCode);
      setInviteLink(qrData.inviteLink);
      setMembers(groupData.members || []);
      setBannedMembers(groupData.bannedMembers || []);

      const me = (groupData.members || []).find(m => m.userId?.toString() === currentUserId?.toString());
      setMyRole(me?.role || 'member');
    } catch (err) {
      console.error('Error loading group data:', err);
      setError('Failed to load group information.');
    } finally {
      setLoading(false);
    }
  };

  const canManage = (targetRole) =>
    ROLE_RANK[myRole] > ROLE_RANK[targetRole || 'member'];

  // ── invite actions ──────────────────────────────────────────────────────
  const copyToClipboard = (text, label = 'Copied!') => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const handleRegenerateCode = async () => {
    if (!group?.id) return;
    setActionLoading('regen');
    setError('');
    try {
      const newCode = await regenerateInviteCode(group.id);
      setInviteCode(newCode);
      const qrData = await generateGroupQR(group.id);
      setQrCodeData(qrData.qrCode);
      setInviteLink(qrData.inviteLink);
    } catch (err) {
      setError('Failed to regenerate invite code. You may not have permission.');
    } finally {
      setActionLoading('');
    }
  };

  // ── member action helpers ────────────────────────────────────────────────
  const handleRoleChange = async (memberId, newRole) => {
    setActionLoading(memberId);
    setOpenMenuId(null);
    try {
      await updateMemberRole(group.id, memberId, newRole);
      setMembers(prev => prev.map(m =>
        m.userId?.toString() === memberId ? { ...m, role: newRole } : m
      ));
    } catch (err) {
      setError(err.message || 'Failed to update role.');
    } finally {
      setActionLoading('');
    }
  };

  const handleRemove = async (memberId) => {
    setActionLoading(memberId);
    setOpenMenuId(null);
    try {
      await removeMember(group.id, memberId);
      setMembers(prev => prev.filter(m => m.userId?.toString() !== memberId));
    } catch (err) {
      setError(err.message || 'Failed to remove member.');
    } finally {
      setActionLoading('');
    }
  };

  const handleMute = async (memberId, minutes) => {
    setActionLoading(memberId);
    setOpenMenuId(null);
    try {
      await muteMember(group.id, memberId, minutes);
      setMembers(prev => prev.map(m =>
        m.userId?.toString() === memberId
          ? { ...m, isMuted: minutes > 0, mutedUntil: minutes > 0 ? new Date(Date.now() + minutes * 60000) : null }
          : m
      ));
    } catch (err) {
      setError(err.message || 'Failed to mute member.');
    } finally {
      setActionLoading('');
    }
  };

  const handleBan = async (memberId) => {
    setActionLoading(memberId);
    setOpenMenuId(null);
    try {
      await banMember(group.id, memberId);
      const banned = members.find(m => m.userId?.toString() === memberId);
      setMembers(prev => prev.filter(m => m.userId?.toString() !== memberId));
      if (banned) {
        setBannedMembers(prev => [...prev, { userId: banned.userId, name: banned.name, username: banned.username, avatar: banned.avatar, bannedAt: new Date() }]);
      }
    } catch (err) {
      setError(err.message || 'Failed to ban member.');
    } finally {
      setActionLoading('');
    }
  };

  const handleDeleteGroup = async () => {
    setActionLoading('delete');
    try {
      await deleteGroup(group.id);
      onGroupDeleted?.(group.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete group.');
      setConfirmDelete(false);
    } finally {
      setActionLoading('');
    }
  };

  const handleUnban = async (memberId) => {
    setActionLoading(memberId);
    try {
      await unbanMember(group.id, memberId);
      setBannedMembers(prev => prev.filter(m => m.userId?.toString() !== memberId));
    } catch (err) {
      setError(err.message || 'Failed to unban member.');
    } finally {
      setActionLoading('');
    }
  };

  const handleLeaveGroup = async () => {
    setActionLoading('leave');
    try {
      await leaveGroup(group.id);
      onGroupLeft?.(group.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to leave group.');
    } finally {
      setActionLoading('');
    }
  };

  // ── helpers ──────────────────────────────────────────────────────────────
  const getInitials = (name) => (name || '?')[0].toUpperCase();

  const getPromotableRole = (targetRole) => {
    if (!canManage(targetRole)) return null;
    // owner can promote member→mod, mod→admin; admin can only promote member→mod
    if (targetRole === 'member') return 'moderator';
    if (targetRole === 'moderator' && myRole === 'owner') return 'admin';
    return null;
  };

  const getDemotableRole = (targetRole) => {
    if (!canManage(targetRole)) return null;
    if (targetRole === 'admin' && myRole === 'owner') return 'moderator';
    if (targetRole === 'moderator') return 'member';
    return null;
  };

  // ── render ──────────────────────────────────────────────────────────────
  if (!show || !group) return null;

  const isOwner = myRole === 'owner';
  const isAdminOrAbove = ['admin', 'owner'].includes(myRole);
  const isModOrAbove = ['moderator', 'admin', 'owner'].includes(myRole);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Group Info</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Group identity */}
        <div className="px-5 py-5 text-center border-b border-gray-100">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-3">
            {group.avatar || '👥'}
          </div>
          <h3 className="text-xl font-semibold text-gray-900">{group.name}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {members.length} members · <RoleBadge role={myRole} />
            {myRole === 'member' && <span className="text-gray-400 text-xs">Member</span>}
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-5 mt-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
            </svg>
            {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Invite section ── */}
          <div className="px-5 py-4 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Invite Link</h4>

            {loading ? (
              <div className="h-10 bg-gray-100 rounded animate-pulse" />
            ) : (
              <>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border mb-2">
                  <code className="flex-1 text-indigo-600 font-mono text-sm truncate">{inviteCode}</code>
                  <button
                    onClick={() => copyToClipboard(inviteCode)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium shrink-0"
                  >Copy</button>
                  {isOwner && (
                    <button
                      onClick={handleRegenerateCode}
                      disabled={actionLoading === 'regen'}
                      className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0 disabled:opacity-50"
                    >{actionLoading === 'regen' ? '...' : 'Reset'}</button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowQR(!showQR)}
                    className="flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m0 0v9m0 0h9m-9 0H3m9 0a9 9 0 01-9 9m9-9a9 9 0 019-9" />
                    </svg>
                    QR Code
                  </button>
                  <button
                    onClick={() => copyToClipboard(inviteLink)}
                    className="flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy Link
                  </button>
                </div>

                {showQR && qrCodeData && (
                  <div className="mt-3 p-4 bg-white border-2 border-gray-200 rounded-xl text-center">
                    <img src={qrCodeData} alt="Group QR Code" className="w-36 h-36 mx-auto" />
                    <p className="text-xs text-gray-400 mt-2">Scan to join this group</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Members section ── */}
          <div className="px-5 py-4" ref={menuRef}>
            <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Members ({members.length})
            </h4>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {members
                  .slice()
                  .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role])
                  .map((member) => {
                    const isMe = member.userId?.toString() === currentUserId?.toString();
                    const memberId = member.userId?.toString();
                    const isActing = actionLoading === memberId;

                    return (
                      <div key={memberId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 group relative">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                          {getInitials(member.name)}
                        </div>

                        {/* Name + role */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {member.name || member.username}
                              {isMe && <span className="text-indigo-500 ml-1 text-xs">(You)</span>}
                            </span>
                            <RoleBadge role={member.role} />
                            {member.isMuted && (
                              <span className="text-xs text-orange-500 font-medium">🔇 Muted</span>
                            )}
                          </div>
                          {member.username && (
                            <span className="text-xs text-gray-400">@{member.username}</span>
                          )}
                        </div>

                        {/* Action menu — only shown if viewer can manage this member */}
                        {!isMe && canManage(member.role) && (
                          <div className="relative shrink-0">
                            {isActing ? (
                              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <button
                                onClick={() => setOpenMenuId(openMenuId === memberId ? null : memberId)}
                                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                </svg>
                              </button>
                            )}

                            {openMenuId === memberId && (
                              <div className="absolute right-0 top-7 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-10 text-sm">
                                {/* Role actions */}
                                {getPromotableRole(member.role) && (
                                  <button
                                    onClick={() => handleRoleChange(memberId, getPromotableRole(member.role))}
                                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                                  >
                                    <span>⬆️</span>
                                    Promote to {ROLE_BADGE[getPromotableRole(member.role)]?.label}
                                  </button>
                                )}
                                {getDemotableRole(member.role) && (
                                  <button
                                    onClick={() => handleRoleChange(memberId, getDemotableRole(member.role))}
                                    className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                                  >
                                    <span>⬇️</span>
                                    Demote to {ROLE_BADGE[getDemotableRole(member.role)]?.label || 'Member'}
                                  </button>
                                )}

                                {/* Mute/unmute — moderator+ */}
                                {isModOrAbove && (
                                  member.isMuted ? (
                                    <button
                                      onClick={() => handleMute(memberId, 0)}
                                      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                                    >
                                      <span>🔊</span> Unmute
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => handleMute(memberId, 10)}
                                        className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                                      >
                                        <span>🔇</span> Mute 10 min
                                      </button>
                                      <button
                                        onClick={() => handleMute(memberId, 60)}
                                        className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                                      >
                                        <span>🔇</span> Mute 1 hour
                                      </button>
                                    </>
                                  )
                                )}

                                {/* Admin+ actions */}
                                {isAdminOrAbove && (
                                  <>
                                    <div className="border-t border-gray-100 my-1" />
                                    <button
                                      onClick={() => handleRemove(memberId)}
                                      className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"
                                    >
                                      <span>👢</span> Remove from group
                                    </button>
                                    <button
                                      onClick={() => handleBan(memberId)}
                                      className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-700 font-medium flex items-center gap-2"
                                    >
                                      <span>🚫</span> Ban user
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* ── Banned members section — admin/owner only ── */}
          {isAdminOrAbove && bannedMembers.length > 0 && (
            <div className="px-5 py-4 border-t border-gray-100">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Banned Users ({bannedMembers.length})
              </h4>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {bannedMembers.map((member) => {
                  const memberId = member.userId?.toString();
                  const isActing = actionLoading === memberId;
                  return (
                    <div key={memberId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 group">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                        {(member.name || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 truncate block">
                          {member.name || member.username}
                        </span>
                        {member.username && (
                          <span className="text-xs text-gray-400">@{member.username}</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleUnban(memberId)}
                        disabled={isActing}
                        className="text-xs px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 font-medium disabled:opacity-50 transition-colors"
                      >
                        {isActing ? '...' : 'Unban'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer — leave group for non-owners, delete for owner */}
        <div className="border-t border-gray-200 px-5 py-4 space-y-2">
          {/* Leave group — for everyone except owner */}
          {!isOwner && (
            <button
              onClick={handleLeaveGroup}
              disabled={actionLoading === 'leave'}
              className="w-full py-2 bg-orange-50 border border-orange-200 text-orange-600 rounded-xl hover:bg-orange-100 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              🚪 {actionLoading === 'leave' ? 'Leaving...' : 'Leave Group'}
            </button>
          )}

          {/* Delete group — owner only */}
          {isOwner && (
            <>
              {confirmDelete ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-700 font-medium mb-3">
                    Delete <strong>{group.name}</strong>? This cannot be undone — all messages will be permanently erased.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteGroup}
                      disabled={actionLoading === 'delete'}
                      className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === 'delete' ? 'Deleting...' : 'Yes, Delete Group'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-2 bg-red-50 border border-red-200 text-red-600 rounded-xl hover:bg-red-100 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Group
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
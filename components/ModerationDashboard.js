'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getModerationStats, getModerationHistory, moderationLockGroup, moderationUnlockGroup, moderationResetWindow } from '@/lib/api';

const STATUS_COLORS = {
  normal: { bg: '#052e16', border: '#166534', text: '#4ade80', label: 'Normal' },
  warning: { bg: '#422006', border: '#854d0e', text: '#facc15', label: 'Warning' },
  notify_moderator: { bg: '#431407', border: '#9a3412', text: '#fb923c', label: 'Needs Attention' },
  auto_lock: { bg: '#450a0a', border: '#991b1b', text: '#f87171', label: 'Auto-Locked' },
};

const MOOD_EMOJI = { positive: '😊', negative: '😠', neutral: '😐', mixed: '🤔' };

export default function ModerationDashboard({ groupId, groupName, userRole, sentiment, locked, onClose }) {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview'); // overview | history

  const isAdmin = ['admin', 'owner'].includes(userRole);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [statsRes, historyRes] = await Promise.all([
        getModerationStats(groupId),
        getModerationHistory(groupId),
      ]);
      setStats(statsRes);
      setHistory(Array.isArray(historyRes) ? historyRes : historyRes?.logs || []);
    } catch (err) {
      setError(err.message || 'Failed to load moderation data');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update live sentiment from WebSocket
  useEffect(() => {
    if (sentiment) {
      setStats(prev => prev ? { ...prev, ...sentiment } : sentiment);
    }
  }, [sentiment]);

  const handleLock = async () => {
    setActionLoading('lock');
    try {
      await moderationLockGroup(groupId);
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleUnlock = async () => {
    setActionLoading('unlock');
    try {
      await moderationUnlockGroup(groupId);
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset the moderation window? This clears all tracked sentiment data for this group.')) return;
    setActionLoading('reset');
    try {
      await moderationResetWindow(groupId);
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const statusInfo = STATUS_COLORS[stats?.status] || STATUS_COLORS.normal;

  return (
    <AnimatePresence>
      <motion.div
        key="mod-panel"
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.8 }}
        className="fixed top-0 bottom-0 right-0 left-0 md:left-80 z-40 flex flex-col"
        style={{
          background: 'linear-gradient(180deg, rgba(150,104,245,0.10) 0%, rgba(13,11,26,0.98) 12%, #06040f 100%)',
          borderLeft: '1px solid #362A60',
          boxShadow: '-20px 0 60px -10px rgba(110,79,239,0.25)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        {/* Header */}
        <div className="px-4 md:px-8 py-4 md:py-5 border-b flex items-center justify-between" style={{ borderColor: '#362A60', background: 'linear-gradient(180deg, rgba(150,104,245,0.18) 0%, rgba(110,79,239,0.10) 50%, rgba(13,11,26,0.95) 100%)' }}>
          <div className="flex items-center space-x-3">
            <button onClick={onClose} className="p-2 rounded-full hover:bg-[#1c1538] transition-colors" title="Back to chat">
              <svg className="w-5 h-5" style={{ color: '#c4a8ff' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: '#ffffff' }}>Moderation Dashboard</h2>
              <p className="text-sm" style={{ color: '#c4a8ff' }}>{groupName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1.5 rounded-full font-medium" style={{ background: locked ? '#7f1d1d' : '#15102b', color: locked ? '#fca5a5' : '#c4a8ff', border: `1px solid ${locked ? '#991b1b' : '#362A60'}` }}>
              {locked ? '🔒 Locked' : '🟢 Active'}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-8" style={{ borderColor: '#362A60' }}>
          {['overview', 'history'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="py-3 px-5 text-sm font-medium transition-colors relative"
              style={{
                color: tab === t ? '#9668F5' : '#8A84A3',
              }}>
              {t === 'overview' ? '📊 Overview' : '📜 History'}
              {tab === t && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'linear-gradient(90deg, #9668F5, #6E4FEF)' }} />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#362A60', borderTopColor: '#9668F5' }} />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="mb-3" style={{ color: '#f87171' }}>{error}</p>
              <button onClick={fetchData} className="px-4 py-2 rounded-lg text-sm" style={{ background: '#15102b', color: '#ffffff', border: '1px solid #362A60' }}>
                Retry
              </button>
            </div>
          ) : tab === 'overview' ? (
            <div className="space-y-6 max-w-3xl">
              {/* Status Banner */}
              <div className="rounded-xl p-4 flex items-center justify-between"
                   style={{ background: statusInfo.bg, border: `1px solid ${statusInfo.border}` }}>
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{locked ? '🔒' : MOOD_EMOJI[stats?.mood] || '😐'}</span>
                  <div>
                    <p className="font-semibold" style={{ color: statusInfo.text }}>{locked ? 'Group Locked' : statusInfo.label}</p>
                    <p className="text-xs" style={{ color: '#8A84A3' }}>Mood: {stats?.mood || 'unknown'}</p>
                  </div>
                </div>
                {locked && (
                  <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
                    LOCKED
                  </span>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Avg Toxicity" value={`${Math.round((stats?.avg_toxicity || 0) * 100)}%`}
                  color={stats?.avg_toxicity > 0.5 ? '#f87171' : stats?.avg_toxicity > 0.3 ? '#facc15' : '#4ade80'} />
                <StatCard label="Negative Ratio" value={`${Math.round((stats?.negative_ratio || 0) * 100)}%`}
                  color={stats?.negative_ratio > 0.5 ? '#f87171' : stats?.negative_ratio > 0.3 ? '#facc15' : '#4ade80'} />
                <StatCard label="Moderation Score" value={`${Math.round((stats?.moderation_score || 0) * 100)}%`}
                  color={stats?.moderation_score > 0.7 ? '#f87171' : stats?.moderation_score > 0.4 ? '#facc15' : '#4ade80'} />
                <StatCard label="Window Size" value={stats?.window_size ?? '—'} color="#9668F5" />
              </div>

              {/* Toxicity Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium" style={{ color: '#8A84A3' }}>Toxicity Level</span>
                  <span className="text-xs font-mono" style={{ color: '#ffffff' }}>{Math.round((stats?.avg_toxicity || 0) * 100)}%</span>
                </div>
                <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: '#15102b' }}>
                  <div className="h-full rounded-full transition-all duration-700" style={{
                    width: `${Math.round((stats?.avg_toxicity || 0) * 100)}%`,
                    background: stats?.avg_toxicity > 0.5 ? '#ef4444' : stats?.avg_toxicity > 0.3 ? '#eab308' : '#22c55e',
                  }} />
                </div>
              </div>

              {/* Manual Controls */}
              <div className="rounded-xl p-4" style={{ background: '#15102b', border: '1px solid #362A60' }}>
                <h3 className="text-sm font-semibold mb-3" style={{ color: '#ffffff' }}>Manual Controls</h3>
                <div className="flex flex-wrap gap-3">
                  {locked ? (
                    <ActionButton label="🔓 Unlock Group" onClick={handleUnlock}
                      loading={actionLoading === 'unlock'} bg="#166534" />
                  ) : (
                    <ActionButton label="🔒 Lock Group" onClick={handleLock}
                      loading={actionLoading === 'lock'} bg="#991b1b" />
                  )}
                  {isAdmin && (
                    <ActionButton label="🔄 Reset Window" onClick={handleReset}
                      loading={actionLoading === 'reset'} bg="#6b21a8" />
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* History Tab */
            <div className="space-y-3 max-w-3xl">
              {history.length === 0 ? (
                <p className="text-center py-8" style={{ color: '#8A84A3' }}>No moderation history yet.</p>
              ) : history.map((entry, i) => (
                <div key={entry._id || i} className="rounded-xl p-4" style={{ background: '#15102b', border: '1px solid #362A60' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium" style={{ color: '#ffffff' }}>
                      {entry.action === 'lock' ? '🔒 Locked' : entry.action === 'unlock' ? '🔓 Unlocked' : entry.action === 'reset' ? '🔄 Reset' : entry.action}
                    </span>
                    <span className="text-xs" style={{ color: '#8A84A3' }}>
                      {new Date(entry.createdAt || entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {entry.performedBy && (
                    <p className="text-xs" style={{ color: '#8A84A3' }}>
                      By: {entry.performedBy.username || entry.performedBy}
                    </p>
                  )}
                  {entry.reason && (
                    <p className="text-xs mt-1" style={{ color: '#8A84A3' }}>Reason: {entry.reason}</p>
                  )}
                  {entry.stats && (
                    <div className="flex gap-3 mt-2 text-xs" style={{ color: '#8A84A3' }}>
                      <span>Tox: {Math.round((entry.stats.avg_toxicity || 0) * 100)}%</span>
                      <span>Score: {Math.round((entry.stats.moderation_score || 0) * 100)}%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#15102b', border: '1px solid #362A60' }}>
      <p className="text-xs mb-1" style={{ color: '#8A84A3' }}>{label}</p>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function ActionButton({ label, onClick, loading, bg }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      style={{ background: bg, color: '#fff' }}>
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Working...
        </span>
      ) : label}
    </button>
  );
}

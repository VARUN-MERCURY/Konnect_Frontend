'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getModerationStats,
  getModerationHistory,
  moderationLockGroup,
  moderationUnlockGroup,
  moderationResetWindow,
  getTopToxicUsers,
  auditModerationExport,
} from '@/lib/api';
import { exportCsv, safeFilenamePart } from '@/lib/csv';

const STATUS_COLORS = {
  normal: { bg: '#052e16', border: '#166534', text: '#4ade80', label: 'Normal' },
  warning: { bg: '#422006', border: '#854d0e', text: '#facc15', label: 'Warning' },
  notify_moderator: { bg: '#431407', border: '#9a3412', text: '#fb923c', label: 'Needs Attention' },
  auto_lock: { bg: '#450a0a', border: '#991b1b', text: '#f87171', label: 'Auto-Locked' },
};

const MOOD_EMOJI = { positive: '😊', negative: '😠', neutral: '😐', mixed: '🤔' };

const ACTION_META = {
  lock:    { icon: '🔒', label: 'Locked',   color: '#f87171', bg: '#3f1d1d' },
  unlock:  { icon: '🔓', label: 'Unlocked', color: '#4ade80', bg: '#0f3322' },
  reset:   { icon: '🔄', label: 'Reset',    color: '#c4a8ff', bg: '#231a47' },
  export:  { icon: '📤', label: 'Exported', color: '#8A84A3', bg: '#1a162e' },
  flagged: { icon: '🚩', label: 'Flagged',  color: '#facc15', bg: '#3a2e0a' },
};

const RANGE_OPTIONS = [
  { value: 1,  label: '24h' },
  { value: 7,  label: '7d'  },
  { value: 30, label: '30d' },
];

function formatDateHeader(date) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function groupByDate(entries) {
  const groups = new Map();
  for (const e of entries) {
    const key = new Date(e.createdAt || e.timestamp || Date.now()).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    label: formatDateHeader(items[0].createdAt || items[0].timestamp),
    items,
  }));
}

export default function ModerationDashboard({
  groupId,
  groupName,
  userRole,
  sentiment,
  locked,
  moderationAlert,
  onClose,
}) {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [topToxic, setTopToxic] = useState({ users: [], windowDays: 7, generatedAt: null });
  const [topRange, setTopRange] = useState(7);
  const [loading, setLoading] = useState(true);
  const [topLoading, setTopLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview'); // overview | toxic | history
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [exportingType, setExportingType] = useState('');

  const isModerator = ['moderator', 'admin', 'owner'].includes(userRole);
  const isAdmin = ['admin', 'owner'].includes(userRole);

  // ---------- Loaders ----------
  const fetchStatsAndHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [statsRes, historyRes] = await Promise.all([
        getModerationStats(groupId),
        getModerationHistory(groupId, { limit: 50 }),
      ]);
      setStats(statsRes);
      const list = Array.isArray(historyRes) ? historyRes : historyRes?.logs || [];
      setHistory(list);
      setHasMoreHistory(list.length >= 50);
    } catch (err) {
      setError(err.message || 'Failed to load moderation data');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const fetchTopToxic = useCallback(async (days) => {
    if (!isModerator) return;
    try {
      setTopLoading(true);
      const res = await getTopToxicUsers(groupId, { days, limit: 10, minFlags: 3 });
      setTopToxic(res || { users: [], windowDays: days });
    } catch (err) {
      // Non-fatal — leaderboard is optional. Surface gently.
      console.warn('Top toxic load failed:', err.message);
      setTopToxic({ users: [], windowDays: days, error: err.message });
    } finally {
      setTopLoading(false);
    }
  }, [groupId, isModerator]);

  const loadMoreHistory = useCallback(async () => {
    if (history.length === 0) return;
    try {
      setHistoryLoading(true);
      const oldest = history[history.length - 1];
      const before = oldest.createdAt;
      const more = await getModerationHistory(groupId, { limit: 50, before });
      const moreList = Array.isArray(more) ? more : more?.logs || [];
      setHistory((prev) => [...prev, ...moreList]);
      setHasMoreHistory(moreList.length >= 50);
    } catch (err) {
      setError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }, [groupId, history]);

  useEffect(() => { fetchStatsAndHistory(); }, [fetchStatsAndHistory]);
  useEffect(() => { fetchTopToxic(topRange); }, [fetchTopToxic, topRange]);

  // Keep stats live from socket
  useEffect(() => {
    if (sentiment) {
      setStats((prev) => (prev ? { ...prev, ...sentiment } : sentiment));
    }
  }, [sentiment]);

  // Live moderation alert → prepend a synthetic entry to history.
  // The next reload from the server will overwrite this with the canonical record.
  useEffect(() => {
    if (!moderationAlert) return;
    const action = moderationAlert.action || moderationAlert.type;
    if (!action || !ACTION_META[action]) return;
    setHistory((prev) => [
      {
        _id: `live-${moderationAlert.timestamp || Date.now()}`,
        action,
        triggeredBy: moderationAlert.triggeredBy === 'auto' ? 'auto' : 'manual',
        actorId: moderationAlert.actor || null,
        moderationScore: moderationAlert.moderationScore,
        metadata: moderationAlert.metadata || null,
        createdAt: moderationAlert.timestamp || new Date().toISOString(),
        _live: true,
      },
      ...prev,
    ]);
  }, [moderationAlert]);

  // ---------- Actions ----------
  const handleLock = async () => {
    setActionLoading('lock');
    try { await moderationLockGroup(groupId); await fetchStatsAndHistory(); }
    catch (err) { setError(err.message); }
    finally { setActionLoading(''); }
  };
  const handleUnlock = async () => {
    setActionLoading('unlock');
    try { await moderationUnlockGroup(groupId); await fetchStatsAndHistory(); }
    catch (err) { setError(err.message); }
    finally { setActionLoading(''); }
  };
  const handleReset = async () => {
    if (!confirm('Reset the moderation window? This clears all tracked sentiment data for this group.')) return;
    setActionLoading('reset');
    try { await moderationResetWindow(groupId); await fetchStatsAndHistory(); }
    catch (err) { setError(err.message); }
    finally { setActionLoading(''); }
  };

  // ---------- CSV Exports ----------
  const banner = useCallback((scope) => ([
    `Konnect moderation export`,
    `group: ${groupName || groupId}`,
    `scope: ${scope}`,
    `exported_at: ${new Date().toISOString()}`,
    `exported_by_role: ${userRole || 'unknown'}`,
  ]), [groupId, groupName, userRole]);

  const fileStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  const handleExportHistory = useCallback(async () => {
    if (!history.length) return;
    setExportingType('history');
    try {
      const cols = [
        { key: 'createdAt',       header: 'timestamp',       get: (r) => new Date(r.createdAt).toISOString() },
        { key: 'action',          header: 'action' },
        { key: 'triggeredBy',     header: 'triggered_by' },
        { key: 'actor',           header: 'actor',           get: (r) => r.actorId?.username || r.actorId?.name || (r.triggeredBy === 'auto' ? 'system' : '—') },
        { key: 'moderationScore', header: 'moderation_score', get: (r) => r.moderationScore ?? '' },
        { key: 'duration',        header: 'duration_seconds', get: (r) => r.duration ?? '' },
        { key: 'metadata',        header: 'metadata',        get: (r) => r.metadata ? JSON.stringify(r.metadata) : '' },
      ];
      const filename = `moderation-history-${safeFilenamePart(groupName || groupId)}-${fileStamp()}.csv`;
      exportCsv(history, cols, filename, { banner: banner('history') });
      try { await auditModerationExport(groupId, { type: 'history', rows: history.length, range: `last ${history.length} entries` }); } catch (_) {}
    } finally { setExportingType(''); }
  }, [history, groupId, groupName, banner]);

  const handleExportTopToxic = useCallback(async () => {
    if (!topToxic.users?.length) return;
    setExportingType('top-toxic');
    try {
      const cols = [
        { key: 'rank',          header: 'rank' },
        { key: 'username',      header: 'username',       get: (r) => r.username || r.userId },
        { key: 'name',          header: 'display_name',   get: (r) => r.name || '' },
        { key: 'totalCount',    header: 'flagged_total' },
        { key: 'flaggedCount',  header: 'hard_flags' },
        { key: 'avgToxicity',   header: 'avg_toxicity' },
        { key: 'maxToxicity',   header: 'max_toxicity' },
        { key: 'score',         header: 'rank_score' },
        { key: 'lastFlaggedAt', header: 'last_flagged_at', get: (r) => new Date(r.lastFlaggedAt).toISOString() },
      ];
      const range = `${topToxic.windowDays}d`;
      const filename = `top-toxic-${safeFilenamePart(groupName || groupId)}-${range}-${fileStamp()}.csv`;
      exportCsv(topToxic.users, cols, filename, { banner: banner(`top-toxic ${range}`) });
      try { await auditModerationExport(groupId, { type: 'top-toxic', rows: topToxic.users.length, range }); } catch (_) {}
    } finally { setExportingType(''); }
  }, [topToxic, groupId, groupName, banner]);

  const handleExportOverview = useCallback(async () => {
    if (!stats) return;
    setExportingType('overview');
    try {
      const rows = Object.entries(stats).map(([k, v]) => ({
        metric: k,
        value: typeof v === 'object' ? JSON.stringify(v) : v,
      }));
      const cols = [
        { key: 'metric', header: 'metric' },
        { key: 'value',  header: 'value' },
      ];
      const filename = `moderation-overview-${safeFilenamePart(groupName || groupId)}-${fileStamp()}.csv`;
      exportCsv(rows, cols, filename, { banner: banner('overview-snapshot') });
      try { await auditModerationExport(groupId, { type: 'timeline', rows: rows.length, range: 'snapshot' }); } catch (_) {}
    } finally { setExportingType(''); }
  }, [stats, groupId, groupName, banner]);

  // ---------- Derived ----------
  const statusInfo = STATUS_COLORS[stats?.status] || STATUS_COLORS.normal;
  const groupedHistory = useMemo(() => groupByDate(history), [history]);

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
        <div className="px-4 md:px-8 py-4 md:py-5 border-b flex items-center justify-between"
             style={{ borderColor: '#362A60', background: 'linear-gradient(180deg, rgba(150,104,245,0.18) 0%, rgba(110,79,239,0.10) 50%, rgba(13,11,26,0.95) 100%)' }}>
          <div className="flex items-center space-x-3 min-w-0">
            <button onClick={onClose} className="p-2 rounded-full hover:bg-[#1c1538] transition-colors flex-shrink-0" title="Back to chat">
              <svg className="w-5 h-5" style={{ color: '#c4a8ff' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate" style={{ color: '#ffffff' }}>Moderation Dashboard</h2>
              <p className="text-sm truncate" style={{ color: '#c4a8ff' }}>{groupName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{ background: locked ? '#7f1d1d' : '#15102b', color: locked ? '#fca5a5' : '#c4a8ff', border: `1px solid ${locked ? '#991b1b' : '#362A60'}` }}>
              {locked ? '🔒 Locked' : '🟢 Active'}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4 md:px-8 overflow-x-auto" style={{ borderColor: '#362A60' }}>
          {[
            { id: 'overview', label: '📊 Overview' },
            { id: 'toxic',    label: '🔥 Top Toxic' },
            { id: 'history',  label: '📜 History' },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="py-3 px-4 md:px-5 text-sm font-medium transition-colors relative whitespace-nowrap"
              style={{ color: tab === t.id ? '#9668F5' : '#8A84A3' }}>
              {t.label}
              {tab === t.id && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5"
                            style={{ background: 'linear-gradient(90deg, #9668F5, #6E4FEF)' }} />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#362A60', borderTopColor: '#9668F5' }} />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="mb-3" style={{ color: '#f87171' }}>{error}</p>
              <button onClick={fetchStatsAndHistory} className="px-4 py-2 rounded-lg text-sm"
                      style={{ background: '#15102b', color: '#ffffff', border: '1px solid #362A60' }}>
                Retry
              </button>
            </div>
          ) : tab === 'overview' ? (
            <div className="space-y-6 max-w-3xl">
              <div className="flex items-center justify-end">
                <ExportButton
                  disabled={!stats || exportingType === 'overview'}
                  loading={exportingType === 'overview'}
                  onClick={handleExportOverview}
                  label="Export snapshot"
                />
              </div>

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
                  <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#7f1d1d', color: '#fca5a5' }}>LOCKED</span>
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
          ) : tab === 'toxic' ? (
            <TopToxicTab
              data={topToxic}
              loading={topLoading}
              range={topRange}
              setRange={setTopRange}
              onExport={handleExportTopToxic}
              exporting={exportingType === 'top-toxic'}
            />
          ) : (
            <HistoryTab
              groups={groupedHistory}
              hasMore={hasMoreHistory}
              loading={historyLoading}
              onLoadMore={loadMoreHistory}
              onExport={handleExportHistory}
              exporting={exportingType === 'history'}
              total={history.length}
            />
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// =================== Sub-views ===================

function TopToxicTab({ data, loading, range, setRange, onExport, exporting }) {
  const users = data?.users || [];
  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {RANGE_OPTIONS.map((r) => (
            <button key={r.value} onClick={() => setRange(r.value)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                background: range === r.value ? '#362A60' : '#15102b',
                color: range === r.value ? '#ffffff' : '#8A84A3',
                border: `1px solid ${range === r.value ? '#9668F5' : '#362A60'}`,
              }}>
              {r.label}
            </button>
          ))}
        </div>
        <ExportButton
          disabled={!users.length || exporting}
          loading={exporting}
          onClick={onExport}
          label="Export CSV"
        />
      </div>

      <p className="text-xs" style={{ color: '#8A84A3' }}>
        Ranked by avg toxicity × log10(messages + 1) over the last {data?.windowDays ?? range} days.
        Visible to moderators only.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#362A60', borderTopColor: '#9668F5' }} />
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: '#15102b', border: '1px solid #362A60' }}>
          <p className="text-3xl mb-2">🌿</p>
          <p style={{ color: '#c4a8ff' }}>No flagged behavior detected.</p>
          <p className="text-xs mt-1" style={{ color: '#8A84A3' }}>The group is clean for this window.</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {users.map((u) => (
            <li key={String(u.userId)} className="rounded-xl p-4 flex items-center gap-4"
                style={{ background: '#15102b', border: '1px solid #362A60' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold"
                   style={{
                     background: u.rank === 1 ? '#7f1d1d' : u.rank === 2 ? '#3f1d1d' : '#231a47',
                     color: u.rank === 1 ? '#fca5a5' : u.rank === 2 ? '#facc15' : '#c4a8ff',
                   }}>
                #{u.rank}
              </div>

              {u.avatar ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={u.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                     style={{ background: '#362A60', color: '#fff' }}>
                  {(u.name || u.username || '?').slice(0, 1).toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="font-medium truncate" style={{ color: '#ffffff' }}>
                  {u.name || u.username || u.userId}
                </p>
                <p className="text-xs truncate" style={{ color: '#8A84A3' }}>
                  {u.username ? `@${u.username} · ` : ''}{u.totalCount} flagged · last {timeAgo(u.lastFlaggedAt)}
                </p>
                <div className="mt-2 w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#0d0b1a' }}>
                  <div className="h-full" style={{
                    width: `${Math.min(100, Math.round(u.avgToxicity * 100))}%`,
                    background: u.avgToxicity > 0.7 ? '#ef4444' : u.avgToxicity > 0.5 ? '#f59e0b' : '#9668F5',
                  }} />
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-sm font-mono font-semibold"
                   style={{ color: u.avgToxicity > 0.7 ? '#f87171' : '#facc15' }}>
                  {Math.round(u.avgToxicity * 100)}%
                </p>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: '#8A84A3' }}>avg tox</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function HistoryTab({ groups, hasMore, loading, onLoadMore, onExport, exporting, total }) {
  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: '#8A84A3' }}>{total} entries</p>
        <ExportButton
          disabled={!total || exporting}
          loading={exporting}
          onClick={onExport}
          label="Export CSV"
        />
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: '#15102b', border: '1px solid #362A60' }}>
          <p className="text-3xl mb-2">📭</p>
          <p style={{ color: '#c4a8ff' }}>No moderation events yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#9668F5' }}>{g.label}</span>
                <span className="flex-1 h-px" style={{ background: '#362A60' }} />
              </div>
              <ul className="space-y-2">
                {g.items.map((entry, i) => (
                  <HistoryEntry key={entry._id || `${g.key}-${i}`} entry={entry} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button onClick={onLoadMore} disabled={loading}
            className="px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
            style={{ background: '#15102b', color: '#c4a8ff', border: '1px solid #362A60' }}>
            {loading ? 'Loading...' : 'Load older'}
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const meta = ACTION_META[entry.action] || { icon: '•', label: entry.action, color: '#c4a8ff', bg: '#15102b' };
  const actorName = entry.actorId?.name || entry.actorId?.username
    || (entry.triggeredBy === 'auto' ? 'System' : '—');
  const score = typeof entry.moderationScore === 'number' ? Math.round(entry.moderationScore * 100) : null;

  return (
    <li
      onClick={() => entry.metadata && setExpanded((v) => !v)}
      className="rounded-xl p-3 flex items-start gap-3 transition-colors"
      style={{
        background: entry._live ? 'linear-gradient(90deg, rgba(150,104,245,0.12), #15102b)' : '#15102b',
        border: `1px solid ${entry._live ? '#9668F5' : '#362A60'}`,
        cursor: entry.metadata ? 'pointer' : 'default',
      }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-lg"
           style={{ background: meta.bg, border: `1px solid ${meta.color}33` }}>
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" style={{ color: meta.color }}>{meta.label}</span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#0d0b1a', color: '#8A84A3' }}>
            {entry.triggeredBy === 'auto' ? 'auto' : 'manual'}
          </span>
          {score !== null && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{
              background: score > 70 ? '#3f1d1d' : score > 40 ? '#3a2e0a' : '#231a47',
              color: score > 70 ? '#fca5a5' : score > 40 ? '#facc15' : '#c4a8ff',
            }}>
              tox {score}%
            </span>
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: '#8A84A3' }}>
          {actorName} · {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
        {expanded && entry.metadata && (
          <pre className="mt-2 p-2 rounded text-[10px] overflow-x-auto"
               style={{ background: '#0d0b1a', color: '#c4a8ff', border: '1px solid #362A60' }}>
{JSON.stringify(entry.metadata, null, 2)}
          </pre>
        )}
      </div>
    </li>
  );
}

// =================== Helpers ===================

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
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

function ExportButton({ onClick, disabled, loading, label = 'Export CSV' }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 flex items-center gap-1.5"
      style={{ background: '#15102b', color: '#c4a8ff', border: '1px solid #362A60' }}>
      {loading ? (
        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <span>⬇</span>
      )}
      {label}
    </button>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { isAuthenticated, refreshAccessToken, previewGroupByCode, joinGroupByCode } from '@/lib/api';

export default function JoinGroupPage() {
  const router = useRouter();
  const { code } = useParams();

  const [group, setGroup] = useState(null);
  const [loadingGroup, setLoadingGroup] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  // null = still checking, true/false = resolved
  const [authed, setAuthed] = useState(null);

  // Resolve auth: check sessionStorage first, then try silent cookie refresh
  useEffect(() => {
    (async () => {
      if (isAuthenticated()) {
        setAuthed(true);
        return;
      }
      try {
        await refreshAccessToken();
        setAuthed(true);
      } catch {
        setAuthed(false);
      }
    })();
  }, []);

  // Fetch group preview (public endpoint — no auth required)
  useEffect(() => {
    if (!code) return;
    (async () => {
      try {
        const data = await previewGroupByCode(code);
        setGroup(data);
      } catch (err) {
        const msg = err.message || '';
        if (msg.includes('404') || msg.includes('Invalid') || msg.includes('not found')) {
          setNotFound(true);
        } else {
          setError('Could not load group info. Please check your connection and try again.');
        }
      } finally {
        setLoadingGroup(false);
      }
    })();
  }, [code]);

  const handleJoin = async () => {
    if (!authed) {
      sessionStorage.setItem('pendingInviteCode', code);
      router.push(`/login?redirect=/join/${code}`);
      return;
    }
    setJoining(true);
    setError('');
    try {
      await joinGroupByCode(code);
      router.push('/whatsapp');
    } catch (err) {
      setError(err.message || 'Failed to join group. Please try again.');
      setJoining(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loadingGroup) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm mx-4 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 animate-pulse" />
          <div className="h-5 bg-gray-100 rounded w-3/4 mx-auto mb-2 animate-pulse" />
          <div className="h-4 bg-gray-100 rounded w-1/2 mx-auto animate-pulse" />
        </div>
      </div>
    );
  }

  // ── Invite invalid ────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm mx-4 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Invite invalid</h1>
          <p className="text-sm text-gray-500 mb-6">This link has expired or the group no longer accepts invites.</p>
          <button onClick={() => router.push('/')} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
            Go to Konnect
          </button>
        </div>
      </div>
    );
  }

  // ── Load error ────────────────────────────────────────────────────────────
  if (error && !group) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm mx-4 text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <button onClick={() => window.location.reload()} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Group preview + join ──────────────────────────────────────────────────
  const buttonLabel = authed === null ? 'Checking...' : authed ? 'Accept Invite' : 'Log in to Join';

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm mx-4 text-center">

        <div className="w-20 h-20 bg-indigo-600 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl shadow">
          {group?.avatar
            ? <img src={group.avatar} alt="" className="w-20 h-20 rounded-full object-cover" />
            : <span>👥</span>
          }
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-1">{group?.name}</h1>
        {group?.description && <p className="text-sm text-gray-500 mb-2">{group.description}</p>}
        <p className="text-xs text-gray-400 mb-6">
          {group?.memberCount ?? '?'} member{group?.memberCount !== 1 ? 's' : ''}
        </p>

        <p className="text-xs text-gray-400 mb-4">
          You&apos;ve been invited to join a group on{' '}
          <span className="font-semibold text-indigo-600">Konnect</span>
        </p>

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        <button
          onClick={handleJoin}
          disabled={joining || authed === null}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-3"
        >
          {joining ? 'Joining...' : buttonLabel}
        </button>

        {authed === false && (
          <p className="text-xs text-gray-400">
            Don&apos;t have an account?{' '}
            <button
              onClick={() => {
                sessionStorage.setItem('pendingInviteCode', code);
                router.push(`/register?redirect=/join/${code}`);
              }}
              className="text-indigo-600 hover:underline"
            >
              Sign up
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

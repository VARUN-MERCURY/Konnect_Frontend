'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, refreshAccessToken } from '@/lib/api';

export default function ProtectedRoute({ children }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function checkAuth() {
      try {
        if (!isAuthenticated()) {
          // Try to refresh token in case user has valid refresh token
          try {
            await refreshAccessToken();
          } catch (refreshError) {
            router.replace('/login');
            return;
          }
        }
        setLoading(false);
      } catch (error) {
        console.error('Auth check failed:', error);
        setError('Authentication check failed. Redirecting to login...');
        setTimeout(() => router.replace('/login'), 2000);
      }
    }

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <div className="cardHeader">
            <h1 className="logo">Konnect</h1>
            <p className="subtitle">Checking authentication...</p>
          </div>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div className="spinner"></div>
            <p>Please wait...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="card">
          <div className="cardHeader">
            <h1 className="logo">Konnect</h1>
            <p className="subtitle">Authentication Error</p>
          </div>
          <p className="error">{error}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
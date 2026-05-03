'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAccessToken, isAuthenticated, logout, authenticatedRequest, getCurrentUser } from '@/lib/api';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function DashboardPage() {
  const router = useRouter();

  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [greeting, setGreeting] = useState('');
  const [initial, setInitial] = useState('?');
  const [logoutMsg, setLogoutMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check authentication status
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }

    const loadUserData = async () => {
      try {
        const accessToken = getAccessToken();
        if (accessToken) {
          setToken(accessToken);
          
          // Fetch real user data from database
          const userData = await getCurrentUser();
          setUser(userData);
          
          // Set greeting with real user data
          const displayName = userData.name || userData.username || 'User';
          const flow = sessionStorage.getItem('pendingFlow') || '';
          
          setGreeting(
            flow === 'register'
              ? `Welcome to Konnect, ${displayName}!`
              : `Welcome back, ${displayName}!`
          );
          
          // Set initial from name or username
          const nameForInitial = userData.name || userData.username || 'K';
          setInitial(nameForInitial[0].toUpperCase());
          
          // Clean up after setting greeting
          sessionStorage.removeItem('pendingEmail');
          sessionStorage.removeItem('pendingFlow');
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        // Fallback to generic greeting on error
        setGreeting('Welcome to your dashboard');
        setInitial('K');
        setError('Failed to load user profile');
      } finally {
        setLoading(false);
      }
    };
    
    loadUserData();
  }, [router]);

  async function handleLogout() {
    setLogoutMsg('Signing out...');
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
      setLogoutMsg('Signed out successfully.');
      setTimeout(() => router.push('/login'), 1000);
    }
  }

  async function testAuthenticatedRequest() {
    setError('');
    try {
      // Test the getCurrentUser endpoint
      const response = await authenticatedRequest('/auth/users/me');
      if (response.ok) {
        console.log('Protected request successful:', response.data);
        setError(`Success! User: ${response.data.user.username} (${response.data.user.email})`);
      } else {
        setError('Protected request failed: ' + (response.data.message || 'Unknown error'));
      }
    } catch (error) {
      setError('Request failed: ' + error.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Logo */}
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <div className="w-4 h-4 bg-white rounded-sm"></div>
                </div>
                <span className="text-xl font-bold text-gray-900">Konnect</span>
              </div>
              
              {/* User Menu */}
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-indigo-700">{initial}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-gray-500 hover:text-gray-700 transition-colors duration-200 flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span className="text-sm font-medium">Sign out</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <div className="space-y-6 md:space-y-8 animate-fade-in">
            {/* Welcome Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 md:p-8">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-2xl font-bold text-white">{initial}</span>
                </div>
                
                <div className="space-y-2">
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{greeting}</h1>
                  {user && (
                    <div className="text-center space-y-1">
                      <p className="text-lg text-gray-700">@{user.username}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                      {user.userCode && (
                        <p className="text-xs text-gray-400 font-mono">ID: {user.userCode}</p>
                      )}
                    </div>
                  )}
                  <p className="text-gray-600 max-w-2xl mx-auto">
                    You're all set! Your account is verified and ready to go. 
                    Explore the features below to get started with Konnect.
                  </p>
                </div>

                {logoutMsg && (
                  <div className="inline-flex items-center px-4 py-2 rounded-lg bg-green-50 text-green-700 border border-green-200">
                    <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {logoutMsg}
                  </div>
                )}
              </div>
            </div>

            {/* Feature Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Authentication Status */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Authentication</h3>
                </div>
                
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Access Token</span>
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-md text-xs font-medium">Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Refresh Token</span>
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-md text-xs font-medium">Secure Cookie</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Session</span>
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-md text-xs font-medium">7 days</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
                </div>
                
                <div className="space-y-3">
                  <button
                    onClick={testAuthenticatedRequest}
                    className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                  >
                    <div className="font-medium text-gray-900">Test API Request</div>
                    <div className="text-sm text-gray-600">Test authenticated endpoint</div>
                  </button>
                </div>
                
                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
              </div>

              {/* Token Info */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Token Details</h3>
                </div>
                
                {token && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Access Token (Preview)</label>
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <code className="text-xs text-gray-600 font-mono break-all">
                          {token.substring(0, 47)}...
                        </code>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>• Expires in 15 minutes</p>
                      <p>• Auto-refreshes seamlessly</p>
                      <p>• Secured with 256-bit encryption</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Real-time Chat */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Live Chat</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Real-time messaging</span>
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-md text-xs font-medium">TCP Pub/Sub</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Horizontal scaling</span>
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium">Ready</span>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => router.push('/whatsapp')}
                    className="w-full text-left px-4 py-3 bg-gradient-to-r from-indigo-50 to-blue-50 hover:from-indigo-100 hover:to-blue-100 rounded-lg transition-all duration-200 border border-indigo-200 hover:border-indigo-300 transform hover:-translate-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">Open Konnect Chat</div>
                        <div className="text-sm text-gray-600">WhatsApp-style messaging experience</div>
                      </div>
                      <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Security Notice */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-indigo-600 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-indigo-900 mb-2">Your account is secure</h3>
                  <p className="text-indigo-700 leading-relaxed">
                    Your session is protected with industry-standard security measures including 
                    JWT tokens, httpOnly cookies, and automatic token refresh. Your data is encrypted 
                    both in transit and at rest.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

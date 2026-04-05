const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost';

// Token management
let accessToken = null;
let isRefreshing = false;
let refreshPromise = null;

/**
 * Get stored access token
 */
export function getAccessToken() {
  if (typeof window !== 'undefined' && !accessToken) {
    accessToken = sessionStorage.getItem('accessToken');
  }
  return accessToken;
}

/**
 * Set access token in memory and storage
 */
export function setAccessToken(token) {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem('accessToken', token);
    } else {
      sessionStorage.removeItem('accessToken');
    }
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
  const token = getAccessToken();
  console.log('isAuthenticated check:', token ? 'authenticated' : 'not authenticated');
  return !!token;
}

/**
 * Clear all auth data
 */
export function clearAuth() {
  setAccessToken(null);
  if (typeof window !== 'undefined') {
    sessionStorage.clear();
    localStorage.clear();
    // Clear any cookies by setting them to expire
    document.cookie.split(";").forEach(function(c) { 
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
    });
  }
}

/**
 * Attempt to refresh access token using refresh token cookie
 */
export async function refreshAccessToken() {
  // Prevent multiple simultaneous refresh attempts
  if (isRefreshing) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = fetch(`${API_BASE}/auth/refresh-token`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
    .then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        if (data.accessToken) {
          setAccessToken(data.accessToken);
          return data.accessToken;
        }
      }
      throw new Error('Refresh failed');
    })
    .finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * POST to the auth service.
 * @param {string} path  e.g. '/auth/login'
 * @param {object} body  JSON payload
 * @returns {{ ok: boolean, status: number, data: object }}
 */
export async function authPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // send / receive httpOnly cookies (refreshToken)
    body: JSON.stringify(body),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    // empty body / non-JSON response
  }

  return { ok: res.ok, status: res.status, data };
}

/**
 * Make authenticated API requests with automatic token refresh
 * @param {string} path  API endpoint path
 * @param {object} options  Fetch options
 * @returns {{ ok: boolean, status: number, data: object }}
 */
export async function authenticatedRequest(path, options = {}) {
  let token = getAccessToken();
  console.log('Making authenticated request to:', path, 'with token:', token ? 'present' : 'missing');
  
  if (!token) {
    throw new Error('No access token available');
  }

  const makeRequest = async (authToken) => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        ...options.headers,
      },
      credentials: 'include',
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      // empty body / non-JSON response
    }
    
    console.log('API Response:', { path, status: res.status, ok: res.ok, data });
    return { ok: res.ok, status: res.status, data };
  };

  // Try initial request
  let response = await makeRequest(token);
  
  // If token expired (401), try to refresh and retry
  if (response.status === 401 && !isRefreshing) {
    try {
      const newToken = await refreshAccessToken();
      response = await makeRequest(newToken);
    } catch (refreshError) {
      // Refresh failed, redirect to login
      clearAuth();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Authentication expired');
    }
  }

  return response;
}

/**
 * Logout user by calling logout endpoint and clearing local data
 */
export async function logout() {
  try {
    await authPost('/auth/logout', {});
  } catch (error) {
    console.error('Logout request failed:', error);
    // Continue with client-side cleanup even if server call fails
  }
  
  clearAuth();
  
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// User Search APIs
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Search users by username, email, or user code
 * @param {string} query - Search query
 * @param {string} type - Search type: 'all', 'username', 'email', 'usercode'
 */
export async function searchUsers(query, type = 'all') {
  try {
    const params = new URLSearchParams({ q: query, type });
    const response = await authenticatedRequest(`/auth/users/search?${params}`);
    const data = response.data;
    return data.users || [];
  } catch (error) {
    console.error('Error searching users:', error);
    throw error;
  }
}

/**
 * Get current user profile information
 */
export async function getCurrentUser() {
  try {
    const response = await authenticatedRequest('/auth/users/me');
    console.log('getCurrentUser response:', response); // Debug logging
    
    if (!response.ok) {
      let errorMessage = 'Failed to fetch user';
      try {
        if (response.data && typeof response.data === 'object' && response.data.message) {
          errorMessage = response.data.message;
        }
      } catch (parseError) {
        console.warn('Error parsing response message:', parseError);
      }
      console.error('getCurrentUser response not ok:', response.status, errorMessage);
      throw new Error('HTTP ' + response.status + ': ' + errorMessage);
    }
    
    const data = response.data;
    console.log('getCurrentUser data:', data); // Debug logging
    
    if (!data || !data.user) {
      console.error('Invalid response structure:', data);
      throw new Error('Invalid response: missing user data');
    }
    
    return data.user;
  } catch (error) {
    console.error('Error getting current user:', error);
    throw error;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Group Management APIs  
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Join a group by invite code
 * @param {string} inviteCode - The group invite code
 */
export async function joinGroupByCode(inviteCode) {
  try {
    const response = await authenticatedRequest('/api/groups/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode })
    });
    const data = response.data;
    return data.conversation;
  } catch (error) {
    console.error('Error joining group:', error);
    throw error;
  }
}

/**
 * Preview group information by invite code
 * @param {string} inviteCode - The group invite code
 */
export async function previewGroupByCode(inviteCode) {
  try {
    const response = await authenticatedRequest(`/api/groups/preview/${inviteCode}`);
    const data = response.data;
    return data.group;
  } catch (error) {
    console.error('Error previewing group:', error);
    throw error;
  }
}

/**
 * Generate QR code for group invite
 * @param {string} groupId - The group ID
 */
export async function generateGroupQR(groupId) {
  try {
    const response = await authenticatedRequest(`/api/groups/${groupId}/qr`);
    const data = response.data;
    return {
      qrCode: data.qrCode,
      inviteCode: data.inviteCode,
      inviteLink: data.inviteLink
    };
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

/**
 * Regenerate group invite code (admin only)
 * @param {string} groupId - The group ID
 */
export async function regenerateInviteCode(groupId) {
  try {
    const response = await authenticatedRequest(`/api/groups/${groupId}/regenerate-code`, {
      method: 'POST'
    });
    const data = response.data;
    return data.inviteCode;
  } catch (error) {
    console.error('Error regenerating invite code:', error);
    throw error;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Conversations API
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Get user's conversations with pagination
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Number of conversations per page (default: 20)
 */
export async function getConversations(page = 1, limit = 20) {
  try {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    const response = await authenticatedRequest(`/api/conversations?${params}`);
    const data = response.data;
    return data.conversations || [];
  } catch (error) {
    console.error('Error fetching conversations:', error);
    throw error;
  }
}

/**
 * Get messages for a conversation
 * @param {string} conversationId - The conversation ID
 * @param {number} page - Page number (default: 1)  
 * @param {number} limit - Number of messages per page (default: 50)
 */
export async function getMessages(conversationId, page = 1, limit = 50) {
  try {
    const params = new URLSearchParams({ 
      conversationId,
      page: page.toString(), 
      limit: limit.toString() 
    });
    const response = await authenticatedRequest(`/api/messages?${params}`);
    const data = response.data;
    return data.messages || [];
  } catch (error) {
    console.error('Error fetching messages:', error);
    throw error;
  }
}

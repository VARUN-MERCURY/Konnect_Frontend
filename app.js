/* ───────────────────────────────────────────────────────────────
   Konnect — Auth Frontend
   Routes: /auth/register  /auth/login  /auth/verify-otp  /auth/logout
   Auth service base URL: http://localhost/auth (via Traefik)
─────────────────────────────────────────────────────────────── */

const API = 'http://localhost';

// ─── State ────────────────────────────────────────────────────────
let pendingEmail = '';
let pendingFlow  = ''; // 'register' | 'login'
let accessToken  = '';

// ─── View Manager ────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── Utility: show / hide message ────────────────────────────────
function showMsg(el, text, type = 'error') {
  el.textContent = text;
  el.className = `msg ${type}`;
}

function hideMsg(el) {
  el.className = 'msg hidden';
  el.textContent = '';
}

// ─── Utility: loading state on button ────────────────────────────
function setLoading(btn, on) {
  btn.disabled = on;
  btn.classList.toggle('loading', on);
}

// ─── Utility: POST helper ─────────────────────────────────────────
async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',          // send/receive cookies (refreshToken)
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// ─── Password Toggle ──────────────────────────────────────────────
document.querySelectorAll('.toggle-pw').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
  });
});

// ─── Navigation links ────────────────────────────────────────────
document.getElementById('go-register').addEventListener('click', e => {
  e.preventDefault();
  clearForms();
  showView('view-register');
});

document.getElementById('go-login').addEventListener('click', e => {
  e.preventDefault();
  clearForms();
  showView('view-login');
});

function clearForms() {
  document.querySelectorAll('input').forEach(i => { i.value = ''; i.classList.remove('invalid'); });
  document.querySelectorAll('.msg').forEach(m => hideMsg(m));
}

// ─── REGISTER ────────────────────────────────────────────────────
document.getElementById('form-register').addEventListener('submit', async e => {
  e.preventDefault();

  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm  = document.getElementById('reg-confirm').value;
  const errEl    = document.getElementById('register-error');
  const btn      = document.getElementById('register-btn');

  hideMsg(errEl);

  // Client-side validation
  if (!name) {
    return showMsg(errEl, 'Please enter your full name.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showMsg(errEl, 'Please enter a valid email address.');
  }
  if (password.length < 8) {
    return showMsg(errEl, 'Password must be at least 8 characters.');
  }
  if (password !== confirm) {
    return showMsg(errEl, 'Passwords do not match.');
  }

  setLoading(btn, true);

  try {
    const { ok, data } = await post('/auth/register', { name, email, password });

    if (ok) {
      pendingEmail = email;
      pendingFlow  = 'register';
      openOtpView();
    } else {
      showMsg(errEl, data.message || 'Registration failed.');
    }
  } catch {
    showMsg(errEl, 'Cannot reach the auth service. Make sure it is running on port 3002.');
  } finally {
    setLoading(btn, false);
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────
document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  hideMsg(errEl);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showMsg(errEl, 'Please enter a valid email address.');
  }
  if (!password) {
    return showMsg(errEl, 'Password is required.');
  }

  setLoading(btn, true);

  try {
    const { ok, data } = await post('/auth/login', { email, password });

    if (ok) {
      pendingEmail = email;
      pendingFlow  = 'login';
      openOtpView();
    } else {
      showMsg(errEl, data.message || 'Login failed.');
    }
  } catch {
    showMsg(errEl, 'Cannot reach the auth service. Make sure it is running on port 3002.');
  } finally {
    setLoading(btn, false);
  }
});

// ─── OTP VIEW ────────────────────────────────────────────────────
function openOtpView() {
  document.getElementById('otp-input').value = '';
  hideMsg(document.getElementById('otp-error'));
  document.getElementById('otp-email-hint').textContent = pendingEmail;
  showView('view-otp');
  setTimeout(() => document.getElementById('otp-input').focus(), 100);
}

// Auto-format OTP input (digits only)
document.getElementById('otp-input').addEventListener('input', function () {
  this.value = this.value.replace(/\D/g, '').slice(0, 6);
});

document.getElementById('form-otp').addEventListener('submit', async e => {
  e.preventDefault();

  const otp   = document.getElementById('otp-input').value.trim();
  const errEl = document.getElementById('otp-error');
  const btn   = document.getElementById('otp-btn');

  hideMsg(errEl);

  if (otp.length < 4) {
    return showMsg(errEl, 'Please enter the full OTP.');
  }

  setLoading(btn, true);

  try {
    const { ok, status, data } = await post('/auth/verify-otp', { email: pendingEmail, otp });

    if (ok && data.accessToken) {
      accessToken = data.accessToken;
      openDashboard();
    } else if (status === 429) {
      showMsg(errEl, data.message || 'Too many attempts. Please try again later.');
    } else {
      showMsg(errEl, data.message || 'OTP verification failed.');
    }
  } catch {
    showMsg(errEl, 'Cannot reach the auth service. Make sure it is running on port 3002.');
  } finally {
    setLoading(btn, false);
  }
});

// ─── Resend OTP ───────────────────────────────────────────────────
document.getElementById('resend-btn').addEventListener('click', async () => {
  const errEl = document.getElementById('otp-error');
  const btn   = document.getElementById('resend-btn');

  hideMsg(errEl);
  setLoading(btn, true);

  try {
    const path = pendingFlow === 'register' ? '/auth/register' : '/auth/login';
    // For resend we only have email; password is cleared from inputs for security.
    // Resend login OTP requires credentials again — show a convenience message.
    if (pendingFlow === 'login') {
      showMsg(errEl, 'To resend, please go back and sign in again.', 'error');
      return;
    }

    // For register flow we don't have credentials here; prompt user
    showMsg(errEl, 'To resend, please go back and submit the registration form again.', 'error');
  } finally {
    setLoading(btn, false);
  }
});

// ─── DASHBOARD ────────────────────────────────────────────────────
function openDashboard() {
  const initial = pendingEmail.charAt(0).toUpperCase();
  document.getElementById('dash-avatar').textContent = initial;
  document.getElementById('dash-greeting').textContent =
    pendingFlow === 'register'
      ? `Welcome to Konnect, ${pendingEmail.split('@')[0]}!`
      : `Welcome back, ${pendingEmail.split('@')[0]}!`;
  document.getElementById('dash-token').textContent = accessToken;
  hideMsg(document.getElementById('logout-msg'));
  showView('view-dashboard');
}

// ─── LOGOUT ───────────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await post('/auth/logout', {});
  } catch {
    // Proceed with client-side logout even if request fails
  }

  accessToken  = '';
  pendingEmail = '';
  pendingFlow  = '';
  clearForms();
  showView('view-login');
});

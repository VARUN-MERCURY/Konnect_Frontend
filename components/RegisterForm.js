'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { authPost } from '@/lib/api';

export default function RegisterForm({ onOtpRequired } = {}) {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthError = urlParams.get('error');
    const oauthSuccess = urlParams.get('success');
    const token = urlParams.get('token');
    const refreshToken = urlParams.get('refreshToken');

    if (oauthSuccess && token && refreshToken) {
      sessionStorage.setItem('accessToken', token);
      localStorage.setItem('refreshToken', refreshToken);
      sessionStorage.removeItem('oauthIntent');
      window.history.replaceState({}, document.title, window.location.pathname);
      router.push('/dashboard');
      return;
    }

    if (oauthError) {
      const errorMessages = {
        'oauth_denied': 'OAuth authorization was denied. Please try again.',
        'oauth_processing_failed': 'OAuth registration failed during processing. Please try again.',
        'account_exists_different_provider': 'An account with this email already exists using a different login method.'
      };
      const message = errorMessages[oauthError] || decodeURIComponent(oauthError).replace(/_/g, ' ');
      setError(`OAuth Error: ${message}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Please enter your full name.');
    if (username.trim().length < 3) return setError('Username must be at least 3 characters.');
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) return setError('Username can only contain letters, numbers, and underscores.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Please enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    setLoading(true);
    try {
      const { ok, data } = await authPost('/auth/register', { name: name.trim(), username: username.trim(), email, password });
      if (ok) {
        sessionStorage.setItem('pendingEmail', email);
        sessionStorage.setItem('pendingFlow', 'register');
        if (typeof onOtpRequired === 'function') {
          onOtpRequired(email, 'register');
        } else {
          router.push('/verify-otp');
        }
      } else {
        setError(data.message || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError('Cannot reach the authentication service.');
    } finally {
      setLoading(false);
    }
  }

  const getPasswordStrength = (pass) => {
    if (!pass) return { strength: 0, text: '', color: '' };
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score++;
    if (/\d/.test(pass)) score++;
    if (/[^A-Za-z\d]/.test(pass)) score++;
    const levels = [
      { strength: 1, text: 'Weak' }, { strength: 2, text: 'Fair' },
      { strength: 3, text: 'Good' }, { strength: 4, text: 'Strong' }
    ];
    return levels[score - 1] || { strength: 0, text: '' };
  };

  const passwordStrength = getPasswordStrength(password);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="text-xs font-medium text-[#9668F5] uppercase tracking-widest mb-3">Get started free</div>
        <h2 className="text-2xl font-bold text-white">Create your account</h2>
        <p className="text-[#8A84A3] text-sm leading-relaxed">Join Konnect — no credit card required.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="reg-name" className="block text-xs font-medium text-[#9668F5]/80 uppercase tracking-wide">Full Name</label>
            <input id="reg-name" type="text" autoComplete="name" required className="w-full px-3 py-2.5 bg-[#2A293E]/60 border border-[#362A60] rounded-xl text-white placeholder-[#5740A0] text-sm transition-all duration-200 focus:outline-none focus:border-[#9668F5] focus:ring-2 focus:ring-[#9668F5]/20" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reg-username" className="block text-xs font-medium text-[#9668F5]/80 uppercase tracking-wide">Username</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="text-[#5740A0] text-sm">@</span></div>
              <input id="reg-username" type="text" autoComplete="username" required className="w-full pl-7 pr-3 py-2.5 bg-[#2A293E]/60 border border-[#362A60] rounded-xl text-white placeholder-[#5740A0] text-sm transition-all duration-200 focus:outline-none focus:border-[#9668F5] focus:ring-2 focus:ring-[#9668F5]/20" placeholder="handle" maxLength={30} value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reg-email" className="block text-xs font-medium text-[#9668F5]/80 uppercase tracking-wide">Email address</label>
          <input id="reg-email" type="email" autoComplete="email" required className="w-full px-4 py-2.5 bg-[#2A293E]/60 border border-[#362A60] rounded-xl text-white placeholder-[#5740A0] text-sm transition-all duration-200 focus:outline-none focus:border-[#9668F5] focus:ring-2 focus:ring-[#9668F5]/20" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reg-password" className="block text-xs font-medium text-[#9668F5]/80 uppercase tracking-wide">Password</label>
          <div className="relative">
            <input id="reg-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required className="w-full px-4 pr-12 py-2.5 bg-[#2A293E]/60 border border-[#362A60] rounded-xl text-white placeholder-[#5740A0] text-sm transition-all duration-200 focus:outline-none focus:border-[#9668F5] focus:ring-2 focus:ring-[#9668F5]/20" placeholder="Min. 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#5740A0] hover:text-[#9668F5] transition-colors" onClick={() => setShowPassword(!showPassword)}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>
          {password && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= passwordStrength.strength ? (passwordStrength.strength >= 3 ? 'bg-[#9668F5]' : passwordStrength.strength === 2 ? 'bg-yellow-500' : 'bg-red-500') : 'bg-[#362A60]'}`} />
                ))}
              </div>
              <p className={`text-xs ${passwordStrength.strength >= 3 ? 'text-[#9668F5]' : passwordStrength.strength === 2 ? 'text-yellow-500' : 'text-red-400'}`}>{passwordStrength.text}</p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="reg-confirm" className="block text-xs font-medium text-[#9668F5]/80 uppercase tracking-wide">Confirm Password</label>
          <input id="reg-confirm" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" required className={`w-full px-4 py-2.5 bg-[#2A293E]/60 border rounded-xl text-white placeholder-[#5740A0] text-sm transition-all duration-200 focus:outline-none focus:ring-2 ${confirmPassword && password !== confirmPassword ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20' : 'border-[#362A60] focus:border-[#9668F5] focus:ring-[#9668F5]/20'}`} placeholder="Re-enter password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          {confirmPassword && (
            <p className={`text-xs ${password === confirmPassword ? 'text-[#9668F5]' : 'text-red-400'}`}>
              {password === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
            </p>
          )}
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/25">
            <p className="text-sm text-red-400">{error}</p>
          </motion.div>
        )}

        <motion.button type="submit" disabled={loading} whileHover={{ scale: loading ? 1 : 1.01 }} whileTap={{ scale: loading ? 1 : 0.98 }} className="w-full py-3.5 px-6 bg-gradient-to-r from-[#9668F5] to-[#6E4FEF] text-white font-semibold rounded-xl text-sm transition-all duration-200 disabled:opacity-50 shadow-lg shadow-[#6E4FEF]/25">
          {loading ? 'Creating account...' : 'Create Account →'}
        </motion.button>

        <p className="text-center text-xs text-[#5740A0]">By continuing you agree to our Terms · Privacy</p>
      </form>
    </div>
  );
}

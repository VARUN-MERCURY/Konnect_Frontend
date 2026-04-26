'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { authPost, setAccessToken } from '@/lib/api';

/**
 * Inline OTP verification form designed to live inside the same right-pane
 * glass card as LoginForm / RegisterForm — no page navigation required.
 *
 * Props:
 *  - email      string   The email the OTP was sent to (required).
 *  - flow       string   'register' | 'login' — drives copy.
 *  - onBack     ()=>void Optional. Called when user clicks "Use a different email".
 *  - onSuccess  (data)=>void Optional. Called after successful verification.
 *               Receives the auth response. If omitted, defaults to redirecting
 *               to /whatsapp (or pendingInviteCode if set).
 */
export default function OtpForm({ email, flow = 'register', onBack, onSuccess }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  function setDigit(index, value) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const paste = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!paste) return;
    const next = Array.from({ length: 6 }, (_, i) => paste[i] || '');
    setOtp(next);
    inputRefs.current[Math.min(paste.length, 5)]?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    const code = otp.join('');
    if (code.length < 6) {
      setError('Please enter the complete 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      const { ok, status, data } = await authPost('/auth/verify-otp', { email, otp: code });
      if (ok && data?.accessToken) {
        setAccessToken(data.accessToken);
        sessionStorage.removeItem('pendingEmail');
        sessionStorage.removeItem('pendingFlow');
        if (onSuccess) {
          onSuccess(data);
        } else {
          const pendingInvite = sessionStorage.getItem('pendingInviteCode');
          if (pendingInvite) {
            sessionStorage.removeItem('pendingInviteCode');
            window.location.href = `/join/${pendingInvite}`;
          } else {
            window.location.href = '/whatsapp';
          }
        }
      } else if (status === 429) {
        setError(data?.message || 'Too many attempts. Please try again later.');
      } else if (status === 401) {
        setError(data?.message || 'Invalid verification code.');
      } else {
        setError(data?.message || 'Verification failed. Please try again.');
      }
    } catch (err) {
      setError('Cannot reach the auth service. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    setInfo('');
    if (!email) return;
    setResendCooldown(30);
    try {
      const endpoint = flow === 'register' ? '/auth/resend-otp' : '/auth/resend-otp';
      const { ok, data } = await authPost(endpoint, { email });
      if (ok) {
        setInfo('A new code has been sent to your email.');
      } else {
        // Backend may not have a resend route — provide guidance.
        setInfo(
          flow === 'register'
            ? 'If you didn\u2019t receive it, please go back and submit the form again.'
            : 'If you didn\u2019t receive it, please go back and sign in again.'
        );
      }
    } catch {
      setInfo('Resend unavailable. Please try the previous step again.');
    }
  }

  const isRegister = flow === 'register';
  const completeCount = otp.filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="text-xs font-medium text-[#9668F5] uppercase tracking-widest mb-3">
          {isRegister ? 'One last step' : 'Two-factor verification'}
        </div>
        <h2 className="text-2xl font-bold text-white">Enter your verification code</h2>
        <p className="text-[#8A84A3] text-sm leading-relaxed">
          We sent a 6-digit code to{' '}
          <span className="text-[#c4a8ff] font-medium">{email || 'your email'}</span>.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-[#9668F5]/80 uppercase tracking-wide">
              Verification code
            </label>
            <span className="text-[10px] text-[#5740A0]">{completeCount}/6</span>
          </div>
          <div className="flex justify-between gap-2">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (inputRefs.current[i] = el)}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digit}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                className="w-full h-14 text-center text-xl font-bold bg-[#2A293E]/60 border border-[#362A60] rounded-xl text-white transition-all duration-200 focus:outline-none focus:border-[#9668F5] focus:ring-2 focus:ring-[#9668F5]/30 hover:border-[#5740A0]"
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#5740A0]">
            <span className="inline-flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Expires in 5 minutes
            </span>
            <span>Check spam folder</span>
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25"
          >
            <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-400">{error}</p>
          </motion.div>
        )}

        {info && !error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-3.5 rounded-xl bg-[#9668F5]/10 border border-[#9668F5]/25"
          >
            <p className="text-sm text-[#c4a8ff]">{info}</p>
          </motion.div>
        )}

        <motion.button
          type="submit"
          disabled={loading || completeCount < 6}
          whileHover={{
            scale: loading || completeCount < 6 ? 1 : 1.01,
            boxShadow: loading || completeCount < 6 ? 'none' : '0 0 30px rgba(110,79,239,0.45)',
          }}
          whileTap={{ scale: loading || completeCount < 6 ? 1 : 0.98 }}
          className="w-full py-3.5 px-6 bg-gradient-to-r from-[#9668F5] to-[#6E4FEF] text-white font-semibold rounded-xl text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#9668F5]/50 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#6E4FEF]/25"
        >
          {loading ? 'Verifying...' : 'Verify & continue →'}
        </motion.button>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={onBack}
            className="text-[#9668F5] hover:text-[#c4a8ff] transition-colors font-medium"
          >
            ← Use a different email
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={loading || resendCooldown > 0}
            className="text-[#9668F5] hover:text-[#c4a8ff] transition-colors font-medium disabled:text-[#5740A0] disabled:cursor-not-allowed"
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
          </button>
        </div>
      </form>

      <p className="text-center text-xs text-[#5740A0]">🔒 Codes are single-use and expire in 5 minutes</p>
    </div>
  );
}

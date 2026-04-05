'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authPost, setAccessToken } from '@/lib/api';
import AuthLayout from '@/components/AuthLayout';

export default function VerifyOtpPage() {
  const router = useRouter();

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [flow, setFlow] = useState('');
  const inputRefs = useRef([]);

  useEffect(() => {
    const stored = sessionStorage.getItem('pendingEmail');
    if (!stored) {
      router.replace('/login');
      return;
    }
    setEmail(stored);
    
    // Get flow type for UI display
    const storedFlow = sessionStorage.getItem('pendingFlow') || '';
    setFlow(storedFlow);
    
    // Focus first input
    inputRefs.current[0]?.focus();
  }, [router]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  function handleOtpChange(index, value) {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    // Auto-focus next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = Array.from({ length: 6 }, (_, i) => paste[i] || '');
    setOtp(newOtp);
    
    // Focus the next empty input or the last one
    const nextIndex = Math.min(paste.length, 5);
    inputRefs.current[nextIndex]?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const otpString = otp.join('');
    if (otpString.length < 6) {
      return setError('Please enter the complete verification code.');
    }

    setLoading(true);
    try {
      const { ok, status, data } = await authPost('/auth/verify-otp', { email, otp: otpString });

      if (ok && data.accessToken) {
        // Store access token using new API method
        setAccessToken(data.accessToken);
        
        // Clean up pending data
        sessionStorage.removeItem('pendingEmail');
        sessionStorage.removeItem('pendingFlow');
        
        router.push('/whatsapp');
      } else if (status === 429) {
        setError(data.message || 'Too many attempts. Please try again later.');
      } else if (status === 401) {
        setError(data.message || 'Invalid verification code. Please check and try again.');
      } else {
        setError(data.message || 'Verification failed. Please try again.');
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      setError('Cannot reach the auth service. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    
    // Provide helpful guidance for resending OTP
    if (flow === 'register') {
      setError('To resend the verification code, please go back to the registration page and submit your details again.');
    } else {
      setError('To resend the verification code, please go back to the login page and enter your credentials again.');
    }
    
    // Set cooldown
    setResendCooldown(30);
  }

  const isRegistration = flow === 'register';

  return (
    <AuthLayout 
      title={isRegistration ? "Welcome to Konnect!" : "Welcome back!"}
      subtitle={isRegistration 
        ? "You're almost done! Just verify your email to get started with your new account."
        : "We've sent a verification code to your email. Enter it below to continue."
      }
    >
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-gray-900">Check your email</h2>
            <p className="text-gray-600">
              We've sent a 6-digit verification code to
            </p>
            {email && (
              <p className="text-indigo-600 font-medium text-lg">{email}</p>
            )}
          </div>
        </div>

        {/* OTP Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700 text-center">
              Enter verification code
            </label>
            
            {/* OTP Input Grid */}
            <div className="flex justify-center space-x-3">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={el => inputRefs.current[index] = el}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  className="w-12 h-14 text-center text-xl font-bold bg-white border-2 border-gray-200 rounded-lg
                           transition-all duration-200 ease-in-out
                           focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 focus:outline-none
                           hover:border-gray-300"
                  value={digit}
                  onChange={e => handleOtpChange(index, e.target.value)}
                  onKeyDown={e => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  autoComplete="one-time-code"
                />
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-red-50 p-4 border border-red-200 animate-slide-up">
              <div className="flex">
                <svg className="h-5 w-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || otp.join('').length < 6}
            className="btn-primary group"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Verifying...
              </>
            ) : (
              <>
                Verify & Continue
                <svg className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>

          {/* Resend Section */}
          <div className="text-center space-y-4">
            <button
              type="button"
              onClick={handleResend}
              disabled={loading || resendCooldown > 0}
              className="text-sm text-indigo-600 hover:text-indigo-500 font-medium transition-colors duration-200 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 
                ? `Resend code in ${resendCooldown}s` 
                : "Didn't receive the code? Get help"
              }
            </button>
            
            {/* Help Info */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-center space-x-6 text-xs text-gray-600">
                <div className="flex items-center space-x-1">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Expires in 5 minutes</span>
                </div>
                <div className="flex items-center space-x-1">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                  </svg>
                  <span>Check spam folder</span>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}

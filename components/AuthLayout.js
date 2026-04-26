'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import gsap from 'gsap';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import OtpForm from './OtpForm';

function NoiseOverlay() {
  return (
    <svg className="pointer-events-none fixed inset-0 w-full h-full opacity-[0.04] z-50" xmlns="http://www.w3.org/2000/svg">
      <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  );
}

function Orb({ style, className }) {
  const ref = useRef(null);
  useEffect(() => {
    gsap.to(ref.current, { y: 'random(-30, 30)', x: 'random(-20, 20)', duration: 'random(6, 10)', repeat: -1, yoyo: true, ease: 'sine.inOut' });
  }, []);
  return <div ref={ref} style={style} className={className} />;
}

function Counter({ to, suffix = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const obj = { val: 0 };
    gsap.to(obj, { val: parseFloat(to), duration: 2.4, delay: 1.2, ease: 'power3.out', onUpdate() { if (ref.current) { const d = to.toString().includes('.') ? 1 : 0; ref.current.textContent = obj.val.toFixed(d) + suffix; } } });
  }, [to, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

/**
 * AuthLayout — split layout with curtain-wipe between login and register.
 *  Left half: brand description (static, never moves).
 *  Right half: BOTH login & register forms stacked, separated by a draggable vertical divider.
 *    - Register layer is shown LEFT of the divider.
 *    - Login layer is shown RIGHT of the divider.
 *    - On /login → divider starts fully right (Login fully visible).
 *    - On /register → divider starts fully left (Register fully visible).
 *    - Drag the handle on the line ↔ to wipe between them. Even 1px of drag reveals the other form proportionally.
 *    - Release past 50% → snap and navigate to that route.
 */
export default function AuthLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const isRegister = pathname?.includes('/register');

  // Inline OTP step state. When set, the right-pane card swaps to OtpForm.
  const [otpEmail, setOtpEmail] = useState('');
  const [otpFlow, setOtpFlow] = useState('register');
  const handleOtpRequired = (email, flow) => {
    setOtpEmail(email);
    setOtpFlow(flow || 'register');
  };
  const handleOtpBack = () => {
    sessionStorage.removeItem('pendingEmail');
    sessionStorage.removeItem('pendingFlow');
    setOtpEmail('');
  };
  const showOtp = !!otpEmail;

  const brandRef = useRef(null);
  const rightPaneRef = useRef(null);
  const mounted = useRef(false);
  const [paneWidth, setPaneWidth] = useState(0);

  // Divider position in PIXELS within the right pane.
  // 0 = far left (Register fully visible), paneWidth = far right (Login fully visible).
  const dividerX = useMotionValue(0);

  // Clip-paths drive the wipe: login revealed right of divider, register revealed left of divider.
  const loginClip = useTransform(dividerX, (x) => `inset(0 0 0 ${x}px)`);
  const registerClip = useTransform(dividerX, (x) => `inset(0 ${Math.max(paneWidth - x, 0)}px 0 0)`);

  // Measure right pane and set initial divider position based on route
  useEffect(() => {
    const measure = () => {
      if (rightPaneRef.current) {
        const w = rightPaneRef.current.offsetWidth;
        setPaneWidth(w);
        // Start with divider at the page midline (left edge of right pane = 0).
        // Login form fully visible on the right half; drag right to reveal Register.
        if (!mounted.current) {
          dividerX.set(0);
        } else {
          dividerX.set(isRegister ? w : 0);
        }
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      gsap.fromTo(brandRef.current, { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 1, ease: 'power3.out', delay: 0.2 });
    }
  }, []);

  const handleDragEnd = () => {
    if (!paneWidth) return;
    const x = dividerX.get();
    const pct = x / paneWidth;
    if (pct < 0.5) {
      animate(dividerX, 0, { type: 'spring', stiffness: 240, damping: 28 });
      // Update URL without remounting the layout (keeps left pane stable)
      if (!isRegister) window.history.replaceState({}, '', '/register');
    } else {
      animate(dividerX, paneWidth, { type: 'spring', stiffness: 240, damping: 28 });
      if (isRegister) window.history.replaceState({}, '', '/login');
    }
  };

  return (
    <div className="min-h-screen w-full overflow-hidden bg-[#06040f] relative select-none">
      <NoiseOverlay />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(110,79,239,0.25),transparent)]" />
      <Orb className="fixed w-[700px] h-[700px] rounded-full pointer-events-none" style={{ top: '-200px', left: '-200px', background: 'radial-gradient(circle, rgba(110,79,239,0.18) 0%, transparent 70%)' }} />
      <Orb className="fixed w-[500px] h-[500px] rounded-full pointer-events-none" style={{ bottom: '-100px', right: '-100px', background: 'radial-gradient(circle, rgba(150,104,245,0.15) 0%, transparent 70%)' }} />
      <Orb className="fixed w-[300px] h-[300px] rounded-full pointer-events-none" style={{ top: '40%', left: '30%', background: 'radial-gradient(circle, rgba(87,64,160,0.2) 0%, transparent 70%)' }} />
      <div className="fixed inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(150,104,245,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(150,104,245,0.04) 1px, transparent 1px)', backgroundSize: '80px 80px' }} />

      <div className="relative min-h-screen flex">
        {/* LEFT: Branding (untouched) */}
        <div ref={brandRef} className="hidden lg:flex w-1/2 flex-col justify-between p-16 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="relative w-16 h-16">
              <img src="/konnect-logo.png" alt="Konnect" className="w-16 h-16 object-contain drop-shadow-[0_0_22px_rgba(150,104,245,0.6)]" />
            </div>
            <div>
              <div className="text-white font-bold text-2xl tracking-tight leading-none">Konnect</div>
              <div className="text-[#5740A0] text-[10px] tracking-[0.2em] uppercase mt-1">by DevGroup</div>
            </div>
          </div>

          <div className="space-y-10 max-w-[420px]">
            <div className="inline-flex items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-full border border-[#362A60] bg-[#0d0b1a]">
              <div className="flex gap-0.5 items-end h-4">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1 rounded-full bg-[#9668F5]" style={{ height: '14px', animation: `barPulse 1.2s ease-in-out ${i * 0.15}s infinite alternate` }} />
                ))}
              </div>
              <span className="text-[#9668F5] text-xs font-medium">97.2% detection accuracy live</span>
            </div>

            <div>
              <h1 className="text-[56px] font-black text-white leading-[1.0] tracking-tight">
                Connect<br />
                <span className="relative inline-block">
                  <span className="relative z-10 bg-gradient-to-r from-[#9668F5] via-[#c4a8ff] to-[#6E4FEF] bg-clip-text text-transparent">smarter.</span>
                  <svg className="absolute -bottom-2 left-0 w-full" height="6" viewBox="0 0 200 6" preserveAspectRatio="none">
                    <path d="M0 3 Q50 0 100 3 Q150 6 200 3" stroke="url(#ul)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                    <defs><linearGradient id="ul" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#9668F5" /><stop offset="100%" stopColor="#6E4FEF" /></linearGradient></defs>
                  </svg>
                </span>
              </h1>
              <p className="mt-6 text-[#8A84A3] text-base leading-relaxed">Real-time group messaging with ML-powered moderation. Communities that stay healthy, conversations that matter.</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[{ val: '97.2', suffix: '%', label: 'Detection Rate' }, { val: '312', suffix: 'ms', label: 'Avg Latency' }, { val: '99.9', suffix: '%', label: 'Uptime SLA' }].map(s => (
                <div key={s.label} className="relative group">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#9668F5]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative p-4 rounded-2xl border border-[#362A60]/60 bg-[#0d0b1a]/80 backdrop-blur-sm text-center">
                    <div className="text-2xl font-black bg-gradient-to-b from-white to-[#9668F5] bg-clip-text text-transparent"><Counter to={s.val} suffix={s.suffix} /></div>
                    <div className="text-[10px] text-[#5740A0] mt-1 uppercase tracking-widest">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {['Sentiment Analysis', 'Auto-Moderation', 'E2E Encrypted', 'Microservices', 'Kafka Streams'].map(f => (
                <span key={f} className="px-3 py-1 text-xs rounded-full border border-[#362A60] text-[#8A84A3] hover:border-[#9668F5]/50 hover:text-[#9668F5] transition-all duration-300 cursor-default">{f}</span>
              ))}
            </div>
          </div>

          <div className="relative p-5 rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-[#9668F5]/5 blur-2xl" />
            <div className="flex items-center gap-3 mb-3 relative z-10">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#9668F5] to-[#5740A0] flex items-center justify-center text-white font-bold text-sm">S</div>
              <div><div className="text-white text-sm font-semibold">Sanya Mehta</div><div className="text-[#5740A0] text-xs">Team Lead · DevSync</div></div>
              <div className="ml-auto text-[#9668F5] text-xs font-medium">★★★★★</div>
            </div>
            <p className="text-[#8A84A3] text-sm leading-relaxed relative z-10">"Konnect's AI keeps our team channels positive. It's like having a community manager at 3am."</p>
          </div>
        </div>

        {/* CENTER DIVIDER LINE between halves (visual only) */}
        <div className="hidden lg:block absolute left-1/2 top-0 h-full w-px bg-gradient-to-b from-transparent via-[#9668F5]/40 to-transparent z-20 pointer-events-none" />

        {/* RIGHT pane: stacked forms + draggable vertical curtain */}
        <div ref={rightPaneRef} className="flex-1 lg:w-1/2 relative z-10 overflow-hidden">
          {/* Mobile fallback */}
          <div className="lg:hidden flex items-center justify-center min-h-screen p-6">
            <div className="w-full max-w-[420px]">
              <div className="glass-card group">
                <div className="glass-sheen" />
                <div className="glass-edge" />
                <div className="relative p-8">
                  {showOtp ? (
                    <OtpForm email={otpEmail} flow={otpFlow} onBack={handleOtpBack} />
                  ) : isRegister ? (
                    <RegisterForm onOtpRequired={handleOtpRequired} />
                  ) : (
                    <LoginForm onOtpRequired={handleOtpRequired} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Desktop: stacked forms with clip-path wipe */}
          <div className="hidden lg:flex h-screen items-center justify-center relative">
            {showOtp ? (
              /* OTP step — single centered card, no curtain */
              <div className="absolute inset-0 flex items-center justify-center p-12 z-20">
                <div className="w-full max-w-[420px] my-auto">
                  <div className="glass-card group">
                    <div className="glass-sheen" />
                    <div className="glass-edge" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-[#9668F5]/60 to-transparent" />
                    <div className="relative p-8 lg:p-10">
                      <OtpForm email={otpEmail} flow={otpFlow} onBack={handleOtpBack} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
            <>
            {/* REGISTER layer (visible LEFT of divider) */}
            <motion.div
              style={{ clipPath: registerClip, WebkitClipPath: registerClip }}
              className="absolute inset-0 flex items-center justify-center p-12 z-10"
            >
              <div className="w-full max-w-[420px] my-auto">
                <div className="glass-card group">
                  <div className="glass-sheen" />
                  <div className="glass-edge" />
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-[#9668F5]/60 to-transparent" />
                  <div className="relative p-8 lg:p-10"><RegisterForm onOtpRequired={handleOtpRequired} /></div>
                </div>
              </div>
            </motion.div>

            {/* LOGIN layer (visible RIGHT of divider) */}
            <motion.div
              style={{ clipPath: loginClip, WebkitClipPath: loginClip }}
              className="absolute inset-0 flex items-center justify-center p-12 z-10"
            >
              <div className="w-full max-w-[420px] my-auto">
                <div className="glass-card group">
                  <div className="glass-sheen" />
                  <div className="glass-edge" />
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-[#9668F5]/60 to-transparent" />
                  <div className="relative p-8 lg:p-10"><LoginForm onOtpRequired={handleOtpRequired} /></div>
                </div>
              </div>
            </motion.div>

            {/* DRAGGABLE DIVIDER */}
            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: paneWidth || 0 }}
              dragElastic={0}
              dragMomentum={false}
              style={{ x: dividerX }}
              onDragEnd={handleDragEnd}
              className="absolute top-0 left-0 h-full z-30 cursor-ew-resize group"
            >
              {/* Glow line */}
              <div className="absolute top-0 left-0 h-full w-px bg-gradient-to-b from-transparent via-[#9668F5] to-transparent shadow-[0_0_12px_rgba(150,104,245,0.8)] -translate-x-1/2" />
              {/* Wider hit area */}
              <div className="absolute top-0 left-0 h-full w-8 -translate-x-1/2" />

              {/* Handle in middle */}
              <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
                <div className="relative">
                  <div className="absolute inset-0 -m-4 rounded-2xl bg-[#9668F5]/30 blur-xl opacity-60 group-hover:opacity-100 transition-opacity" />
                  <div className="relative w-7 h-28 rounded-full bg-gradient-to-b from-[#c4a8ff] via-[#9668F5] to-[#6E4FEF] shadow-[0_0_24px_rgba(150,104,245,0.7)] border border-white/20 flex items-center justify-center overflow-hidden">
                    {/* Vertical DRAG label — clean using CSS writing-mode (no rotate distortion) */}
                    <span
                      className="text-white text-[10px] font-bold tracking-[0.5em] uppercase pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
                      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                    >
                      ◀ Drag ▶
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
            </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes barPulse {
          from { transform: scaleY(0.4); opacity: 0.5; }
          to   { transform: scaleY(1);   opacity: 1; }
        }
        @keyframes glassShimmer {
          0%   { transform: translateX(-150%) skewX(-12deg); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateX(350%)  skewX(-12deg); opacity: 0; }
        }
        .glass-card {
          position: relative;
          border-radius: 28px;
          overflow: hidden;
          background:
            linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 40%, rgba(150,104,245,0.06) 100%);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow:
            0 0 0 1px rgba(150,104,245,0.08) inset,
            0 1px 0 rgba(255,255,255,0.18) inset,
            0 -1px 0 rgba(255,255,255,0.05) inset,
            0 30px 80px -20px rgba(0,0,0,0.7),
            0 0 60px -10px rgba(110,79,239,0.35);
        }
        .glass-card::before {
          content: '';
          position: absolute; inset: 0;
          border-radius: inherit;
          background:
            radial-gradient(120% 60% at 50% -10%, rgba(255,255,255,0.18), transparent 50%),
            radial-gradient(80% 50% at 100% 100%, rgba(150,104,245,0.12), transparent 60%);
          pointer-events: none;
          mix-blend-mode: screen;
        }
        .glass-sheen {
          position: absolute; top: 0; left: 0;
          width: 35%; height: 100%;
          background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.10) 45%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.10) 55%, transparent 100%);
          filter: blur(8px);
          pointer-events: none;
          animation: glassShimmer 7s linear infinite;
        }
        .glass-edge {
          position: absolute; inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg, rgba(255,255,255,0.35), rgba(150,104,245,0.25) 40%, transparent 70%);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

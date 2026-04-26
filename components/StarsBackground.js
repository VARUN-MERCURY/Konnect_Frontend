'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export default function StarsBackground({
  density = 80,
  meteorTrigger,
  meteorBurstSize = 6,
}) {
  const stars = useMemo(() => {
    return Array.from({ length: density }, (_, i) => {
      const size = Math.random() * 2 + 0.5;
      return {
        id: i,
        size,
        top: Math.random() * 100,
        left: Math.random() * 100,
        delay: Math.random() * 6,
        duration: 2.5 + Math.random() * 4,
        opacity: 0.3 + Math.random() * 0.6,
        color: size > 1.8 ? '#c4a8ff' : '#ffffff',
      };
    });
  }, [density]);

  const shootingStars = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => ({
        id: i,
        top: Math.random() * 60,
        delay: i * 7 + Math.random() * 5,
        duration: 1.2 + Math.random() * 0.6,
      })),
    []
  );

  const [meteors, setMeteors] = useState([]);
  const meteorIdRef = useRef(0);
  // Track the previous trigger value so we only fire when it actually changes,
  // not on mount nor on React 18 StrictMode's double-effect invocation.
  const lastTriggerRef = useRef(meteorTrigger);

  useEffect(() => {
    if (meteorTrigger === undefined || meteorTrigger === null) return;
    if (meteorTrigger === lastTriggerRef.current) return;
    lastTriggerRef.current = meteorTrigger;

    const burst = Array.from({ length: meteorBurstSize }, () => {
      const id = ++meteorIdRef.current;
      const delay = Math.random() * 0.35;
      const duration = 0.9 + Math.random() * 0.6;
      const startTop = -5 + Math.random() * 35;
      const length = 110 + Math.random() * 90;
      return { id, delay, duration, startTop, length };
    });

    setMeteors((prev) => [...prev, ...burst]);

    const ids = burst.map((m) => m.id);
    const t = setTimeout(() => {
      setMeteors((prev) => prev.filter((m) => !ids.includes(m.id)));
    }, 2000);

    return () => clearTimeout(t);
  }, [meteorTrigger, meteorBurstSize]);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
      style={{ zIndex: 0 }}
    >
      <div
        className="absolute inset-0 nebula-1"
        style={{
          background:
            'radial-gradient(ellipse 600px 400px at 20% 30%, rgba(150,104,245,0.10), transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 nebula-2"
        style={{
          background:
            'radial-gradient(ellipse 700px 500px at 80% 70%, rgba(110,79,239,0.08), transparent 60%)',
        }}
      />

      {stars.map((s) => (
        <span
          key={s.id}
          className="star"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            background: s.color,
            boxShadow:
              s.size > 1.8
                ? `0 0 ${s.size * 3}px ${s.color}`
                : `0 0 ${s.size * 2}px rgba(255,255,255,0.4)`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
            opacity: s.opacity,
          }}
        />
      ))}

      {shootingStars.map((s) => (
        <span
          key={`shoot-${s.id}`}
          className="shooting-star"
          style={{
            top: `${s.top}%`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}

      {meteors.map((m) => (
        <span
          key={`meteor-${m.id}`}
          className="meteor"
          style={{
            top: `${m.startTop}%`,
            width: `${m.length}px`,
            animationDelay: `${m.delay}s`,
            animationDuration: `${m.duration}s`,
          }}
        />
      ))}

      <style jsx>{`
        .star {
          position: absolute;
          border-radius: 9999px;
          animation-name: twinkle;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
        }
        @keyframes twinkle {
          0%, 100% { opacity: var(--start, 0.3); transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        .nebula-1 { animation: drift1 40s ease-in-out infinite alternate; }
        .nebula-2 { animation: drift2 55s ease-in-out infinite alternate; }
        @keyframes drift1 {
          from { transform: translate(0, 0); }
          to   { transform: translate(40px, -30px); }
        }
        @keyframes drift2 {
          from { transform: translate(0, 0); }
          to   { transform: translate(-50px, 40px); }
        }
        .shooting-star {
          position: absolute;
          left: -10%;
          width: 120px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(196, 168, 255, 0.9), #ffffff);
          border-radius: 9999px;
          opacity: 0;
          filter: drop-shadow(0 0 6px rgba(196, 168, 255, 0.8));
          animation-name: shoot;
          animation-iteration-count: infinite;
          animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
          transform: rotate(-18deg);
        }
        @keyframes shoot {
          0% { transform: translateX(0) rotate(-18deg); opacity: 0; }
          5% { opacity: 1; }
          70% { opacity: 1; }
          100% { transform: translateX(120vw) rotate(-18deg); opacity: 0; }
        }
        .meteor {
          /* Anchored at top-right; bar is drawn pointing leftwards.
             Bright head is at the LEADING (left) end, fading trail behind. */
          position: absolute;
          right: -5%;
          height: 2px;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(150, 104, 245, 0.6) 40%,
            rgba(196, 168, 255, 0.95) 75%,
            #ffffff 100%
          );
          border-radius: 9999px;
          opacity: 0;
          filter: drop-shadow(0 0 8px rgba(196, 168, 255, 0.9));
          /* Rotate around the right (anchor) edge. Negative angle so the
             leading-left tip swings DOWN, matching the travel direction
             (top-right -> bottom-left). */
          transform-origin: right center;
          transform: rotate(-22deg);
          animation-name: meteorShower;
          animation-iteration-count: 1;
          animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
          animation-fill-mode: forwards;
          will-change: transform, opacity;
        }
        @keyframes meteorShower {
          0% { transform: translate(0, 0) rotate(-22deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translate(-130vw, 55vh) rotate(-22deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .star, .nebula-1, .nebula-2, .shooting-star, .meteor { animation: none !important; }
          .meteor { display: none; }
        }
      `}</style>
    </div>
  );
}

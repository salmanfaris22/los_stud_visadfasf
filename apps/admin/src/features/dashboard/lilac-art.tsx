import * as React from "react";

/** Soft 3D-looking lavender flower: two rings of twisted petals. Decorative only. */
export function Flower({ className }: { className?: string }) {
  const id = React.useId().replace(/:/g, "");
  const petal = "M100 100 C 66 84, 64 26, 100 12 C 132 20, 134 78, 100 100 Z";
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <defs>
        <linearGradient id={`p${id}`} x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0%" stopColor="#8d6be6" />
          <stop offset="55%" stopColor="#b9a0f3" />
          <stop offset="100%" stopColor="#ece4fe" />
        </linearGradient>
        <linearGradient id={`q${id}`} x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0%" stopColor="#7b57de" />
          <stop offset="100%" stopColor="#d9cbfb" />
        </linearGradient>
        <radialGradient id={`c${id}`}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={`s${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#5a3fb8" floodOpacity="0.25" />
        </filter>
      </defs>
      <g filter={`url(#s${id})`}>
        {Array.from({ length: 12 }, (_, i) => (
          <path key={`o${i}`} d={petal} fill={`url(#p${id})`} stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" transform={`rotate(${i * 30} 100 100)`} />
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <path key={`i${i}`} d={petal} fill={`url(#q${id})`} stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1" transform={`rotate(${i * 36 + 14} 100 100) translate(100 100) scale(0.58) translate(-100 -100)`} />
        ))}
      </g>
      <circle cx="100" cy="100" r="16" fill={`url(#c${id})`} />
    </svg>
  );
}

/** Stack of glossy pink-to-lilac rings, like a soft coil. Decorative only. */
export function Coil({ className }: { className?: string }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 120 210" className={className} aria-hidden>
      <defs>
        <linearGradient id={`r${id}`} x1="0" x2="1">
          <stop offset="0%" stopColor="#f3bfe0" />
          <stop offset="45%" stopColor="#c7b0f6" />
          <stop offset="100%" stopColor="#f7d9ee" />
        </linearGradient>
      </defs>
      {Array.from({ length: 7 }, (_, i) => {
        const cy = 26 + i * 26;
        const dx = i % 2 ? 6 : -6;
        return (
          <g key={i}>
            <ellipse cx={60 + dx} cy={cy} rx="42" ry="14" fill="none" stroke={`url(#r${id})`} strokeWidth="15" />
            <ellipse cx={60 + dx} cy={cy - 4} rx="40" ry="10" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2.5" />
          </g>
        );
      })}
    </svg>
  );
}

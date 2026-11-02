/* Calm living room with a wall-mounted split AC — the welcome-screen picture. Drawn here (not a stock photo)
 * so it is ours to use; the cool air lines drift gently. */

export function RoomArt() {
  return (
    <svg viewBox="0 0 360 230" width="100%" style={{ display: "block", borderRadius: 18 }} role="img" aria-label="A calm living room cooled by a split AC">
      <defs>
        <linearGradient id="wall" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#efe9df" /><stop offset="1" stopColor="#e3dacb" /></linearGradient>
        <linearGradient id="floor" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d9cdb9" /><stop offset="1" stopColor="#cbbca4" /></linearGradient>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#dbeee9" /><stop offset="1" stopColor="#b9d7c4" /></linearGradient>
        <linearGradient id="ac" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e6ebee" /></linearGradient>
        <linearGradient id="sofa" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#efe6d8" /><stop offset="1" stopColor="#dccfba" /></linearGradient>
      </defs>
      <rect width="360" height="230" fill="url(#wall)" />
      {/* ceiling line + cove light */}
      <rect width="360" height="16" fill="#f6f2ea" /><rect y="16" width="360" height="2" fill="#fff8e6" opacity=".9" />
      {/* window with garden */}
      <rect x="0" y="18" width="70" height="168" fill="url(#sky)" />
      <circle cx="22" cy="80" r="26" fill="#8fb98d" /><circle cx="48" cy="62" r="22" fill="#a5c79b" /><circle cx="14" cy="118" r="20" fill="#7aa978" />
      <rect x="0" y="150" width="70" height="36" fill="#9cc08f" />
      <rect x="66" y="18" width="6" height="168" fill="#e9e3d8" /><rect x="70" y="18" width="16" height="168" fill="#f3efe7" opacity=".85" />
      {/* slatted wall panels */}
      {[0, 1].map((p) => <g key={p} transform={`translate(${p ? 238 : 118} 30)`}>{Array.from({ length: 9 }).map((_, i) => <rect key={i} x={i * 6} width="3.4" height="150" rx="1.5" fill="#d8ccb8" />)}</g>)}
      {/* cupboard */}
      <rect x="306" y="34" width="54" height="152" fill="#8a7d6e" /><path d="M333 34v152" stroke="#7a6e60" strokeWidth="1.5" /><rect x="328" y="100" width="2" height="18" rx="1" fill="#e8b23a" /><rect x="336" y="100" width="2" height="18" rx="1" fill="#e8b23a" />
      {/* split AC */}
      <g transform="translate(166 44)">
        <rect width="72" height="22" rx="5" fill="url(#ac)" stroke="#d3dbe0" />
        <rect x="6" y="15" width="60" height="3" rx="1.5" fill="#cfd8de" />
        <circle cx="64" cy="7" r="1.6" fill="#14ae95" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${14 + i * 20} 30 q6 9 0 18`} stroke="#9fd3e6" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".75">
            <animate attributeName="opacity" values=".15;.8;.15" dur="2.6s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
            <animateTransform attributeName="transform" type="translate" values="0 0;0 5;0 0" dur="2.6s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
          </path>
        ))}
      </g>
      {/* floor + rug */}
      <rect y="186" width="360" height="44" fill="url(#floor)" />
      <ellipse cx="190" cy="212" rx="120" ry="12" fill="#e9e1d3" />
      {/* sofa */}
      <g transform="translate(92 140)">
        <rect x="0" y="14" width="128" height="40" rx="14" fill="url(#sofa)" />
        <rect x="6" y="0" width="58" height="30" rx="12" fill="#f3ece0" /><rect x="66" y="0" width="58" height="30" rx="12" fill="#f3ece0" />
        <rect x="16" y="6" width="22" height="18" rx="7" fill="#e5dac7" /><rect x="88" y="6" width="22" height="18" rx="7" fill="#e5dac7" />
        <path d="M30 22c14 6 28 6 40 18" stroke="#b8a891" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".55" />
      </g>
      {/* coffee table */}
      <g transform="translate(170 192)"><rect width="56" height="7" rx="2" fill="#efece6" /><rect x="6" y="7" width="7" height="12" fill="#e2ddd3" /><rect x="43" y="7" width="7" height="12" fill="#e2ddd3" /><rect x="34" y="-4" width="14" height="4" rx="1" fill="#fff" /></g>
      {/* armchair */}
      <g transform="translate(250 150)"><path d="M6 10c0-12 46-12 46 0v30H6z" fill="#f1e9dc" /><rect x="0" y="22" width="58" height="24" rx="10" fill="url(#sofa)" /></g>
      {/* plant */}
      <g transform="translate(292 150)"><rect x="2" y="24" width="14" height="14" rx="3" fill="#cdbfa8" /><path d="M9 24c-8-10-6-20 0-24c6 4 8 14 0 24M9 24c4-8 12-10 14-6" stroke="#6f9b6b" strokeWidth="4" fill="none" strokeLinecap="round" /></g>
    </svg>
  );
}

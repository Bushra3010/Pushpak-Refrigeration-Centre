/* Product artwork for the spare-parts promo banners — drawn in SVG so the slider looks finished
 * before the shop uploads its own photos. Gold-on-dark to match the Bada Business style. */

import type { PromoArt } from "../lib/promo";

const G = "#e8b23a", L = "#ffe7b0", D = "#8a6410", W = "#f4f4f5", S = "#c9ccd1";

export function PromoArtSvg({ art, size = 132 }: { art: PromoArt; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 120 120", "aria-hidden": true } as const;
  switch (art) {
    case "ac":
      return (
        <svg {...common}>
          <rect x="8" y="22" width="104" height="40" rx="9" fill={W} />
          <rect x="8" y="50" width="104" height="12" rx="4" fill={S} />
          <path d="M18 56h84" stroke="#9aa0a8" strokeWidth="2" strokeLinecap="round" />
          <circle cx="98" cy="33" r="2.5" fill="#14ae95" />
          <path d="M30 72c0 6-5 8-5 14M50 72c0 6-5 8-5 14M70 72c0 6-5 8-5 14M90 72c0 6-5 8-5 14" stroke={L} strokeWidth="3" fill="none" strokeLinecap="round" />
          <g transform="translate(70 84)"><circle r="14" fill={G} /><circle r="5" fill="#111" /><path d="M0-12v6M0 6v6M-12 0h6M6 0h6M-8.5-8.5l4 4M4.5 4.5l4 4M-8.5 8.5l4-4M4.5-4.5l4-4" stroke="#111" strokeWidth="3" strokeLinecap="round" /></g>
        </svg>
      );
    case "fridge":
      return (
        <svg {...common}>
          <rect x="30" y="8" width="58" height="104" rx="8" fill={W} />
          <path d="M30 46h58" stroke={S} strokeWidth="3" />
          <rect x="76" y="20" width="4" height="16" rx="2" fill={G} />
          <rect x="76" y="56" width="4" height="22" rx="2" fill={G} />
          <path d="M44 22l6 6m0-6l-6 6M47 18v14" stroke="#7cc6e8" strokeWidth="2.4" strokeLinecap="round" />
          <rect x="22" y="88" width="24" height="16" rx="3" fill={G} /><path d="M27 96h14" stroke="#111" strokeWidth="2.5" />
        </svg>
      );
    case "washer":
      return (
        <svg {...common}>
          <rect x="16" y="8" width="88" height="104" rx="9" fill={W} />
          <path d="M16 30h88" stroke={S} strokeWidth="3" />
          <circle cx="32" cy="19" r="4" fill={G} /><rect x="44" y="16" width="34" height="6" rx="3" fill={S} />
          <circle cx="60" cy="70" r="30" fill="#2b2f36" /><circle cx="60" cy="70" r="22" fill="#5aa9d6" />
          <path d="M42 74c6-6 12 6 18 0s12 6 18 0" stroke={W} strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="60" cy="70" r="30" fill="none" stroke={G} strokeWidth="4" />
        </svg>
      );
    case "microwave":
      return (
        <svg {...common}>
          <rect x="6" y="28" width="108" height="66" rx="8" fill={W} />
          <rect x="14" y="36" width="70" height="50" rx="5" fill="#2b2f36" />
          <ellipse cx="49" cy="74" rx="24" ry="5" fill={G} opacity="0.85" />
          <path d="M28 50h40" stroke="#ffcf6b" strokeWidth="2" opacity="0.5" />
          <rect x="90" y="38" width="16" height="10" rx="2" fill="#14ae95" />
          <circle cx="98" cy="62" r="4" fill={G} /><circle cx="98" cy="76" r="4" fill={D} />
          <rect x="18" y="98" width="10" height="6" rx="2" fill={S} /><rect x="92" y="98" width="10" height="6" rx="2" fill={S} />
        </svg>
      );
    case "purifier":
      return (
        <svg {...common}>
          <rect x="32" y="6" width="56" height="96" rx="10" fill={W} />
          <rect x="40" y="16" width="40" height="40" rx="6" fill="#5aa9d6" opacity="0.85" />
          <path d="M60 24c-7 9-10 14-10 19a10 10 0 0 0 20 0c0-5-3-10-10-19z" fill={W} />
          <rect x="46" y="64" width="28" height="6" rx="3" fill={G} />
          <path d="M60 80v10" stroke={S} strokeWidth="5" strokeLinecap="round" />
          <path d="M60 96c-3 4-4 6-4 8a4 4 0 0 0 8 0c0-2-1-4-4-8z" fill="#5aa9d6" />
          <rect x="88" y="40" width="14" height="44" rx="6" fill={G} /><path d="M92 48h6M92 56h6M92 64h6" stroke="#111" strokeWidth="2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <g transform="translate(44 46)"><circle r="26" fill={G} /><circle r="10" fill="#111" />
            {Array.from({ length: 8 }).map((_, i) => <rect key={i} x="-5" y="-34" width="10" height="12" rx="2" fill={G} transform={`rotate(${i * 45})`} />)}</g>
          <rect x="62" y="64" width="46" height="34" rx="4" fill="#1d6b3a" /><path d="M68 72h10M68 80h18M68 88h8M90 72h12" stroke={L} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="94" cy="88" r="4" fill={G} />
        </svg>
      );
  }
}

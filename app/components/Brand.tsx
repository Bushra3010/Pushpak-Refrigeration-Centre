/* Pushpak brand pieces — the round PRC logo (public/prc-logo.png) and the wordmark. */

/** The round "PRC" badge. The PNG has white corners, so it's clipped to a circle. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/prc-logo.png" alt="Pushpak Refrigeration Centre" width={size} height={size}
      style={{ display: "block", width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  );
}

/** "Pushpak" with "REFRIGERATION CENTRE" under it. */
export function Wordmark({ light }: { light?: boolean }) {
  return (
    <div style={{ lineHeight: 1.05 }}>
      <p style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-0.01em", color: light ? "white" : "var(--blue-dark)" }}>Pushpak</p>
      <p style={{ margin: "2px 0 0", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: light ? "rgba(255,255,255,0.7)" : "var(--blue)" }}>REFRIGERATION CENTRE</p>
    </div>
  );
}

"use client";

import { BackIcon, ChevronRight } from "./icons";

/* Mobile building blocks shared by the customer and technician apps (ported from zevto). */

/** Detail-page header: back arrow + title on the canvas, optional actions right. */
export function PageHeader({ title, sub, onBack, right }: { title: string; sub?: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "18px 16px 12px",
      position: "sticky", top: 0, zIndex: 20, background: "var(--app-bg)",
    }}>
      {onBack && (
        <button onClick={onBack} aria-label="Back" className="press" style={iconBtn}>
          <BackIcon c="var(--ink)" />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>{title}</h2>
        {sub && <p style={{ margin: 0, fontSize: 12, color: "var(--ink-mute)" }}>{sub}</p>}
      </div>
      {right && <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{right}</div>}
    </div>
  );
}

export const iconBtn: React.CSSProperties = {
  background: "none", border: "none", padding: 0, cursor: "pointer",
  display: "flex", alignItems: "center", position: "relative",
};

/** Segmented pill tabs — white track, blue active pill. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div style={{
      display: "flex", background: "var(--surface)", borderRadius: 999, padding: 4,
      boxShadow: "var(--shadow-card)",
    }}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} aria-pressed={on} style={{
            flex: 1, border: "none", cursor: "pointer", borderRadius: 999,
            padding: "9px 6px", fontSize: 13.5, fontWeight: on ? 600 : 500,
            background: on ? "var(--blue)" : "transparent",
            color: on ? "white" : "var(--ink-soft)",
            transition: "background 0.2s, color 0.2s",
          }}>{t.label}</button>
        );
      })}
    </div>
  );
}

export type Tone = "blue" | "green" | "amber" | "red" | "purple" | "teal" | "grey" | "orange";

export const TONES: Record<Tone, { bg: string; fg: string }> = {
  blue: { bg: "var(--info-bg)", fg: "var(--info-text)" },
  green: { bg: "var(--success)", fg: "var(--success-text)" },
  amber: { bg: "var(--warning)", fg: "var(--warning-text)" },
  red: { bg: "var(--error)", fg: "var(--error-text)" },
  purple: { bg: "var(--purple-tint)", fg: "var(--purple)" },
  teal: { bg: "var(--teal-bg)", fg: "var(--teal-text)" },
  grey: { bg: "var(--surface-dim)", fg: "var(--text-muted)" },
  orange: { bg: "var(--gold-tint)", fg: "var(--gold-dark)" },
};

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONES[tone];
  return <span style={{ background: t.bg, color: t.fg, fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>{children}</span>;
}

export function PrimaryButton({ children, onClick, disabled, tone = "blue", style, type = "button" }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; tone?: "blue" | "gold" | "green"; style?: React.CSSProperties; type?: "button" | "submit";
}) {
  const bg = tone === "gold" ? "linear-gradient(135deg,var(--gold),var(--gold-dark))" : tone === "green" ? "linear-gradient(135deg,#22a06b,#15803d)" : "linear-gradient(135deg,var(--blue),var(--blue-dark))";
  const glow = tone === "gold" ? "0 6px 16px rgba(255,138,31,0.38)" : tone === "green" ? "0 6px 16px rgba(21,128,61,0.3)" : "0 6px 16px rgba(11,92,255,0.30)";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="press" style={{
      width: "100%", border: "none", borderRadius: 16, padding: "15px 18px",
      fontSize: 15, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      background: disabled ? "var(--line-strong)" : bg,
      color: disabled ? "var(--ink-mute)" : "white",
      boxShadow: disabled ? "none" : glow,
      ...style,
    }}>{children}</button>
  );
}

export function GhostButton({ children, onClick, danger, style }: { children: React.ReactNode; onClick?: () => void; danger?: boolean; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} className="press" style={{
      width: "100%", border: `1.5px solid ${danger ? "#fecaca" : "var(--line-strong)"}`, background: "var(--surface)", borderRadius: 14, padding: 13,
      fontSize: 14, fontWeight: 700, color: danger ? "var(--error-text)" : "var(--text-secondary)", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 6, ...style,
    }}>{children}</button>
  );
}

export const card: React.CSSProperties = {
  background: "var(--surface)", borderRadius: 18, boxShadow: "var(--shadow-card)",
};

export const label: React.CSSProperties = {
  display: "block", margin: "0 0 8px", fontSize: 13.5, fontWeight: 600, color: "var(--ink)",
};

export const field: React.CSSProperties = {
  width: "100%", background: "var(--surface)", border: "1.5px solid var(--line)",
  borderRadius: 14, padding: "13px 14px", fontSize: 14, color: "var(--ink)", outline: "none",
};

export const small: React.CSSProperties = { margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.5 };

export const sectionTitle: React.CSSProperties = { margin: "20px 2px 10px", fontSize: 15, fontWeight: 700, color: "var(--ink)" };

/** Sticky footer bar for detail pages with a main action. */
export function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-print" style={{
      position: "sticky", bottom: 0, zIndex: 20,
      padding: "12px 16px calc(14px + env(safe-area-inset-bottom))",
      background: "linear-gradient(to top, var(--app-bg) 75%, rgba(238,241,251,0))",
    }}>{children}</div>
  );
}

/** Modal sheet that slides up over the current page. */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={{
      position: "absolute", inset: 0, zIndex: 100, background: "rgba(15,23,41,0.45)",
      display: "flex", alignItems: "flex-end",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet-up no-scroll" style={{
        width: "100%", maxHeight: "88%", overflowY: "auto", background: "var(--app-bg)",
        borderRadius: "24px 24px 0 0", padding: "10px 16px calc(20px + env(safe-area-inset-bottom))",
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--line-strong)", margin: "0 auto 12px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ ...iconBtn, fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} style={{
      width: 46, height: 27, borderRadius: 999, border: "none", cursor: "pointer", padding: 3, flexShrink: 0,
      background: on ? "var(--blue)" : "var(--line-strong)", transition: "background 0.2s",
      display: "flex", justifyContent: on ? "flex-end" : "flex-start",
    }}>
      <span style={{ width: 21, height: 21, borderRadius: "50%", background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </button>
  );
}

/** Wrapping row of selectable chips — single or multi select. */
export function Chips<T extends string>({ options, value, onChange, multi }: {
  options: readonly T[]; value: T | T[]; onChange: (v: T) => void; multi?: boolean;
}) {
  const sel = (o: T) => (multi ? (value as T[]).includes(o) : value === o);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = sel(o);
        return (
          <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={on} className="press" style={{
            border: on ? "1.5px solid var(--blue)" : "1.5px solid var(--line)", borderRadius: 999, padding: "8px 13px",
            background: on ? "var(--blue-tint)" : "var(--surface)", color: on ? "var(--blue)" : "var(--text-secondary)",
            fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          }}>{o}</button>
        );
      })}
    </div>
  );
}

export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span aria-label={`${value} out of 5 stars`} style={{ color: "var(--gold)", fontSize: size, letterSpacing: 1, lineHeight: 1 }}>
      {"★".repeat(Math.round(value))}<span style={{ color: "var(--line-strong)" }}>{"★".repeat(5 - Math.round(value))}</span>
    </span>
  );
}

export function StarPicker({ value, onChange, size = 32 }: { value: number; onChange: (n: number) => void; size?: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)} aria-label={`${n} stars`} aria-pressed={n <= value}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: size, lineHeight: 1, color: n <= value ? "var(--gold)" : "var(--line-strong)", padding: 0 }}>★</button>
      ))}
    </div>
  );
}

export function Avatar({ initials, size = 44 }: { initials: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg,var(--blue),var(--blue-dark))", color: "white",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.32, fontWeight: 700,
    }}>{initials}</div>
  );
}

export function ViewAll({ onClick, text = "View All" }: { onClick: () => void; text?: string }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--blue)", fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}>
      {text} <ChevronRight s={14} c="var(--blue)" />
    </button>
  );
}

/** Key / value row inside a card. */
export function KV({ k, v, strong, first }: { k: React.ReactNode; v: React.ReactNode; strong?: boolean; first?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: first ? "none" : "1px solid var(--line)", fontSize: 13 }}>
      <span style={{ color: "var(--ink-soft)" }}>{k}</span>
      <span style={{ fontWeight: strong ? 800 : 600, color: "var(--ink)", textAlign: "right" }}>{v}</span>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 13.5, padding: "30px 12px", margin: 0 }}>{children}</p>;
}

/** Bottom-of-screen toast used by both mobile apps. */
export function Toast({ msg, raised }: { msg: string | null; raised?: boolean }) {
  if (!msg) return null;
  return (
    <div className="fade-up" role="status" style={{
      position: "absolute", left: 16, right: 16, bottom: raised ? 90 : 96, zIndex: 420,
      background: "var(--ink)", color: "white", borderRadius: 14, padding: "12px 16px",
      fontSize: 13.5, fontWeight: 500, boxShadow: "var(--shadow-xl)", textAlign: "center",
    }}>{msg}</div>
  );
}

/** Floating pill bottom nav shared by the customer and technician apps. */
export function PillNav<T extends string>({ tabs, active, onChange }: {
  tabs: { id: T; label: string; icon: (c: string) => React.ReactNode; dot?: number | boolean }[]; active: T; onChange: (t: T) => void;
}) {
  return (
    <div className="no-print" style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 14px calc(10px + env(safe-area-inset-bottom))", pointerEvents: "none", zIndex: 50 }}>
      <nav style={{
        display: "flex", background: "rgba(255,255,255,0.94)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        borderRadius: 999, padding: 4, boxShadow: "0 8px 24px rgba(15,23,41,0.14)", pointerEvents: "auto",
      }}>
        {tabs.map((t) => {
          const on = t.id === active;
          const color = on ? "var(--blue)" : "var(--ink)";
          return (
            <button key={t.id} aria-label={t.label} aria-current={on ? "page" : undefined} onClick={() => onChange(t.id)} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative",
              background: on ? "var(--blue-tint)" : "transparent", border: "none", borderRadius: 999, cursor: "pointer", padding: "6px 0 5px",
              transition: "background 0.2s",
            }}>
              {t.icon(color)}
              <span style={{ fontSize: 10.5, fontWeight: on ? 600 : 500, color }}>{t.label}</span>
              {!!t.dot && !on && (
                <span style={{
                  position: "absolute", top: 3, left: "calc(50% + 5px)", minWidth: 16, height: 16, padding: "0 4px", borderRadius: 10,
                  background: "var(--red)", border: "1.5px solid white", color: "white", fontSize: 9.5, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{typeof t.dot === "number" ? t.dot : ""}</span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** 430px phone shell — the page never scrolls, only the content area. */
export function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--app-bg)", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 430, height: "100%", position: "relative", background: "var(--app-bg)", overflow: "hidden", boxShadow: "var(--shadow-float)", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

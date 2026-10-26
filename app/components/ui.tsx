"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrandMark, Wordmark } from "./Brand";
import { BackIcon, BellIcon, ChevronRight, SearchIcon } from "./icons";

/* Mobile building blocks shared by the customer and technician apps (ported from zevto). */

/** Detail-page header: back arrow + title on the canvas, optional actions right. */
export function PageHeader({ title, sub, onBack, right }: { title: string; sub?: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "18px 16px 12px",
      position: "sticky", top: 0, zIndex: 20, background: "#fff", borderBottom: "1px solid var(--line)", marginBottom: 12,
    }}>
      {onBack && (
        <button onClick={onBack} aria-label="Back" className="press" style={iconBtn}>
          <BackIcon c="var(--ink)" />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em" }}>{title}</h2>
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

/** Text tabs with a dot under the active one (Bada Business style). */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--surface)", borderRadius: 10, padding: "4px 6px 2px", boxShadow: "var(--shadow-card)" }}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} aria-pressed={on} style={{
            flex: 1, border: "none", cursor: "pointer", background: "transparent",
            padding: "9px 6px 4px", fontSize: 14, fontWeight: on ? 600 : 500,
            color: on ? "var(--ink)" : "var(--ink-mute)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          }}>{t.label}<span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: on ? "var(--ink)" : "transparent" }} /></button>
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
  const bg = tone === "gold" ? "var(--gold)" : tone === "green" ? "#15803d" : "#111";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="press" style={{
      width: "100%", border: "none", borderRadius: 10, padding: "15px 18px",
      fontSize: 15, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      background: disabled ? "var(--line-strong)" : bg,
      color: disabled ? "var(--ink-mute)" : tone === "gold" ? "#111" : "white",
      boxShadow: "none",
      ...style,
    }}>{children}</button>
  );
}

export function GhostButton({ children, onClick, danger, style }: { children: React.ReactNode; onClick?: () => void; danger?: boolean; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} className="press" style={{
      width: "100%", border: `1.5px solid ${danger ? "#fecaca" : "var(--line-strong)"}`, background: "var(--surface)", borderRadius: 10, padding: 13,
      fontSize: 14, fontWeight: 700, color: danger ? "var(--error-text)" : "var(--text-secondary)", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 6, ...style,
    }}>{children}</button>
  );
}

export const card: React.CSSProperties = {
  background: "var(--surface)", borderRadius: 12, boxShadow: "var(--shadow-card)",
};

export const label: React.CSSProperties = {
  display: "block", margin: "0 0 8px", fontSize: 13.5, fontWeight: 600, color: "var(--ink)",
};

export const field: React.CSSProperties = {
  width: "100%", background: "var(--surface)", border: "1.5px solid var(--line-strong)",
  borderRadius: 10, padding: "13px 14px", fontSize: 14, color: "var(--ink)", outline: "none",
};

export const small: React.CSSProperties = { margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.5 };

export const sectionTitle: React.CSSProperties = { margin: "22px 2px 10px", fontSize: 17, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--ink)" };

/** Sticky footer bar for detail pages with a main action. */
export function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-print" style={{
      position: "sticky", bottom: 0, zIndex: 20,
      padding: "12px 16px calc(14px + env(safe-area-inset-bottom))",
      background: "linear-gradient(to top, var(--app-bg) 75%, rgba(246,246,247,0))",
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
      background: on ? "#15803d" : "var(--line-strong)", transition: "background 0.2s",
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
            border: on ? "1.5px solid #111" : "1.5px solid var(--line-strong)", borderRadius: 999, padding: "8px 13px",
            background: on ? "#111" : "var(--surface)", color: on ? "white" : "var(--text-secondary)",
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
      background: "#111", color: "var(--gold)", border: "2px solid var(--gold)",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.32, fontWeight: 700,
    }}>{initials}</div>
  );
}

export function ViewAll({ onClick, text = "See All" }: { onClick: () => void; text?: string }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink)", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 2 }}>
      {text}
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

/** Flat bottom tab bar (Bada Business style) shared by the customer and technician apps. */
export function PillNav<T extends string>({ tabs, active, onChange }: {
  tabs: { id: T; label: string; icon: (c: string) => React.ReactNode; dot?: number | boolean }[]; active: T; onChange: (t: T) => void;
}) {
  return (
    <div className="no-print" style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 50 }}>
      <nav aria-label="Main navigation" style={{
        display: "flex", background: "#fff", borderTop: "1px solid var(--line)", boxShadow: "0 -4px 16px rgba(0,0,0,0.05)",
        padding: "6px 4px calc(6px + env(safe-area-inset-bottom))",
      }}>
        {tabs.map((t) => {
          const on = t.id === active;
          const color = on ? "#111" : "#8a8d93";
          return (
            <button key={t.id} aria-label={t.label} aria-current={on ? "page" : undefined} onClick={() => onChange(t.id)} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative",
              background: "transparent", border: "none", cursor: "pointer", padding: "6px 0 4px",
            }}>
              <span aria-hidden style={{ position: "absolute", top: -6, width: 26, height: 3, borderRadius: "0 0 3px 3px", background: on ? "#111" : "transparent" }} />
              {t.icon(color)}
              <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500, color }}>{t.label}</span>
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

/** Responsive mobile workspace with a desktop companion panel. */
export function PhoneShell({ children, role = "customer" }: { children: React.ReactNode; role?: "customer" | "technician" }) {
  const technician = role === "technician";
  return (
    <div className="workspace-backdrop">
      <aside className="workspace-intro">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}><BrandMark size={48} /><Wordmark /></div>
        <h2>{technician ? <>Great service.<br />Starts with you.</> : <>A little care.<br />A lot more cool.</>}</h2>
        <p>{technician ? "Your working day, in one place. Stay on top of your jobs, keep track of parts, and take care of every customer." : "From the first booking to the final repair, keep your home comfortable with AC care from Pushpak."}</p>
        <div className="workspace-links" aria-label="Switch workspace">
          <Link href="/" aria-current={!technician ? "page" : undefined}>Customer</Link>
          <Link href="/technician" aria-current={technician ? "page" : undefined}>Technician</Link>
          <Link href="/admin">Admin ↗</Link>
        </div>
      </aside>
      <div className={`phone-workspace ${role}-workspace`}>{children}</div>
    </div>
  );
}

/* ───────────── Bada Business style home blocks ───────────── */

/** Sticky white top bar: menu (or brand) left, centred logo + wordmark, search and bell right. */
export function AppHeader({ onMenu, onSearch, onBell, unread = 0, tagline = "AC Sales · Service · Repair" }: {
  onMenu?: () => void; onSearch?: () => void; onBell?: () => void; unread?: number; tagline?: string;
}) {
  return (
    <header className="bb-header">
      {onMenu ? (
        <button className="bb-icon-btn press" onClick={onMenu} aria-label="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h12M4 18h16" /></svg>
        </button>
      ) : <BrandMark size={36} />}
      <div className="bb-logo">
        {onMenu && <BrandMark size={30} />}
        <div style={{ lineHeight: 1.05, textAlign: "left" }}>
          <p style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", color: "#111" }}>Pushpak</p>
          <p style={{ margin: "1px 0 0", fontSize: 8.5, fontWeight: 600, letterSpacing: "0.04em", color: "#555" }}>{tagline}</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {onSearch && <button className="bb-icon-btn press" onClick={onSearch} aria-label="Search"><SearchIcon s={22} c="#111" /></button>}
        {onBell && (
          <button className="bb-icon-btn ring press" onClick={onBell} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
            <BellIcon s={19} c="#111" />
            {unread > 0 && <span className="bb-badge">{unread}</span>}
          </button>
        )}
      </div>
    </header>
  );
}

export function Hello({ name, sub }: { name: string; sub?: React.ReactNode }) {
  return (
    <div className="bb-hello">
      Hello, <b>{name}</b>
      {sub && <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2, letterSpacing: 0 }}>{sub}</div>}
    </div>
  );
}

export type Banner = { title: React.ReactNode; text: string; cta: string; art: string; onClick: () => void };

/** Swipeable promo banners with auto-advance and dots. */
export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => {
      const el = ref.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / (el.scrollWidth / banners.length)) + 1) % banners.length;
      const child = el.children[next] as HTMLElement | undefined;
      if (child) el.scrollTo({ left: child.offsetLeft - 16, behavior: "smooth" });
    }, 4500);
    return () => clearInterval(t);
  }, [banners.length]);
  return (
    <div>
      <div ref={ref} className="bb-carousel" onScroll={(e) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / (el.scrollWidth / banners.length))); }}>
        {banners.map((b, n) => (
          <button key={n} className="bb-banner press" onClick={b.onClick}>
            <h3>{b.title}</h3>
            <p>“{b.text}”</p>
            <span className="bb-chip">{b.cta} ›</span>
            <span className="bb-art" aria-hidden>{b.art}</span>
          </button>
        ))}
      </div>
      {banners.length > 1 && <div className="bb-dots" aria-hidden>{banners.map((_, n) => <span key={n} className={n === i ? "on" : ""} />)}</div>}
    </div>
  );
}

export type Tile = { icon: React.ReactNode; label: string; onClick: () => void; count?: number };

/** 2-column black tiles with gold borders. */
export function GoldTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="bb-tiles">
      {tiles.map((t) => (
        <button key={t.label} className="bb-tile press" onClick={t.onClick}>
          <span className="bb-tile-icon" aria-hidden>{t.icon}</span>
          <span>{t.label}</span>
          {!!t.count && <span className="bb-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** "Popular Courses ……… See All" section heading. */
export function SectionHead({ title, onAll, allText = "See All" }: { title: string; onAll?: () => void; allText?: string }) {
  return (
    <div className="bb-section">
      <h3>{title}</h3>
      {onAll && <button onClick={onAll}>{allText}</button>}
    </div>
  );
}

/** Single-choice dropdown (native select — the phone shows its own picker). */
export function Dropdown<T extends string>({ label: l, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: readonly T[] }) {
  return (
    <div style={{ position: "relative" }}>
      <select aria-label={l} value={value} onChange={(e) => onChange(e.target.value as T)} style={{ ...field, appearance: "none", WebkitAppearance: "none", paddingRight: 38, fontWeight: 600, cursor: "pointer" }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <span aria-hidden style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 12, color: "var(--ink-soft)" }}>▼</span>
    </div>
  );
}

/** Pick-several dropdown: shows the picks; tap to open a checklist. */
export function MultiDropdown<T extends string>({ label: l, value, onToggle, options, placeholder = "Select" }: { label: string; value: T[]; onToggle: (v: T) => void; options: readonly T[]; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" aria-label={l} aria-expanded={open} onClick={() => setOpen(!open)} style={{ ...field, textAlign: "left", cursor: "pointer", fontWeight: 600, paddingRight: 38, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value.length ? value.join(", ") : <span style={{ color: "var(--ink-mute)", fontWeight: 500 }}>{placeholder}</span>}
      </button>
      <span aria-hidden style={{ position: "absolute", right: 14, top: 16, pointerEvents: "none", fontSize: 12, color: "var(--ink-soft)" }}>{open ? "▲" : "▼"}</span>
      {open && (
        <div role="listbox" aria-multiselectable="true" style={{ marginTop: 6, background: "var(--surface)", border: "1.5px solid var(--line-strong)", borderRadius: 10, maxHeight: 260, overflowY: "auto", boxShadow: "var(--shadow-lg)" }}>
          {options.map((o) => {
            const on = value.includes(o);
            return (
              <label key={o} role="option" aria-selected={on} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: "1px solid var(--line)", fontSize: 14, cursor: "pointer", fontWeight: on ? 700 : 500 }}>
                <input type="checkbox" checked={on} onChange={() => onToggle(o)} style={{ width: 18, height: 18, accentColor: "#111" }} /> {o}
              </label>
            );
          })}
          <button type="button" onClick={() => setOpen(false)} style={{ width: "100%", border: "none", background: "#111", color: "#fff", padding: 11, fontWeight: 700, fontSize: 13.5, cursor: "pointer", position: "sticky", bottom: 0 }}>Done</button>
        </div>
      )}
    </div>
  );
}

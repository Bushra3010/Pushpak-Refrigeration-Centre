"use client";

import { SearchIcon } from "../components/icons";
import { TONES, type Tone } from "../components/ui";

/* Desktop building blocks for the admin panel (ported from zevto) — same tokens as the apps,
 * denser layout. */

// One tone palette for the apps and the admin panel.
export type { Tone };

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONES[tone];
  return <span style={{ background: t.bg, color: t.fg, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>{children}</span>;
}

export function Panel({ title, actions, children, pad = true }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; pad?: boolean }) {
  return (
    <section style={{ background: "var(--surface)", borderRadius: 16, boxShadow: "var(--shadow-card)", border: "1px solid var(--line)", minWidth: 0 }}>
      {(title || actions) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h3>
          {actions && <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
        </div>
      )}
      <div style={pad ? { padding: 16 } : undefined}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone = "blue" }: { label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 16, padding: "14px 16px", boxShadow: "var(--shadow-card)", border: "1px solid var(--line)", borderTop: `3px solid ${TONES[tone].fg}` }}>
      <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)", fontWeight: 500 }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: "var(--ink)" }}>{value}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ink-mute)" }}>{sub}</p>}
    </div>
  );
}

export interface Col<T> {
  key: string;
  head: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  width?: number | string;
}

/** Scrolls sideways on narrow screens instead of squashing columns. */
export function Table<T>({ cols, rows, rowKey, empty = "Nothing to show." }: { cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string; empty?: string }) {
  return (
    <div className="no-scroll" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} style={{ textAlign: c.align ?? "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap", width: c.width, background: "var(--bg-secondary)" }}>{c.head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="admin-row">
              {cols.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? "left", padding: "11px 14px", borderBottom: "1px solid var(--line)", verticalAlign: "middle" }}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} style={{ padding: "32px 14px", textAlign: "center", color: "var(--ink-mute)" }}>{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Btn({ children, onClick, kind = "primary", disabled, small, type = "button" }: {
  children: React.ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger" | "gold"; disabled?: boolean; small?: boolean; type?: "button" | "submit";
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "var(--blue)", color: "white", border: "1px solid var(--blue)" },
    gold: { background: "var(--gold)", color: "white", border: "1px solid var(--gold)" },
    ghost: { background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--line-strong)" },
    danger: { background: "var(--surface)", color: "var(--error-text)", border: "1px solid #fecaca" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="press" style={{
      ...styles[kind], borderRadius: 10, padding: small ? "5px 10px" : "8px 14px", fontSize: small ? 12 : 13, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-secondary)", borderRadius: 10, padding: "7px 10px", minWidth: 200 }}>
      <SearchIcon s={16} c="var(--ink-mute)" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: "var(--ink)", flex: 1, minWidth: 0 }} />
    </label>
  );
}

/** Pill filter row: All / Placed / Shipped … */
export function Filter<T extends string>({ options, value, onChange, counts }: { options: T[]; value: T; onChange: (v: T) => void; counts?: Partial<Record<T, number>> }) {
  return (
    <div className="no-scroll" style={{ display: "flex", gap: 6, overflowX: "auto" }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <button key={o} onClick={() => onChange(o)} aria-pressed={on} style={{
            border: "none", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            background: on ? "var(--blue)" : "var(--bg-secondary)", color: on ? "white" : "var(--text-secondary)",
          }}>{o}{counts?.[o] !== undefined && <span style={{ opacity: 0.7, marginLeft: 5 }}>{counts[o]}</span>}</button>
        );
      })}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, width = 480 }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,41,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade-up" style={{ width: "100%", maxWidth: width, maxHeight: "92vh", overflowY: "auto", background: "var(--surface)", borderRadius: 18, boxShadow: "var(--shadow-xl)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 20, lineHeight: 1, cursor: "pointer", color: "var(--ink-mute)" }}>×</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 18px", borderTop: "1px solid var(--line)" }}>{footer}</div>}
      </div>
    </div>
  );
}

export const input: React.CSSProperties = {
  width: "100%", background: "var(--surface)", border: "1.5px solid var(--line-strong)", borderRadius: 10,
  padding: "9px 11px", fontSize: 13.5, color: "var(--ink)", outline: "none",
};

export const fieldLabel: React.CSSProperties = { display: "block", margin: "0 0 6px", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" };

export const muted: React.CSSProperties = { fontSize: 12, color: "var(--ink-mute)" };

export function Initials({ name, size = 30 }: { name: string; size?: number }) {
  const t = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: "var(--blue-tint)", color: "var(--blue)", fontSize: size * 0.36, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{t}</span>;
}

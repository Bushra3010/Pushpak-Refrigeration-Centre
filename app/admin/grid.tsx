"use client";

import { useMemo, useState } from "react";
import { Btn, SearchBox } from "./kit";

/* Finance tables: column picker, search, per-column filters, sorting, totals,
 * pagination, sideways scroll and CSV export. Same look as kit.Table. */

export interface GridCol<T> {
  key: string;
  head: string;
  /** raw value used for sorting, filters, totals and CSV */
  value: (row: T) => string | number | null | undefined;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right";
  hidden?: boolean;
  filter?: boolean;
  total?: boolean;
  money?: boolean;
}

const money = (n: number) => `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name.endsWith(".csv") ? name : `${name}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function DataGrid<T>({ cols, rows, rowKey, exportName, pageSize = 12, empty = "Nothing to show.", toolbar }: {
  cols: GridCol<T>[]; rows: T[]; rowKey: (r: T) => string; exportName: string; pageSize?: number; empty?: string; toolbar?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(() => new Set(cols.filter((c) => !c.hidden).map((c) => c.key)));
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);
  const [picker, setPicker] = useState(false);
  const visible = cols.filter((c) => shown.has(c.key));

  const options = useMemo(() => Object.fromEntries(cols.filter((c) => c.filter).map((c) => [c.key, [...new Set(rows.map((r) => String(c.value(r) ?? "")).filter(Boolean))].sort()])), [cols, rows]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => Object.entries(filters).every(([k, v]) => !v || String(cols.find((c) => c.key === k)?.value(r) ?? "") === v)
      && (!needle || cols.some((c) => String(c.value(r) ?? "").toLowerCase().includes(needle))));
    if (sort) {
      const c = cols.find((x) => x.key === sort.key)!;
      out = [...out].sort((a, b) => {
        const x = c.value(a), y = c.value(b);
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
      });
    }
    return out;
  }, [rows, q, filters, sort, cols]);
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages - 1);
  const slice = list.slice(cur * size, cur * size + size);
  const totals = visible.some((c) => c.total) ? Object.fromEntries(visible.filter((c) => c.total).map((c) => [c.key, list.reduce((a, r) => a + (Number(c.value(r)) || 0), 0)])) : null;
  const fmt = (c: GridCol<T>, v: number) => (c.money ? money(v) : (Math.round(v * 100) / 100).toLocaleString("en-IN"));

  const th: React.CSSProperties = { padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap", background: "var(--bg-secondary)" };
  const sel: React.CSSProperties = { border: "1.5px solid var(--line-strong)", borderRadius: 10, padding: "6px 8px", fontSize: 12.5, background: "var(--surface)", color: "var(--ink)", maxWidth: 190 };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search" />
        {cols.filter((c) => c.filter).map((c) => (
          <select key={c.key} value={filters[c.key] ?? ""} onChange={(e) => { setFilters({ ...filters, [c.key]: e.target.value }); setPage(0); }} style={sel} aria-label={`Filter ${c.head}`}>
            <option value="">All {c.head.toLowerCase()}</option>
            {options[c.key].map((o) => <option key={o}>{o}</option>)}
          </select>
        ))}
        {toolbar}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, position: "relative" }}>
          <Btn small kind="ghost" onClick={() => setPicker(!picker)}>Columns ▾</Btn>
          {picker && (
            <div style={{ position: "absolute", right: 0, top: 34, zIndex: 30, width: 230, maxHeight: 320, overflowY: "auto", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "var(--shadow-xl)", padding: 8 }}>
              {cols.map((c) => (
                <label key={c.key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "5px 6px" }}>
                  <input type="checkbox" checked={shown.has(c.key)} onChange={() => { const n = new Set(shown); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); setShown(n); }} />{c.head}
                </label>
              ))}
            </div>
          )}
          <Btn small kind="ghost" onClick={() => downloadCsv(exportName, [visible.map((c) => c.head), ...list.map((r) => visible.map((c) => c.value(r) ?? ""))])}>⬇ CSV</Btn>
        </div>
      </div>
      <div className="no-scroll" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr>{visible.map((c) => (
              <th key={c.key} style={{ ...th, textAlign: c.align ?? (c.money || c.total ? "right" : "left") }}>
                <button onClick={() => setSort(sort?.key === c.key ? (sort.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textTransform: "inherit", letterSpacing: "inherit" }}>
                  {c.head}{sort?.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={rowKey(r)} className="admin-row">
                {visible.map((c) => {
                  const v = c.value(r);
                  return (
                    <td key={c.key} style={{ textAlign: c.align ?? (c.money || c.total ? "right" : "left"), padding: "10px 12px", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: c.money && Number(v) < 0 ? "var(--error-text)" : undefined }}>
                      {c.render ? c.render(r) : c.money && typeof v === "number" ? money(v) : v ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!slice.length && <tr><td colSpan={visible.length} style={{ padding: "30px 14px", textAlign: "center", color: "var(--ink-mute)" }}>{empty}</td></tr>}
          </tbody>
          {totals && list.length > 0 && (
            <tfoot>
              <tr>{visible.map((c, i) => (
                <td key={c.key} style={{ padding: "10px 12px", fontWeight: 800, background: "var(--bg-secondary)", textAlign: c.total ? "right" : "left", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  {c.key in totals ? fmt(c, totals[c.key]) : i === 0 ? `Total (${list.length})` : ""}
                </td>
              ))}</tr>
            </tfoot>
          )}
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "10px 16px", fontSize: 12, color: "var(--ink-mute)" }}>
        <span>{list.length} of {rows.length} rows</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} style={sel} aria-label="Rows per page">{[10, 12, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}</select>
          <Btn small kind="ghost" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹</Btn>
          {cur + 1} / {pages}
          <Btn small kind="ghost" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>›</Btn>
        </span>
      </div>
    </div>
  );
}

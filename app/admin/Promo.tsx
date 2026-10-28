"use client";

import { useState } from "react";
import { shrinkPhoto } from "../components/repair";
import { SpareSlide } from "../customer/SpareParts";
import { fmtDateTime, type Db } from "../lib/data";
import { ENQUIRY_STATUSES, PROMO_ART, PROMO_ART_LABEL, validateBanner, type BannerDraft, type EnquiryStatus, type PartEnquiry, type PromoArt, type PromoBanner } from "../lib/promo";
import { addBanner, deleteBanner, moveBanner, setEnquiryStatus, updateBanner } from "../lib/store";
import { Badge, Btn, Filter, Modal, Panel, SearchBox, Stat, Table, fieldLabel, input, muted } from "./kit";

/* Admin → Spare Parts Promo: full control of the "Explore More at Pushpak" slider on the customer
 * home page (add, edit, delete, enable/disable, order, photo) and the enquiries it brings in. */

const EMPTY: BannerDraft = { category: "", title: "", subtitle: "", parts: [], art: "parts", image: null, cta: "Enquire Now", enabled: true };
const TONE: Record<EnquiryStatus, "blue" | "amber" | "purple" | "green" | "grey"> = { New: "blue", Contacted: "amber", Quoted: "purple", Sold: "green", Closed: "grey" };

export function PromoSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const banners = [...(db.promoBanners ?? [])].sort((a, b) => a.order - b.order);
  const enquiries = db.partEnquiries ?? [];
  const [edit, setEdit] = useState<{ id: string | null; draft: BannerDraft } | null>(null);
  const [del, setDel] = useState<PromoBanner | null>(null);
  const [preview, setPreview] = useState<PromoBanner | null>(null);
  const [f, setF] = useState<"All" | EnquiryStatus>("New");
  const [q, setQ] = useState("");
  const [enq, setEnq] = useState<PartEnquiry | null>(null);
  const live = banners.filter((b) => b.enabled).length;
  const counts = Object.fromEntries((["All", ...ENQUIRY_STATUSES] as const).map((s) => [s, s === "All" ? enquiries.length : enquiries.filter((e) => e.status === s).length])) as Partial<Record<"All" | EnquiryStatus, number>>;
  const rows = enquiries.filter((e) => f === "All" || e.status === f).filter((e) => !q.trim() || `${e.id} ${e.name} ${e.phone} ${e.category} ${e.part} ${e.appliance}`.toLowerCase().includes(q.toLowerCase()));
  const byCat = banners.map((b) => ({ b, n: enquiries.filter((e) => e.bannerId === b.id).length }));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="admin-grid-4">
        <Stat label="Live banners" value={`${live} / ${banners.length}`} sub="shown on the customer home page" tone="blue" />
        <Stat label="New enquiries" value={String(counts.New ?? 0)} sub="waiting for a call back" tone={counts.New ? "amber" : "green"} />
        <Stat label="Sold" value={String(counts.Sold ?? 0)} sub={`of ${enquiries.length} enquiries`} tone="green" />
        <Stat label="Top category" value={byCat.sort((a, b) => b.n - a.n)[0]?.b.category.replace(" Spare Parts", "") ?? "—"} sub={`${byCat[0]?.n ?? 0} enquiries`} tone="teal" />
      </div>

      <Panel title="Explore More at Pushpak — banners" actions={<Btn onClick={() => setEdit({ id: null, draft: { ...EMPTY } })}>＋ Add Banner</Btn>} pad={false}>
        <p style={{ ...muted, margin: 0, padding: "10px 16px 0" }}>Only enabled banners show, in this order, on the customer home page. Auto-slides every 4 seconds.</p>
        <Table<PromoBanner> rowKey={(b) => b.id} rows={banners} empty="No banners yet — add one." cols={[
          { key: "order", head: "#", width: 70, render: (b) => { const i = banners.indexOf(b); return <div style={{ display: "flex", gap: 4 }}><Btn small kind="ghost" disabled={i === 0} onClick={() => moveBanner(b.id, -1, who)}>↑</Btn><Btn small kind="ghost" disabled={i === banners.length - 1} onClick={() => moveBanner(b.id, 1, who)}>↓</Btn></div>; } },
          { key: "banner", head: "Banner", render: (b) => <div><b>{b.title}</b><div style={muted}>{b.category} · {b.image ? "photo" : `${PROMO_ART_LABEL[b.art]} art`}</div></div> },
          { key: "parts", head: "Parts shown", render: (b) => <span style={muted}>{b.parts.join(", ") || "—"}</span> },
          { key: "status", head: "Status", render: (b) => <Badge tone={b.enabled ? "green" : "grey"}>{b.enabled ? "Enabled" : "Disabled"}</Badge> },
          { key: "updated", head: "Updated", render: (b) => <span style={muted}>{fmtDateTime(b.updatedAt)} · {b.updatedBy}</span> },
          { key: "actions", head: "", render: (b) => (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Btn small kind="ghost" onClick={() => setPreview(b)}>Preview</Btn>
              <Btn small kind="ghost" onClick={() => setEdit({ id: b.id, draft: { category: b.category, title: b.title, subtitle: b.subtitle, parts: [...b.parts], art: b.art, image: b.image, cta: b.cta, enabled: b.enabled } })}>Edit</Btn>
              <Btn small kind={b.enabled ? "ghost" : "primary"} onClick={() => { updateBanner(b.id, { enabled: !b.enabled }, who); notify(b.enabled ? `"${b.title}" hidden` : `"${b.title}" is live`); }}>{b.enabled ? "Disable" : "Enable"}</Btn>
              <Btn small kind="danger" onClick={() => setDel(b)}>Delete</Btn>
            </div>
          ) },
        ]} />
      </Panel>

      <Panel title="Spare part enquiries" actions={<SearchBox value={q} onChange={setQ} placeholder="Search name, mobile, part…" />} pad={false}>
        <div style={{ padding: "12px 16px 0" }}><Filter options={["All", ...ENQUIRY_STATUSES]} value={f} onChange={setF} counts={counts} /></div>
        <Table<PartEnquiry> rowKey={(e) => e.id} rows={rows} empty="No enquiries here." cols={[
          { key: "id", head: "Enquiry", render: (e) => <div><b>{e.id}</b><div style={muted}>{fmtDateTime(e.at)}</div></div> },
          { key: "cust", head: "Customer", render: (e) => <div>{e.name}<div style={muted}>{e.phone}</div></div> },
          { key: "need", head: "Needs", render: (e) => <div><b>{e.part}</b><div style={muted}>{e.category}{e.appliance ? ` · ${e.appliance}` : ""}</div></div> },
          { key: "status", head: "Status", render: (e) => <Badge tone={TONE[e.status]}>{e.status}</Badge> },
          { key: "act", head: "", render: (e) => (
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small kind="ghost" onClick={() => window.open(`tel:${e.phone}`)}>Call</Btn>
              <Btn small kind="ghost" onClick={() => window.open(`https://wa.me/91${e.phone}?text=${encodeURIComponent(`Namaste ${e.name}, Pushpak Refrigeration Centre here about your enquiry ${e.id} for ${e.part}${e.appliance ? ` (${e.appliance})` : ""}.`)}`, "_blank", "noopener")}>WhatsApp</Btn>
              <Btn small onClick={() => setEnq(e)}>Update</Btn>
            </div>
          ) },
        ]} />
      </Panel>

      {edit && <BannerModal draft={edit.draft} isNew={!edit.id} onClose={() => setEdit(null)} onSave={(d) => {
        if (edit.id) { const e = updateBanner(edit.id, d, who); if (e) return e; notify("Banner updated"); }
        else { const r = addBanner(d, who); if ("error" in r) return r.error; notify(d.enabled ? "Banner added — live on the customer app" : "Banner added (disabled)"); }
        setEdit(null); return null;
      }} />}
      {del && (
        <Modal title="Delete banner?" onClose={() => setDel(null)} footer={<><Btn kind="ghost" onClick={() => setDel(null)}>Cancel</Btn><Btn kind="danger" onClick={() => { deleteBanner(del.id, who); notify(`"${del.title}" deleted`); setDel(null); }}>Delete</Btn></>}>
          <p style={{ margin: 0, fontSize: 14 }}>&ldquo;{del.title}&rdquo; ({del.category}) will be removed from the customer home page. Past enquiries are kept. To hide it for a while instead, use Disable.</p>
        </Modal>
      )}
      {preview && <Modal title="Preview — as customers see it" onClose={() => setPreview(null)} width={420}><SpareSlide b={preview} /></Modal>}
      {enq && <EnquiryModal e={enq} onClose={() => setEnq(null)} onSave={(s, note) => { setEnquiryStatus(enq.id, s, note, who); notify(`${enq.id} → ${s}`); setEnq(null); }} />}
    </div>
  );
}

function BannerModal({ draft, isNew, onClose, onSave }: { draft: BannerDraft; isNew: boolean; onClose: () => void; onSave: (d: BannerDraft) => string | null }) {
  const [d, setD] = useState(draft);
  const [partsText, setPartsText] = useState(draft.parts.join(", "));
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<BannerDraft>) => setD((x) => ({ ...x, ...p }));
  const full = { ...d, parts: partsText.split(",").map((x) => x.trim()).filter(Boolean) };
  const save = () => { const e = validateBanner(full) ?? onSave(full); if (e) setErr(e); };
  const photo = async (fl: FileList | null) => { if (!fl?.[0]) return; try { set({ image: await shrinkPhoto(fl[0], 900) }); } catch { setErr("Could not read the photo."); } };
  return (
    <Modal title={isNew ? "Add banner" : "Edit banner"} onClose={onClose} width={760} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}>{isNew ? "Add Banner" : "Save Changes"}</Btn></>}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18 }} className="form-grid">
        <div>
          <L t="Category *"><input value={d.category} onChange={(e) => set({ category: e.target.value })} placeholder="e.g. AC Spare Parts" style={input} list="promo-cats" />
            <datalist id="promo-cats">{["AC Spare Parts", "Refrigerator Spare Parts", "Washing Machine Spare Parts", "Microwave Oven Spare Parts", "Water Purifier Spare Parts"].map((c) => <option key={c} value={c} />)}</datalist></L>
          <L t={`Title * (${d.title.length}/40)`}><input value={d.title} onChange={(e) => set({ title: e.target.value })} style={input} /></L>
          <L t={`Subtitle (${d.subtitle.length}/90)`}><input value={d.subtitle} onChange={(e) => set({ subtitle: e.target.value })} style={input} /></L>
          <L t="Parts shown as tags (comma separated)"><input value={partsText} onChange={(e) => setPartsText(e.target.value)} placeholder="PCB, Compressor, Fan Motor" style={input} /></L>
          <L t="Button text *"><input value={d.cta} onChange={(e) => set({ cta: e.target.value })} style={input} /></L>
          <L t="Artwork (used when there is no photo)">
            <select value={d.art} onChange={(e) => set({ art: e.target.value as PromoArt })} style={input}>{PROMO_ART.map((a) => <option key={a} value={a}>{PROMO_ART_LABEL[a]}</option>)}</select>
          </L>
          <span style={fieldLabel}>Product photo</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <label style={{ ...input, width: "auto", cursor: "pointer", fontWeight: 600 }}>📷 {d.image ? "Change photo" : "Upload photo"}<input type="file" accept="image/*" onChange={(e) => photo(e.target.files)} style={{ display: "none" }} /></label>
            {d.image && <Btn small kind="ghost" onClick={() => set({ image: null })}>Remove photo</Btn>}
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, fontWeight: 600 }}><input type="checkbox" checked={d.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Enabled (show on the customer home page)</label>
          {err && <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
        </div>
        <div>
          <span style={fieldLabel}>Live preview</span>
          <SpareSlide b={{ ...full, id: "preview", order: 0, updatedAt: "", updatedBy: "" }} />
          <p style={{ ...muted, marginTop: 8 }}>Upload a wide photo (landscape). It is shown darkened behind the text.</p>
        </div>
      </div>
    </Modal>
  );
}

/* Outside the modal so inputs keep focus while typing. */
function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label style={{ display: "block", marginBottom: 12 }}><span style={fieldLabel}>{t}</span>{children}</label>;
}

function EnquiryModal({ e, onClose, onSave }: { e: PartEnquiry; onClose: () => void; onSave: (s: EnquiryStatus, note: string) => void }) {
  const [s, setS] = useState<EnquiryStatus>(e.status);
  const [note, setNote] = useState("");
  return (
    <Modal title={`${e.id} · ${e.part}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={() => onSave(s, note)}>Save</Btn></>}>
      <p style={{ margin: "0 0 4px", fontSize: 14 }}><b>{e.name}</b> · {e.phone}</p>
      <p style={{ ...muted, margin: "0 0 12px" }}>{e.category}{e.appliance ? ` · ${e.appliance}` : ""}{e.note ? ` · “${e.note}”` : ""}</p>
      <span style={fieldLabel}>Status</span>
      <Filter options={[...ENQUIRY_STATUSES]} value={s} onChange={setS} />
      <label style={{ display: "block", marginTop: 12 }}><span style={fieldLabel}>Note</span><input value={note} onChange={(x) => setNote(x.target.value)} placeholder="Price quoted, part ordered…" style={input} /></label>
      <p style={{ ...fieldLabel, margin: "14px 0 4px" }}>History</p>
      {e.history.map((h, i) => <p key={i} style={{ ...muted, margin: "0 0 3px" }}><b>{h.status}</b> · {fmtDateTime(h.at)} · {h.by}{h.note ? ` — ${h.note}` : ""}</p>)}
    </Modal>
  );
}

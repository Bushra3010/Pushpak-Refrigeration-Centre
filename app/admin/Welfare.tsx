"use client";

import { useState } from "react";
import { CurrentCylinder, LpgForm, UsageSummary, cylinderSummary } from "../components/Lpg";
import { fmtDate, inr, isoDay, type Db } from "../lib/data";
import { addCylinder, completeTask, deleteCylinder, finishCylinder, payRent, saveRoom, updateCylinder } from "../lib/store";
import { CYLINDER_KIND, PERIODS, RENT_MODES, welfareSummary, type PeriodId, STAFF_ROLES, daysOf, emptyRoom, finishedCylinders, rentDueDate, type LpgCylinder, type RentRoom, type RoomDraft, type StaffTask } from "../lib/welfare";
import { addDays as addDaysIso } from "../lib/samples";
import { Badge, Btn, Filter, Modal, Panel, Stat, Table, fieldLabel, input, muted } from "./kit";
import type { Role } from "./System";

/* Admin → Staff Welfare & Facilities: mess LPG cylinders (technician or office can enter), room rent (admin only)
 * and the shop-staff task list that rent due dates and low LPG fill automatically. */

/* ───────────── LPG cylinder tracking ───────────── */

export function LpgSection({ db, who, role, notify, go }: { db: Db; who: string; role: Role; notify: (m: string) => void; go: (s: "rent" | "stafftasks") => void }) {
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<LpgCylinder | null>(null);
  const s = cylinderSummary(db);
  const list = db.cylinders ?? [];
  const history = finishedCylinders(list);
  const t0 = isoDay(0);
  const inHouse = db.techs.filter((t) => t.active).length;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="admin-grid-4">
        <Stat label="Technicians (in-house)" value={String(s.current?.people ?? inHouse)} sub={s.last ? `last cylinder: ${daysOf(s.last, t0)} days · ${s.last.people} people` : "eating at the mess"} tone="blue" />
        <Stat label="Cylinder size" value={s.current ? `${s.current.sizeKg} kg` : "—"} sub={s.current ? CYLINDER_KIND[s.current.sizeKg] : "no cylinder in use"} tone="red" />
        <Stat label="Avg. usage" value={s.min === s.max ? `${s.avg} days` : `${s.min}–${s.max} days`} sub="per cylinder" tone="green" />
        <Stat label="Per cylinder coverage" value={s.peopleMin === s.peopleMax ? `${s.peopleMax || "—"} technicians` : `${s.peopleMin}–${s.peopleMax} technicians`} sub={`${s.current?.meals ?? 2} meals / day`} tone="purple" />
      </div>

      <div className="admin-grid-2">
        <Panel title="⭐ Current cylinder" actions={<>{s.current && <Btn small kind="ghost" onClick={() => { const e = finishCylinder(s.current!.id, t0, who); notify(e ? `⚠ ${e}` : `${s.current!.no} marked finished`); }}>Mark finished today</Btn>}<Btn onClick={() => setAdding(true)}>＋ New cylinder started</Btn></>}>
          <CurrentCylinder db={db} />
        </Panel>
        <Panel title="📊 Usage summary"><UsageSummary db={db} /></Panel>
      </div>

      <WelfarePeriodPanel db={db} />
      <RentStatusPanel db={db} who={who} role={role} notify={notify} go={go} />

      <div className="admin-grid-2">
        <Panel title="🕘 Cylinder history" pad={false}>
          <Table<LpgCylinder> rowKey={(c) => c.id} rows={history} empty="No finished cylinders yet." cols={[
            { key: "n", head: "#", render: (c) => history.indexOf(c) + 1 },
            { key: "no", head: "Cylinder no.", render: (c) => <b>{c.no}</b> },
            { key: "start", head: "Start", render: (c) => fmtDate(c.start) },
            { key: "end", head: "End", render: (c) => fmtDate(c.end!) },
            { key: "days", head: "Days", align: "center", render: (c) => daysOf(c, t0) },
            { key: "people", head: "Technicians", align: "center", render: (c) => <span>{c.people}<div style={muted}>{c.meals ?? 2} meals/day</div></span> },
            { key: "cost", head: "Cost", render: (c) => (c.cost == null ? "—" : inr(c.cost)) },
            { key: "by", head: "Entered by", render: (c) => <span>{c.by}<div style={muted}>{c.byRole === "Admin" ? "Office" : "Technician app"}</div></span> },
            { key: "a", head: "", render: (c) => <Btn small kind="ghost" onClick={() => setEdit(c)}>Edit</Btn> },
          ]} />
        </Panel>
        <Panel title="💡 Reference (14.2 kg domestic cylinder)">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
            <li>Runs around <b>28–32 days</b> for 5–8 technicians (2 meals/day).</li>
            <li>For 6 technicians: about <b>12 cylinders a year</b> (11–13, depending on usage &amp; menu).</li>
            <li>Actual use varies with cooking frequency, menu and number of people.</li>
            <li>A <b>&quot;Book next cylinder&quot;</b> task opens for the shop staff when about 3 days are left.</li>
            <li>Technicians can enter a new cylinder from their app (Home → Mess LPG).</li>
          </ul>
        </Panel>
      </div>

      {adding && (
        <Modal title="New cylinder started" onClose={() => setAdding(false)} width={560}>
          <LpgForm db={db} inp={input} lab={fieldLabel} onCancel={() => setAdding(false)} onSave={(d) => { const e = addCylinder(d, who, "Admin"); if (!e) { setAdding(false); notify(`${d.no} started`); } return e; }} />
        </Modal>
      )}
      {edit && <EditCylinder c={edit} who={who} notify={notify} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditCylinder({ c, who, notify, onClose }: { c: LpgCylinder; who: string; notify: (m: string) => void; onClose: () => void }) {
  const [x, setX] = useState(c);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<LpgCylinder>) => { setX({ ...x, ...p }); setErr(null); };
  return (
    <Modal title={`Edit ${c.no}`} onClose={onClose} width={520} footer={<>
      <Btn kind="danger" onClick={() => { if (confirm(`Delete ${c.no}?`)) { deleteCylinder(c.id, who); notify(`${c.no} deleted`); onClose(); } }}>Delete</Btn>
      <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
      <Btn onClick={() => { const e = updateCylinder(c.id, { no: x.no, start: x.start, end: x.end, people: x.people, meals: x.meals, cost: x.cost, vendor: x.vendor, note: x.note }, who); setErr(e); if (!e) { notify("Saved"); onClose(); } }}>Save</Btn>
    </>}>
      <div className="form-grid">
        <label><span style={fieldLabel}>Cylinder no.</span><input value={x.no} onChange={(e) => set({ no: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Technicians</span><input type="number" value={x.people} onChange={(e) => set({ people: Number(e.target.value) })} style={input} /></label>
        <label><span style={fieldLabel}>Meals per day</span><select value={x.meals ?? 2} onChange={(e) => set({ meals: Number(e.target.value) })} style={input}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label><span style={fieldLabel}>Start</span><input type="date" value={x.start} onChange={(e) => set({ start: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>End</span><input type="date" value={x.end ?? ""} onChange={(e) => set({ end: e.target.value || null })} style={input} /></label>
        <label><span style={fieldLabel}>Cost (₹)</span><input type="number" value={x.cost ?? ""} onChange={(e) => set({ cost: e.target.value === "" ? null : Number(e.target.value) })} style={input} /></label>
        <label><span style={fieldLabel}>Vendor</span><input value={x.vendor} onChange={(e) => set({ vendor: e.target.value })} style={input} /></label>
      </div>
      {err && <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
    </Modal>
  );
}

/* ───────────── Room rent (admin only) ───────────── */

export function RentSection({ db, who, notify }: { db: Db; who: string; notify: (m: string) => void }) {
  const [edit, setEdit] = useState<{ id: string | null; d: RoomDraft } | null>(null);
  const rooms = db.rooms ?? [];
  const pays = db.rentPayments ?? [];
  const t0 = isoDay(0);
  const month = t0.slice(0, 7);
  const paid = (r: RentRoom) => pays.find((p) => p.roomId === r.id && p.month === month);
  const active = rooms.filter((r) => r.active);
  const monthly = active.reduce((s, r) => s + r.amount, 0);
  const paidThisMonth = pays.filter((p) => p.month === month).reduce((s, p) => s + p.amount, 0);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="admin-grid-4">
        <Stat label="Rooms on rent" value={String(active.length)} sub={`${rooms.length - active.length} paused`} tone="blue" />
        <Stat label="Monthly rent" value={inr(monthly)} sub="all active rooms" tone="purple" />
        <Stat label="Paid this month" value={inr(paidThisMonth)} sub={`${active.filter(paid).length}/${active.length} rooms`} tone="green" />
        <Stat label="Pending this month" value={inr(active.filter((r) => !paid(r)).reduce((s, r) => s + r.amount, 0))} sub="task goes to staff before the due date" tone="amber" />
      </div>
      <Panel title="Room rent — only Admin can add or change" actions={<Btn onClick={() => setEdit({ id: null, d: emptyRoom() })}>＋ Add room</Btn>} pad={false}>
        <Table<RentRoom> rowKey={(r) => r.id} rows={rooms} empty="No rooms yet — add the technicians' room / godown on rent." cols={[
          { key: "room", head: "Room / property", render: (r) => <div><b>{r.label}</b>{r.note && <div style={muted}>{r.note}</div>}</div> },
          { key: "landlord", head: "Landlord", render: (r) => <div>{r.landlord}<div style={muted}>{r.phone || "—"}</div></div> },
          { key: "amount", head: "Rent", render: (r) => <b>{inr(r.amount)}</b> },
          { key: "due", head: "Due date", render: (r) => <div>Every month, day {r.dueDay}<div style={muted}>task {r.remindBefore ? `${r.remindBefore} day${r.remindBefore === 1 ? "" : "s"} before` : "on the day"} → {r.assignTo}</div></div> },
          { key: "this", head: month, render: (r) => { const p = paid(r); return !r.active ? <Badge tone="grey">Paused</Badge> : p ? <div><Badge tone="green">Paid</Badge><div style={muted}>{fmtDate(p.paidOn)} · {p.mode}</div></div> : <Badge tone={rentDueDate(r, month) < t0 ? "red" : "amber"}>{rentDueDate(r, month) < t0 ? "Overdue" : `Due ${fmtDate(rentDueDate(r, month))}`}</Badge>; } },
          { key: "a", head: "", render: (r) => <Btn small kind="ghost" onClick={() => setEdit({ id: r.id, d: { ...r } })}>Edit</Btn> },
        ]} />
      </Panel>
      <Panel title="Payment history" pad={false}>
        <Table rowKey={(p) => p.id} rows={pays} empty="No rent paid yet." cols={[
          { key: "m", head: "Month", render: (p) => p.month },
          { key: "r", head: "Room", render: (p) => rooms.find((r) => r.id === p.roomId)?.label ?? "—" },
          { key: "a", head: "Amount", render: (p) => inr(p.amount) },
          { key: "d", head: "Paid on", render: (p) => fmtDate(p.paidOn) },
          { key: "mode", head: "Mode", render: (p) => <span>{p.mode}{p.ref && <div style={muted}>{p.ref}</div>}</span> },
          { key: "by", head: "Paid by", render: (p) => p.by },
        ]} />
      </Panel>
      {edit && <RoomForm init={edit} who={who} notify={notify} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RoomForm({ init, who, notify, onClose }: { init: { id: string | null; d: RoomDraft }; who: string; notify: (m: string) => void; onClose: () => void }) {
  const [d, setD] = useState(init.d);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<RoomDraft>) => { setD({ ...d, ...p }); setErr(null); };
  const save = () => { const e = saveRoom(init.id, d, who); setErr(e); if (!e) { notify("Room rent saved"); onClose(); } };
  return (
    <Modal title={init.id ? "Edit room rent" : "Add room on rent"} onClose={onClose} width={580} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Save</Btn></>}>
      <div className="form-grid">
        <label style={{ gridColumn: "1 / -1" }}><span style={fieldLabel}>Room / property *</span><input value={d.label} onChange={(e) => set({ label: e.target.value })} placeholder="Technician room — Laxmi Nagar" style={input} /></label>
        <label><span style={fieldLabel}>Landlord name *</span><input value={d.landlord} onChange={(e) => set({ landlord: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Landlord mobile</span><input inputMode="numeric" value={d.phone} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} style={input} /></label>
        <label><span style={fieldLabel}>Monthly rent (₹) *</span><input type="number" min={0} value={d.amount || ""} onChange={(e) => set({ amount: Number(e.target.value) })} style={input} /></label>
        <label><span style={fieldLabel}>Due day every month (1–28) *</span><input type="number" min={1} max={28} value={d.dueDay} onChange={(e) => set({ dueDay: Number(e.target.value) })} style={input} /></label>
        <label><span style={fieldLabel}>Show task to staff — days before</span><input type="number" min={0} max={10} value={d.remindBefore} onChange={(e) => set({ remindBefore: Number(e.target.value) })} style={input} /></label>
        <label><span style={fieldLabel}>Task goes to (shop staff)</span><select value={d.assignTo} onChange={(e) => set({ assignTo: e.target.value as RoomDraft["assignTo"] })} style={input}>{STAFF_ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label style={{ gridColumn: "1 / -1" }}><span style={fieldLabel}>Note</span><input value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. 2 rooms, 6 technicians, agreement till Mar 2027" style={input} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}><input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} /> Active (create a task every month)</label>
      </div>
      <p style={{ ...muted, marginTop: 10 }}>On the due date (minus the days above) a <b>“Pay room rent”</b> task appears automatically for {d.assignTo} in <b>Staff Tasks</b> and on their dashboard.</p>
      {err && <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
    </Modal>
  );
}

/* ───────────── Shop-staff tasks ───────────── */

const mineFor = (role: Role) => (t: StaffTask) => role === "Admin" || t.assignTo === role;

export function TasksSection({ db, who, role, notify }: { db: Db; who: string; role: Role; notify: (m: string) => void }) {
  const [f, setF] = useState<"Open" | "Done" | "All">("Open");
  const [pay, setPay] = useState<StaffTask | null>(null);
  const all = (db.staffTasks ?? []).filter(mineFor(role));
  const rows = all.filter((t) => f === "All" || t.status === f).sort((a, b) => (a.status === b.status ? a.due.localeCompare(b.due) : a.status === "Open" ? -1 : 1));
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title={role === "Admin" ? "All shop-staff tasks" : `My tasks · ${role}`} actions={<Filter options={["Open", "Done", "All"] as const as unknown as ("Open" | "Done" | "All")[]} value={f} onChange={setF} counts={{ Open: all.filter((t) => t.status === "Open").length, Done: all.filter((t) => t.status === "Done").length, All: all.length }} />} pad={false}>
        <TaskTable rows={rows} onDo={(t) => (t.kind === "Room Rent" ? setPay(t) : (completeTask(t.id, who), notify("Task done")))} />
      </Panel>
      <p style={{ ...muted, margin: 0 }}>Tasks open automatically: room rent before its due date (set by Admin in Room Rent), and “book next cylinder” when the mess LPG has about 3 days left.</p>
      {pay && <PayRentModal task={pay} db={db} who={who} notify={notify} onClose={() => setPay(null)} />}
    </div>
  );
}

function TaskTable({ rows, onDo }: { rows: StaffTask[]; onDo: (t: StaffTask) => void }) {
  const t0 = isoDay(0);
  return (
    <Table<StaffTask> rowKey={(t) => t.id} rows={rows} empty="No tasks here." cols={[
      { key: "k", head: "Task", render: (t) => <div><Badge tone={t.kind === "Room Rent" ? "purple" : t.kind === "Warranty Expiry" ? "amber" : "red"}>{t.kind === "Room Rent" ? "🏠 Room Rent" : t.kind === "Warranty Expiry" ? "🧾 Warranty" : "🔥 LPG"}</Badge><div style={{ fontWeight: 700, marginTop: 4 }}>{t.title}</div><div style={muted}>{t.detail}</div></div> },
      { key: "due", head: "Due", render: (t) => <span style={{ fontWeight: 600, color: t.status === "Open" && t.due < t0 ? "var(--error-text)" : undefined }}>{fmtDate(t.due)}{t.status === "Open" && t.due < t0 ? " · overdue" : t.due === t0 ? " · today" : ""}</span> },
      { key: "to", head: "Assigned to", render: (t) => t.assignTo },
      { key: "s", head: "Status", render: (t) => t.status === "Done" ? <div><Badge tone="green">Done</Badge><div style={muted}>{t.doneBy} · {t.note}</div></div> : <Badge tone="amber">Open</Badge> },
      { key: "a", head: "", render: (t) => t.status === "Open" ? <Btn small onClick={() => onDo(t)}>{t.kind === "Room Rent" ? "Mark paid" : "Mark done"}</Btn> : null },
    ]} />
  );
}

function PayRentModal({ task, db, who, notify, onClose }: { task: StaffTask; db: Db; who: string; notify: (m: string) => void; onClose: () => void }) {
  const room = (db.rooms ?? []).find((r) => r.id === task.key.split(":")[1]);
  const [p, setP] = useState({ amount: room?.amount ?? 0, paidOn: isoDay(0), mode: "UPI" as (typeof RENT_MODES)[number], ref: "" });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal title="Record rent payment" onClose={onClose} width={480} footer={<><Btn kind="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={() => { const e = payRent(task.id, p, who); setErr(e); if (!e) { notify("Rent payment recorded"); onClose(); } }}>Save — mark paid</Btn></>}>
      <p style={{ margin: "0 0 12px", fontSize: 13.5 }}><b>{task.title}</b><br /><span style={muted}>{task.detail}</span></p>
      <div className="form-grid">
        <label><span style={fieldLabel}>Amount paid (₹)</span><input type="number" value={p.amount || ""} onChange={(e) => setP({ ...p, amount: Number(e.target.value) })} style={input} /></label>
        <label><span style={fieldLabel}>Paid on</span><input type="date" max={isoDay(0)} value={p.paidOn} onChange={(e) => setP({ ...p, paidOn: e.target.value })} style={input} /></label>
        <label><span style={fieldLabel}>Mode</span><select value={p.mode} onChange={(e) => setP({ ...p, mode: e.target.value as typeof p.mode })} style={input}>{RENT_MODES.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label><span style={fieldLabel}>Reference {p.mode === "Cash" ? "(optional)" : "*"}</span><input value={p.ref} onChange={(e) => setP({ ...p, ref: e.target.value })} placeholder="UPI / UTR / cheque no." style={input} /></label>
      </div>
      {err && <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 600, color: "var(--error-text)" }}>{err}</p>}
    </Modal>
  );
}

/** Dashboard panel: open tasks for the signed-in role. */
export function TasksPanel({ db, who, role, notify, onAll }: { db: Db; who: string; role: Role; notify: (m: string) => void; onAll: () => void }) {
  const [pay, setPay] = useState<StaffTask | null>(null);
  const open = (db.staffTasks ?? []).filter(mineFor(role)).filter((t) => t.status === "Open").sort((a, b) => a.due.localeCompare(b.due));
  if (!open.length) return null;
  return (
    <Panel title={`📌 ${role === "Admin" ? "Shop-staff tasks" : "My tasks"} (${open.length})`} actions={<Btn small kind="ghost" onClick={onAll}>Open Staff Tasks</Btn>} pad={false}>
      <TaskTable rows={open.slice(0, 5)} onDo={(t) => (t.kind === "Room Rent" ? setPay(t) : (completeTask(t.id, who), notify("Task done")))} />
      {pay && <PayRentModal task={pay} db={db} who={who} notify={notify} onClose={() => setPay(null)} />}
    </Panel>
  );
}

/* ───────────── 3 / 6 / 12-month summary (LPG page + Dashboard) ───────────── */

export function WelfarePeriodPanel({ db, onOpen }: { db: Db; onOpen?: () => void }) {
  const [p, setP] = useState<PeriodId>("3 Months");
  const months = PERIODS.find((x) => x.id === p)!.months;
  const w = welfareSummary(db, months, isoDay(0));
  const tile = (k: string, v: string, sub: string) => (
    <div style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: "12px 12px" }}>
      <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 600 }}>{k}</p>
      <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800 }}>{v}</p>
      <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ink-mute)" }}>{sub}</p>
    </div>
  );
  return (
    <Panel title="🏠 Staff welfare summary" actions={<>{onOpen && <Btn small kind="ghost" onClick={onOpen}>LPG tracking</Btn>}<Filter options={PERIODS.map((x) => x.id) as PeriodId[]} value={p} onChange={setP} /></>}>
      <p style={{ ...muted, margin: "0 0 10px" }}>{PERIODS.find((x) => x.id === p)!.label} · from {fmtDate(w.from)} · calculated automatically</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {tile("LPG cylinders used", String(w.cylinders), w.avgDays ? `avg ${w.avgDays} days each` : "average after 1 finished cylinder")}
        {tile("Technicians at mess", w.avgPeople ? String(w.avgPeople) : "—", "average per cylinder")}
        {tile("LPG cost", inr(w.lpgCost), w.perTechMonth != null ? `${inr(w.perTechMonth)} / technician / month` : "add cost on each cylinder")}
        {tile("Room rent paid", inr(w.rentPaid), `${w.rentPayments} payment${w.rentPayments === 1 ? "" : "s"}`)}
        {tile("Tool rental cost", inr(w.toolCost), `${w.toolRentals} rental${w.toolRentals === 1 ? "" : "s"}`)}
        {tile("Total welfare & facilities", inr(w.total), "LPG + room rent + tool rental")}
      </div>
    </Panel>
  );
}

/** This month's room rent status + open rent tasks, on the LPG / welfare page. */
function RentStatusPanel({ db, who, role, notify, go }: { db: Db; who: string; role: Role; notify: (m: string) => void; go: (s: "rent" | "stafftasks") => void }) {
  const [pay, setPay] = useState<StaffTask | null>(null);
  const t0 = isoDay(0), month = t0.slice(0, 7);
  const rooms = (db.rooms ?? []).filter((r) => r.active);
  const tasks = (db.staffTasks ?? []).filter((t) => t.kind === "Room Rent" && t.status === "Open" && mineFor(role)(t));
  return (
    <Panel title="🏠 Room rent — this month" actions={<>{role === "Admin" && <Btn small kind="ghost" onClick={() => go("rent")}>Manage rooms</Btn>}<Btn small kind="ghost" onClick={() => go("stafftasks")}>Staff tasks</Btn></>} pad={false}>
      <Table<RentRoom> rowKey={(r) => r.id} rows={rooms} empty={role === "Admin" ? "No rooms yet — add them in Room Rent." : "No room rent set up."} cols={[
        { key: "room", head: "Room", render: (r) => <div><b>{r.label}</b><div style={muted}>{r.landlord}</div></div> },
        { key: "amt", head: "Rent", render: (r) => inr(r.amount) },
        { key: "due", head: "Due", render: (r) => fmtDate(rentDueDate(r, month)) },
        { key: "to", head: "Task for", render: (r) => r.assignTo },
        { key: "s", head: "Status", render: (r) => {
          const paid = (db.rentPayments ?? []).find((p) => p.roomId === r.id && p.month === month);
          const task = tasks.find((t) => t.key === `rent:${r.id}:${month}`);
          return paid ? <Badge tone="green">Paid {fmtDate(paid.paidOn)}</Badge> : task ? <Btn small onClick={() => setPay(task)}>Mark paid</Btn> : <Badge tone="grey">Task opens {fmtDate(addDaysIso(rentDueDate(r, month), -r.remindBefore))}</Badge>;
        } },
      ]} />
      {pay && <PayRentModal task={pay} db={db} who={who} notify={notify} onClose={() => setPay(null)} />}
    </Panel>
  );
}

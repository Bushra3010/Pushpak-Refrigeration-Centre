# Pushpak Refrigeration Centre — AC Service Platform (demo)

Next.js 16 + React 19, same frontend stack and design system as zevto. **All data is demo data** (`app/lib/data.ts`), stored in this browser's localStorage and shared by all three apps. Supabase will replace `app/lib/store.ts` later.

```bash
npm install
npm run dev
```

| App | URL | Demo login |
|---|---|---|
| Customer app | http://localhost:3000 | 9876543210 (Rajesh Sharma) or any new number · OTP 1234 |
| Technician app | /technician | 9871234560 (Rohit Kumar) · OTP 1234 |
| Admin panel | /admin | admin@pushpak.in / pushpak@demo |

Example flow: book in the customer app → assign in Admin → Jobs → accept, diagnose, quote on the technician app → approve in the customer app → complete work → pay → invoice → the AC's service history updates.

- `app/lib/data.ts`: types, seed data, totals and GST, AC history, recommendation engine
- `app/lib/store.ts`: every write action (audit log + notifications)
- `app/components/service.tsx`: shared timeline, quotation, invoice, AC history, questionnaire and screen protection
- `app/customer/`, `app/technician/`, `app/admin/`: the three apps

## Profitability add-on

Shows the owner what each job and technician really earns — materials, salary allocation, overtime,
allowances, room/food, petrol/travel and overhead — reconciled to company profit. Rules:
[`docs/PROFITABILITY.md`](docs/PROFITABILITY.md).

| Where | What |
|---|---|
| Admin → **Profit Dashboard** | Revenue ex GST, payments collected, outstanding, materials, labour, direct expenses, gross & net profit and margins, jobs/completed/pending/callbacks, actual vs estimated hours, utilisation. Filters: month range, technician, customer, job type, status. Every card opens its records; 5 charts; reconciliation check. |
| Admin → **Technician Profit** | Assigned/completed jobs, productive & travel hours, salary to jobs, idle salary, overtime, incentives, direct & allocated allowances, materials, attributed revenue, gross & fully allocated contribution, callback rate, average hours. |
| Admin → **Payroll & Salary** | Effective-dated monthly/hourly salary, working days & hours, overtime, fixed allowances, attendance, holidays, incentives, deductions, advances; payslips; draft → approve (locks the month). |
| Admin → **Expenses & Claims** | Direct job / technician shared / operating classification, approval, reversal, reimbursement once. |
| Admin → **Time Sheets** | Approve/reject technician time; corrections with reason and a second approver. |
| Admin → **Pipe & Tonnage Calc** | Copper pipe weight, price & gauge (paired lines, insulation, fittings, labour, markup vs margin, GST separate); AC tonnage estimator; save to a customer or add lines to a job's estimate. |
| Admin → **Cost & Calc Rules** | Allocation rules, salary visibility, copper density + source, gauge tables with sources/verification, tonnage coefficients. |
| Admin → job → **Team, time & profit** | Helpers (multi-technician), approved revenue split, time log, job expenses, estimated vs actual profit, log a callback. |
| Admin → **Reports** | CSV exports: job & technician profitability, payroll & allowances, material consumption, inventory, receivables, monthly operating profit, estimate vs actual. |
| Technician app | Job timer (travel / work / break / resume / stop — never overlapping), expense claims, my hours & corrections, my payslips (if allowed), copper pipe calculator (estimate → "📐 Pipe calc", and Stock tab) showing weight & customer price only. |
| Customer app | Home → "Buying a new AC? Find the right size" — tonnage estimate with recommended size and an installation-quote request that notifies the office. |

| Technician app → **Calculators** tab | 24 calculators (`/technician#calculators`, each at `/technician#calculators/<id>`): search, category filters, favourites, recently used, saved history, print/share. Rates, packages, AMC plans, travel policy and reference data are set in Admin → Cost & Calc Rules → *Technician calculators*. See [`docs/CALCULATORS.md`](docs/CALCULATORS.md). |

Older saved demo data is upgraded automatically (Settings → Reset demo restores the full sample).
In this demo the role picker and data live in the browser; real authentication, database storage and
server-side permission checks arrive with the Supabase step.

```bash
npm test   # 155 tests: pipe/tonnage/markup-vs-margin, payroll allocation, revenue split,
           # reconciliation example, demo data, store flows (timer, locks, duplicate prevention), UI render
```

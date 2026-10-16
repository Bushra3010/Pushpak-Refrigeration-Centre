# Profitability, payroll & calculators — calculation model

The maths lives in `app/lib/calc/*` (pure functions, unit-tested in `tests/`); `app/lib/finance.ts`
gathers inputs from the shared demo store; `app/lib/store.ts` holds the write actions. All money
is INR, rounded to paise; allocations use a largest-remainder split so the parts always add up
exactly to their source.

## Revenue — three separate figures

* **Earned revenue (ex GST)** — job taxable value (after discount, before GST), recognised on the
  invoice date. In this app a job is invoiced only after its work is completed.
* **Refunds** reverse revenue (refund amount ÷ (1 + GST%)) on the refund date and reduce cash.
* **Cash collected** — payments received minus refunds, incl. GST.
* **Outstanding** — invoice totals still due, incl. GST.

## Materials

Parts on a job become material cost when the work is completed: `qty × part cost`, with the cost
snapshotted on the line at that moment (`unitCost`). Quotation/estimate lines — including lines
added from the copper pipe calculator — never move stock.

## Technician cost (per technician, per month)

```
scheduled paid hours = working weekdays in the month (minus holidays) × scheduled hours/day
hourly salary cost   = monthly salary ÷ scheduled paid hours           (hourly staff: their rate)
job hours            = approved work time on jobs (+ approved travel, if the rule says so)
salary to jobs       = min(payable salary, hourly cost × job hours), split by job hours
idle salary          = payable salary − salary to jobs   (so 100% of salary is accounted for)
overtime             = hours beyond scheduled/day (all hours on off days) × rate × multiplier, split by job hours
direct labour (job)  = salary to jobs + overtime + job-linked incentives
shared pool          = fixed allowances + approved "technician shared" expenses (room, food, mobile…)
                       + incentives not linked to a job − cost recoveries deducted from salary
shared to jobs       = shared pool split by the configured basis (approved productive hours by default)
unallocated shared   = what the basis could not place (e.g. no hours)
```

Every payroll row checks: `payable salary + OT + incentives + allowances + shared expenses − recoveries
= direct labour + idle + shared to jobs + unallocated` (shown as "Reconciles ✓").

* Attendance reduces payable salary only when the rule is on (`monthly ÷ scheduled days × lost days`).
  Low job hours never reduce salary.
* **Advances** are a receivable: giving one is not an expense; recovery is a payslip deduction.
* **Reimbursable claims**: the approved claim is the expense (recorded once). Repaying it — in
  payroll or directly — only settles it, and each claim can be repaid once.
* Direct job petrol / travel / food go straight to their job and never enter the shared pool.
* **Approving payroll** stores the payslip lines and every allocation row; reports use the stored
  rows for that month. Approved months lock time, attendance, incentives, deductions and shared costs.
  Months not yet approved are computed live and labelled *provisional*.

## Profit

```
Job gross profit     = revenue − materials − direct labour − direct job expenses
Company gross profit = Σ job gross profit
Remaining opex       = operating expenses + idle salary + technician shared costs
Net operating profit = company gross profit − remaining opex
Job allocated profit = job gross profit − (technician shared costs allocated to the job + share of company overhead)
```

Company overhead is spread over jobs (by revenue, labour hours, direct cost or not at all) **for
reporting only** — it is never added again to company costs. The dashboard proves
`Σ job allocated profit − unallocated overhead = net operating profit`.

Worked example (tests/profitability.test.ts): revenue ₹10,000, materials ₹2,000, labour ₹1,500,
direct expenses ₹500 → gross profit ₹6,000; with ₹1,000 overhead → job allocated profit ₹5,000 and
company net operating profit ₹5,000 (overhead deducted once).

## Technician attribution

On multi-technician jobs (lead + helpers) revenue, materials and direct expenses are split by
**approved labour hours**, or by **manual percentages approved by an admin that total exactly
100%**. Labour, allowances and idle salary are each technician's own cost. So
`Σ technician gross contribution = company job gross profit`; revenue is never counted in full for
each technician. Callbacks are counted against the technicians of the original job.

## Copper pipe

`ID = OD − 2 × wall` (requires `2 × wall < OD`); with metres
`kg = π/4 × (OD² − ID²) × length × density` (default 8,960 kg/m³, editable with its source).
Procurement weight = net × (1 + wastage). Cost = kg × ₹/kg, or metres × supplier ₹/m if given.
Selling price by markup `cost × (1 + m)` or target margin `cost ÷ (1 − m)`; GST shown separately.
Gauge thickness comes only from sourced tables (Cost & Calc Rules); SWG ships **unverified**.

## Tonnage

Base BTU/h per ft² × height factor × climate × sunlight × roof × insulation, + 600 BTU/h per
occupant above two, + window area × factor × sunlight, + appliance watts × 3.412, + 4,000 BTU/h for
kitchens. Tons = BTU/h ÷ 12,000; suggested size = smallest configured capacity ≥ estimate ×
(1 + safety margin). All coefficients are editable. Results are preliminary — complex sites need a
professional heat-load assessment.

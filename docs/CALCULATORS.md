# Technician Calculators hub

Open the technician app → **Calculators** (bottom nav), or go to `/technician#calculators`.
Each calculator has its own link: `/technician#calculators/<id>`.

| # | Calculator | id | Action |
|---|---|---|---|
| 01 | Copper Pipe | `copper-pipe` | Add to Estimate |
| 02 | AC Tonnage Estimator | `tonnage` | Save |
| 03 | Installation Estimate | `installation-estimate` | Add to Estimate |
| 04 | Extra Material Charges | `extra-material` | Add to Estimate |
| 05 | Drain Pipe | `drain-pipe` | Add to Estimate |
| 06 | Insulation | `insulation` | Add to Estimate |
| 07 | Cable & Electrical | `cable-electrical` | Add to Estimate |
| 08 | AC Stand & Accessories | `stand-accessories` | Add to Estimate |
| 09 | Refrigerant Charge Adjustment | `refrigerant-charge` | Save Readings to Job |
| 10 | Refrigerant Usage & Billing | `refrigerant-usage` | Add to Estimate |
| 11 | Pressure–Temperature Reference | `pressure-temperature` | Save Readings to Job |
| 12 | Superheat / Subcooling | `superheat-subcooling` | Save Readings to Job |
| 13 | Air Temperature Difference | `air-delta-t` | Save Readings to Job |
| 14 | Airflow | `airflow` | Save Readings to Job |
| 15 | Repair Estimate | `repair-estimate` | Add to Estimate |
| 16 | Electricity Cost | `electricity-cost` | Save |
| 17 | AC Replacement Savings | `replacement-savings` | Save |
| 18 | AMC Plan | `amc-plan` | Add to Estimate |
| 19 | Unit Converter | `unit-converter` | Save |
| 20 | Work & Travel Hours | `work-hours` | Manual entries → time-correction approval |
| 21 | Overtime Estimate | `overtime` | Save (amount only if salary is shared) |
| 22 | Travel / Petrol Claim | `travel-claim` | Create Claim (Pending) |
| 23 | Material Requirement | `material-requirement` | Request stock / request return |
| 24 | Customer Bill | `customer-bill` | Save (never changes the invoice) |
| 25 | Gas Weight & Price | `gas-weight-price` | Add to Estimate |

## Rules

* Maths: `app/lib/calc/tools.ts` (pure, tested in `tests/tools.test.ts`); copper and tonnage reuse `pipe.ts` / `tonnage.ts`.
* Screens: `app/technician/calc/`. One shell gives every calculator Calculate / Reset, result, breakdown,
  assumptions, save with job & customer, history, print and share.
* Every Calculate gets a new id. Saving, adding lines or creating a claim twice from the same result is refused
  (UI and store), so repeated taps never duplicate estimate lines or claims.
* Add to Estimate: appended while the job is before/at Diagnosis; once the estimate is approved it goes in as
  add-on work needing the customer's re-approval. Never moves stock or edits an invoice.
* Technicians see customer rates only. Purchase cost, markup, margin, profit and hidden salary never reach these
  screens, saved summaries or printouts (enforced by a test across all of them). In demo mode this is a browser-side
  simulation, not production-grade data security.
* Settings live in `db.fin.tools` (`app/lib/tool-settings.ts`), edited in Admin → Cost & Calc Rules.
  Saved data is migrated by `upgradeDb` (`DB_VERSION = 2`), which keeps existing data and settings.

## Reference data — shipped empty on purpose

Nothing below is invented. Until the office adds a sourced entry **and marks it verified**, the tool shows
"Assessment unavailable" and says exactly what is needed.

| Needed by | Data | Enter in Cost & Calc Rules |
|---|---|---|
| 11, 12 | Pressure–temperature table per refrigerant (absolute kPa; bubble & dew for blends) | PT tables |
| 09 | Per-model additional-charge rule (factory charge, included length, g/m, limits) | Manufacturer refrigerant rules. Technicians can also enter values from the unit's manual, with the source |
| 07 | Cable current-rating table (material, installation method, sizes → amps) | Cable tables |
| 07 | Allowed voltage-drop % and its source | Limits |
| 01 | SWG gauge table: shipped, but **unverified** until checked against the supplier's pipe | Gauge tables |

All rates, packages and AMC plans are **sample demo values** and are labelled that way.

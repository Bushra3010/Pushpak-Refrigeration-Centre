// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { seedDb } from "@/app/lib/data";
import { withFinanceSeed } from "@/app/lib/finance-seed";
import { ProfitSection, TechProfitSection } from "@/app/admin/Profit";
import { PayrollSection } from "@/app/admin/Payroll";
import { ExpensesSection, TimeSheetsSection } from "@/app/admin/Expenses";
import { CalculatorsSection, CostRulesSection } from "@/app/admin/Calculators";
import { JobFinance } from "@/app/admin/JobFinance";
import { ReportsSection } from "@/app/admin/Reports";
import { MyFinance, TimerCard } from "@/app/technician/Timer";

const db = withFinanceSeed(seedDb());
const noop = () => {};
const job = db.jobs.find((j) => j.id === "J-1024")!;
const open = db.jobs.find((j) => j.id === "J-1042")!;
const t1 = db.techs.find((t) => t.id === "t1")!;

describe("new screens render with the demo data", () => {
  const cases: [string, () => React.ReactElement, RegExp][] = [
    ["profit dashboard", () => <ProfitSection db={db} openJob={noop} />, /Net operating profit/],
    ["technician profit", () => <TechProfitSection db={db} />, /Technician profitability/],
    ["payroll", () => <PayrollSection db={db} who="Admin" notify={noop} />, /Payslips/],
    ["expenses", () => <ExpensesSection db={db} who="Admin" notify={noop} />, /All expenses/],
    ["time sheets", () => <TimeSheetsSection db={db} who="Admin" notify={noop} />, /Correction requests/],
    ["calculators", () => <CalculatorsSection db={db} who="Admin" notify={noop} />, /Procurement weight/],
    ["cost rules", () => <CostRulesSection db={db} who="Admin" notify={noop} />, /Gauge tables/],
    ["job finance tab", () => <JobFinance db={db} job={job} who="Admin" notify={noop} />, /Team & revenue split/],
    ["reports + finance exports", () => <ReportsSection db={db} />, /Finance reports/],
    ["technician timer", () => <TimerCard db={db} job={open} tech={t1} flash={noop} />, /Job timer/],
    ["technician profile finance", () => <MyFinance db={db} tech={t1} flash={noop} />, /My salary/],
  ];
  for (const [name, el, text] of cases)
    it(name, () => {
      render(el());
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
      cleanup();
    });

  it("calculator tonnage tab computes an estimate", () => {
    render(<CalculatorsSection db={db} who="Admin" notify={noop} />);
    fireEvent.click(screen.getByText("AC tonnage estimator"));
    expect(screen.getByText(/Suggested capacity/)).toBeTruthy();
    expect(screen.getByText(/Preliminary estimate only/)).toBeTruthy();
    cleanup();
  });

  it("profit cards open their records", () => {
    render(<ProfitSection db={db} openJob={noop} />);
    fireEvent.click(screen.getByText("Payments collected"));
    expect(screen.getAllByRole("dialog").length).toBe(1);
    cleanup();
  });
});

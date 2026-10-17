// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Db } from "@/app/lib/data";
import { resetDemo } from "@/app/lib/store";
import { SizingPage } from "@/app/customer/Sizing";
import { PipeCalcSheet } from "@/app/technician/PipeSheet";

afterEach(cleanup);
resetDemo();
const db = (): Db => JSON.parse(localStorage.getItem("prc:db:v1")!);

describe("customer new-AC journey", () => {
  it("estimates the size, then sends a Get Best AC Quote request to the office", () => {
    const me = db().customers.find((c) => c.id === "c1")!;
    const onAccessories = vi.fn();
    render(<SizingPage db={db()} me={me} onBack={() => {}} onBook={() => {}} onAccessories={onAccessories} flash={() => {}} />);
    expect(screen.getByText("Recommended AC size")).toBeTruthy();
    expect(screen.getByLabelText("Window direction")).toBeTruthy();
    expect(screen.getByLabelText("Refrigerator")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Get Best AC Quote" }));
    expect(screen.getByRole("alert").textContent).toMatch(/When do you need/);
    expect(db().acQuotes ?? []).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Daikin" }));
    fireEvent.click(screen.getByRole("button", { name: "Only unit price" }));
    fireEvent.click(screen.getByRole("button", { name: "Immediate" }));
    fireEvent.click(screen.getByRole("button", { name: "More ACs" }));
    fireEvent.click(screen.getByRole("button", { name: "Get Best AC Quote" }));

    const d = db();
    const q = d.acQuotes![0];
    expect(q).toMatchObject({ customerId: "c1", acType: "Split AC", brands: ["Daikin"], quantity: 2, withInstallation: false, timeline: "Immediate", status: "Open" });
    expect(q.capacityTons).toBe(q.recommendedTons);
    expect(q.contact.phone).toMatch(/^\d{10}$/);
    expect(d.calcs[0]).toMatchObject({ kind: "Tonnage", customerId: "c1" });
    expect(d.notifications.some((n) => n.to === "admin" && n.title === "New AC quote request")).toBe(true);
    expect(screen.getByText("✓ Request sent")).toBeTruthy();

    fireEvent.click(screen.getByText("AC Installation Accessories"));
    expect(onAccessories).toHaveBeenCalled();
  });
});

describe("technician pipe calculator", () => {
  it("prices copper lines without showing cost or margin, and adds them to the estimate", () => {
    const onAdd = vi.fn();
    render(<PipeCalcSheet db={db()} onClose={() => {}} onAdd={onAdd} />);
    expect(screen.getByText(/customer price/)).toBeTruthy();
    expect(screen.queryByText(/margin|cost/i)).toBeNull();
    fireEvent.click(screen.getByText("Add to estimate"));
    const lines = onAdd.mock.calls[0][0];
    expect(lines).toHaveLength(2);
    expect(lines.every((l: { kind: string; price: number }) => l.kind === "Material" && l.price > 0)).toBe(true);
  });
});

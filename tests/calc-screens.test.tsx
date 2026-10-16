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

describe("customer AC sizing", () => {
  it("shows a recommended size and sends an installation enquiry to the office", () => {
    const me = db().customers.find((c) => c.id === "c1")!;
    render(<SizingPage db={db()} me={me} onBack={() => {}} onBook={() => {}} flash={() => {}} />);
    expect(screen.getByText("Recommended AC size")).toBeTruthy();
    expect(screen.getByText(/Ton$/)).toBeTruthy();
    fireEvent.click(screen.getByText("Get installation quote"));
    const d = db();
    expect(d.calcs[0].kind).toBe("Tonnage");
    expect(d.calcs[0].customerId).toBe("c1");
    expect(d.notifications.some((n) => n.to === "admin" && n.title === "New AC installation enquiry")).toBe(true);
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

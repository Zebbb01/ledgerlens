import { describe, expect, it } from "vitest";
import type { Invoice } from "./extract.ts";
import { canApprove, statusFor, validate, type Check } from "./validate.ts";

const f = <T>(value: T | null, confidence: number | null = 0.95) => ({ value, confidence, page: 1 });

// A correct Philippine VAT invoice: 1,000.00 + 12% VAT = 1,120.00.
function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    vendorName: f("Bluepeak Office Supply Corp."),
    vendorTaxId: f("123-456-789-000"),
    customerName: f("Harbor & Pine Cafe"),
    invoiceId: f("INV-1042"),
    invoiceDate: f("2026-10-05"),
    dueDate: f("2026-11-04"),
    currency: "PHP",
    subtotal: f(100000),
    discount: f<number>(null, null),
    tax: f(12000),
    total: f(112000),
    vatableSales: f(100000, null),
    vatExemptSales: f(0, null),
    zeroRatedSales: f(0, null),
    vatAmount: f(12000, null),
    lines: [
      { description: "Paper", quantity: 10, unitPrice: 6000, amount: 60000 },
      { description: "Toner", quantity: 1, unitPrice: 40000, amount: 40000 },
    ],
    ...overrides,
  };
}

const today = "2026-10-31";
const check = (checks: Check[], id: string) => checks.find((c) => c.id === id);

describe("validate", () => {
  it("passes every check on a correct VAT invoice", () => {
    const checks = validate(invoice(), { today });

    expect(checks.map((c) => [c.id, c.status])).toEqual([
      ["required", "pass"],
      ["total-math", "pass"],
      ["lines-sum", "pass"],
      ["vat-rate", "pass"],
      ["vat-breakdown", "pass"],
      ["dates", "pass"],
      ["tin", "pass"],
      ["duplicate", "pass"],
      ["confidence", "pass"],
    ]);
    expect(statusFor(checks)).toBe("ready");
  });

  it("fails total-math when subtotal plus tax is not the total", () => {
    const checks = validate(invoice({ total: f(112100) }), { today });

    expect(check(checks, "total-math")?.status).toBe("fail");
    expect(check(checks, "total-math")?.message).toContain("1,121.00");
  });

  it("allows one cent of rounding in total-math", () => {
    const checks = validate(invoice({ total: f(112001), vatableSales: f(null), vatAmount: f(null) }), { today });

    expect(check(checks, "total-math")?.status).toBe("pass");
  });

  it("subtracts the discount in total-math", () => {
    const inv = invoice({ discount: f(10000), total: f(102000), vatableSales: f(null), vatAmount: f(null) });

    expect(check(validate(inv, { today }), "total-math")?.status).toBe("pass");
  });

  it("fails vat-rate when VAT is not 12% of VATable sales", () => {
    const checks = validate(invoice({ vatAmount: f(11000, null) }), { today });

    expect(check(checks, "vat-rate")?.status).toBe("fail");
  });

  it("fails vat-breakdown when the printed parts do not add up to the total", () => {
    const checks = validate(invoice({ zeroRatedSales: f(5000, null) }), { today });

    expect(check(checks, "vat-breakdown")?.status).toBe("fail");
  });

  it("skips the VAT checks when no breakdown is printed", () => {
    const checks = validate(invoice({ vatableSales: f(null), vatAmount: f(null) }), { today });

    expect(check(checks, "vat-rate")?.status).toBe("skip");
    expect(check(checks, "vat-breakdown")?.status).toBe("skip");
  });

  it("fails required and names the missing field", () => {
    const checks = validate(invoice({ total: f<number>(null, null) }), { today });

    expect(check(checks, "required")?.status).toBe("fail");
    expect(check(checks, "required")?.message).toContain("total");
  });

  it("fails dates for an invoice dated in the future", () => {
    const checks = validate(invoice({ invoiceDate: f("2026-11-15"), dueDate: f("2026-12-15") }), { today });

    expect(check(checks, "dates")?.status).toBe("fail");
  });

  it("fails dates when the due date is before the invoice date", () => {
    const checks = validate(invoice({ dueDate: f("2026-10-01") }), { today });

    expect(check(checks, "dates")?.status).toBe("fail");
  });

  it("fails tin for a malformed Philippine TIN", () => {
    const checks = validate(invoice({ vendorTaxId: f("12-345") }), { today });

    expect(check(checks, "tin")?.status).toBe("fail");
  });

  it("skips tin on invoices that are not in pesos", () => {
    const checks = validate(invoice({ currency: "USD", vendorTaxId: f("94-1234567") }), { today });

    expect(check(checks, "tin")?.status).toBe("skip");
  });

  it("fails duplicate when another document has the same vendor and number", () => {
    const checks = validate(invoice(), { today, duplicateOf: "Bluepeak-INV-1042.pdf" });

    expect(check(checks, "duplicate")?.status).toBe("fail");
    expect(check(checks, "duplicate")?.message).toContain("Bluepeak-INV-1042.pdf");
  });

  it("warns when a key field was read with low confidence", () => {
    const checks = validate(invoice({ vendorName: f("Bluepeak", 0.5) }), { today });

    expect(check(checks, "confidence")?.status).toBe("warn");
    expect(check(checks, "confidence")?.message).toContain("vendor");
    expect(statusFor(checks)).toBe("needs_review");
  });

  it("passes lines-sum for VAT-inclusive prices that add up to the total", () => {
    const lines = [{ description: "Cement", quantity: 4, unitPrice: 28000, amount: 112000 }];
    const checks = validate(invoice({ lines }), { today });

    expect(check(checks, "lines-sum")?.status).toBe("pass");
  });

  it("warns, not fails, when line items do not add up to the subtotal", () => {
    const lines = [{ description: "Paper", quantity: 1, unitPrice: 60000, amount: 60000 }];
    const checks = validate(invoice({ lines }), { today });

    expect(check(checks, "lines-sum")?.status).toBe("warn");
  });
});

describe("canApprove", () => {
  it("blocks approval while any check fails, and allows it with warnings", () => {
    expect(canApprove(validate(invoice({ total: f(1) }), { today }))).toBe(false);
    expect(canApprove(validate(invoice({ vendorName: f("Bluepeak", 0.5) }), { today }))).toBe(true);
  });
});

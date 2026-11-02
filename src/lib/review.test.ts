import { describe, expect, it } from "vitest";
import { normalize, type Invoice } from "./extract.ts";
import { fieldToFix, flaggedFields, summarize } from "./review.ts";
import type { Check } from "./validate.ts";

const f = <T>(value: T | null, confidence: number | null = 0.95) => ({ value, confidence, page: 1 });
const base = normalize({ content: "", pages: [], documents: [] });
const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  ...base,
  vendorName: f("Bluepeak"),
  invoiceDate: f("2026-10-05"),
  subtotal: f(100000),
  tax: f(12000),
  total: f(112000),
  ...overrides,
});
const check = (id: string, status: Check["status"]): Check => ({ id, status, message: "" });

describe("flaggedFields", () => {
  it("flags every amount in the sum when the totals do not add up", () => {
    expect(flaggedFields([check("total-math", "fail")], invoice())).toEqual({
      subtotal: "fail",
      discount: "fail",
      tax: "fail",
      total: "fail",
    });
  });

  it("flags only the missing fields for the required check", () => {
    const inv = invoice({ total: f<number>(null, null) });

    expect(flaggedFields([check("required", "fail")], inv)).toEqual({ total: "fail" });
  });

  it("flags only the fields read with low confidence", () => {
    const inv = invoice({ subtotal: f(100000, 0.27), tax: f(12000, 0.68) });

    expect(flaggedFields([check("confidence", "warn")], inv)).toEqual({ subtotal: "warn", tax: "warn" });
  });

  it("lets a failure outrank a warning on the same field", () => {
    const inv = invoice({ subtotal: f(100000, 0.27) });
    const checks = [check("confidence", "warn"), check("total-math", "fail")];

    expect(flaggedFields(checks, inv).subtotal).toBe("fail");
  });

  it("flags nothing for passed and skipped checks", () => {
    expect(flaggedFields([check("total-math", "pass"), check("vat-rate", "skip")], invoice())).toEqual({});
  });
});

describe("fieldToFix", () => {
  it("points to the least confident field in a failed sum", () => {
    const inv = invoice({ subtotal: f(317500, 0.27), tax: f(34018, 0.68), total: f(317500, 0.94) });

    expect(fieldToFix(check("total-math", "fail"), inv)).toBe("subtotal");
  });

  it("points to the total when the fields in the sum are read equally well", () => {
    expect(fieldToFix(check("total-math", "fail"), invoice())).toBe("total");
  });

  it("has no field for a check that is not about one", () => {
    expect(fieldToFix(check("lines-sum", "warn"), invoice())).toBe("subtotal");
    expect(fieldToFix(check("unknown", "fail"), invoice())).toBeUndefined();
  });
});

describe("summarize", () => {
  it("counts each status and says to fix the failures first", () => {
    const checks = [check("a", "fail"), check("b", "warn"), check("c", "pass"), check("d", "pass"), check("e", "skip")];

    expect(summarize(checks)).toEqual({
      failed: 1,
      warned: 1,
      passed: 2,
      skipped: 1,
      next: "Fix the failed check, save, and the checks run again.",
    });
  });

  it("asks for a look when only warnings remain", () => {
    expect(summarize([check("a", "warn"), check("b", "pass")]).next).toBe(
      "Nothing failed. Look over the flagged field, then approve.",
    );
  });

  it("says the bill is ready when every check passes", () => {
    expect(summarize([check("a", "pass"), check("b", "skip")]).next).toBe("Every check passed. Approve to export it.");
  });
});

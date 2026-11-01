import { describe, expect, it } from "vitest";
import { normalize } from "./extract.ts";
import { applyEdits, parseMoney } from "./edits.ts";

const now = new Date("2026-10-31T00:00:00Z");
const invoice = {
  ...normalize({ content: "", pages: [], documents: [] }),
  total: { value: 186000, confidence: 0.9, page: 1 },
  vendorName: { value: "Bluepeak", confidence: 0.9, page: 1 },
};

describe("applyEdits", () => {
  it("applies a correction, marks it as read by a person and records the edit", () => {
    const result = applyEdits(invoice, { total: 168000 }, now);

    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.invoice.total).toEqual({ value: 168000, confidence: 1, page: 1 });
    expect(result.edits).toEqual([{ field: "total", from: 186000, to: 168000, at: now }]);
  });

  it("records nothing for a field that did not change", () => {
    const result = applyEdits(invoice, { total: 186000, vendorName: "Bluepeak" }, now);

    expect("edits" in result && result.edits).toEqual([]);
  });

  it("clears a field with an empty value", () => {
    const result = applyEdits(invoice, { vendorName: "  ", total: null }, now);

    expect("invoice" in result && result.invoice.vendorName.value).toBeNull();
    expect("invoice" in result && result.invoice.total.value).toBeNull();
  });

  it("changes the currency", () => {
    const result = applyEdits(invoice, { currency: "usd" }, now);

    expect("invoice" in result && result.invoice.currency).toBe("USD");
  });

  it.each([
    [{ owner: "x" }, "Unknown field: owner"],
    [{ invoiceDate: "05/10/2026" }, "invoiceDate must be a date"],
    [{ total: 12.5 }, "total must be an amount"],
    [{ vendorName: "x".repeat(201) }, "vendorName is too long"],
    [{ currency: "pesos" }, "currency must be a three-letter code"],
  ])("rejects %j", (changes, error) => {
    expect(applyEdits(invoice, changes, now)).toEqual({ error });
  });
});

describe("parseMoney", () => {
  it.each([
    ["1,680.00", 168000],
    ["1680", 168000],
    [" -50.5 ", -5050],
    ["0.29", 29],
    ["", null],
  ])("reads %j as %j cents", (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it.each(["abc", "1.234", "1,2,3.00", "12e3"])("refuses %j", (input) => {
    expect(parseMoney(input)).toBeUndefined();
  });
});

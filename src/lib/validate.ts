// Checks run in code on every extracted invoice. A failing check blocks approval
// until a person fixes the field; nothing the model reads is trusted unchecked.
import type { Field, Invoice } from "./extract.ts";

export type Check = { id: string; status: "pass" | "fail" | "warn" | "skip"; message: string };

export const VAT_RATE = 0.12; // Philippine VAT
const LOW_CONFIDENCE = 0.8;

export const formatMoney = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

export function validate(inv: Invoice, ctx: { today: string; duplicateOf?: string | null }): Check[] {
  const checks: Check[] = [];
  const add = (id: string, status: Check["status"], message: string) => checks.push({ id, status, message });
  const m = formatMoney;
  const sub = inv.subtotal.value;
  const tax = inv.tax.value;
  const total = inv.total.value;
  const discount = inv.discount.value ?? 0;

  const missing = (
    [
      ["vendor", inv.vendorName],
      ["invoice date", inv.invoiceDate],
      ["total", inv.total],
    ] as const
  )
    .filter(([, x]) => x.value === null)
    .map(([name]) => name);
  if (missing.length) add("required", "fail", `Missing: ${missing.join(", ")}.`);
  else add("required", "pass", "Vendor, invoice date and total are present.");

  if (sub === null || tax === null || total === null) {
    add("total-math", "skip", "Needs subtotal, tax and total.");
  } else {
    const expected = sub - discount + tax;
    const sum = `Subtotal ${m(sub)}${discount ? ` − discount ${m(discount)}` : ""} + tax ${m(tax)} = ${m(expected)}`;
    if (near(expected, total, 1)) add("total-math", "pass", `${sum}, matching the total.`);
    else add("total-math", "fail", `${sum}, but the total reads ${m(total)}.`);
  }

  const amounts = inv.lines.map((l) => l.amount).filter((a): a is number => a !== null);
  const basis = sub ?? (total !== null && tax !== null ? total - tax : null);
  if (!amounts.length || basis === null) {
    add("lines-sum", "skip", "No line amounts to add up.");
  } else {
    // Lines are read less reliably than totals, so a mismatch asks for a look
    // instead of blocking approval. Retail prices in the Philippines include VAT,
    // so lines may add up to the total instead of the subtotal.
    const sum = amounts.reduce((a, b) => a + b, 0);
    const matches = near(sum, basis, amounts.length) || (total !== null && near(sum, total, amounts.length));
    if (matches) add("lines-sum", "pass", `Line items add up to ${m(sum)}.`);
    else add("lines-sum", "warn", `Line items add up to ${m(sum)}, not ${m(basis)}. A line may be missing or misread.`);
  }

  const vatable = inv.vatableSales.value;
  const vat = inv.vatAmount.value;
  if (vatable === null || vat === null) {
    add("vat-rate", "skip", "No VAT breakdown printed.");
    add("vat-breakdown", "skip", "No VAT breakdown printed.");
  } else {
    const expectedVat = Math.round(vatable * VAT_RATE);
    if (near(expectedVat, vat, 2)) add("vat-rate", "pass", `VAT ${m(vat)} is 12% of VATable sales ${m(vatable)}.`);
    else add("vat-rate", "fail", `VAT should be 12% of ${m(vatable)} = ${m(expectedVat)}, but it reads ${m(vat)}.`);

    const parts = vatable + (inv.vatExemptSales.value ?? 0) + (inv.zeroRatedSales.value ?? 0) + vat;
    if (total === null) add("vat-breakdown", "skip", "No total to compare the VAT breakdown with.");
    else if (near(parts, total, 2)) add("vat-breakdown", "pass", `VATable, exempt, zero-rated and VAT add up to ${m(parts)}.`);
    else add("vat-breakdown", "fail", `VATable, exempt, zero-rated and VAT add up to ${m(parts)}, but the total reads ${m(total)}.`);
  }

  const date = inv.invoiceDate.value;
  const due = inv.dueDate.value;
  if (!date) add("dates", "skip", "No invoice date.");
  else if (date > ctx.today) add("dates", "fail", `Invoice date ${date} is in the future.`);
  else if (due && due < date) add("dates", "fail", `Due date ${due} is before the invoice date ${date}.`);
  else add("dates", "pass", "Invoice date is not in the future, and the due date follows it.");

  const tin = inv.vendorTaxId.value?.replace(/\s/g, "");
  if (inv.currency !== "PHP") add("tin", "skip", "Not a peso invoice.");
  else if (!tin) add("tin", "warn", "No vendor TIN found. A BIR invoice must show the seller's TIN.");
  else if (/^\d{3}-?\d{3}-?\d{3}(-?\d{3,5})?$/.test(tin)) add("tin", "pass", `Vendor TIN ${tin} has the BIR format.`);
  else add("tin", "fail", `Vendor TIN "${tin}" is not in the BIR format 000-000-000-000.`);

  if (ctx.duplicateOf) add("duplicate", "fail", `Same vendor and invoice number as ${ctx.duplicateOf}.`);
  else add("duplicate", "pass", "No other document has this vendor and invoice number.");

  const keyFields: [string, Field<unknown>][] = [
    ["vendor", inv.vendorName],
    ["invoice number", inv.invoiceId],
    ["invoice date", inv.invoiceDate],
    ["subtotal", inv.subtotal],
    ["tax", inv.tax],
    ["total", inv.total],
  ];
  const low = keyFields
    .filter(([, x]) => x.value !== null && x.confidence !== null && x.confidence < LOW_CONFIDENCE)
    .map(([name, x]) => `${name} (${Math.round((x.confidence ?? 0) * 100)}%)`);
  if (low.length) add("confidence", "warn", `Read with low confidence: ${low.join(", ")}. Check against the document.`);
  else add("confidence", "pass", "Key fields were read with high confidence.");

  return checks;
}

export const statusFor = (checks: Check[]) =>
  checks.some((c) => c.status === "fail" || c.status === "warn") ? "needs_review" : "ready";

export const canApprove = (checks: Check[]) => !checks.some((c) => c.status === "fail");

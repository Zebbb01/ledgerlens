// What the review screen needs from the checks: which fields each one is about,
// and a one-line summary of what to do next.
import type { Invoice } from "./extract.ts";
import { KEY_FIELDS, isLowConfidence, type Check } from "./validate.ts";

export type FieldKey = Exclude<keyof Invoice, "currency" | "lines">;
type Flag = "fail" | "warn";

const RELATED: Record<string, FieldKey[]> = {
  "total-math": ["total", "subtotal", "tax", "discount"],
  "lines-sum": ["subtotal"],
  "vat-rate": ["vatableSales", "vatAmount"],
  "vat-breakdown": ["vatableSales", "vatExemptSales", "zeroRatedSales", "vatAmount", "total"],
  dates: ["invoiceDate", "dueDate"],
  tin: ["vendorTaxId"],
  duplicate: ["vendorName", "invoiceId"],
};

export function fieldsForCheck(check: Check, inv: Invoice): FieldKey[] {
  if (check.id === "required") return (["vendorName", "invoiceDate", "total"] as const).filter((k) => inv[k].value === null);
  if (check.id === "confidence") return KEY_FIELDS.map(([, key]) => key).filter((key) => isLowConfidence(inv[key]));
  return RELATED[check.id] ?? [];
}

// The field to look at first: the least confident one, since a misread value is
// the likeliest culprit. Ties keep the order above, so a sum points at its total.
export function fieldToFix(check: Check, inv: Invoice): FieldKey | undefined {
  const confidence = (key: FieldKey) => inv[key].confidence ?? 1;
  return [...fieldsForCheck(check, inv)].sort((a, b) => confidence(a) - confidence(b))[0];
}

export function flaggedFields(checks: Check[], inv: Invoice): Partial<Record<FieldKey, Flag>> {
  const flags: Partial<Record<FieldKey, Flag>> = {};
  for (const c of checks) {
    if (c.status !== "fail" && c.status !== "warn") continue;
    for (const key of fieldsForCheck(c, inv)) if (flags[key] !== "fail") flags[key] = c.status;
  }
  return flags;
}

export function summarize(checks: Check[]) {
  const count = (status: Check["status"]) => checks.filter((c) => c.status === status).length;
  const [failed, warned, passed, skipped] = [count("fail"), count("warn"), count("pass"), count("skip")];
  const next = failed
    ? `Fix the failed ${failed === 1 ? "check" : "checks"}, save, and the checks run again.`
    : warned
      ? `Nothing failed. Look over the flagged ${warned === 1 ? "field" : "fields"}, then approve.`
      : "Every check passed. Approve to export it.";
  return { failed, warned, passed, skipped, next };
}

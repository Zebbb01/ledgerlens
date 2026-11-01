// Corrections a person makes on the review screen. Input comes from the browser,
// so every field is checked here before it touches the stored invoice.
import { toCents, type Field, type Invoice } from "./extract.ts";

export const EDITABLE = {
  vendorName: "text",
  vendorTaxId: "text",
  customerName: "text",
  invoiceId: "text",
  invoiceDate: "date",
  dueDate: "date",
  subtotal: "money",
  discount: "money",
  tax: "money",
  total: "money",
  vatableSales: "money",
  vatExemptSales: "money",
  zeroRatedSales: "money",
  vatAmount: "money",
} as const;

export type Edit = { field: string; from: unknown; to: unknown; at: Date };

// "1,680.00" -> 168000 cents; "" -> null; anything else that is not an amount -> undefined.
export function parseMoney(input: string): number | null | undefined {
  const s = input.trim();
  if (!s) return null;
  if (!/^-?(\d{1,3}(,\d{3})*|\d+)(\.\d{1,2})?$/.test(s)) return undefined;
  return toCents(Number(s.replaceAll(",", "")));
}

function parse(kind: (typeof EDITABLE)[keyof typeof EDITABLE], name: string, raw: unknown) {
  if (raw === null) return { value: null };
  if (kind === "text") {
    if (typeof raw !== "string") return { error: `${name} must be text` };
    if (raw.length > 200) return { error: `${name} is too long` };
    return { value: raw.trim() || null };
  }
  if (kind === "date") {
    const ok = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw));
    return ok ? { value: raw } : { error: `${name} must be a date` };
  }
  const ok = typeof raw === "number" && Number.isSafeInteger(raw) && Math.abs(raw) < 1e13;
  return ok ? { value: raw } : { error: `${name} must be an amount` };
}

export function applyEdits(
  invoice: Invoice,
  changes: Record<string, unknown>,
  now: Date,
): { invoice: Invoice; edits: Edit[] } | { error: string } {
  const next: Invoice = { ...invoice };
  const edits: Edit[] = [];
  for (const [name, raw] of Object.entries(changes)) {
    if (name === "currency") {
      const code = typeof raw === "string" ? raw.trim().toUpperCase() : raw;
      if (code !== null && !(typeof code === "string" && /^[A-Z]{3}$/.test(code))) {
        return { error: "currency must be a three-letter code" };
      }
      if (code !== invoice.currency) edits.push({ field: name, from: invoice.currency, to: code, at: now });
      next.currency = code as string | null;
      continue;
    }
    if (!Object.hasOwn(EDITABLE, name)) return { error: `Unknown field: ${name}` };
    const key = name as keyof typeof EDITABLE;
    const parsed = parse(EDITABLE[key], name, raw);
    if ("error" in parsed) return { error: parsed.error as string };
    const old = invoice[key] as Field<unknown>;
    if (parsed.value === old.value) continue;
    edits.push({ field: name, from: old.value, to: parsed.value, at: now });
    (next[key] as Field<unknown>) = { value: parsed.value, confidence: 1, page: old.page };
  }
  return { invoice: next, edits };
}

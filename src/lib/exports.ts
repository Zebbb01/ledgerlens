import type { Invoice } from "./extract.ts";

type ExportDoc = { fileName: string; status: string; category: string | null; invoice: Invoice };

const HEADER = [
  "Vendor", "Vendor TIN", "Invoice number", "Invoice date", "Due date", "Currency", "Description",
  "Quantity", "Unit price", "Line amount", "Tax", "Total", "Category", "Status", "File",
];

const amount = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));

// Text comes from the uploaded document, so a cell that starts like a formula
// is prefixed with an apostrophe before a spreadsheet can run it.
const text = (s: string | null) => (s && /^[=+\-@\t\r]/.test(s) ? `'${s}` : (s ?? ""));

const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

export function toCsv(docs: ExportDoc[]): string {
  const rows = [HEADER];
  for (const { invoice: inv, ...doc } of docs) {
    const lines = inv.lines.length ? inv.lines : [null];
    for (const line of lines) {
      rows.push([
        text(inv.vendorName.value),
        text(inv.vendorTaxId.value),
        text(inv.invoiceId.value),
        inv.invoiceDate.value ?? "",
        inv.dueDate.value ?? "",
        inv.currency ?? "",
        text(line?.description ?? null),
        line?.quantity?.toString() ?? "",
        amount(line?.unitPrice ?? null),
        amount(line?.amount ?? null),
        amount(inv.tax.value),
        amount(inv.total.value),
        text(doc.category),
        doc.status,
        text(doc.fileName),
      ]);
    }
  }
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

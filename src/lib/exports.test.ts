import { describe, expect, it } from "vitest";
import type { Invoice } from "./extract.ts";
import { toCsv } from "./exports.ts";

const f = <T>(value: T | null) => ({ value, confidence: 0.9, page: 1 });

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    vendorName: f("Bluepeak Office Supply Corp."),
    vendorTaxId: f("123-456-789-000"),
    customerName: f(null),
    invoiceId: f("INV-1042"),
    invoiceDate: f("2026-10-05"),
    dueDate: f("2026-11-04"),
    currency: "PHP",
    subtotal: f(100000),
    discount: f(null),
    tax: f(12000),
    total: f(112000),
    vatableSales: f(null),
    vatExemptSales: f(null),
    zeroRatedSales: f(null),
    vatAmount: f(null),
    lines: [
      { description: "Paper", quantity: 10, unitPrice: 6000, amount: 60000 },
      { description: "Toner", quantity: 1, unitPrice: 40000, amount: 40000 },
    ],
    ...overrides,
  };
}

const doc = (inv: Invoice) => ({ fileName: "inv.pdf", status: "approved", category: "Office supplies", invoice: inv });
const rows = (csv: string) => csv.trimEnd().split("\r\n");

describe("toCsv", () => {
  it("writes a header and one row per line item, with amounts as decimals", () => {
    const [header, first, second] = rows(toCsv([doc(invoice())]));

    expect(header).toBe(
      "Vendor,Vendor TIN,Invoice number,Invoice date,Due date,Currency,Description,Quantity,Unit price,Line amount,Tax,Total,Category,Status,File",
    );
    expect(first).toBe(
      "Bluepeak Office Supply Corp.,123-456-789-000,INV-1042,2026-10-05,2026-11-04,PHP,Paper,10,60.00,600.00,120.00,1120.00,Office supplies,approved,inv.pdf",
    );
    expect(second).toContain(",Toner,1,400.00,400.00,");
  });

  it("writes one row for an invoice without line items", () => {
    const lines = rows(toCsv([doc(invoice({ lines: [] }))]));

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(",PHP,,,,,120.00,1120.00,");
  });

  it("quotes cells that contain commas, quotes or line breaks", () => {
    const csv = toCsv([doc(invoice({ vendorName: f('Harbor & Pine, "Cafe"'), lines: [] }))]);

    expect(rows(csv)[1].startsWith('"Harbor & Pine, ""Cafe"""')).toBe(true);
  });

  it("neutralises spreadsheet formulas in text read from the document", () => {
    const csv = toCsv([doc(invoice({ vendorName: f("=HYPERLINK(\"http://x\")"), lines: [] }))]);

    expect(rows(csv)[1].startsWith(`"'=HYPERLINK(""http://x"")"`)).toBe(true);
  });

  it("keeps negative amounts as numbers", () => {
    const lines = [{ description: "Discount", quantity: 1, unitPrice: -5000, amount: -5000 }];

    expect(rows(toCsv([doc(invoice({ lines }))]))[1]).toContain(",Discount,1,-50.00,-50.00,");
  });
});

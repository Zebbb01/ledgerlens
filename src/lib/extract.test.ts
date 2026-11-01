import { describe, expect, it } from "vitest";
import { normalize, type AnalyzeResult } from "./extract.ts";

const region = (page = 1) => [{ pageNumber: page, polygon: [] }];
const str = (value: string, confidence = 0.95, page = 1) => ({
  type: "string",
  valueString: value,
  content: value,
  confidence,
  boundingRegions: region(page),
});
const money = (amount: number, currencyCode?: string, confidence = 0.95) => ({
  type: "currency",
  valueCurrency: { amount, currencyCode },
  confidence,
  boundingRegions: region(),
});
const date = (value: string, confidence = 0.95) => ({
  type: "date",
  valueDate: value,
  confidence,
  boundingRegions: region(),
});

function result(fields: Record<string, unknown>, content = ""): AnalyzeResult {
  return { content, pages: [{ pageNumber: 1 }], documents: [{ fields }] };
}

describe("normalize", () => {
  it("maps header fields with confidence and page, and money in cents", () => {
    const inv = normalize(
      result({
        VendorName: str("Bluepeak Office Supply Corp."),
        VendorTaxId: str("123-456-789-000", 0.9),
        InvoiceId: str("INV-1042", 0.97, 2),
        InvoiceDate: date("2026-10-05"),
        DueDate: date("2026-11-04"),
        SubTotal: money(1000, "PHP"),
        TotalTax: money(120, "PHP"),
        InvoiceTotal: money(1120.29, "PHP"),
      }),
    );

    expect(inv.vendorName).toEqual({ value: "Bluepeak Office Supply Corp.", confidence: 0.95, page: 1 });
    expect(inv.vendorTaxId.value).toBe("123-456-789-000");
    expect(inv.invoiceId).toEqual({ value: "INV-1042", confidence: 0.97, page: 2 });
    expect(inv.invoiceDate.value).toBe("2026-10-05");
    expect(inv.dueDate.value).toBe("2026-11-04");
    expect(inv.subtotal.value).toBe(100000);
    expect(inv.tax.value).toBe(12000);
    expect(inv.total.value).toBe(112029);
    expect(inv.currency).toBe("PHP");
  });

  it("reads line items, with prices in cents", () => {
    const inv = normalize(
      result({
        Items: {
          type: "array",
          valueArray: [
            {
              type: "object",
              valueObject: {
                Description: str("A4 bond paper, 10 reams"),
                Quantity: { type: "number", valueNumber: 10 },
                UnitPrice: money(0.29),
                Amount: money(2.9),
              },
            },
            { type: "object", valueObject: { Description: str("Delivery") } },
          ],
        },
      }),
    );

    expect(inv.lines).toEqual([
      { description: "A4 bond paper, 10 reams", quantity: 10, unitPrice: 29, amount: 290 },
      { description: "Delivery", quantity: null, unitPrice: null, amount: null },
    ]);
  });

  it("returns empty fields when the model found no invoice", () => {
    const inv = normalize({ content: "", pages: [], documents: [] });

    expect(inv.vendorName).toEqual({ value: null, confidence: null, page: null });
    expect(inv.total.value).toBeNull();
    expect(inv.lines).toEqual([]);
    expect(inv.currency).toBeNull();
  });

  it("reads the Philippine VAT breakdown printed on the document", () => {
    const content = [
      "OFFICIAL RECEIPT",
      "VATable Sales 1,000.00",
      "VAT-Exempt Sales 0.00",
      "Zero-Rated Sales",
      "250.00",
      "VAT Amount ₱120.00",
      "TOTAL AMOUNT DUE ₱1,370.00",
    ].join("\n");

    const inv = normalize(result({}, content));

    expect(inv.vatableSales.value).toBe(100000);
    expect(inv.vatExemptSales.value).toBe(0);
    expect(inv.zeroRatedSales.value).toBe(25000);
    expect(inv.vatAmount.value).toBe(12000);
  });

  it("reads '12% VAT' as the VAT amount", () => {
    const inv = normalize(result({}, "VATable Sales: P892.86\n12% VAT: P107.14"));

    expect(inv.vatAmount.value).toBe(10714);
  });

  it("infers PHP from a peso sign when the model gives no currency code", () => {
    const inv = normalize(result({ InvoiceTotal: money(500) }, "Total ₱500.00"));

    expect(inv.currency).toBe("PHP");
  });
});

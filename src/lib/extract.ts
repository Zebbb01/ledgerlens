// Turns an Azure AI Document Intelligence (prebuilt-invoice) result into the
// invoice LedgerLens checks. Money is kept in integer cents from here on.

type DiField = {
  type?: string;
  valueString?: string;
  valueDate?: string;
  valueNumber?: number;
  valueCurrency?: { amount?: number; currencyCode?: string };
  valueArray?: DiField[];
  valueObject?: Record<string, DiField>;
  content?: string;
  confidence?: number;
  boundingRegions?: { pageNumber: number }[];
};

export type AnalyzeResult = {
  content: string;
  pages: unknown[];
  documents: { fields: Record<string, unknown> }[];
};

export type Field<T> = { value: T | null; confidence: number | null; page: number | null };

export type Line = {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
};

export type Invoice = {
  vendorName: Field<string>;
  vendorTaxId: Field<string>;
  customerName: Field<string>;
  invoiceId: Field<string>;
  invoiceDate: Field<string>;
  dueDate: Field<string>;
  currency: string | null;
  subtotal: Field<number>;
  discount: Field<number>;
  tax: Field<number>;
  total: Field<number>;
  vatableSales: Field<number>;
  vatExemptSales: Field<number>;
  zeroRatedSales: Field<number>;
  vatAmount: Field<number>;
  lines: Line[];
};

export const toCents = (amount: number) => Math.round(amount * 100);

const empty = <T>(): Field<T> => ({ value: null, confidence: null, page: null });

function field<T>(f: DiField | undefined, read: (f: DiField) => T | undefined): Field<T> {
  const value = f ? read(f) : undefined;
  if (value === undefined || value === null) return empty();
  return { value, confidence: f?.confidence ?? null, page: f?.boundingRegions?.[0]?.pageNumber ?? null };
}

const text = (f: DiField) => f.valueString ?? f.content;
const day = (f: DiField) => f.valueDate;
const cents = (f: DiField) => {
  const amount = f.valueCurrency?.amount ?? f.valueNumber;
  return amount === undefined ? undefined : toCents(amount);
};

// The breakdown a Philippine VAT invoice or official receipt must print. Document
// Intelligence has no fields for it, so it is read from the page text.
const AMOUNT = String.raw`[\s:]*(?:PHP|Php|P|₱)?\s*(-?\d{1,3}(?:,\d{3})*\.\d{2}|-?\d+\.\d{2})`;
function printed(content: string, label: string): Field<number> {
  const m = new RegExp(label + AMOUNT, "i").exec(content);
  if (!m) return empty();
  return { value: toCents(Number(m[1].replaceAll(",", ""))), confidence: null, page: null };
}

// The model often misses a Philippine TIN printed as "VAT Reg. TIN: ...". The
// first TIN in reading order is the seller's, printed under its name; a
// customer's TIN, if any, comes later.
function printedTin(content: string): Field<string> {
  const m = /\bTIN\b[^\d\n]{0,12}(\d{3}-?\d{3}-?\d{3}(?:-?\d{3,5})?)/i.exec(content);
  return m ? { value: m[1], confidence: null, page: null } : empty();
}

export function normalize(result: AnalyzeResult): Invoice {
  const f = (result.documents[0]?.fields ?? {}) as Record<string, DiField>;
  const content = result.content ?? "";
  const code = [f.InvoiceTotal, f.SubTotal, f.TotalTax].find((x) => x?.valueCurrency?.currencyCode)?.valueCurrency
    ?.currencyCode;
  const tin = field(f.VendorTaxId, text);

  return {
    vendorName: field(f.VendorName, text),
    vendorTaxId: tin.value !== null ? tin : printedTin(content),
    customerName: field(f.CustomerName, text),
    invoiceId: field(f.InvoiceId, text),
    invoiceDate: field(f.InvoiceDate, day),
    dueDate: field(f.DueDate, day),
    currency: code ?? (/₱|\bPHP\b/.test(content) ? "PHP" : null),
    subtotal: field(f.SubTotal, cents),
    discount: field(f.TotalDiscount, cents),
    tax: field(f.TotalTax, cents),
    total: field(f.InvoiceTotal, cents),
    vatableSales: printed(content, String.raw`VAT-?able\s+Sales`),
    vatExemptSales: printed(content, String.raw`VAT[- ]?Exempt(?:\s+Sales)?`),
    zeroRatedSales: printed(content, String.raw`Zero[- ]?Rated(?:\s+Sales)?`),
    vatAmount: printed(content, String.raw`(?:VAT\s+Amount|12%\s*VAT|VAT\s*\(12%\))`),
    lines: (f.Items?.valueArray ?? []).map(({ valueObject: o = {} }) => ({
      description: field(o.Description, text).value,
      quantity: field(o.Quantity, (x) => x.valueNumber).value,
      unitPrice: field(o.UnitPrice, cents).value,
      amount: field(o.Amount, cents).value,
    })),
  };
}

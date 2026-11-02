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

// A name the model read across lines ("SPX\nEXPRESS") becomes one line.
const text = (f: DiField) => (f.valueString ?? f.content)?.replace(/\s+/g, " ").trim();
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

// A registered business name ends like this; logo text read as the vendor usually doesn't.
const ENTITY = /\b(inc|corp|corporation|co|company|ltd|limited|llc|opc|plc|pte|pty)\.?$/i;

// On real invoices the model sometimes takes the logo ("SPX EXPRESS") as the vendor.
// The registered name is then often in VendorAddressRecipient, and a Philippine
// invoice also prints it as the "Business Style" beside the seller's TIN.
function vendor(f: Record<string, DiField>, content: string): Field<string> {
  const registered = (x: Field<string>) => x.value !== null && ENTITY.test(x.value);
  const name = field(f.VendorName, text);
  if (registered(name)) return name;
  const recipient = field(f.VendorAddressRecipient, text);
  if (registered(recipient)) return recipient;
  const style = /Business Style:[ \t]*([^\n]+)/i.exec(content)?.[1].trim() ?? null;
  const printed = { value: style, confidence: null, page: null };
  return registered(printed) ? printed : name;
}

// A Philippine invoice numbers itself as a BIR series ("Series Number ISISF…"),
// which the model can miss. The first one is the invoice's; the range in the
// footer comes later.
function printedNumber(content: string): Field<string> {
  const m = /(?:Series Number|Invoice (?:No\.?|Number)|SI No\.?)[\s:#]*([A-Z0-9][A-Z0-9-]{3,})/i.exec(content);
  return m ? { value: m[1], confidence: null, page: null } : empty();
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
  const id = field(f.InvoiceId, text);

  return {
    vendorName: vendor(f, content),
    vendorTaxId: tin.value !== null ? tin : printedTin(content),
    customerName: field(f.CustomerName, text),
    invoiceId: id.value !== null ? id : printedNumber(content),
    invoiceDate: field(f.InvoiceDate, day),
    dueDate: field(f.DueDate, day),
    currency: code ?? (/₱|\bPHP\b/.test(content) ? "PHP" : null),
    subtotal: field(f.SubTotal, cents),
    discount: field(f.TotalDiscount, cents),
    tax: field(f.TotalTax, cents),
    total: field(f.InvoiceTotal, cents),
    vatableSales: printed(content, String.raw`(?:VAT-?able|VAT\s+STD)\s+Sales`),
    vatExemptSales: printed(content, String.raw`VAT[- ]?Exempt(?:\s+Sales)?`),
    zeroRatedSales: printed(content, String.raw`(?:Zero[- ]?Rated|VAT\s+ZERO)(?:\s+Sales)?`),
    vatAmount: printed(content, String.raw`(?:VAT\s+Amount|12%\s*VAT|VAT\s*\(12%\)|(?:^|\n)VAT)`),
    lines: (f.Items?.valueArray ?? []).map(({ valueObject: o = {} }) => ({
      description: field(o.Description, text).value,
      quantity: field(o.Quantity, (x) => x.valueNumber).value,
      unitPrice: field(o.UnitPrice, cents).value,
      amount: field(o.Amount, cents).value,
    })),
  };
}

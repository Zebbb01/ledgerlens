// Generates the sample PDFs in samples/, their answer keys, and the results the
// mock Document Intelligence server returns for them. Run: npm run samples
import { writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type Line = { desc: string; qty: number; unit: number };
type Spec = {
  file: string;
  title: string;
  vendor: string;
  vendorLines: string[];
  tin: string | null;
  customer: string;
  numberLabel: string;
  number: string;
  date: [iso: string, printed: string];
  due: [iso: string, printed: string] | null;
  currency: "PHP" | "USD";
  lines: Line[];
  totals: [label: string, amount: number][];
  read: { subtotal: number; tax: number; total: number; vatable: number | null; vat: number | null };
  confidence?: Record<string, number>;
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cents = (n: number | null) => (n === null ? null : Math.round(n * 100));

const SPECS: Spec[] = [
  {
    file: "bluepeak-vat-invoice.pdf",
    title: "SALES INVOICE",
    vendor: "Bluepeak Office Supply Corp.",
    vendorLines: ["Unit 4B, Ortigas Center, Pasig City, Metro Manila"],
    tin: "123-456-789-000",
    customer: "Harbor & Pine Cafe",
    numberLabel: "Invoice No.",
    number: "INV-2026-1042",
    date: ["2026-10-05", "October 5, 2026"],
    due: ["2026-11-04", "November 4, 2026"],
    currency: "PHP",
    lines: [
      { desc: "A4 bond paper 70gsm, ream", qty: 10, unit: 245 },
      { desc: "Toner cartridge TN-2380", qty: 2, unit: 1850 },
      { desc: "Heavy-duty stapler", qty: 1, unit: 450 },
    ],
    totals: [
      ["VATable Sales", 6600],
      ["VAT-Exempt Sales", 0],
      ["Zero-Rated Sales", 0],
      ["VAT Amount", 792],
      ["TOTAL AMOUNT DUE", 7392],
    ],
    read: { subtotal: 6600, tax: 792, total: 7392, vatable: 6600, vat: 792 },
  },
  {
    file: "ironleaf-receipt.pdf",
    title: "OFFICIAL RECEIPT",
    vendor: "Ironleaf Hardware Trading",
    vendorLines: ["88 Rizal Avenue, Davao City"],
    tin: "987-654-321-00000",
    customer: "Harbor & Pine Cafe",
    numberLabel: "OR No.",
    number: "004512",
    date: ["2026-10-20", "10/20/2026"],
    due: null,
    currency: "PHP",
    lines: [
      { desc: "Portland cement, 40 kg", qty: 5, unit: 285 },
      { desc: "Deformed steel bar, 10 mm", qty: 10, unit: 175 },
    ],
    totals: [
      ["Total Sales (VAT Inclusive)", 3175],
      ["VATable Sales", 2834.82],
      ["VAT Amount", 340.18],
      ["VAT-Exempt Sales", 0],
      ["TOTAL AMOUNT DUE", 3175],
    ],
    read: { subtotal: 2834.82, tax: 340.18, total: 3175, vatable: 2834.82, vat: 340.18 },
    confidence: { InvoiceId: 0.71 },
  },
  {
    file: "cloudnote-saas-invoice.pdf",
    title: "INVOICE",
    vendor: "Cloudnote Inc.",
    vendorLines: ["500 Howard Street, San Francisco, CA 94105", "billing@cloudnote.example"],
    tin: null,
    customer: "Harbor & Pine Cafe",
    numberLabel: "Invoice #",
    number: "CN-88213",
    date: ["2026-10-01", "Oct 1, 2026"],
    due: ["2026-10-31", "Oct 31, 2026"],
    currency: "USD",
    lines: [{ desc: "Team plan, monthly (per seat)", qty: 5, unit: 12 }],
    totals: [
      ["Subtotal", 60],
      ["Tax", 0],
      ["Total due (USD)", 60],
    ],
    read: { subtotal: 60, tax: 0, total: 60, vatable: null, vat: null },
  },
  {
    file: "bluepeak-math-error.pdf",
    title: "SALES INVOICE",
    vendor: "Bluepeak Office Supply Corp.",
    vendorLines: ["Unit 4B, Ortigas Center, Pasig City, Metro Manila"],
    tin: "123-456-789-000",
    customer: "Harbor & Pine Cafe",
    numberLabel: "Invoice No.",
    number: "INV-2026-1043",
    date: ["2026-10-12", "October 12, 2026"],
    due: ["2026-11-11", "November 11, 2026"],
    currency: "PHP",
    lines: [
      { desc: "Whiteboard marker, box of 12", qty: 3, unit: 220 },
      { desc: "Clear folder, pack of 50", qty: 4, unit: 210 },
    ],
    // The printed total is wrong on purpose: 1,500.00 + 180.00 is 1,680.00.
    totals: [
      ["VATable Sales", 1500],
      ["VAT Amount", 180],
      ["TOTAL AMOUNT DUE", 1860],
    ],
    read: { subtotal: 1500, tax: 180, total: 1860, vatable: 1500, vat: 180 },
  },
];

async function render(spec: Spec) {
  const pdf = await PDFDocument.create();
  const fixed = new Date("2026-10-01T00:00:00Z");
  pdf.setCreationDate(fixed);
  pdf.setModificationDate(fixed);
  pdf.setProducer("LedgerLens samples");
  pdf.setCreator("LedgerLens");
  pdf.setTitle(`${spec.title} ${spec.number}`);
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text: string[] = []; // reading order, as Document Intelligence returns it

  const draw = (p: PDFPage, s: string, x: number, y: number, size = 10, font: PDFFont = regular, right = false) => {
    p.drawText(s, { x: right ? x - font.widthOfTextAtSize(s, size) : x, y, size, font, color: rgb(0.1, 0.12, 0.16) });
  };
  const say = (s: string) => text.push(s);

  draw(page, spec.vendor, 50, 785, 17, bold);
  say(spec.vendor);
  spec.vendorLines.forEach((l, i) => (draw(page, l, 50, 768 - i * 13, 9), say(l)));
  if (spec.tin) {
    const tin = `VAT Reg. TIN: ${spec.tin}`;
    draw(page, tin, 50, 768 - spec.vendorLines.length * 13, 9);
    say(tin);
  }

  draw(page, spec.title, 545, 785, 14, bold, true);
  say(spec.title);
  const meta = [`${spec.numberLabel} ${spec.number}`, `Date: ${spec.date[1]}`, ...(spec.due ? [`Due: ${spec.due[1]}`] : [])];
  meta.forEach((m, i) => (draw(page, m, 545, 766 - i * 14, 10, regular, true), say(m)));

  draw(page, "Bill to", 50, 700, 9, bold);
  draw(page, spec.customer, 50, 686, 11);
  say("Bill to");
  say(spec.customer);

  page.drawRectangle({ x: 45, y: 628, width: 505, height: 20, color: rgb(0.93, 0.95, 0.97) });
  const head: [string, number, boolean][] = [["Description", 52, false], ["Qty", 345, true], ["Unit price", 445, true], ["Amount", 543, true]];
  head.forEach(([h, x, r]) => draw(page, h, x, 634, 9, bold, r));
  say(head.map(([h]) => h).join(" "));

  let y = 608;
  for (const l of spec.lines) {
    const amount = l.qty * l.unit;
    draw(page, l.desc, 52, y);
    draw(page, String(l.qty), 345, y, 10, regular, true);
    draw(page, fmt(l.unit), 445, y, 10, regular, true);
    draw(page, fmt(amount), 543, y, 10, regular, true);
    say(`${l.desc} ${l.qty} ${fmt(l.unit)} ${fmt(amount)}`);
    y -= 20;
  }

  y -= 16;
  for (const [label, amount] of spec.totals) {
    const strong = /TOTAL|due/.test(label);
    draw(page, label, 340, y, 10, strong ? bold : regular);
    draw(page, `${spec.currency} ${fmt(amount)}`, 543, y, 10, strong ? bold : regular, true);
    say(`${label} ${spec.currency} ${fmt(amount)}`);
    y -= 17;
  }

  const footer = "Sample document generated for LedgerLens. All names and numbers are fictitious.";
  draw(page, footer, 50, 60, 8);
  say(footer);

  return { bytes: await pdf.save({ useObjectStreams: false }), content: text.join("\n") };
}

// What Document Intelligence (prebuilt-invoice) would return, in its shape.
function diResult(spec: Spec, content: string) {
  const c = (name: string) => spec.confidence?.[name] ?? 0.96;
  const str = (name: string, v: string) => ({ type: "string", valueString: v, content: v, confidence: c(name), boundingRegions: [{ pageNumber: 1 }] });
  const money = (name: string, amount: number) => ({
    type: "currency",
    valueCurrency: { amount, currencyCode: spec.currency },
    confidence: c(name),
    boundingRegions: [{ pageNumber: 1 }],
  });
  const date = (name: string, d: [string, string]) => ({ type: "date", valueDate: d[0], content: d[1], confidence: c(name), boundingRegions: [{ pageNumber: 1 }] });
  const fields: Record<string, unknown> = {
    VendorName: str("VendorName", spec.vendor),
    CustomerName: str("CustomerName", spec.customer),
    InvoiceId: str("InvoiceId", spec.number),
    InvoiceDate: date("InvoiceDate", spec.date),
    SubTotal: money("SubTotal", spec.read.subtotal),
    TotalTax: money("TotalTax", spec.read.tax),
    InvoiceTotal: money("InvoiceTotal", spec.read.total),
    Items: {
      type: "array",
      valueArray: spec.lines.map((l) => ({
        type: "object",
        valueObject: {
          Description: str("Description", l.desc),
          Quantity: { type: "number", valueNumber: l.qty, confidence: 0.95 },
          UnitPrice: money("UnitPrice", l.unit),
          Amount: money("Amount", l.qty * l.unit),
        },
      })),
    },
  };
  if (spec.tin) fields.VendorTaxId = str("VendorTaxId", spec.tin);
  if (spec.due) fields.DueDate = date("DueDate", spec.due);
  return { apiVersion: "2024-11-30", modelId: "prebuilt-invoice", content, pages: [{ pageNumber: 1 }], documents: [{ docType: "invoice", fields }] };
}

const mock: Record<string, unknown> = {};
const answers: Record<string, unknown> = {};
for (const spec of SPECS) {
  const { bytes, content } = await render(spec);
  await writeFile(`samples/${spec.file}`, bytes);
  mock[spec.file] = diResult(spec, content);
  answers[spec.file] = {
    vendorName: spec.vendor,
    vendorTaxId: spec.tin,
    invoiceId: spec.number,
    invoiceDate: spec.date[0],
    dueDate: spec.due?.[0] ?? null,
    currency: spec.currency,
    subtotal: cents(spec.read.subtotal),
    tax: cents(spec.read.tax),
    total: cents(spec.read.total),
    vatableSales: cents(spec.read.vatable),
    vatAmount: cents(spec.read.vat),
  };
}
await writeFile("samples/mock-di.json", JSON.stringify(mock, null, 2) + "\n");
await writeFile("samples/answers.json", JSON.stringify(answers, null, 2) + "\n");
console.log(`Wrote ${SPECS.length} samples to samples/`);

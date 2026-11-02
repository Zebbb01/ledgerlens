// Generates the sample PDFs in samples/, their answer keys, and the results the
// mock Document Intelligence server returns for them. Run: npm run samples
import { writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

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

// One A4 page, drawn twice: into the PDF, and as an SVG thumbnail for the app. The
// text is also collected in reading order, as Document Intelligence returns it.
type RGB = [number, number, number];

async function sheet(title: string) {
  const pdf = await PDFDocument.create();
  const fixed = new Date("2026-10-01T00:00:00Z");
  pdf.setCreationDate(fixed);
  pdf.setModificationDate(fixed);
  pdf.setProducer("LedgerLens samples");
  pdf.setCreator("LedgerLens");
  pdf.setTitle(title);
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const text: string[] = [];
  const rects: string[] = [];
  const texts: string[] = [];
  const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const hex = (c: RGB) => `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
  const INK: RGB = [0.1, 0.12, 0.16];

  // SVG's y axis points down, PDF's up.
  const draw = (s: string, x: number, y: number, size = 10, font: PDFFont = regular, right = false, color: RGB = INK) => {
    page.drawText(s, { x: right ? x - font.widthOfTextAtSize(s, size) : x, y, size, font, color: rgb(...color) });
    const weight = font === bold ? ' font-weight="700"' : "";
    const fill = color === INK ? "" : ` fill="${hex(color)}"`;
    texts.push(`<text x="${x}" y="${842 - y}" font-size="${size}"${weight}${fill}${right ? ' text-anchor="end"' : ""}>${esc(s)}</text>`);
  };
  const rect = (x: number, y: number, width: number, height: number, color: RGB) => {
    page.drawRectangle({ x, y, width, height, color: rgb(...color) });
    rects.push(`<rect x="${x}" y="${842 - y - height}" width="${width}" height="${height}" fill="${hex(color)}"/>`);
  };
  const say = (...lines: string[]) => text.push(...lines);
  const width = (s: string, size: number, font: PDFFont) => font.widthOfTextAtSize(s, size);

  const finish = async () => ({
    bytes: await pdf.save({ useObjectStreams: false }),
    content: text.join("\n"),
    thumbnail: [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595 842">',
      '<rect width="595" height="842" fill="#fff"/>',
      '<g font-family="Helvetica, Arial, sans-serif" fill="#1a1f29">',
      // Backgrounds first, so the text sits on top of them.
      ...rects,
      ...texts,
      "</g></svg>",
    ].join(""),
  });
  return { draw, rect, say, width, finish, regular, bold };
}

const FOOTER = "Sample document generated for LedgerLens. All names and numbers are fictitious.";

async function render(spec: Spec) {
  const { draw, rect, say, finish, regular, bold } = await sheet(`${spec.title} ${spec.number}`);

  draw(spec.vendor, 50, 785, 17, bold);
  say(spec.vendor);
  spec.vendorLines.forEach((l, i) => (draw(l, 50, 768 - i * 13, 9), say(l)));
  if (spec.tin) {
    const tin = `VAT Reg. TIN: ${spec.tin}`;
    draw(tin, 50, 768 - spec.vendorLines.length * 13, 9);
    say(tin);
  }

  draw(spec.title, 545, 785, 14, bold, true);
  say(spec.title);
  const meta = [`${spec.numberLabel} ${spec.number}`, `Date: ${spec.date[1]}`, ...(spec.due ? [`Due: ${spec.due[1]}`] : [])];
  meta.forEach((m, i) => (draw(m, 545, 766 - i * 14, 10, regular, true), say(m)));

  draw("Bill to", 50, 700, 9, bold);
  draw(spec.customer, 50, 686, 11);
  say("Bill to");
  say(spec.customer);

  rect(45, 628, 505, 20, [0.93, 0.95, 0.97]);
  const head: [string, number, boolean][] = [["Description", 52, false], ["Qty", 345, true], ["Unit price", 445, true], ["Amount", 543, true]];
  head.forEach(([h, x, r]) => draw(h, x, 634, 9, bold, r));
  say(head.map(([h]) => h).join(" "));

  let y = 608;
  for (const l of spec.lines) {
    const amount = l.qty * l.unit;
    draw(l.desc, 52, y);
    draw(String(l.qty), 345, y, 10, regular, true);
    draw(fmt(l.unit), 445, y, 10, regular, true);
    draw(fmt(amount), 543, y, 10, regular, true);
    say(`${l.desc} ${l.qty} ${fmt(l.unit)} ${fmt(amount)}`);
    y -= 20;
  }

  y -= 16;
  for (const [label, amount] of spec.totals) {
    const strong = /TOTAL|due/.test(label);
    draw(label, 340, y, 10, strong ? bold : regular);
    draw(`${spec.currency} ${fmt(amount)}`, 543, y, 10, strong ? bold : regular, true);
    say(`${label} ${spec.currency} ${fmt(amount)}`);
    y -= 17;
  }

  draw(FOOTER, 50, 60, 8);
  say(FOOTER);
  return finish();
}

// A marketplace shipping invoice laid out like a real Shopee (SPX) one: the logo is a
// wordmark that is not the company's registered name, and the VAT breakdown uses the
// platform's own labels ("PH VAT STD sales", a plain "VAT" line). On the real invoice
// the model took the logo as the vendor, and that is what this sample reproduces.
const SHIPPING = {
  file: "parcelwave-shipping-invoice.pdf",
  vendor: "Parcelwave Logistics Inc.",
  logo: "PARCELWAVE EXPRESS",
  tin: "241-118-730-00000",
  series: "PWISF000731204556",
  date: ["2026-10-14", "14-Oct-2026"] as [string, string],
  customer: "Harbor & Pine Cafe",
  fee: 249.11,
  vat: 29.89,
  total: 279,
};

async function renderShipping() {
  const s = SHIPPING;
  const { draw, rect, say, width, finish, regular, bold } = await sheet(`Invoice (Logistics) ${s.series}`);
  const GRAY: RGB = [0.42, 0.45, 0.5];
  const BRAND: RGB = [0.05, 0.42, 0.72];
  const LIGHT: RGB = [0.95, 0.95, 0.96];
  const RULE: RGB = [0.1, 0.12, 0.16];
  const centre = (t: string, y: number, size: number, font: PDFFont = regular) =>
    draw(t, 297.5 + width(t, size, font) / 2, y, size, font, true);

  const vendorLines = ["21F Meridian Tower, Garnet Road, Ortigas Center,", "Pasig City, Metro Manila 1605"];
  draw(s.vendor, 40, 790, 14);
  vendorLines.forEach((l, i) => draw(l, 40, 775 - i * 11, 9, bold));
  draw(`VAT REG. TIN: ${s.tin}`, 40, 753, 9, bold);
  draw(`Business Style: ${s.vendor}`, 40, 742, 9, bold);
  draw("PARCELWAVE", 555, 784, 22, bold, true, BRAND);
  draw("EXPRESS", 555, 771, 9, bold, true, BRAND);
  say(s.vendor, ...vendorLines, `VAT REG. TIN: ${s.tin}`, `Business Style: ${s.vendor}`, "PARCELWAVE", "EXPRESS");

  centre("Invoice (Logistics)", 706, 13);
  centre(`Date: ${s.date[1]}`, 692, 9, bold);
  say("Invoice (Logistics)", `Date: ${s.date[1]}`);

  const left: [string, string][] = [
    ["Series Number", s.series],
    ["Bill To", s.customer],
    ["TIN", "-"],
    ["Business Style", "-"],
    ["Address", "12 Mabini Street, Poblacion District,"],
  ];
  const right: [string, string][] = [
    ["Order ID", "2610143QXLMZB"],
    ["Order Paid Date", "11-Oct-2026"],
    ["Payment Method", "Online Banking"],
  ];
  left.forEach(([k, v], i) => (draw(k, 40, 660 - i * 17, 9, regular, false, GRAY), draw(v, 150, 660 - i * 17, 9)));
  draw("Davao City, Davao del Sur, 8000", 150, 581, 9);
  right.forEach(([k, v], i) => (draw(k, 330, 660 - i * 17, 9, regular, false, GRAY), draw(v, 430, 660 - i * 17, 9)));
  left.forEach((row, i) => say(...row, ...(right[i] ?? [])));
  say("Davao City, Davao del Sur, 8000");

  rect(40, 560, 515, 1.2, RULE);
  rect(40, 538, 515, 1, RULE);
  draw("Description", 46, 545, 9, regular, false, GRAY);
  draw("Quantity", 330, 545, 9, regular, false, GRAY);
  draw("Unit Price", 400, 545, 9, regular, false, GRAY);
  draw("Amount", 549, 545, 9, regular, true, GRAY);
  draw("Shipping Fee", 46, 520, 9);
  draw("1", 340, 520, 9);
  draw(fmt(s.fee), 400, 520, 9);
  draw(fmt(s.fee), 549, 520, 9, regular, true);
  rect(40, 510, 515, 0.6, [0.85, 0.86, 0.88]);
  say("Description", "Quantity", "Unit Price", "Amount", "Shipping Fee", "1", fmt(s.fee), fmt(s.fee));

  const vatRows: [string, string][] = [
    ["PH VAT STD sales", fmt(s.fee)],
    ["PH VAT EXEMPT sales", "-"],
    ["PH VAT ZERO sales", "-"],
    ["Total Sales Amount", fmt(s.fee)],
  ];
  const totalRows: [string, string][] = [
    ["Subtotal", fmt(s.fee)],
    ["Discount", "0.00"],
    ["VAT", fmt(s.vat)],
    ["Withholding Tax", "0.00"],
    ["Total Amount Due (PHP)", fmt(s.total)],
  ];
  vatRows.forEach(([k, v], i) => {
    rect(40, 486 - i * 20, 120, 18, LIGHT);
    draw(k, 46, 491 - i * 20, 9);
    draw(v, 225, 491 - i * 20, 9, regular, true);
  });
  totalRows.forEach(([k, v], i) => {
    rect(355, 486 - i * 20, 120, 18, LIGHT);
    draw(k, 361, 491 - i * 20, 9);
    draw(v, 549, 491 - i * 20, 9, regular, true);
  });
  // Document Intelligence reads the two boxes row by row, a label then its value.
  totalRows.forEach((row, i) => say(...(vatRows[i] ?? []), ...row));

  const notes = [
    "Acknowledgment Certificate: AC_123_102026_000999",
    "Series Number: PWISF000000000001-PWISF999999999999",
    "* This is a system-generated document. No signature is required.",
  ];
  notes.forEach((n, i) => draw(n, 40, 370 - i * 12, 8.5, i < 2 ? bold : regular, false, i < 2 ? RULE : GRAY));
  draw(FOOTER, 50, 60, 8);
  say(...notes, FOOTER);
  return finish();
}

// What Document Intelligence returned for the real invoice, in this sample's terms:
// the logo as VendorName, the registered name as VendorAddressRecipient, and the
// series number read at low confidence.
function shippingResult(content: string) {
  const s = SHIPPING;
  const at = { boundingRegions: [{ pageNumber: 1 }] };
  const str = (v: string, confidence: number) => ({ type: "string", valueString: v, content: v, confidence, ...at });
  const money = (amount: number, confidence: number) => ({
    type: "currency",
    valueCurrency: { amount, currencyCode: "PHP" },
    confidence,
    ...at,
  });
  const fields = {
    VendorName: str(s.logo, 0.91),
    VendorAddressRecipient: str(s.vendor, 0.93),
    VendorTaxId: str(s.tin, 0.79),
    CustomerName: str(s.customer, 0.9),
    InvoiceId: str(s.series, 0.54),
    InvoiceDate: { type: "date", valueDate: s.date[0], content: s.date[1], confidence: 0.95, ...at },
    SubTotal: money(s.fee, 0.95),
    TotalDiscount: money(0, 0.75),
    TotalTax: money(s.vat, 0.94),
    InvoiceTotal: money(s.total, 0.95),
    Items: {
      type: "array",
      valueArray: [
        {
          type: "object",
          valueObject: {
            Description: str("Shipping Fee", 0.95),
            Quantity: { type: "number", valueNumber: 1, confidence: 0.95 },
            UnitPrice: money(s.fee, 0.95),
            Amount: money(s.fee, 0.95),
          },
        },
      ],
    },
  };
  return { apiVersion: "2024-11-30", modelId: "prebuilt-invoice", content, pages: [{ pageNumber: 1 }], documents: [{ docType: "invoice", fields }] };
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
  const { bytes, content, thumbnail } = await render(spec);
  await writeFile(`samples/${spec.file}`, bytes);
  await writeFile(`public/samples/${spec.file.replace(/\.pdf$/, ".svg")}`, thumbnail);
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
{
  const s = SHIPPING;
  const { bytes, content, thumbnail } = await renderShipping();
  await writeFile(`samples/${s.file}`, bytes);
  await writeFile(`public/samples/${s.file.replace(/\.pdf$/, ".svg")}`, thumbnail);
  mock[s.file] = shippingResult(content);
  answers[s.file] = {
    vendorName: s.vendor,
    vendorTaxId: s.tin,
    invoiceId: s.series,
    invoiceDate: s.date[0],
    dueDate: null,
    currency: "PHP",
    subtotal: cents(s.fee),
    tax: cents(s.vat),
    total: cents(s.total),
    vatableSales: cents(s.fee),
    vatAmount: cents(s.vat),
  };
}
await writeFile("samples/mock-di.json", JSON.stringify(mock, null, 2) + "\n");
await writeFile("samples/answers.json", JSON.stringify(answers, null, 2) + "\n");
console.log(`Wrote ${SPECS.length + 1} samples to samples/`);

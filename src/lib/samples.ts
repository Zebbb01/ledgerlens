// Sample documents shipped with the app. All names on them are fictitious.
export const SAMPLES = [
  { file: "bluepeak-vat-invoice.pdf", title: "VAT invoice", note: "Philippine VAT invoice with the full VAT breakdown." },
  { file: "ironleaf-receipt.pdf", title: "Official receipt", note: "VAT-inclusive prices, the kind of receipt models misread." },
  { file: "cloudnote-saas-invoice.pdf", title: "SaaS invoice", note: "US dollar invoice with no VAT." },
  { file: "bluepeak-math-error.pdf", title: "Wrong total", note: "The printed total does not add up, so approval is blocked." },
  {
    file: "parcelwave-shipping-invoice.pdf",
    title: "Marketplace shipping invoice",
    note: "Laid out like a real Shopee shipping invoice, with a logo that is not the company's name.",
  },
] as const;

export const isSample = (file: string) => SAMPLES.some((s) => s.file === file);

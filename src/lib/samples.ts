// Sample documents shipped with the app. All names on them are fictitious.
export const SAMPLES = [
  { file: "bluepeak-vat-invoice.pdf", title: "VAT invoice", note: "Philippine VAT invoice. Every check passes." },
  { file: "ironleaf-receipt.pdf", title: "Official receipt", note: "VAT-inclusive prices, one field read with low confidence." },
  { file: "cloudnote-saas-invoice.pdf", title: "SaaS invoice", note: "US dollar invoice with no VAT." },
  { file: "bluepeak-math-error.pdf", title: "Wrong total", note: "The printed total does not add up, so approval is blocked." },
] as const;

export const isSample = (file: string) => SAMPLES.some((s) => s.file === file);

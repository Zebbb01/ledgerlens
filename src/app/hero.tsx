// The landing hero: what LedgerLens does, shown with a real sample document and
// the check it fails, plus the three steps every bill goes through.

const STEPS = [
  {
    title: "Read",
    text: "Azure AI Document Intelligence pulls the vendor, dates, amounts and line items.",
    icon: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  },
  {
    title: "Check",
    text: "Nine checks in code: totals, 12% VAT, the vendor's TIN, dates and duplicates.",
    icon: "M4 6h2m4 0h10M4 12h2m4 0h10M4 18h2m4 0h10M3 6l1 1 2-2",
  },
  {
    title: "Approve",
    text: "A person fixes what failed, then the bill exports as CSV or JSON.",
    icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6",
  },
];

function HeroVisual() {
  return (
    <figure
      role="img"
      aria-label="A sample invoice whose printed total is wrong, beside the failed totals check and the total field flagged for a fix"
      className="relative mx-auto w-full max-w-md pb-6 lg:max-w-none"
    >
      <div aria-hidden="true" className="dot-grid absolute -inset-8" />
      <div aria-hidden="true" className="absolute inset-x-12 top-8 h-48 rounded-full bg-brand/20 blur-3xl" />
      <div className="relative ml-auto w-[78%] -rotate-2 overflow-hidden rounded-xl border border-line bg-white shadow-xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG drawn from the sample PDF */}
        <img src="/samples/bluepeak-math-error.svg" alt="" className="aspect-4/3 w-full object-cover object-top" />
      </div>
      <div className="absolute left-0 top-[42%] w-[72%] rounded-xl border border-line bg-surface p-4 shadow-lg">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Checks</p>
        <ul className="mt-2 space-y-2 text-sm">
          <li className="flex gap-2">
            <span className="w-4 shrink-0 text-center font-bold text-fail">✕</span>
            <span>
              <span className="font-medium">Totals add up</span> <span className="text-xs font-medium text-fail">Failed</span>
              <span className="block text-xs text-muted">1,500.00 + VAT 180.00 = 1,680.00, but the total reads 1,860.00.</span>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="w-4 shrink-0 text-center font-bold text-pass">✓</span>
            <span className="font-medium">VAT is 12%</span>
          </li>
          <li className="flex gap-2">
            <span className="w-4 shrink-0 text-center font-bold text-pass">✓</span>
            <span className="font-medium">Vendor TIN format</span>
          </li>
        </ul>
      </div>
      <div className="absolute right-3 bottom-0 flex items-baseline gap-2 rounded-lg border border-fail bg-surface px-3 py-2 shadow-lg ring-1 ring-fail">
        <span className="text-xs text-muted">Total</span>
        <span className="font-semibold tabular-nums">1,860.00</span>
        <span className="text-xs font-medium text-fail">fix before approval</span>
      </div>
    </figure>
  );
}

export function Hero() {
  return (
    <section className="grid items-center gap-12 lg:grid-cols-2">
      <div>
        <p className="inline-flex rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
          Azure AI Document Intelligence · checks in code
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Invoices and receipts in, checked numbers out.
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-pretty text-muted">
          LedgerLens reads a bill, then checks every number before anyone can approve it. When the model misreads a
          total, the bill waits for a person instead of reaching the books.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href="#add"
            className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-on-brand hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Try a sample
          </a>
          <a
            href="https://github.com/Zebbb01/ledgerlens#how-it-works"
            className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            How it works
          </a>
        </div>
      </div>
      <HeroVisual />

      <ol className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-xl border border-line bg-surface p-4">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="mt-0.5 shrink-0 text-brand">
              <path d={s.icon} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <p className="text-sm font-semibold">
                <span className="text-muted tabular-nums">{i + 1}.</span> {s.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

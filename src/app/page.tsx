import { Workbench } from "./workbench";

export default function Home() {
  return (
    <>
      <section className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Invoices and receipts in, checked numbers out.</h1>
        <p className="mt-3 leading-relaxed text-muted">
          LedgerLens reads a bill with Azure AI Document Intelligence, then checks it in code: totals, line items, 12%
          VAT, dates, the vendor&apos;s TIN and duplicates. A bill that fails a check waits for a person before it can
          be approved and exported to the books.
        </p>
      </section>
      <Workbench />
    </>
  );
}

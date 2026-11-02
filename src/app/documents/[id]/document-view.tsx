"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Status } from "@/lib/db.ts";
import { parseMoney } from "@/lib/edits.ts";
import { toCsv } from "@/lib/exports.ts";
import type { Field, Invoice } from "@/lib/extract.ts";
import { CATEGORIES } from "@/lib/llm.ts";
import { fieldToFix, flaggedFields, summarize, type FieldKey } from "@/lib/review.ts";
import { canApprove, formatMoney, type Check } from "@/lib/validate.ts";
import type { ReactNode } from "react";
import { StatusPill, buttonClass, focusRing } from "../../ui";

type Doc = {
  id: string;
  fileName: string;
  contentType: string;
  status: Status;
  error: string | null;
  cached: boolean;
  invoice: Invoice | null;
  checks: Check[];
  category: string | null;
  categorySource: "model" | "person" | null;
  editedFields: string[];
  createdAt: string;
};

type Kind = "text" | "date" | "money";
const GROUPS: { title: string; fields: [key: keyof Invoice, label: string, kind: Kind][] }[] = [
  {
    title: "Bill",
    fields: [
      ["vendorName", "Vendor", "text"],
      ["vendorTaxId", "Vendor TIN", "text"],
      ["customerName", "Customer", "text"],
      ["invoiceId", "Invoice number", "text"],
      ["invoiceDate", "Invoice date", "date"],
      ["dueDate", "Due date", "date"],
    ],
  },
  {
    title: "Amounts",
    fields: [
      ["subtotal", "Subtotal", "money"],
      ["discount", "Discount", "money"],
      ["tax", "Tax", "money"],
      ["total", "Total", "money"],
    ],
  },
  {
    title: "VAT breakdown",
    fields: [
      ["vatableSales", "VATable sales", "money"],
      ["vatExemptSales", "VAT-exempt sales", "money"],
      ["zeroRatedSales", "Zero-rated sales", "money"],
      ["vatAmount", "VAT amount", "money"],
    ],
  },
];

const CHECK_TITLE: Record<string, string> = {
  required: "Required fields",
  "total-math": "Totals add up",
  "lines-sum": "Line items add up",
  "vat-rate": "VAT is 12%",
  "vat-breakdown": "VAT breakdown adds up",
  dates: "Dates make sense",
  tin: "Vendor TIN format",
  duplicate: "Not a duplicate",
  confidence: "Read confidence",
};

const CHECK_LOOK: Record<Check["status"], { word: string; mark: string; tone: string }> = {
  pass: { word: "Passed", mark: "✓", tone: "text-pass" },
  fail: { word: "Failed", mark: "✕", tone: "text-fail" },
  warn: { word: "Check", mark: "!", tone: "text-warn" },
  skip: { word: "Skipped", mark: "–", tone: "text-skip" },
};

const LABEL = Object.fromEntries(GROUPS.flatMap((g) => g.fields.map(([key, label]) => [key, label]))) as Record<string, string>;

const FLAG_RING = { fail: "border-fail ring-1 ring-fail", warn: "border-warn ring-1 ring-warn", none: "" };

function CheckItem({ check, children }: { check: Check; children?: ReactNode }) {
  const look = CHECK_LOOK[check.status];
  return (
    <li className="flex gap-3 text-sm">
      <span aria-hidden="true" className={`w-4 shrink-0 text-center font-bold ${look.tone}`}>
        {look.mark}
      </span>
      <div className="min-w-0">
        <p>
          <span className="font-medium">{CHECK_TITLE[check.id] ?? check.id}</span>{" "}
          <span className={`text-xs font-medium ${look.tone}`}>{look.word}</span>
        </p>
        <p className="text-muted">{check.message}</p>
        {children}
      </div>
    </li>
  );
}

const show = (f: Field<unknown>, kind: Kind) =>
  f.value === null ? "" : kind === "money" ? formatMoney(f.value as number) : String(f.value);

function formFrom(inv: Invoice | null): Record<string, string> {
  if (!inv) return {};
  const form: Record<string, string> = { currency: inv.currency ?? "" };
  for (const g of GROUPS) for (const [key, , kind] of g.fields) form[key] = show(inv[key] as Field<unknown>, kind);
  return form;
}

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const inputClass = `w-full rounded-lg border border-line bg-surface px-3 py-2 text-base sm:text-sm read-only:bg-canvas ${focusRing}`;

async function fetchDoc(id: string): Promise<Doc | "missing" | null> {
  const res = await fetch(`/api/documents/${id}`, { cache: "no-store" }).catch(() => null);
  if (res?.status === 404) return "missing";
  return res?.ok ? res.json() : null;
}

export function DocumentView() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Doc | "missing" | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const receive = useCallback((d: Doc | "missing") => {
    setDoc(d);
    if (d === "missing") return;
    setForm(formFrom(d.invoice));
    setCategory(d.category ?? "");
  }, []);

  useEffect(() => {
    let live = true;
    void fetchDoc(id).then((d) => {
      if (!live) return;
      if (d) receive(d);
      else setMessage({ error: true, text: "Could not load this document. Refresh to try again." });
    });
    return () => {
      live = false;
    };
  }, [id, version, receive]);

  const waiting = doc !== null && doc !== "missing" && (doc.status === "queued" || doc.status === "processing");
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      setVersion((v) => v + 1);
    }, 2000);
    return () => clearInterval(timer);
  }, [waiting]);

  if (doc === null) return <p className="text-sm text-muted">{message?.text ?? "Loading the document…"}</p>;
  if (doc === "missing") {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-semibold">Document not found</h1>
        <p className="mt-2 text-muted">
          It belongs to another browser, or it was deleted: demo documents are kept for 7 days.
        </p>
        <Link href="/" className={`mt-4 inline-block rounded text-brand hover:underline ${focusRing}`}>
          Back to your documents
        </Link>
      </div>
    );
  }

  const inv = doc.invoice;
  const editable = doc.status === "ready" || doc.status === "needs_review";

  // Only fields the person changed are sent; the server checks them again.
  function changes(): Record<string, unknown> | string {
    if (!inv) return {};
    const out: Record<string, unknown> = {};
    for (const g of GROUPS) {
      for (const [key, label, kind] of g.fields) {
        const before = (inv[key] as Field<unknown>).value;
        const raw = form[key] ?? "";
        if (kind === "money") {
          const cents = parseMoney(raw);
          if (cents === undefined) return `${label} is not an amount. Use a number like 1,234.56.`;
          if (cents !== before) out[key] = cents;
        } else if (raw.trim() !== (before ?? "")) {
          out[key] = raw.trim() || null;
        }
      }
    }
    const currency = (form.currency ?? "").trim().toUpperCase();
    if (currency !== (inv.currency ?? "")) out.currency = currency || null;
    return out;
  }

  async function send(action?: "approve" | "rerun") {
    const fields = action === "rerun" ? {} : changes();
    if (typeof fields === "string") return setMessage({ error: true, text: fields });
    const body: Record<string, unknown> = action ? { action } : {};
    if (Object.keys(fields).length) body.fields = fields;
    if (action !== "rerun" && category !== (doc && doc !== "missing" ? (doc.category ?? "") : "")) body.category = category || null;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMessage({ error: true, text: data.error ?? "Could not save. Try again." });
      receive(data);
      const done = { approve: "Approved. Download the bill below.", rerun: "Queued again." } as const;
      setMessage({ error: false, text: action ? done[action] : "Saved. The checks ran again." });
    } catch {
      setMessage({ error: true, text: "Could not reach LedgerLens. Try again." });
    } finally {
      setSaving(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };

  const seconds = Math.max(0, Math.round((now - new Date(doc.createdAt).getTime()) / 1000));
  const blocked = !canApprove(doc.checks);
  const base = doc.fileName.replace(/\.[^.]+$/, "");
  // What needs a person comes first; passed and skipped checks fold away.
  const summary = summarize(doc.checks);
  const attention = doc.checks.filter((c) => c.status === "fail" || c.status === "warn");
  const settled = doc.checks.filter((c) => c.status === "pass" || c.status === "skip");
  const flags = inv && editable ? flaggedFields(doc.checks, inv) : {};

  return (
    <div>
      <Link href="/" className={`rounded text-sm text-brand hover:underline ${focusRing}`}>
        ← All documents
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">{doc.fileName}</h1>
        <StatusPill status={doc.status} testId="doc-status" />
      </div>

      <div className="mt-2 space-y-1 text-sm text-muted">
        {waiting && (
          <p>
            {doc.status === "queued" ? "Waiting for the worker" : "Reading the document"} ({seconds}s). In Azure the
            worker starts from zero when a document arrives, so the first one can take up to a minute.
          </p>
        )}
        {doc.cached && <p>Reused the analysis of an identical file, so no free pages were used.</p>}
        {doc.status === "failed" && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-fail">{doc.error}</p>
            <button type="button" className={buttonClass.secondary} disabled={saving} onClick={() => void send("rerun")}>
              Run again
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-line bg-surface lg:sticky lg:top-4">
          {doc.contentType === "application/pdf" ? (
            <iframe title="Document preview" src={`/api/documents/${doc.id}/file#navpanes=0&view=FitH`} className="h-[70vh] w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a private, per-browser file
            <img title="Document preview" alt="The uploaded document" src={`/api/documents/${doc.id}/file`} className="w-full" />
          )}
        </div>

        {inv && (
          <div className="space-y-6">
            <section aria-labelledby="checks-heading" className="rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="checks-heading" className="font-semibold">
                  Checks
                </h2>
                <p className="flex flex-wrap gap-1.5 text-xs font-medium">
                  {summary.failed > 0 && (
                    <span className="rounded-full border border-fail/50 px-2 py-0.5 text-fail">{summary.failed} failed</span>
                  )}
                  {summary.warned > 0 && (
                    <span className="rounded-full border border-warn/50 px-2 py-0.5 text-warn">{summary.warned} to check</span>
                  )}
                  <span className="rounded-full border border-pass/50 px-2 py-0.5 text-pass">{summary.passed} passed</span>
                </p>
              </div>
              <p className="mt-1 text-sm text-muted">
                {doc.status === "approved" ? "Approved. Download the bill below." : summary.next}
              </p>

              {attention.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {attention.map((c) => {
                    const target = editable ? fieldToFix(c, inv) : undefined;
                    return (
                      <CheckItem key={c.id} check={c}>
                        {target && (
                          <button
                            type="button"
                            onClick={() => document.getElementById(target)?.focus()}
                            className={`mt-1 rounded text-xs font-medium text-brand hover:underline ${focusRing}`}
                          >
                            Go to {LABEL[target]}
                          </button>
                        )}
                      </CheckItem>
                    );
                  })}
                </ul>
              )}

              <details className="mt-4">
                <summary className={`cursor-pointer rounded text-sm font-medium text-brand ${focusRing}`}>
                  Show {summary.passed} passed{summary.skipped ? ` and ${summary.skipped} skipped` : ""}{" "}
                  {summary.passed + summary.skipped === 1 ? "check" : "checks"}
                </summary>
                <ul className="mt-3 space-y-2.5">
                  {settled.map((c) => (
                    <CheckItem key={c.id} check={c} />
                  ))}
                </ul>
              </details>
            </section>

            <form onSubmit={onSubmit} className="space-y-6 rounded-xl border border-line bg-surface p-5">
              {GROUPS.map((g) => (
                <fieldset key={g.title}>
                  <legend className="font-semibold">{g.title}</legend>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {g.fields.map(([key, label, kind]) => {
                      const f = inv[key] as Field<unknown>;
                      const edited = doc.editedFields.includes(key);
                      const low = !edited && f.confidence !== null && f.confidence < 0.8;
                      const chip = edited
                        ? "edited"
                        : f.confidence !== null
                          ? `${Math.round(f.confidence * 100)}%${low ? ", check" : ""}`
                          : f.value !== null
                            ? "from text"
                            : "";
                      return (
                        <div key={key}>
                          <div className="flex items-baseline justify-between gap-2">
                            <label htmlFor={key} className="text-sm font-medium">
                              {label}
                            </label>
                            {chip && (
                              <span id={`${key}-note`} className={`text-xs ${low ? "text-warn" : "text-muted"}`}>
                                {chip}
                              </span>
                            )}
                          </div>
                          <input
                            id={key}
                            type={kind === "date" ? "date" : "text"}
                            inputMode={kind === "money" ? "decimal" : undefined}
                            readOnly={!editable}
                            aria-describedby={chip ? `${key}-note` : undefined}
                            aria-invalid={flags[key as FieldKey] === "fail" || undefined}
                            value={form[key] ?? ""}
                            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                            className={`mt-1 ${inputClass} ${kind === "money" ? "text-right tabular-nums" : ""} ${FLAG_RING[flags[key as FieldKey] ?? "none"]}`}
                          />
                        </div>
                      );
                    })}
                    {g.title === "Bill" && (
                      <div>
                        <label htmlFor="currency" className="text-sm font-medium">
                          Currency
                        </label>
                        <input
                          id="currency"
                          maxLength={3}
                          readOnly={!editable}
                          value={form.currency ?? ""}
                          onChange={(e) => setForm({ ...form, currency: e.target.value })}
                          className={`mt-1 uppercase ${inputClass}`}
                        />
                      </div>
                    )}
                  </div>
                </fieldset>
              ))}

              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="category" className="text-sm font-medium">
                    Category
                  </label>
                  {doc.categorySource === "model" && <span className="text-xs text-muted">suggested by the model</span>}
                </div>
                <select
                  id="category"
                  disabled={!editable}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                >
                  <option value="">Not set</option>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              {inv.lines.length > 0 && (
                <div>
                  <h2 className="font-semibold">Line items</h2>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-104 text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs text-muted">
                          <th className="py-2 pr-3 font-medium">Description</th>
                          <th className="py-2 pr-3 text-right font-medium">Qty</th>
                          <th className="py-2 pr-3 text-right font-medium">Unit price</th>
                          <th className="py-2 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="tabular-nums">
                        {inv.lines.map((l, i) => (
                          <tr key={i} className="border-b border-line last:border-0">
                            <td className="py-2 pr-3">{l.description ?? "—"}</td>
                            <td className="py-2 pr-3 text-right">{l.quantity ?? "—"}</td>
                            <td className="py-2 pr-3 text-right">{l.unitPrice === null ? "—" : formatMoney(l.unitPrice)}</td>
                            <td className="py-2 text-right">{l.amount === null ? "—" : formatMoney(l.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {editable && (
                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
                  <button type="submit" className={buttonClass.secondary} disabled={saving}>
                    Save changes
                  </button>
                  <button
                    type="button"
                    className={buttonClass.primary}
                    disabled={saving || blocked}
                    onClick={() => void send("approve")}
                  >
                    Approve
                  </button>
                  {blocked && <p className="text-sm text-muted">Fix the failed checks, then save, to approve.</p>}
                </div>
              )}
              <p
                role={message?.error ? "alert" : "status"}
                className={`min-h-5 text-sm ${message?.error ? "text-fail" : "text-muted"}`}
              >
                {message?.text ?? ""}
              </p>
            </form>

            <section aria-labelledby="export-heading" className="rounded-xl border border-line bg-surface p-5">
              <h2 id="export-heading" className="font-semibold">
                Export
              </h2>
              <p className="mt-1 text-sm text-muted">One row per line item, ready for a bill import.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  className={buttonClass.secondary}
                  onClick={() =>
                    download(
                      `${base}.csv`,
                      "text/csv",
                      toCsv([{ fileName: doc.fileName, status: doc.status, category: doc.category, invoice: inv }]),
                    )
                  }
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  className={buttonClass.secondary}
                  onClick={() => download(`${base}.json`, "application/json", JSON.stringify(doc, null, 2))}
                >
                  Download JSON
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

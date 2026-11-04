"use client";

// The review screen: the original on the left, what was read and checked on the
// right, and the decision in a bar that stays in view.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Status } from "@/lib/db.ts";
import { parseMoney } from "@/lib/edits.ts";
import { toCsv } from "@/lib/exports.ts";
import type { Field, Invoice } from "@/lib/extract.ts";
import { CATEGORIES } from "@/lib/llm.ts";
import { fieldToFix, flaggedFields, summarize, type FieldKey } from "@/lib/review.ts";
import { canApprove, formatMoney, type Check } from "@/lib/validate.ts";
import { toast } from "../../toast";
import { Badge, Button, Icon, Skeleton, Spinner, StatusBadge, WORKING, focusRing, inputClass, selectClass } from "../../ui";

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

const CHECK_LOOK: Record<Check["status"], { word: string; icon: "check" | "x" | "alert" | "minus"; tone: string }> = {
  pass: { word: "Passed", icon: "check", tone: "text-pass" },
  fail: { word: "Failed", icon: "x", tone: "text-fail" },
  warn: { word: "Check", icon: "alert", tone: "text-warn" },
  skip: { word: "Skipped", icon: "minus", tone: "text-skip" },
};

const LABEL = Object.fromEntries(GROUPS.flatMap((g) => g.fields.map(([key, label]) => [key, label]))) as Record<string, string>;
const FLAG_RING = { fail: "border-fail ring-1 ring-fail", warn: "border-warn ring-1 ring-warn", none: "" };
const sectionLabel = "text-2xs font-semibold tracking-wider text-muted uppercase";

function CheckItem({ check, children }: { check: Check; children?: ReactNode }) {
  const look = CHECK_LOOK[check.status];
  return (
    <li className="flex gap-2.5 text-sm">
      <Icon name={look.icon} size={15} className={`mt-0.5 ${look.tone}`} />
      <div className="min-w-0">
        <p>
          <span className="font-medium">{CHECK_TITLE[check.id] ?? check.id}</span>{" "}
          <span className={`text-xs ${look.tone}`}>{look.word}</span>
        </p>
        <p className="text-muted">{check.message}</p>
        {children}
      </div>
    </li>
  );
}

const show = (f: Field<unknown>, kind: Kind) => (f.value === null ? "" : kind === "money" ? formatMoney(f.value as number) : String(f.value));

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "approve" | "rerun" | null>(null);
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
      else setError("Could not load this document. Refresh to try again.");
    });
    return () => {
      live = false;
    };
  }, [id, version, receive]);

  const waiting = doc !== null && doc !== "missing" && WORKING.includes(doc.status);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      setVersion((v) => v + 1);
    }, 2000);
    return () => clearInterval(timer);
  }, [waiting]);

  if (doc === null) return error ? <p className="p-4 text-sm text-fail">{error}</p> : <PageSkeleton />;
  if (doc === "missing") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm">
        <p className="text-base font-medium">Document not found</p>
        <p className="mt-1 text-muted">It belongs to another browser, or it was deleted: demo documents are kept for 7 days.</p>
        <Link href="/" className={`mt-3 inline-block rounded-sm text-brand hover:underline ${focusRing}`}>
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
    if (typeof fields === "string") return setError(fields);
    const body: Record<string, unknown> = action ? { action } : {};
    if (Object.keys(fields).length) body.fields = fields;
    if (action !== "rerun" && category !== (doc && doc !== "missing" ? (doc.category ?? "") : "")) body.category = category || null;
    setSaving(action ?? "save");
    setError(null);
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Could not save. Try again.");
      receive(data);
      const done = { approve: "Approved. Download it for the books.", rerun: "Queued again" } as const;
      toast(action ? done[action] : "Saved. The checks ran again.", "pass");
    } catch {
      setError("Could not reach LedgerLens. Try again.");
    } finally {
      setSaving(null);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send();
  };

  const seconds = Math.max(0, Math.round((now - new Date(doc.createdAt).getTime()) / 1000));
  const blocked = !canApprove(doc.checks);
  const base = doc.fileName.replace(/\.[^.]+$/, "");
  const summary = summarize(doc.checks);
  // What needs a person comes first; passed and skipped checks fold away.
  const attention = doc.checks.filter((c) => c.status === "fail" || c.status === "warn");
  const settled = doc.checks.filter((c) => c.status === "pass" || c.status === "skip");
  const flags = inv && editable ? flaggedFields(doc.checks, inv) : {};

  return (
    <div>
      <div className="sticky top-12 z-10 border-b border-line bg-surface">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 sm:px-4 lg:h-12 lg:flex-nowrap lg:py-0">
          <Link href="/" className={`flex items-center gap-1 rounded-sm text-sm text-muted hover:text-ink ${focusRing}`}>
            <Icon name="back" size={14} />
            Documents
          </Link>
          <span aria-hidden="true" className="text-line-strong">
            /
          </span>
          <h1 className="min-w-0 truncate text-base font-semibold">{doc.fileName}</h1>
          <StatusBadge status={doc.status} testId="doc-status" />
          {inv && (
            <div className="ml-auto flex shrink-0 gap-1.5">
              <Button
                size="sm"
                onClick={() =>
                  download(`${base}.csv`, "text/csv", toCsv([{ fileName: doc.fileName, status: doc.status, category: doc.category, invoice: inv }]))
                }
              >
                <Icon name="download" size={14} />
                Download CSV
              </Button>
              <Button size="sm" variant="ghost" onClick={() => download(`${base}.json`, "application/json", JSON.stringify(doc, null, 2))}>
                Download JSON
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="border-b border-line bg-subtle lg:sticky lg:top-24 lg:h-[calc(100dvh-6rem)] lg:border-r lg:border-b-0">
          {doc.contentType === "application/pdf" ? (
            <iframe title="Document preview" src={`/api/documents/${doc.id}/file#navpanes=0&view=FitH`} className="h-[60dvh] w-full lg:h-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a private, per-browser file
            <img title="Document preview" alt="The uploaded document" src={`/api/documents/${doc.id}/file`} className="mx-auto max-h-full w-full object-contain" />
          )}
        </div>

        <div className="min-w-0">
          {waiting && (
            <div role="status" className="border-b border-line px-4 py-4 sm:px-5">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Spinner className="text-brand" />
                {doc.status === "queued" ? "Waiting for the reader" : "Reading the document"}
                <span className="font-normal text-muted tabular-nums">{seconds} s</span>
              </p>
              <p className="mt-1 text-xs text-muted">After a quiet spell the reader starts from zero, so the first document can take up to a minute.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="grid gap-1.5">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-8 w-full rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {doc.status === "failed" && (
            <div role="alert" className="m-4 flex flex-wrap items-center gap-3 rounded-md bg-fail-soft px-3 py-2.5 text-sm text-fail sm:mx-5">
              <Icon name="alert" size={15} />
              <span className="min-w-0 flex-1">{doc.error}</span>
              <Button size="sm" loading={saving === "rerun"} onClick={() => void send("rerun")}>
                Run again
              </Button>
            </div>
          )}

          {inv && (
            <>
              <section aria-labelledby="checks-heading" className="border-b border-line px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="checks-heading" className={sectionLabel}>
                    Checks
                  </h2>
                  <p className="flex flex-wrap gap-1">
                    {summary.failed > 0 && <Badge tone="fail">{summary.failed} failed</Badge>}
                    {summary.warned > 0 && <Badge tone="warn">{summary.warned} to check</Badge>}
                    <Badge tone="pass">{summary.passed} passed</Badge>
                  </p>
                </div>
                <p className="mt-1.5 text-sm text-ink-2">{doc.status === "approved" ? "Approved. Download the bill for the books." : summary.next}</p>
                {doc.cached && <p className="mt-0.5 text-xs text-muted">Reused the analysis of an identical file, so no free pages were used.</p>}

                {attention.length > 0 && (
                  <ul className="mt-3 grid gap-3">
                    {attention.map((c) => {
                      const target = editable ? fieldToFix(c, inv) : undefined;
                      return (
                        <CheckItem key={c.id} check={c}>
                          {target && (
                            <button
                              type="button"
                              onClick={() => document.getElementById(target)?.focus()}
                              className={`mt-0.5 rounded-sm text-xs font-medium text-brand hover:underline ${focusRing}`}
                            >
                              Go to {LABEL[target]}
                            </button>
                          )}
                        </CheckItem>
                      );
                    })}
                  </ul>
                )}

                <details className="group mt-3">
                  <summary className={`flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-xs font-medium text-brand ${focusRing}`}>
                    <Icon name="chevron" size={14} className="-rotate-90 transition-transform group-open:rotate-0" />
                    Show {summary.passed} passed{summary.skipped ? ` and ${summary.skipped} skipped` : ""} {summary.passed + summary.skipped === 1 ? "check" : "checks"}
                  </summary>
                  <ul className="mt-2.5 grid gap-2">
                    {settled.map((c) => (
                      <CheckItem key={c.id} check={c} />
                    ))}
                  </ul>
                </details>
              </section>

              <form onSubmit={onSubmit}>
                {GROUPS.map((g) => (
                  <fieldset key={g.title} className="border-b border-line px-4 py-4 sm:px-5">
                    <legend className={`${sectionLabel} float-left mb-3 w-full`}>{g.title}</legend>
                    <div className="clear-both grid gap-x-3 gap-y-2.5 sm:grid-cols-2">
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
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <label htmlFor={key} className="text-sm text-ink-2">
                                {label}
                              </label>
                              {chip && (
                                <span id={`${key}-note`} className={`text-2xs tabular-nums ${low ? "font-medium text-warn" : "text-muted"}`}>
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
                              className={`${inputClass} ${kind === "money" ? "text-right tabular-nums" : ""} ${FLAG_RING[flags[key as FieldKey] ?? "none"]}`}
                            />
                          </div>
                        );
                      })}
                      {g.title === "Bill" && (
                        <div>
                          <label htmlFor="currency" className="mb-1 block text-sm text-ink-2">
                            Currency
                          </label>
                          <input
                            id="currency"
                            maxLength={3}
                            readOnly={!editable}
                            value={form.currency ?? ""}
                            onChange={(e) => setForm({ ...form, currency: e.target.value })}
                            className={`uppercase ${inputClass}`}
                          />
                        </div>
                      )}
                      {g.title === "Bill" && (
                        <div>
                          <div className="mb-1 flex items-baseline justify-between gap-2">
                            <label htmlFor="category" className="text-sm text-ink-2">
                              Category
                            </label>
                            {doc.categorySource === "model" && <span className="text-2xs text-muted">suggested</span>}
                          </div>
                          <div className="relative">
                            <select id="category" disabled={!editable} value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
                              <option value="">Not set</option>
                              {CATEGORIES.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                            <Icon name="chevron" size={14} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted" />
                          </div>
                        </div>
                      )}
                    </div>
                  </fieldset>
                ))}

                {inv.lines.length > 0 && (
                  <section aria-labelledby="lines-heading" className="border-b border-line px-4 py-4 sm:px-5">
                    <h2 id="lines-heading" className={sectionLabel}>
                      Line items
                    </h2>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-104 text-sm">
                        <thead>
                          <tr className="border-b border-line text-left text-xs text-muted">
                            <th className="py-1.5 pr-3 font-medium">Description</th>
                            <th className="py-1.5 pr-3 text-right font-medium">Qty</th>
                            <th className="py-1.5 pr-3 text-right font-medium">Unit price</th>
                            <th className="py-1.5 text-right font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="tabular-nums">
                          {inv.lines.map((l, i) => (
                            <tr key={i} className="border-b border-line last:border-0">
                              <td className="py-1.5 pr-3">{l.description ?? "—"}</td>
                              <td className="py-1.5 pr-3 text-right">{l.quantity ?? "—"}</td>
                              <td className="py-1.5 pr-3 text-right">{l.unitPrice === null ? "—" : formatMoney(l.unitPrice)}</td>
                              <td className="py-1.5 text-right">{l.amount === null ? "—" : formatMoney(l.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {editable && (
                  <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:px-5">
                    <p className={`mr-auto text-xs ${blocked ? "text-fail" : "text-muted"}`}>
                      {blocked ? "Fix the failed checks and save to approve." : "Changes run the checks again when saved."}
                    </p>
                    <Button type="submit" loading={saving === "save"} disabled={saving !== null}>
                      Save changes
                    </Button>
                    <Button variant="primary" loading={saving === "approve"} disabled={saving !== null || blocked} onClick={() => void send("approve")}>
                      Approve
                    </Button>
                  </div>
                )}
              </form>
            </>
          )}

          {error && (
            <p role="alert" className="px-4 py-3 text-sm text-fail sm:px-5">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div aria-label="Loading the document" className="grid lg:grid-cols-2">
      <div className="h-[60dvh] bg-subtle lg:h-[calc(100dvh-3rem)]" />
      <div className="grid content-start gap-3 p-5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}

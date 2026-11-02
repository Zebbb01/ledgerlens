"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Status } from "@/lib/db.ts";
import { SAMPLES } from "@/lib/samples.ts";
import { formatMoney } from "@/lib/validate.ts";
import { StatusPill, buttonClass, focusRing } from "./ui";

type Row = {
  id: string;
  fileName: string;
  status: Status;
  createdAt: string;
  vendor: string | null;
  invoiceId: string | null;
  total: number | null;
  currency: string | null;
};

const added = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function fetchRows(): Promise<Row[] | null> {
  try {
    const res = await fetch("/api/documents", { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export function Workbench() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    void fetchRows().then((result) => {
      if (!live) return;
      setLoadFailed(result === null);
      if (result) setRows(result);
    });
    return () => {
      live = false;
    };
  }, [version]);

  const working = rows?.some((r) => r.status === "queued" || r.status === "processing");
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => setVersion((v) => v + 1), 3000);
    return () => clearInterval(timer);
  }, [working]);

  async function add(init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/documents", { method: "POST", ...init });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "Something went wrong. Try again.");
      router.push(`/documents/${body.id}`);
    } catch {
      setError("Could not reach LedgerLens. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    void add({ body: form });
  }

  const runSample = (file: string) =>
    void add({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sample: file }) });

  return (
    <div id="add" className="mt-14 grid scroll-mt-6 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section aria-labelledby="add-heading" className="rounded-xl border border-line bg-surface p-5">
        <h2 id="add-heading" className="font-semibold">
          Add a document
        </h2>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file && !busy) upload(file);
          }}
          className={`mt-3 rounded-lg border-2 border-dashed px-4 py-6 text-center ${dragging ? "border-brand" : "border-line"}`}
        >
          <label className={`${buttonClass.primary} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand`}>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              className="sr-only"
              aria-describedby="file-help"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) upload(file);
              }}
            />
            Upload an invoice or receipt
          </label>
          <p id="file-help" className="mt-3 text-sm text-muted">
            Or drop a file here. PDF, PNG or JPEG up to 4 MB; the free tier reads the first two pages.
          </p>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-fail">
            {error}
          </p>
        )}

        <h3 className="mt-6 text-sm font-semibold">Try a sample</h3>
        <ul className="mt-2 grid grid-cols-2 gap-3">
          {SAMPLES.map((s) => (
            <li key={s.file}>
              <button
                type="button"
                onClick={() => runSample(s.file)}
                disabled={busy}
                className={`group flex h-full w-full flex-col overflow-hidden rounded-lg border border-line text-left hover:border-brand disabled:cursor-wait disabled:opacity-60 ${focusRing}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG drawn from the sample PDF */}
                <img
                  src={`/samples/${s.file.replace(/\.pdf$/, ".svg")}`}
                  alt=""
                  className="aspect-3/2 w-full border-b border-line bg-white object-cover object-top"
                />
                <span className="block px-3 pt-2.5 text-sm font-medium group-hover:text-brand">{s.title}</span>
                <span className="block px-3 pb-3 text-xs leading-relaxed text-muted">{s.note}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 min-h-5 text-sm text-muted" aria-live="polite">
          {busy ? "Adding the document…" : ""}
        </p>
      </section>

      <section aria-labelledby="docs-heading" className="rounded-xl border border-line bg-surface p-5">
        <h2 id="docs-heading" className="font-semibold">
          Your documents
        </h2>
        <p className="mt-1 text-sm text-muted">Private to this browser.</p>
        <div className="mt-4">
          {loadFailed ? (
            <p role="alert" className="text-sm text-fail">
              Could not load your documents. Refresh the page to try again.
            </p>
          ) : rows === null ? (
            <p className="text-sm text-muted">Loading documents…</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-6 py-12 text-center">
              <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" className="text-muted">
                <path
                  d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="mt-3 text-sm font-medium">No documents yet.</p>
              <p className="mt-1 max-w-xs text-sm text-muted">
                Run a sample or upload a bill. Each one shows up here with its checks.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-136 text-sm sm:min-w-0">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">File</th>
                    <th className="py-2 pr-3 font-medium">Vendor</th>
                    <th className="py-2 pr-3 text-right font-medium">Total</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="hidden py-2 font-medium sm:table-cell">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/documents/${r.id}`}
                          title={r.fileName}
                          className={`block max-w-40 truncate rounded font-medium text-brand hover:underline ${focusRing}`}
                        >
                          {r.fileName}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="block max-w-40 truncate" title={r.vendor ?? undefined}>
                          {r.vendor ?? "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
                        {r.total === null ? "—" : `${r.currency ?? ""} ${formatMoney(r.total)}`.trim()}
                      </td>
                      <td className="py-2.5 pr-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="hidden whitespace-nowrap py-2.5 text-muted sm:table-cell">{added.format(new Date(r.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

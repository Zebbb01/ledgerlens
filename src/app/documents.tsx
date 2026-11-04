"use client";

// The home page: this browser's documents in one dense table, with upload and the
// samples a click away. A file dropped anywhere on the table is uploaded.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Status } from "@/lib/db.ts";
import { SAMPLES } from "@/lib/samples.ts";
import { formatMoney } from "@/lib/validate.ts";
import { Button, Dialog, Icon, Skeleton, Spinner, StatusBadge, WORKING, buttonClass, focusRing } from "./ui";

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
const thumb = (file: string) => `/samples/${file.replace(/\.pdf$/, ".svg")}`;

export function Documents() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [samples, setSamples] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/documents", { cache: "no-store" })
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) return setState("error");
        setRows(await res.json());
        setState("ready");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [version]);

  const working = rows?.some((r) => WORKING.includes(r.status));
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => setVersion((v) => v + 1), 3000);
    return () => clearInterval(timer);
  }, [working]);

  async function add(init: RequestInit, key: string) {
    setPending(key);
    setError(null);
    try {
      const res = await fetch("/api/documents", { method: "POST", ...init });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "That did not work. Try again.");
      // Next keeps the left page alive in the background; an open modal would keep
      // the next page inert, so it closes first.
      setSamples(false);
      router.push(`/documents/${body.id}`);
    } catch {
      setError("Could not reach LedgerLens. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  function upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    void add({ body: form }, "upload");
  }

  const runSample = (file: string) =>
    void add({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sample: file }) }, file);

  return (
    <div className="mx-auto max-w-6xl px-3 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted">Private to this browser. Deleted after 7 days.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setSamples(true)} disabled={pending !== null}>
            Try a sample
          </Button>
          <label className={`${buttonClass("primary")} cursor-pointer has-disabled:cursor-wait has-disabled:opacity-60 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand`}>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              aria-label="Upload an invoice or receipt"
              className="sr-only"
              disabled={pending !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) upload(file);
              }}
            />
            {pending === "upload" ? <Spinner /> : <Icon name="upload" size={14} />}
            Upload
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 flex items-center gap-2 rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">
          <Icon name="alert" size={15} />
          {error}
        </p>
      )}

      <section
        aria-label="Your documents"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file && pending === null) upload(file);
        }}
        className="relative mt-4 overflow-hidden rounded-lg border border-line bg-surface"
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg border-2 border-dashed border-brand bg-brand-soft/90 text-sm font-medium text-brand">
            Drop to upload
          </div>
        )}

        {state === "loading" && <TableSkeleton />}
        {state === "error" && (
          <div className="p-4 text-sm">
            <p>Your documents could not be loaded.</p>
            <Button size="sm" className="mt-2" onClick={() => setVersion((v) => v + 1)}>
              Try again
            </Button>
          </div>
        )}
        {state === "ready" && rows?.length === 0 && (
          <div className="px-4 py-8 sm:px-6">
            <div className="flex items-center gap-2">
              <Icon name="file" size={18} className="text-muted" />
              <p className="text-base font-medium">No documents yet</p>
            </div>
            <p className="mt-1 text-sm text-muted">Upload a bill, or start with a sample. Drop a file here any time.</p>
            <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {SAMPLES.map((s) => (
                <li key={s.file}>
                  <SampleTile sample={s} pending={pending === s.file} disabled={pending !== null} onClick={() => runSample(s.file)} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {state === "ready" && !!rows?.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs text-muted">
                <tr>
                  <th className="w-[32%] px-3 py-2 font-medium">Document</th>
                  <th className="hidden w-[26%] px-3 py-2 font-medium sm:table-cell">Vendor</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Invoice no.</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-subtle">
                    <td className="max-w-0 px-3 py-2">
                      <Link href={`/documents/${r.id}`} title={r.fileName} className={`flex items-center gap-2 rounded-sm font-medium text-ink hover:text-brand ${focusRing}`}>
                        <Icon name="file" size={15} className="text-muted" />
                        <span className="truncate">{r.fileName}</span>
                      </Link>
                      <span className="block truncate pl-6 text-xs text-muted sm:hidden">{r.vendor ?? "Vendor not read"}</span>
                    </td>
                    <td className="hidden max-w-0 px-3 py-2 sm:table-cell">
                      <span className="block truncate" title={r.vendor ?? undefined}>
                        {r.vendor ?? <span className="text-muted">—</span>}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2 font-mono text-xs whitespace-nowrap text-ink-2 md:table-cell">{r.invoiceId ?? "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {r.total === null ? <span className="text-muted">—</span> : `${r.currency ?? ""} ${formatMoney(r.total)}`.trim()}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="hidden px-3 py-2 text-right whitespace-nowrap text-muted tabular-nums md:table-cell">{added.format(new Date(r.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-2 text-xs text-muted">PDF, PNG or JPEG up to 4 MB. The free tier reads the first two pages.</p>

      <Dialog open={samples} onClose={() => setSamples(false)} title="Try a sample" description="Made-up bills that show what the checks catch." wide>
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
          {SAMPLES.map((s) => (
            <li key={s.file}>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => runSample(s.file)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-subtle disabled:cursor-wait ${focusRing} focus-visible:-outline-offset-2`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG drawn from the sample PDF */}
                <img src={thumb(s.file)} alt="" className="h-12 w-9 shrink-0 rounded-sm border border-line bg-white object-cover object-top" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {s.title}
                    {pending === s.file && <Spinner className="text-brand" />}
                  </span>
                  <span className="block truncate text-xs text-muted">{s.note}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

function SampleTile({ sample, pending, disabled, onClick }: { sample: (typeof SAMPLES)[number]; pending: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group flex h-full w-full flex-col overflow-hidden rounded-md border border-line text-left hover:border-brand disabled:cursor-wait ${focusRing}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG drawn from the sample PDF */}
      <img src={thumb(sample.file)} alt="" className="h-20 w-full border-b border-line bg-white object-cover object-top" />
      <span className="flex items-center gap-1.5 px-2 pt-1.5 text-sm font-medium group-hover:text-brand">
        {sample.title}
        {pending && <Spinner className="text-brand" />}
      </span>
      <span className="px-2 pb-2">
        <span className="line-clamp-2 text-xs text-muted">{sample.note}</span>
      </span>
    </button>
  );
}

function TableSkeleton() {
  return (
    <div aria-label="Loading documents" className="divide-y divide-line">
      <div className="h-8 bg-canvas" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-3 py-3">
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="hidden h-3 w-1/5 sm:block" />
          <Skeleton className="ml-auto h-3 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

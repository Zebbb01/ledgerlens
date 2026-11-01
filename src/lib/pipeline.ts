// One queued document, start to finish: read the file, analyze it (or reuse the
// analysis of an identical file), check the numbers, and save the result.
import type { Db } from "mongodb";
import { analyses, documents, type DocRecord } from "./db.ts";
import { normalize, type AnalyzeResult, type Invoice } from "./extract.ts";
import { monthKey, take } from "./quota.ts";
import { statusFor, validate } from "./validate.ts";

export type PipelineDeps = {
  readFile: (blobName: string) => Promise<Uint8Array>;
  analyze: (bytes: Uint8Array) => Promise<AnalyzeResult>;
  suggestCategory?: (invoice: Invoice) => Promise<string | null>;
  monthlyPageCap: number;
  now?: () => Date;
};

// ponytail: the free tier reads at most 2 pages per analysis, so each analysis
// reserves 2 pages of the monthly allowance; count real pages on a paid tier.
export const PAGES_PER_ANALYSIS = 2;

const QUOTA_MESSAGE = "This month's free analysis allowance is used up. The sample documents still work.";

// "Today" on the earliest calendar in use (UTC+14), so no time zone sees a valid
// invoice dated today as being in the future.
const latestToday = (now: Date) => new Date(now.getTime() + 14 * 3600_000).toISOString().slice(0, 10);

// Keeps what normalize() reads and drops word positions, which make up most of a
// result and would crowd the free database.
function trim(result: AnalyzeResult): AnalyzeResult {
  const documents = JSON.parse(
    JSON.stringify(result.documents ?? [], (k, v) => (k === "polygon" || k === "spans" ? undefined : v)),
  );
  return { content: (result.content ?? "").slice(0, 100_000), pages: (result.pages ?? []).map((_, i) => ({ pageNumber: i + 1 })), documents };
}

function publicMessage(e: unknown) {
  if (e instanceof Error && (e.message.startsWith("Document Intelligence") || e.message === QUOTA_MESSAGE)) return e.message;
  console.error("Processing failed", e);
  return "Processing failed. Run it again; if it keeps failing, the file may be unreadable.";
}

// Runs the checks, including the lookup for another document in the same
// workspace with this vendor and invoice number. Also used after a person edits.
export async function recheck(db: Db, doc: DocRecord, invoice: Invoice, now = new Date()) {
  const duplicate =
    invoice.vendorName.value && invoice.invoiceId.value
      ? await documents(db).findOne(
          {
            workspaceId: doc.workspaceId,
            _id: { $ne: doc._id },
            status: { $ne: "failed" },
            "invoice.vendorName.value": invoice.vendorName.value,
            "invoice.invoiceId.value": invoice.invoiceId.value,
          },
          { projection: { fileName: 1 } },
        )
      : null;
  const checks = validate(invoice, { today: latestToday(now), duplicateOf: duplicate?.fileName });
  return { checks, status: statusFor(checks) };
}

export async function processDocument(
  db: Db,
  ref: { id: string; workspaceId: string },
  deps: PipelineDeps,
): Promise<DocRecord["status"] | "skipped"> {
  const now = (deps.now ?? (() => new Date()))();
  const where = { _id: ref.id, workspaceId: ref.workspaceId };
  // "processing" too: the queue redelivers a message when a worker stopped before
  // finishing, and the queue's visibility timeout keeps two workers apart.
  const doc = await documents(db).findOneAndUpdate(
    { ...where, status: { $in: ["queued", "processing"] } },
    { $set: { status: "processing", updatedAt: now } },
    { returnDocument: "after" },
  );
  if (!doc) return "skipped";

  try {
    const bytes = await deps.readFile(doc.blobName);
    const key = { _id: doc.sha256, sha256: doc.sha256 };
    let result = (await analyses(db).findOne(key))?.result;
    const cached = Boolean(result);
    if (!result) {
      if (!(await take(db, monthKey(now), PAGES_PER_ANALYSIS, deps.monthlyPageCap))) throw new Error(QUOTA_MESSAGE);
      result = trim(await deps.analyze(bytes));
      await analyses(db).updateOne(key, { $set: { result, createdAt: now } }, { upsert: true });
    }

    const invoice = normalize(result);
    const { checks, status } = await recheck(db, doc, invoice, now);
    const category = deps.suggestCategory ? await deps.suggestCategory(invoice).catch(() => null) : null;

    await documents(db).updateOne(where, {
      $set: { status, invoice, checks, cached, category, categorySource: category ? "model" : null, error: null, updatedAt: now },
    });
    return status;
  } catch (e) {
    await documents(db).updateOne(where, { $set: { status: "failed", error: publicMessage(e), updatedAt: now } });
    return "failed";
  }
}

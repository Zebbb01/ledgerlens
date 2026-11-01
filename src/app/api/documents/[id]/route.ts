import { documents, getDb, type DocRecord } from "@/lib/db.ts";
import { applyEdits, type Edit } from "@/lib/edits.ts";
import { fail } from "@/lib/http.ts";
import { CATEGORIES } from "@/lib/llm.ts";
import { recheck } from "@/lib/pipeline.ts";
import { enqueue } from "@/lib/storage.ts";
import { canApprove } from "@/lib/validate.ts";
import { workspaceId } from "@/lib/workspace.ts";

type Ctx = RouteContext<"/api/documents/[id]">;

// What the browser sees: no storage names, hashes or workspace IDs.
function view(d: DocRecord) {
  return {
    id: d._id,
    fileName: d.fileName,
    contentType: d.contentType,
    status: d.status,
    error: d.error ?? null,
    cached: d.cached ?? false,
    invoice: d.invoice ?? null,
    checks: d.checks ?? [],
    category: d.category ?? null,
    categorySource: d.categorySource ?? null,
    editedFields: [...new Set(d.edits.map((e) => e.field))],
    createdAt: d.createdAt,
    approvedAt: d.approvedAt ?? null,
  };
}

async function load(ctx: Ctx) {
  const { id } = await ctx.params;
  const [ws, db] = await Promise.all([workspaceId(), getDb()]);
  return { db, doc: await documents(db).findOne({ _id: id, workspaceId: ws }) };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { doc } = await load(ctx);
  return doc ? Response.json(view(doc)) : fail(404, "Document not found.");
}

// Corrections, a category, approval, or another run for a failed document.
export async function PATCH(req: Request, ctx: Ctx) {
  const { db, doc } = await load(ctx);
  if (!doc) return fail(404, "Document not found.");
  const body = (await req.json().catch(() => null)) as {
    fields?: Record<string, unknown>;
    category?: unknown;
    action?: unknown;
  } | null;
  if (!body || typeof body !== "object") return fail(400, "Send a JSON object.");
  const where = { _id: doc._id, workspaceId: doc.workspaceId };
  const now = new Date();

  if (body.action === "rerun") {
    if (doc.status !== "failed") return fail(409, "Only a failed document can be run again.");
    await documents(db).updateOne(where, { $set: { status: "queued", error: null, updatedAt: now } });
    await enqueue({ id: doc._id, workspaceId: doc.workspaceId });
    return Response.json(view({ ...doc, status: "queued", error: null }));
  }

  if (!doc.invoice || (doc.status !== "ready" && doc.status !== "needs_review")) {
    return fail(409, "This document can no longer be changed.");
  }
  if (body.action !== undefined && body.action !== "approve") return fail(400, "Unknown action.");

  let invoice = doc.invoice;
  const edits: Edit[] = [];
  if (body.fields !== undefined) {
    if (!body.fields || typeof body.fields !== "object") return fail(400, "fields must be an object.");
    const result = applyEdits(doc.invoice, body.fields, now);
    if ("error" in result) return fail(400, result.error);
    invoice = result.invoice;
    edits.push(...result.edits);
  }

  let { category = null, categorySource = null } = doc;
  if (body.category !== undefined && body.category !== category) {
    if (body.category !== null && !(CATEGORIES as readonly unknown[]).includes(body.category)) {
      return fail(400, "Unknown category.");
    }
    edits.push({ field: "category", from: category, to: body.category, at: now });
    category = body.category as string | null;
    categorySource = category ? "person" : null;
  }

  const { checks, status } = await recheck(db, doc, invoice, now);
  const approve = body.action === "approve";
  if (approve && !canApprove(checks)) return fail(409, "Fix the failed checks before approving.");

  const update = {
    invoice,
    checks,
    category,
    categorySource,
    status: approve ? ("approved" as const) : status,
    updatedAt: now,
    ...(approve ? { approvedAt: now } : {}),
  };
  await documents(db).updateOne(where, { $set: update, ...(edits.length ? { $push: { edits: { $each: edits } } } : {}) });
  return Response.json(view({ ...doc, ...update, edits: [...doc.edits, ...edits] }));
}

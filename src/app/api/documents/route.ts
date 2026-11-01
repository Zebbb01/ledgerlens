import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { documents, getDb } from "@/lib/db.ts";
import { clientKey, fail, MAX_BYTES, sha256, sniff } from "@/lib/http.ts";
import { dayKey, take } from "@/lib/quota.ts";
import { isSample } from "@/lib/samples.ts";
import { enqueue, putFile } from "@/lib/storage.ts";
import { workspaceId } from "@/lib/workspace.ts";

export async function GET() {
  const ws = await workspaceId();
  const db = await getDb();
  const list = await documents(db)
    .find(
      { workspaceId: ws },
      {
        projection: {
          fileName: 1,
          status: 1,
          createdAt: 1,
          "invoice.vendorName.value": 1,
          "invoice.invoiceId.value": 1,
          "invoice.total.value": 1,
          "invoice.currency": 1,
        },
      },
    )
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  return Response.json(
    list.map((d) => ({
      id: d._id,
      fileName: d.fileName,
      status: d.status,
      createdAt: d.createdAt,
      vendor: d.invoice?.vendorName.value ?? null,
      invoiceId: d.invoice?.invoiceId.value ?? null,
      total: d.invoice?.total.value ?? null,
      currency: d.invoice?.currency ?? null,
    })),
  );
}

// Adds a document from an upload (multipart "file") or a bundled sample ({ sample }).
export async function POST(req: Request) {
  const ws = await workspaceId();
  const db = await getDb();
  const now = new Date();
  let bytes: Uint8Array;
  let fileName: string;

  if (req.headers.get("content-type")?.includes("application/json")) {
    const { sample } = (await req.json().catch(() => ({}))) as { sample?: unknown };
    if (typeof sample !== "string" || !isSample(sample)) return fail(400, "Unknown sample.");
    bytes = await readFile(path.join(process.cwd(), "samples", sample));
    fileName = sample;
  } else {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) {
      return fail(413, "Files up to 4 MB can be read on the free tier.");
    }
    const file = (await req.formData().catch(() => null))?.get("file");
    if (!(file instanceof File)) return fail(400, "Choose a PDF, PNG or JPEG file.");
    if (file.size > MAX_BYTES) return fail(413, "Files up to 4 MB can be read on the free tier.");
    bytes = new Uint8Array(await file.arrayBuffer());
    fileName = file.name.slice(0, 120) || "upload";
    // Samples are free after their first analysis; uploads spend the shared allowance.
    const perWorkspace = Number(process.env.DAILY_UPLOADS_PER_WORKSPACE ?? 10);
    const perAddress = Number(process.env.DAILY_UPLOADS_PER_ADDRESS ?? 25);
    const allowed =
      (await take(db, dayKey("uploads-ws", ws, now), 1, perWorkspace)) &&
      (await take(db, dayKey("uploads-ip", clientKey(req), now), 1, perAddress));
    if (!allowed) return fail(429, "Today's upload limit for this free demo is reached. The samples still work.");
  }

  const contentType = sniff(bytes);
  if (!contentType) return fail(415, "Only PDF, PNG and JPEG files can be read.");

  const id = randomUUID();
  const blobName = `${ws}/${id}`;
  await putFile(blobName, bytes, contentType);
  await documents(db).insertOne({
    _id: id,
    workspaceId: ws,
    fileName,
    contentType,
    size: bytes.length,
    sha256: sha256(bytes),
    blobName,
    status: "queued",
    edits: [],
    createdAt: now,
    updatedAt: now,
  });
  await enqueue({ id, workspaceId: ws });
  return Response.json({ id }, { status: 201 });
}

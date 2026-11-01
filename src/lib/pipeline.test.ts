import { describe, expect, it, vi } from "vitest";
import { useMongo } from "../test/mongo.ts";
import { documents, type DocRecord } from "./db.ts";
import type { AnalyzeResult } from "./extract.ts";
import { processDocument, recheck, type PipelineDeps } from "./pipeline.ts";

const freshDb = useMongo();
const now = new Date("2026-10-31T02:00:00Z");

const str = (valueString: string) => ({ type: "string", valueString, confidence: 0.95, boundingRegions: [{ pageNumber: 1 }] });
const money = (amount: number) => ({ type: "currency", valueCurrency: { amount, currencyCode: "PHP" }, confidence: 0.95 });

function analysis(invoiceId = "INV-1042"): AnalyzeResult {
  return {
    content: "VATable Sales 1,000.00\nVAT Amount 120.00",
    pages: [{ pageNumber: 1 }],
    documents: [
      {
        fields: {
          VendorName: str("Bluepeak Office Supply Corp."),
          VendorTaxId: str("123-456-789-000"),
          InvoiceId: str(invoiceId),
          InvoiceDate: { type: "date", valueDate: "2026-10-05", confidence: 0.95 },
          SubTotal: money(1000),
          TotalTax: money(120),
          InvoiceTotal: money(1120),
        },
      },
    ],
  };
}

function doc(id: string, sha256: string, status: DocRecord["status"] = "queued"): DocRecord {
  return {
    _id: id,
    workspaceId: "ws1",
    fileName: `${id}.pdf`,
    contentType: "application/pdf",
    size: 10,
    sha256,
    blobName: `ws1/${id}`,
    status,
    edits: [],
    createdAt: now,
    updatedAt: now,
  };
}

function deps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    readFile: async () => new Uint8Array([1, 2, 3]),
    analyze: vi.fn(async () => analysis()),
    monthlyPageCap: 450,
    now: () => now,
    ...overrides,
  };
}

const ref = (id: string) => ({ id, workspaceId: "ws1" });

describe("processDocument", () => {
  it("reads, checks and saves a queued document", async () => {
    const db = freshDb();
    await documents(db).insertOne(doc("d1", "sha-a"));

    await expect(processDocument(db, ref("d1"), deps())).resolves.toBe("ready");

    const saved = await documents(db).findOne({ _id: "d1" });
    expect(saved?.status).toBe("ready");
    expect(saved?.invoice?.total.value).toBe(112000);
    expect(saved?.checks?.filter((c) => c.status === "fail" || c.status === "warn")).toEqual([]);
    expect(saved?.cached).toBe(false);
    expect(await db.collection("usage").findOne({ key: "pages:2026-10" })).toMatchObject({ count: 2 });
  });

  it("reuses the stored analysis of an identical file without spending pages", async () => {
    const db = freshDb();
    await documents(db).insertMany([doc("d1", "sha-a"), doc("d2", "sha-a")]);
    const d = deps();

    await processDocument(db, ref("d1"), d);
    await processDocument(db, ref("d2"), d);

    expect(d.analyze).toHaveBeenCalledTimes(1);
    expect((await documents(db).findOne({ _id: "d2" }))?.cached).toBe(true);
    expect(await db.collection("usage").findOne({ key: "pages:2026-10" })).toMatchObject({ count: 2 });
  });

  it("fails the document with a clear message once the monthly allowance is used up", async () => {
    const db = freshDb();
    await documents(db).insertOne(doc("d1", "sha-a"));
    const d = deps({ monthlyPageCap: 1 });

    await expect(processDocument(db, ref("d1"), d)).resolves.toBe("failed");

    expect(d.analyze).not.toHaveBeenCalled();
    expect((await documents(db).findOne({ _id: "d1" }))?.error).toContain("allowance");
  });

  it("flags a second invoice with the same vendor and number", async () => {
    const db = freshDb();
    await documents(db).insertMany([doc("d1", "sha-a"), doc("d2", "sha-b")]);

    await processDocument(db, ref("d1"), deps());
    await expect(processDocument(db, ref("d2"), deps())).resolves.toBe("needs_review");

    const duplicate = (await documents(db).findOne({ _id: "d2" }))?.checks?.find((c) => c.id === "duplicate");
    expect(duplicate).toMatchObject({ status: "fail" });
    expect(duplicate?.message).toContain("d1.pdf");
  });

  it("skips a document that is not queued, so a redelivered message does nothing", async () => {
    const db = freshDb();
    await documents(db).insertOne(doc("d1", "sha-a", "approved"));
    const d = deps();

    await expect(processDocument(db, ref("d1"), d)).resolves.toBe("skipped");

    expect(d.analyze).not.toHaveBeenCalled();
    expect((await documents(db).findOne({ _id: "d1" }))?.status).toBe("approved");
  });

  it("picks up a document left 'processing' by a worker that stopped mid-way", async () => {
    const db = freshDb();
    await documents(db).insertOne(doc("d1", "sha-a", "processing"));

    await expect(processDocument(db, ref("d1"), deps())).resolves.toBe("ready");
  });

  it("records the reason Document Intelligence gives for a failure", async () => {
    const db = freshDb();
    await documents(db).insertOne(doc("d1", "sha-a"));
    const analyze = async () => {
      throw new Error("Document Intelligence could not read the document: corrupt file");
    };

    await processDocument(db, ref("d1"), deps({ analyze }));

    expect((await documents(db).findOne({ _id: "d1" }))?.error).toBe(
      "Document Intelligence could not read the document: corrupt file",
    );
  });

  it("hides unexpected errors behind a generic message", async () => {
    const db = freshDb();
    await documents(db).insertOne(doc("d1", "sha-a"));
    const readFile = async () => {
      throw new Error("connect ECONNRESET account-key=secret");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});

    await processDocument(db, ref("d1"), deps({ readFile }));

    const error = (await documents(db).findOne({ _id: "d1" }))?.error;
    expect(error).toContain("Processing failed");
    expect(error).not.toContain("secret");
  });

  it("saves the model's category suggestion", async () => {
    const db = freshDb();
    await documents(db).insertOne(doc("d1", "sha-a"));

    await processDocument(db, ref("d1"), deps({ suggestCategory: async () => "Office supplies" }));

    expect(await documents(db).findOne({ _id: "d1" })).toMatchObject({ category: "Office supplies", categorySource: "model" });
  });

  it("rechecks a corrected invoice, keeping the duplicate check", async () => {
    const db = freshDb();
    await documents(db).insertMany([doc("d1", "sha-a"), doc("d2", "sha-b")]);
    await processDocument(db, ref("d1"), deps());
    await processDocument(db, ref("d2"), deps());
    const d2 = (await documents(db).findOne({ _id: "d2" }))!;
    const corrected = { ...d2.invoice!, total: { value: 1, confidence: 1, page: 1 } };

    const { checks, status } = await recheck(db, d2, corrected, now);

    expect(checks.find((c) => c.id === "total-math")?.status).toBe("fail");
    expect(checks.find((c) => c.id === "duplicate")?.status).toBe("fail");
    expect(status).toBe("needs_review");
  });

  it("still finishes when the category model fails", async () => {
    const db = freshDb();
    await documents(db).insertOne(doc("d1", "sha-a"));
    const suggestCategory = async () => {
      throw new Error("rate limited");
    };

    await expect(processDocument(db, ref("d1"), deps({ suggestCategory }))).resolves.toBe("ready");
    expect((await documents(db).findOne({ _id: "d1" }))?.category).toBeNull();
  });
});

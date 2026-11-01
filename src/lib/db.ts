// MongoDB locally and in tests; Azure Cosmos DB for MongoDB (free tier) in Azure.
// Every query carries the shard key of its collection (workspaceId, sha256, key).
import { MongoClient, type Db } from "mongodb";
import type { AnalyzeResult, Invoice } from "./extract.ts";
import type { Check } from "./validate.ts";

export type Status = "queued" | "processing" | "needs_review" | "ready" | "approved" | "failed";

export type DocRecord = {
  _id: string;
  workspaceId: string;
  fileName: string;
  contentType: string;
  size: number;
  sha256: string;
  blobName: string;
  status: Status;
  error?: string | null;
  cached?: boolean;
  invoice?: Invoice;
  checks?: Check[];
  category?: string | null;
  categorySource?: "model" | "person" | null;
  edits: { field: string; from: unknown; to: unknown; at: Date }[];
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date | null;
};

export type AnalysisRecord = { _id: string; sha256: string; result: AnalyzeResult; createdAt: Date };

export const documents = (db: Db) => db.collection<DocRecord>("documents");
export const analyses = (db: Db) => db.collection<AnalysisRecord>("analyses");

const cache = globalThis as { mongo?: Promise<MongoClient> };

export function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");
  cache.mongo ??= new MongoClient(uri).connect();
  return cache.mongo.then((client) => client.db(process.env.MONGODB_DB ?? "ledgerlens"));
}

import { createHash } from "node:crypto";

export const fail = (status: number, error: string) => Response.json({ error }, { status });

export const MAX_BYTES = 4 * 1024 * 1024; // Document Intelligence free tier limit

// The file's own first bytes decide its type, never the name or the browser's claim.
export function sniff(bytes: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  return null;
}

export const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

// Container Apps puts the caller's address first in X-Forwarded-For. Only a salted
// hash is kept, for the daily upload limit.
export function clientKey(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return sha256(`${process.env.IP_SALT ?? "ledgerlens"}:${ip}`).slice(0, 32);
}

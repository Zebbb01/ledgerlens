// Azure AI Document Intelligence REST client: start an analysis, then poll it.
// Plain fetch keeps the dependency list short; the API is two calls.
import type { AnalyzeResult } from "./extract.ts";

const API_VERSION = "2024-11-30";

export type DiOptions = {
  endpoint: string;
  key?: string;
  token?: () => Promise<string>;
  model?: string;
  pollMs?: number;
  timeoutMs?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function waitFor(res: Response, fallbackMs: number) {
  const seconds = Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs;
}

async function reason(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? res.statusText;
}

// The free tier allows one request per second, so 429s are expected and retried.
async function call(url: string, init: RequestInit, o: DiOptions, pollMs: number): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const auth: Record<string, string> = o.key
      ? { "Ocp-Apim-Subscription-Key": o.key }
      : { Authorization: `Bearer ${await o.token!()}` };
    const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...auth } });
    if (res.status !== 429 || attempt === 4) return res;
    await sleep(waitFor(res, pollMs));
  }
}

export async function analyze(bytes: Uint8Array, o: DiOptions): Promise<AnalyzeResult> {
  const pollMs = o.pollMs ?? 1000;
  const deadline = Date.now() + (o.timeoutMs ?? 120_000);
  const model = o.model ?? "prebuilt-invoice";
  const endpoint = o.endpoint.replace(/\/$/, "");

  const started = await call(
    `${endpoint}/documentintelligence/documentModels/${model}:analyze?api-version=${API_VERSION}`,
    { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: bytes as BodyInit },
    o,
    pollMs,
  );
  if (started.status !== 202) throw new Error(`Document Intelligence returned ${started.status}: ${await reason(started)}`);
  const operation = started.headers.get("operation-location");
  if (!operation) throw new Error("Document Intelligence did not return an operation to poll.");

  for (;;) {
    const res = await call(operation, { method: "GET" }, o, pollMs);
    if (!res.ok) throw new Error(`Document Intelligence returned ${res.status}: ${await reason(res)}`);
    const body = (await res.json()) as { status: string; analyzeResult?: AnalyzeResult; error?: { message?: string } };
    if (body.status === "succeeded" && body.analyzeResult) return body.analyzeResult;
    if (body.status === "failed") throw new Error(`Document Intelligence could not read the document: ${body.error?.message}`);
    if (Date.now() > deadline) throw new Error("Document Intelligence did not finish in time.");
    await sleep(waitFor(res, pollMs));
  }
}

// A stand-in for the Azure AI Document Intelligence analyze API, used by tests and
// local development. It answers with stored results looked up by file hash.
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";

type Options = { throttleFirst?: boolean; neverFinish?: boolean };

export function createMockDi(lookup: (sha256: string) => unknown, options: Options = {}) {
  const requests: { method: string; url: string; headers: IncomingHttpHeaders }[] = [];
  const jobs = new Map<string, { sha256: string; polls: number }>();
  let throttle = options.throttleFirst ?? false;

  const server = createServer(async (req, res) => {
    const url = req.url ?? "";
    requests.push({ method: req.method ?? "", url, headers: req.headers });
    const send = (status: number, body?: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };

    if (url === "/health") return send(200, { ok: true });
    if (!req.headers["ocp-apim-subscription-key"] && !req.headers.authorization) {
      return send(401, { error: { code: "401", message: "Access denied: missing credentials." } });
    }

    const analyze = /^\/documentintelligence\/documentModels\/([\w-]+):analyze/.exec(url);
    if (req.method === "POST" && analyze) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      if (throttle) {
        throttle = false;
        return send(429, { error: { code: "429", message: "Rate limit exceeded." } }, { "retry-after": "0" });
      }
      const id = randomUUID();
      jobs.set(id, { sha256: createHash("sha256").update(Buffer.concat(chunks)).digest("hex"), polls: 0 });
      const location = `http://${req.headers.host}/documentintelligence/documentModels/${analyze[1]}/analyzeResults/${id}?api-version=2024-11-30`;
      return send(202, undefined, { "operation-location": location });
    }

    const poll = /\/analyzeResults\/([\w-]+)/.exec(url);
    const job = poll && jobs.get(poll[1]);
    if (req.method === "GET" && job) {
      job.polls++;
      if (job.polls === 1 || options.neverFinish) return send(200, { status: "running" }, { "retry-after": "0" });
      const result = lookup(job.sha256);
      if (result) return send(200, { status: "succeeded", analyzeResult: result });
      return send(200, { status: "failed", error: { code: "InvalidRequest", message: "Mock: unknown document." } });
    }

    send(404, { error: { code: "404", message: "Not found." } });
  });

  return { server, requests };
}

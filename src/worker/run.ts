// The queue worker. In Azure it runs as a Container Apps job that KEDA starts when
// the queue has messages; it drains the queue and exits, so it costs nothing idle.
// Locally, --watch keeps it polling.
import { DefaultAzureCredential } from "@azure/identity";
import { documents, getDb } from "../lib/db.ts";
import { analyze } from "../lib/di.ts";
import { suggestCategory } from "../lib/llm.ts";
import { processDocument, type PipelineDeps } from "../lib/pipeline.ts";
import { getFile, receive, remove } from "../lib/storage.ts";

const watch = process.argv.includes("--watch");
const env = process.env;
if (!env.DI_ENDPOINT) throw new Error("DI_ENDPOINT is not set.");
const endpoint = env.DI_ENDPOINT;

const key = env.DI_KEY;
const credential = key ? undefined : new DefaultAzureCredential();
const token = async () => (await credential!.getToken("https://cognitiveservices.azure.com/.default")).token;

const llmKey = env.LLM_API_KEY;
const llm = {
  endpoint: env.LLM_ENDPOINT ?? "https://generativelanguage.googleapis.com/v1beta/openai",
  key: llmKey ?? "",
  model: env.LLM_MODEL ?? "gemini-3.5-flash-lite",
};

const deps: PipelineDeps = {
  readFile: getFile,
  analyze: (bytes) => analyze(bytes, { endpoint, key, token }),
  suggestCategory: llmKey ? (invoice) => suggestCategory(invoice, llm) : undefined,
  monthlyPageCap: Number(env.MONTHLY_PAGE_CAP ?? 450),
};

const db = await getDb();
const log = (event: string, data: object) => console.log(JSON.stringify({ event, ...data, at: new Date().toISOString() }));

for (;;) {
  const message = await receive();
  if (!message) {
    if (!watch) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    continue;
  }
  let ref: { id: string; workspaceId: string } | undefined;
  try {
    ref = JSON.parse(message.messageText);
  } catch {
    log("message.unreadable", { messageId: message.messageId });
  }
  if (ref && message.dequeueCount <= 5) {
    const started = Date.now();
    const status = await processDocument(db, ref, deps);
    log("document.processed", { id: ref.id, status, ms: Date.now() - started, dequeueCount: message.dequeueCount });
  } else if (ref) {
    // ponytail: no dead-letter queue; after five tries the document is marked
    // failed and the person can run it again from the page.
    await documents(db).updateOne(
      { _id: ref.id, workspaceId: ref.workspaceId, status: { $in: ["queued", "processing"] } },
      { $set: { status: "failed", error: "Processing kept failing. Run it again.", updatedAt: new Date() } },
    );
    log("document.abandoned", { id: ref.id, dequeueCount: message.dequeueCount });
  }
  await remove(message);
}

log("worker.done", {});
process.exit(0);

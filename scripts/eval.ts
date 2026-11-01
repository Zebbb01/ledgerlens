// Scores extraction against the answer keys in samples/answers.json.
// Point DI_ENDPOINT at your Document Intelligence resource and sign in with
// `az login` (keys are disabled on the Terraform-built resource), then:
//   DI_ENDPOINT=https://di-ledgerlens-xxxxxx.cognitiveservices.azure.com npm run eval
import { readFile } from "node:fs/promises";
import { DefaultAzureCredential } from "@azure/identity";
import { analyze } from "../src/lib/di.ts";
import { normalize, type Invoice } from "../src/lib/extract.ts";

const endpoint = process.env.DI_ENDPOINT;
if (!endpoint) throw new Error("Set DI_ENDPOINT to your Document Intelligence endpoint.");
if (/127\.0\.0\.1|localhost/.test(endpoint)) console.warn("Note: this is the mock service, so the score only proves the wiring.\n");

const key = process.env.DI_KEY;
const credential = key ? undefined : new DefaultAzureCredential();
const token = async () => (await credential!.getToken("https://cognitiveservices.azure.com/.default")).token;

const FIELDS = ["vendorName", "vendorTaxId", "invoiceId", "invoiceDate", "dueDate", "currency", "subtotal", "tax", "total", "vatableSales", "vatAmount"] as const;
type Key = (typeof FIELDS)[number];

const answers = JSON.parse(await readFile("samples/answers.json", "utf8")) as Record<string, Record<Key, unknown>>;
const same = (a: unknown, b: unknown) => String(a ?? "").replace(/\s+/g, " ").trim().toLowerCase() === String(b ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const read = (inv: Invoice, f: Key) => (f === "currency" ? inv.currency : inv[f].value);

const hits = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<Key, number>;
const files = Object.entries(answers);
for (const [file, expected] of files) {
  const inv = normalize(await analyze(new Uint8Array(await readFile(`samples/${file}`)), { endpoint, key, token }));
  const misses = FIELDS.filter((f) => !same(read(inv, f), expected[f]));
  for (const f of FIELDS) if (!misses.includes(f)) hits[f]++;
  const detail = misses.map((f) => `${f} (read ${JSON.stringify(read(inv, f))}, expected ${JSON.stringify(expected[f])})`);
  console.log(`${file}: ${FIELDS.length - misses.length}/${FIELDS.length}${detail.length ? ` - missed ${detail.join("; ")}` : ""}`);
  await new Promise((resolve) => setTimeout(resolve, 1100)); // the free tier allows one request per second
}

const total = Object.values(hits).reduce((a, b) => a + b, 0);
console.log(`\nField accuracy over ${files.length} documents:`);
for (const f of FIELDS) console.log(`  ${f.padEnd(14)} ${hits[f]}/${files.length}`);
console.log(`  ${"overall".padEnd(14)} ${((100 * total) / (FIELDS.length * files.length)).toFixed(1)}%`);

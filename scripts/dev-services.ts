// Local stand-ins for LedgerLens' Azure dependencies: an in-memory MongoDB, the
// mock Document Intelligence server, and the queue worker in watch mode.
// Azurite (Blob + Queue) runs separately: npx azurite --inMemoryPersistence
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createMockDi } from "./mock-di.ts";

const env = {
  MONGODB_URI: "mongodb://127.0.0.1:27019/",
  AZURE_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true",
  DI_ENDPOINT: "http://127.0.0.1:4011",
  DI_KEY: "local",
  MONTHLY_PAGE_CAP: "450",
  ...process.env,
};

const mongo = await MongoMemoryServer.create({ instance: { port: 27019, ip: "127.0.0.1" } });

// The mock answers with the stored result of whichever sample has the same hash.
const stored = JSON.parse(await readFile("samples/mock-di.json", "utf8")) as Record<string, unknown>;
const byHash = new Map<string, unknown>();
for (const [file, result] of Object.entries(stored)) {
  byHash.set(createHash("sha256").update(await readFile(`samples/${file}`)).digest("hex"), result);
}
const { server } = createMockDi((sha) => byHash.get(sha));
server.listen(4011, "127.0.0.1");

const worker = spawn(
  process.execPath,
  ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "src/worker/run.ts", "--watch"],
  { env, stdio: "inherit" },
);

console.log("MongoDB on 27019, mock Document Intelligence on 4011, worker watching the queue.");

const stop = async () => {
  worker.kill();
  server.close();
  await mongo.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
worker.on("exit", (code) => {
  console.error(`Worker exited with code ${code}`);
  void stop();
});

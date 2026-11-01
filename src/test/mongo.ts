// Test helper: an in-memory MongoDB per test file.
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll } from "vitest";

export function setupMongo(): () => Db {
  let server: MongoMemoryServer;
  let client: MongoClient;
  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    client = await MongoClient.connect(server.getUri());
  });
  afterAll(async () => {
    await client?.close();
    await server?.stop();
  });
  let n = 0;
  // A fresh database for every call keeps tests independent.
  return () => client.db(`t${++n}`);
}

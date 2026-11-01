import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createMockDi } from "../../scripts/mock-di.ts";
import { analyze } from "./di.ts";

const result = { content: "Total 100.00", pages: [{ pageNumber: 1 }], documents: [] };
const bytes = new TextEncoder().encode("%PDF-1.7 test");
let close: (() => void) | undefined;

async function start(lookup: () => unknown, options = {}) {
  const mock = createMockDi(lookup, options);
  await new Promise<void>((resolve) => mock.server.listen(0, "127.0.0.1", resolve));
  close = () => mock.server.close();
  const endpoint = `http://127.0.0.1:${(mock.server.address() as AddressInfo).port}`;
  return { ...mock, endpoint };
}

afterEach(() => close?.());

describe("analyze", () => {
  it("returns the analyze result after polling the operation", async () => {
    const { endpoint, requests } = await start(() => result);

    await expect(analyze(bytes, { endpoint, key: "k", pollMs: 1 })).resolves.toEqual(result);
    expect(requests.map((r) => r.method)).toEqual(["POST", "GET", "GET"]);
    expect(requests[0].url).toContain("/documentModels/prebuilt-invoice:analyze?api-version=2024-11-30");
  });

  it("authenticates with the key header", async () => {
    const { endpoint, requests } = await start(() => result);

    await analyze(bytes, { endpoint, key: "secret", pollMs: 1 });

    expect(requests[0].headers["ocp-apim-subscription-key"]).toBe("secret");
  });

  it("authenticates with a Microsoft Entra token when no key is set", async () => {
    const { endpoint, requests } = await start(() => result);

    await analyze(bytes, { endpoint, token: async () => "tok", pollMs: 1 });

    expect(requests[0].headers.authorization).toBe("Bearer tok");
    expect(requests[0].headers["ocp-apim-subscription-key"]).toBeUndefined();
  });

  it("throws the service's reason when the analysis fails", async () => {
    const { endpoint } = await start(() => undefined);

    await expect(analyze(bytes, { endpoint, key: "k", pollMs: 1 })).rejects.toThrow("Mock: unknown document.");
  });

  it("waits and retries when the free tier throttles the request", async () => {
    const { endpoint, requests } = await start(() => result, { throttleFirst: true });

    await expect(analyze(bytes, { endpoint, key: "k", pollMs: 1 })).resolves.toEqual(result);
    expect(requests.filter((r) => r.method === "POST")).toHaveLength(2);
  });

  it("gives up when the analysis does not finish in time", async () => {
    const { endpoint } = await start(() => result, { neverFinish: true });

    await expect(analyze(bytes, { endpoint, key: "k", pollMs: 5, timeoutMs: 50 })).rejects.toThrow("did not finish");
  });
});

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Invoice } from "./extract.ts";
import { suggestCategory } from "./llm.ts";

const f = <T>(value: T | null) => ({ value, confidence: 0.9, page: 1 });
const invoice = {
  vendorName: f("Cloudnote Inc."),
  lines: [{ description: "Team plan, 5 seats", quantity: 5, unitPrice: 1200, amount: 6000 }],
} as Invoice;

let close: (() => void) | undefined;
afterEach(() => close?.());

async function fakeModel(status: number, content: string) {
  const seen: { auth?: string; body?: { messages: { content: string }[] } } = {};
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    seen.auth = req.headers.authorization;
    seen.body = JSON.parse(raw);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(status === 200 ? { choices: [{ message: { content } }] } : { error: { message: "nope" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  close = () => server.close();
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { endpoint, seen };
}

describe("suggestCategory", () => {
  it("returns the category the model picked", async () => {
    const { endpoint } = await fakeModel(200, '{"category":"Software and subscriptions"}');

    await expect(suggestCategory(invoice, { endpoint, key: "k", model: "m" })).resolves.toBe("Software and subscriptions");
  });

  it("returns null when the model answers outside the chart of accounts", async () => {
    const { endpoint } = await fakeModel(200, '{"category":"Crypto"}');

    await expect(suggestCategory(invoice, { endpoint, key: "k", model: "m" })).resolves.toBeNull();
  });

  it("sends only the vendor and item descriptions, with the bearer key", async () => {
    const { endpoint, seen } = await fakeModel(200, '{"category":"Other"}');

    await suggestCategory(invoice, { endpoint, key: "secret", model: "m" });

    expect(seen.auth).toBe("Bearer secret");
    const prompt = seen.body?.messages.at(-1)?.content ?? "";
    expect(prompt).toContain("Cloudnote Inc.");
    expect(prompt).toContain("Team plan, 5 seats");
    expect(prompt).not.toContain("60.00");
  });

  it("throws when the model API returns an error", async () => {
    const { endpoint } = await fakeModel(500, "");

    await expect(suggestCategory(invoice, { endpoint, key: "k", model: "m" })).rejects.toThrow("500");
  });
});

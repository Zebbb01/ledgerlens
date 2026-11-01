import { describe, expect, it } from "vitest";
import { clientKey, sniff } from "./http.ts";

const bytes = (s: string) => new Uint8Array(Buffer.from(s, "binary"));

describe("sniff", () => {
  it("names PDF, PNG and JPEG files by their first bytes", () => {
    expect(sniff(bytes("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniff(bytes("\x89PNG\r\n\x1a\n"))).toBe("image/png");
    expect(sniff(bytes("\xff\xd8\xff\xe0"))).toBe("image/jpeg");
  });

  it("refuses anything else, whatever its name says", () => {
    expect(sniff(bytes("<html><script>"))).toBeNull();
    expect(sniff(bytes("%PD"))).toBeNull();
  });
});

describe("clientKey", () => {
  it("hashes the first forwarded address, so the raw IP is never stored", () => {
    const req = (ip: string) => new Request("http://x", { headers: { "x-forwarded-for": ip } });

    expect(clientKey(req("203.0.113.7, 10.0.0.1"))).toBe(clientKey(req("203.0.113.7")));
    expect(clientKey(req("203.0.113.7"))).not.toContain("203.0.113.7");
    expect(clientKey(req("203.0.113.8"))).not.toBe(clientKey(req("203.0.113.7")));
  });
});

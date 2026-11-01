import { describe, expect, it } from "vitest";
import { setupMongo } from "../test/mongo.ts";
import { dayKey, monthKey, take } from "./quota.ts";

const freshDb = setupMongo();

describe("take", () => {
  it("allows use up to the limit, then refuses", async () => {
    const db = freshDb();

    expect(await take(db, "pages:2026-10", 2, 5)).toBe(true);
    expect(await take(db, "pages:2026-10", 2, 5)).toBe(true);
    expect(await take(db, "pages:2026-10", 2, 5)).toBe(false);
    expect(await take(db, "pages:2026-10", 1, 5)).toBe(true);
  });

  it("counts each key separately", async () => {
    const db = freshDb();

    expect(await take(db, "a", 1, 1)).toBe(true);
    expect(await take(db, "b", 1, 1)).toBe(true);
    expect(await take(db, "a", 1, 1)).toBe(false);
  });

  it("never goes over the limit when requests arrive together", async () => {
    const db = freshDb();

    const results = await Promise.all(Array.from({ length: 20 }, () => take(db, "burst", 1, 5)));

    expect(results.filter(Boolean)).toHaveLength(5);
  });
});

describe("keys", () => {
  it("names monthly and daily counters by UTC date", () => {
    const now = new Date("2026-10-31T23:30:00Z");

    expect(monthKey(now)).toBe("pages:2026-10");
    expect(dayKey("ws", "abc", now)).toBe("ws:abc:2026-10-31");
  });
});

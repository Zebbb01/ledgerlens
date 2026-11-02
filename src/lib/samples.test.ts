import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalize, type AnalyzeResult, type Field, type Invoice } from "./extract.ts";
import { SAMPLES } from "./samples.ts";

const mock = JSON.parse(readFileSync("samples/mock-di.json", "utf8")) as Record<string, AnalyzeResult>;
const answers = JSON.parse(readFileSync("samples/answers.json", "utf8")) as Record<string, Record<string, unknown>>;
type ValueKey = Exclude<keyof Invoice, "currency" | "lines">;

describe("sample documents", () => {
  it("has a stored result and an answer key for every sample the app offers", () => {
    for (const { file } of SAMPLES) {
      expect(mock[file], file).toBeDefined();
      expect(answers[file], file).toBeDefined();
    }
  });

  it.each(Object.keys(answers))("%s normalizes to its answer key", (file) => {
    const inv = normalize(mock[file]);
    for (const [key, expected] of Object.entries(answers[file])) {
      const value = key === "currency" ? inv.currency : (inv[key as ValueKey] as Field<unknown>).value;
      expect(value, key).toEqual(expected);
    }
  });

  it("offers a marketplace invoice whose logo is not the vendor's registered name", () => {
    const fields = mock["parcelwave-shipping-invoice.pdf"]?.documents[0].fields as Record<string, { valueString?: string }>;

    expect(fields?.VendorName.valueString).toBe("PARCELWAVE EXPRESS");
    expect(normalize(mock["parcelwave-shipping-invoice.pdf"]).vendorName.value).toBe("Parcelwave Logistics Inc.");
  });
});

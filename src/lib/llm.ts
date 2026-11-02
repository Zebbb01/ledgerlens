// Optional: an LLM suggests an expense category from a fixed chart of accounts.
// Any OpenAI-compatible endpoint works; the default is the Gemini API's free tier
// (GitHub Models, the first default, was retired on 2026-07-30).
import type { Invoice } from "./extract.ts";

export const CATEGORIES = [
  "Office supplies",
  "Software and subscriptions",
  "Utilities",
  "Rent",
  "Professional fees",
  "Travel and transport",
  "Meals and entertainment",
  "Repairs and maintenance",
  "Inventory purchases",
  "Other",
] as const;

export type LlmOptions = { endpoint: string; key: string; model: string };

export async function suggestCategory(inv: Invoice, o: LlmOptions): Promise<string | null> {
  // Amounts and tax IDs stay out of the prompt: the category needs neither.
  const items = inv.lines.map((l) => l.description).filter(Boolean).slice(0, 20).join("; ");
  const res = await fetch(`${o.endpoint.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.key}` },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model: o.model,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "category",
          strict: true,
          schema: {
            type: "object",
            properties: { category: { type: "string", enum: CATEGORIES } },
            required: ["category"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        {
          role: "system",
          content: `You file supplier bills. Pick the one expense category that fits best from: ${CATEGORIES.join(", ")}. Reply as JSON {"category": "..."}.`,
        },
        { role: "user", content: `Vendor: ${inv.vendorName.value ?? "unknown"}\nItems: ${items || "none listed"}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Category model returned ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  try {
    const { category } = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
    return (CATEGORIES as readonly string[]).includes(category) ? category : null;
  } catch {
    return null;
  }
}

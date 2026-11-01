// Each browser gets its own private workspace through a random ID in an HttpOnly
// cookie. Every query is scoped to it, which is what keeps documents private.
import { cookies } from "next/headers";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function workspaceId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get("ws")?.value;
  if (existing && ID.test(existing)) return existing;
  const id = crypto.randomUUID();
  jar.set("ws", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return id;
}

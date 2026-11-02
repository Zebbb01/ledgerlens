// Each browser gets its own private workspace through a random ID in an HttpOnly
// cookie. Every query is scoped to it, which is what keeps documents private.
// The proxy sets the cookie on the first page load; this covers a client that
// calls the API without loading a page first.
import { cookies } from "next/headers";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const WORKSPACE_COOKIE = "ws";
export const workspaceCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
  path: "/",
} as const;

export const isWorkspaceId = (value: string | undefined): value is string => !!value && ID.test(value);

export async function workspaceId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(WORKSPACE_COOKIE)?.value;
  if (isWorkspaceId(existing)) return existing;
  const id = crypto.randomUUID();
  jar.set(WORKSPACE_COOKIE, id, workspaceCookieOptions);
  return id;
}

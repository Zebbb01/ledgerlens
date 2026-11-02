// Gives a browser its workspace cookie on its first page load, before the page
// makes any API call. Without it, two first requests (the document list and a
// quick sample click) could each create a different workspace, and the document
// would then be "not found" in the browser that just added it.
import { NextResponse, type NextRequest } from "next/server";
import { WORKSPACE_COOKIE, isWorkspaceId, workspaceCookieOptions } from "@/lib/workspace.ts";

export function proxy(request: NextRequest) {
  if (isWorkspaceId(request.cookies.get(WORKSPACE_COOKIE)?.value)) return NextResponse.next();
  const id = crypto.randomUUID();
  request.cookies.set(WORKSPACE_COOKIE, id); // so this same request already sees it
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(WORKSPACE_COOKIE, id, workspaceCookieOptions);
  return response;
}

export const config = {
  // Pages and API routes; not build assets, sample images or the icon.
  matcher: ["/((?!_next/|samples/|icon).*)"],
};

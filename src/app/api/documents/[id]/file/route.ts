import { documents, getDb } from "@/lib/db.ts";
import { fail } from "@/lib/http.ts";
import { getFile } from "@/lib/storage.ts";
import { workspaceId } from "@/lib/workspace.ts";

export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await ctx.params;
  const [ws, db] = await Promise.all([workspaceId(), getDb()]);
  const doc = await documents(db).findOne({ _id: id, workspaceId: ws }, { projection: { blobName: 1, contentType: 1 } });
  if (!doc) return fail(404, "Document not found.");
  let bytes: Uint8Array;
  try {
    bytes = await getFile(doc.blobName);
  } catch {
    return fail(404, "The file is no longer stored. Demo files are deleted after 7 days.");
  }
  // The type was decided from the file's own bytes at upload, never by the client.
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

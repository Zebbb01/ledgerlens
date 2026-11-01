import type { Metadata } from "next";
import { Suspense } from "react";
import { DocumentView } from "./document-view";

export const metadata: Metadata = { title: "Review" };

export default function DocumentPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading the document…</p>}>
      <DocumentView />
    </Suspense>
  );
}

import type { Status } from "@/lib/db.ts";

export const STATUS_LABEL: Record<Status, string> = {
  queued: "Queued",
  processing: "Reading",
  needs_review: "Needs review",
  ready: "Ready to approve",
  approved: "Approved",
  failed: "Failed",
};

const STATUS_TONE: Record<Status, string> = {
  queued: "border-line text-muted",
  processing: "border-line text-muted",
  needs_review: "border-warn/50 text-warn",
  ready: "border-brand/50 text-brand",
  approved: "border-pass/50 text-pass",
  failed: "border-fail/50 text-fail",
};

export function StatusPill({ status, testId }: { status: Status; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export const buttonClass = {
  primary: `inline-flex min-h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-on-brand hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50 ${focus}`,
  secondary: `inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-brand disabled:cursor-not-allowed disabled:opacity-50 ${focus}`,
};
export const focusRing = focus;

export function Logo() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="text-brand">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M6.5 8.5h7M6.5 11.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15.2 15.2 21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

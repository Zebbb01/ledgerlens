"use client";

// Shared interface parts. Plain React on native elements (<dialog>, <button>,
// <select>), so focus handling, Esc and focus return come from the browser.
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Status } from "@/lib/db.ts";

export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

// ---------------------------------------------------------------- icons

const PATHS: Record<string, ReactNode> = {
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  back: <path d="m15 18-6-6 6-6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  alert: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  upload: <path d="M12 15V3M7 8l5-5 5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  redo: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />,
  github: (
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.1-1.3-.3-2.5-1-3.5.3-1.2.3-2.4 0-3.5 0 0-1 0-3 1.5-2.6-.5-5.4-.5-8 0C6 2 5 2 5 2c-.3 1.1-.3 2.3 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.4.5-.7 1-.8 1.6-.2.6-.2 1.3-.2 1.9v4M9 18c-4.5 2-5-2-7-2" />
  ),
};

export function Icon({ name, size = 16, className = "" }: { name: keyof typeof PATHS; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="text-brand">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M6.5 8.5h7M6.5 11.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15.2 15.2 21 21" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className={`animate-spin-slow ${className}`}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse-soft rounded-sm bg-subtle ${className}`} />;
}

// ---------------------------------------------------------------- buttons

type Variant = "primary" | "secondary" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-strong",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-subtle",
  ghost: "text-ink-2 hover:bg-subtle hover:text-ink",
};

export const buttonClass = (variant: Variant = "secondary", size: "sm" | "md" = "md") =>
  `relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    size === "sm" ? "h-7 px-2 text-xs pointer-coarse:h-10" : "h-8 px-3 text-sm pointer-coarse:h-11"
  } ${VARIANT[variant]} ${focusRing}`;

// While loading, the label stays (invisible) so the button keeps its width.
export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button type="button" {...props} disabled={disabled || loading} aria-busy={loading || undefined} className={`${buttonClass(variant, size)} ${className}`}>
      <span className={`inline-flex items-center gap-1.5 ${loading ? "invisible" : ""}`}>{children}</span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------- badges

export const STATUS_LABEL: Record<Status, string> = {
  queued: "Queued",
  processing: "Reading",
  needs_review: "Needs review",
  ready: "Ready to approve",
  approved: "Approved",
  failed: "Failed",
};

export type Tone = "neutral" | "brand" | "pass" | "fail" | "warn";

const TONE: Record<Tone, string> = {
  neutral: "bg-subtle text-ink-2",
  brand: "bg-brand-soft text-brand",
  pass: "bg-pass-soft text-pass",
  fail: "bg-fail-soft text-fail",
  warn: "bg-warn-soft text-warn",
};

const STATUS_TONE: Record<Status, Tone> = {
  queued: "neutral",
  processing: "neutral",
  needs_review: "warn",
  ready: "brand",
  approved: "pass",
  failed: "fail",
};

export const WORKING: Status[] = ["queued", "processing"];

export function Badge({ tone = "neutral", children, testId }: { tone?: Tone; children: ReactNode; testId?: string }) {
  return (
    <span data-testid={testId} className={`inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, testId }: { status: Status; testId?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} testId={testId}>
      {WORKING.includes(status) && <Spinner className="size-2.5" />}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

// ---------------------------------------------------------------- forms

// 16 px on phones so iOS does not zoom into a focused field; 13 px on desktop.
export const inputClass = `h-8 w-full rounded-md border border-line-strong bg-surface px-2.5 text-lg text-ink placeholder:text-muted hover:border-muted read-only:border-line read-only:bg-subtle read-only:hover:border-line ${focusRing} focus-visible:outline-offset-0 pointer-coarse:h-11 sm:text-sm`;

// A select drawn like the inputs, with its own chevron, instead of the browser's.
export const selectClass = `${inputClass} cursor-pointer appearance-none pr-8 disabled:cursor-default disabled:border-line disabled:bg-subtle`;

// ---------------------------------------------------------------- dialog

// A native modal <dialog>: the browser traps focus, closes it on Esc and returns
// focus to the trigger. On small screens it fills the width like a sheet.
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={`${id}-title`}
      className={`m-auto w-[calc(100%-1.5rem)] animate-pop-in rounded-lg border border-line bg-surface p-0 text-ink shadow-float ${wide ? "max-w-xl" : "max-w-md"}`}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
            <div>
              <h2 id={`${id}-title`} className="text-lg font-semibold">
                {title}
              </h2>
              {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className={`-mr-1 rounded-md p-1 text-muted hover:bg-subtle hover:text-ink ${focusRing}`}>
              <Icon name="x" />
            </button>
          </div>
          {children && <div className="overflow-y-auto px-4 py-3">{children}</div>}
          {footer && <div className="flex justify-end gap-2 border-t border-line bg-canvas px-4 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

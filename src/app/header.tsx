"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Dialog, Icon, Logo, focusRing } from "./ui";

const REPO = "https://github.com/Zebbb01/ledgerlens";

export function AppHeader() {
  const [about, setAbout] = useState(false);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="flex h-12 items-center gap-4 px-3 sm:px-4">
        <Link href="/" className={`flex items-center gap-2 rounded-md text-base font-semibold tracking-tight ${focusRing}`}>
          <Logo />
          LedgerLens
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setAbout(true)}>
            <Icon name="info" size={14} />
            <span className="hidden sm:inline">How it works</span>
          </Button>
          <a href={REPO} aria-label="Source on GitHub" title="Source on GitHub" className={`grid size-7 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink pointer-coarse:size-10 ${focusRing}`}>
            <Icon name="github" size={16} />
          </a>
        </div>
      </div>

      <Dialog
        open={about}
        onClose={() => setAbout(false)}
        title="How LedgerLens works"
        description="Invoices and receipts in, checked numbers out."
        footer={
          <>
            <a href={`${REPO}#readme`} className={`${focusRing} inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-brand hover:bg-brand-soft`}>
              How it is built
            </a>
            <Button variant="primary" onClick={() => setAbout(false)}>
              Got it
            </Button>
          </>
        }
      >
        <ol className="grid gap-3 text-sm text-ink-2">
          {[
            ["Reads", "the bill with Azure AI Document Intelligence: vendor, dates, amounts and line items."],
            ["Checks", "every number in code: totals, 12% VAT, the vendor's TIN, dates and duplicates."],
            ["Waits", "for a person when a check fails. Approved bills export as CSV or JSON."],
          ].map(([verb, rest], i) => (
            <li key={verb} className="flex gap-3">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-2xs font-semibold text-brand">{i + 1}</span>
              <span>
                <span className="font-medium text-ink">{verb}</span> {rest}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          A free demo on Azure&apos;s free tiers: only the first two pages of a file are read, the month&apos;s analysis
          allowance is shared by everyone, and files are deleted after 7 days. Names on the samples are fictitious.
        </p>
      </Dialog>
    </header>
  );
}

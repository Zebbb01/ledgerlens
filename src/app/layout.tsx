import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Logo, focusRing } from "./ui";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "LedgerLens", template: "%s · LedgerLens" },
  description:
    "Reads invoices and receipts with Azure AI Document Intelligence, checks every number in code, and hands verified bills to the books.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-canvas font-sans text-ink">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className={`flex items-center gap-2 rounded font-semibold tracking-tight ${focusRing}`}>
              <Logo />
              LedgerLens
            </Link>
            <a
              href="https://github.com/Zebbb01/ledgerlens"
              className={`rounded text-sm text-muted hover:text-ink ${focusRing}`}
            >
              Source on GitHub
            </a>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        <footer className="border-t border-line">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs leading-relaxed text-muted sm:px-6">
            A free demo on Azure&apos;s free tiers: files and results are deleted after 7 days, only the first two
            pages of a file are read, and the month&apos;s analysis allowance is shared by everyone. Names on the
            sample documents are fictitious.
          </p>
        </footer>
      </body>
    </html>
  );
}

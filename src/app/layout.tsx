import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppHeader } from "./header";
import { Toaster } from "./toast";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "LedgerLens", template: "%s · LedgerLens" },
  description:
    "Reads invoices and receipts with Azure AI Document Intelligence, checks every number in code, and hands verified bills to the books.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} antialiased`}>
      <body className="min-h-dvh bg-canvas font-sans text-base text-ink">
        <a href="#main" className="sr-only rounded-md bg-surface px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50">
          Skip to content
        </a>
        <AppHeader />
        <main id="main">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}

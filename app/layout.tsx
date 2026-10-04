import type { Metadata } from "next";
import { Fira_Code, Inter, Inter_Tight } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const heading = Inter_Tight({ variable: "--font-heading", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });
const body = Inter({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const mono = Fira_Code({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Attestly — security questionnaires, answered with citations",
    template: "%s · Attestly",
  },
  description:
    "Upload your policies and the customer's questionnaire. Attestly drafts every answer from your own documents with a citation to the exact passage, flags what has no evidence, and writes the answers back into the original spreadsheet.",
  openGraph: {
    title: "Attestly — security questionnaires, answered with citations",
    description: "Every answer cites its source or says it has none. Built for small SaaS teams selling to enterprises.",
    type: "website",
    url: appUrl,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
        <Toaster position="bottom-right" richColors closeButton />
        <Analytics />
      </body>
    </html>
  );
}

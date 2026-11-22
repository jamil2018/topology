import type { ReactNode } from "react";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers";
import "./globals.css";

const SITE_DESCRIPTION =
  "Self-hosted test case management with a Linear-like operating hub.";

function metadataBaseFromEnv(): URL | undefined {
  const raw = process.env.AUTH_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBaseFromEnv(),
  title: "Topology",
  description: SITE_DESCRIPTION,
  applicationName: "Topology",
  openGraph: {
    title: "Topology",
    description: SITE_DESCRIPTION,
    siteName: "Topology",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Topology",
    description: SITE_DESCRIPTION,
  },
};

const themeBoot = `(function(){try{var k='topology-theme';var p=localStorage.getItem(k)||'system';var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var r=p==='dark'||(p!=='light'&&d);var e=document.documentElement;e.classList.toggle('dark',r);e.dataset.theme=r?'dark':'light';e.style.colorScheme=r?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="min-h-full flex flex-col bg-[color:var(--topo-paper)] text-[color:var(--topo-ink)]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

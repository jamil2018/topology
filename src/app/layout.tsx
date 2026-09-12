import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Topology",
  description:
    "Self-hosted test case management with a Linear-like operating hub.",
  applicationName: "Topology",
};

const themeBoot = `(function(){try{var k='topology-theme';var p=localStorage.getItem(k)||'system';var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var r=p==='dark'||(p!=='light'&&d);var e=document.documentElement;e.classList.toggle('dark',r);e.dataset.theme=r?'dark':'light';e.style.colorScheme=r?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
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

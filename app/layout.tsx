import "@fontsource-variable/suse-mono";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Nav } from "@/components/Nav";
import { StoreProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "Quil: research your trades while New York sleeps",
  description: "An AI research desk for Bitget tokenized US stocks and crypto. Ask about a trade, see exactly what it does to your book. You make the call.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <Nav />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}

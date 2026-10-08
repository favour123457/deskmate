import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Lamplight: research your trades while New York sleeps",
  description: "Ask a question about your rToken + crypto book. Lamplight researches with live Bitget data and shows you the risk. You make the call.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#070d1a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

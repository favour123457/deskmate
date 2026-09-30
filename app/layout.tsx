import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Deskmate — AI research desk for tokenized US stocks",
  description: "Ask a question about your rToken + crypto book. Deskmate researches with live Bitget data and shows you the risk. You make the call.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0e14" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

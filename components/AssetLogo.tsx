"use client";
// Real company logo for a held stock (Finnhub company profile, via /api/logo), shown on a small white tile so
// dark logos stay visible on black. Crypto and anything without a logo get a typed monogram instead.
import { useState } from "react";

const CRYPTO = new Set(["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "TON", "AVAX", "LINK", "DOT", "TRX", "LTC", "BCH", "SUI", "ARB", "OP", "BGB", "NEAR", "APT", "HYPE", "USDC"]);

/** "rNVDA" / "NVDA-PERP" / "NVDA" -> "NVDA" */
export function tickerOf(symbol: string) {
  return symbol.replace(/-PERP$/i, "").replace(/^r(?=[A-Z])/, "").toUpperCase();
}

export function AssetLogo({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const t = tickerOf(symbol);
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (CRYPTO.has(t) || failed) {
    return (
      <span className={`asset-logo mono${CRYPTO.has(t) ? " round" : ""}`} style={{ ...style, fontSize: Math.round(size * 0.32) }} aria-hidden>
        {t.slice(0, 3)}
      </span>
    );
  }
  return (
    <span className="asset-logo tile" style={style} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/logo/${t}`} alt="" width={size - 8} height={size - 8} loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}

import { companyInfo, finnhubEnabled } from "@/lib/finnhub";

export const runtime = "nodejs";

// GET /api/logo/NVDA -> redirect to the company's official logo (Finnhub company profile), or 404.
// The client shows a monogram when this 404s, so nothing is ever invented.
export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 10);
  if (!t || !finnhubEnabled()) return new Response(null, { status: 404 });
  const { logo } = await companyInfo(t);
  if (!logo || !/^https:\/\//.test(logo)) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  return new Response(null, { status: 302, headers: { Location: logo, "Cache-Control": "public, max-age=86400, s-maxage=86400" } });
}

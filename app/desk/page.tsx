"use client";
// Old route: /desk (and /desk#portfolio, /desk#news) now live at /ask, /portfolio and /news.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DeskRedirect() {
  const router = useRouter();
  useEffect(() => {
    const h = window.location.hash.slice(1);
    router.replace(h === "portfolio" ? "/portfolio" : h === "news" ? "/news" : "/ask");
  }, [router]);
  return null;
}

"use client";
// Top navigation: brand (goes home) on the left, four centred sections. Active item gets a white underline
// that slides between items.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { BRAND, Wordmark } from "./Brand";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/ask", label: "Ask" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/news", label: "News" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-brand" aria-label={`${BRAND} home`}>
          <Wordmark />
        </Link>
        <nav className="nav-links" aria-label="Main">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className="nav-link" aria-current={active ? "page" : undefined}>
                {l.label}
                {active && <motion.span layoutId="nav-underline" className="nav-underline" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              </Link>
            );
          })}
        </nav>
        <span className="nav-spacer" aria-hidden />
      </div>
    </header>
  );
}

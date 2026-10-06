"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/docs", label: "Docs" },
  { href: "/playground", label: "Playground" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[rgba(247,244,242,0.9)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em]">
          <PrismMark />
          Prism API
        </Link>
        <nav aria-label="Main">
          <ul className="flex items-center gap-0.5 text-[14px] sm:gap-1">
            {links.map((l) => {
              const active = path.startsWith(l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-[9px] px-2.5 py-2 transition-colors sm:px-3 ${active ? "bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--border)]" : "text-muted hover:text-ink"}`}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export function PrismMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <rect width="24" height="24" rx="7" fill="var(--accent)" />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="var(--foreground)" strokeWidth="1.5" />
      <path d="M6.5 12h11M12 6.5c-2 3.2-2 7.8 0 11M12 6.5c2 3.2 2 7.8 0 11" fill="none" stroke="var(--foreground)" strokeWidth="1.2" />
    </svg>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const links = [
  { href: "/demo", label: "Demo" },
  { href: "/docs", label: "Docs" },
  { href: "/playground", label: "Playground" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[rgba(247,244,242,0.9)] backdrop-blur-md">
      <div className="mx-auto flex min-h-16 max-w-page flex-wrap items-center justify-between gap-3 px-5 py-3 sm:flex-nowrap sm:px-8 sm:py-0 lg:px-12">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em]">
          <PrismMark />
          Prism API
        </Link>
        <nav aria-label="Main" className="w-full sm:w-auto">
          <ul className="flex items-center justify-between gap-0.5 text-[14px] sm:gap-1">
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

export function PrismMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <Image src="/prism-icon.svg" alt="" width={491} height={492} className={`rounded-md object-contain ${className}`} priority />
  );
}

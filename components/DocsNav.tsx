"use client";

import { useEffect, useState } from "react";

/** Docs sidebar that highlights the section currently in view. */
export function DocsNav({
  sections,
}: {
  sections: readonly (readonly [string, string])[];
}) {
  const [active, setActive] = useState<string>(sections[0]?.[0] ?? "");

  useEffect(() => {
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        // The topmost section in the reading band wins.
        const first = sections.find(([id]) => visible.has(id));
        if (first) setActive(first[0]);
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );
    for (const [id] of sections) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Docs" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
      <p className="text-[13px] text-muted">Prism API docs</p>
      <ul className="mt-3 flex gap-1 overflow-x-auto pb-1 text-[14px] lg:flex-col lg:overflow-visible">
        {sections.map(([id, label]) => (
          <li key={id} className="shrink-0">
            <a
              href={`#${id}`}
              aria-current={active === id ? "location" : undefined}
              className={`block rounded-[8px] px-3 py-1.5 transition-colors hover:bg-surface hover:text-ink ${
                active === id ? "bg-surface font-medium text-ink" : "text-muted"
              }`}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

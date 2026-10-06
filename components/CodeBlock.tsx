import { CodeLines } from "./CodeLines";

export function CodeBlock({ code, label, className = "" }: { code: string; label?: string; className?: string }) {
  return (
    <figure className={`overflow-hidden rounded-[14px] border border-line bg-surface ${className}`}>
      {label && <figcaption className="border-b border-line px-4 py-2 text-[12.5px] text-muted">{label}</figcaption>}
      <pre className="overflow-x-auto px-4 py-3.5 text-[12.5px] leading-[1.75] sm:text-[13px]">
        <CodeLines code={code} />
      </pre>
    </figure>
  );
}

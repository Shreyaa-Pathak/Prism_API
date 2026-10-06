import { tokenizeLine, type TokenType } from "@/lib/highlight";

const palettes: Record<"light" | "dark", Record<TokenType, string>> = {
  light: {
    comment: "text-muted italic",
    string: "text-[var(--syntax-string)]",
    keyword: "text-accent-ink font-medium",
    number: "text-accent-ink",
    prop: "text-ink",
    punct: "text-muted",
    plain: "text-ink-2",
  },
  dark: {
    comment: "text-code-dim italic",
    string: "text-blush",
    keyword: "text-accent",
    number: "text-accent-soft",
    prop: "text-warm",
    punct: "text-code-dim",
    plain: "text-line",
  },
};

export function HighlightedLine({ line, theme }: { line: string; theme: "light" | "dark" }) {
  if (line === "") return <>{" "}</>;
  const p = palettes[theme];
  return (
    <>
      {tokenizeLine(line).map((t, i) => (
        <span key={i} className={p[t.type]}>
          {t.text}
        </span>
      ))}
    </>
  );
}

export function CodeLines({ code, theme = "light", className = "" }: { code: string; theme?: "light" | "dark"; className?: string }) {
  return (
    <code className={`block font-mono ${className}`}>
      {code.split("\n").map((line, i) => (
        <span key={i} className="block whitespace-pre">
          <HighlightedLine line={line} theme={theme} />
        </span>
      ))}
    </code>
  );
}

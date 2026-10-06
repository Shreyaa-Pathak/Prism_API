export type TokenType = "comment" | "string" | "keyword" | "number" | "prop" | "punct" | "plain";
export interface Token { type: TokenType; text: string }

const KEYWORDS = new Set([
  "export", "const", "async", "await", "return", "undefined", "new", "import", "from",
  "query", "type", "true", "false", "null", "GET", "POST", "curl",
]);

const TOKEN_RE =
  /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+\b)|([A-Za-z_$][\w$]*)|([{}()[\],;.=>+?:!/&|\\-])|(\s+)|(.)/g;

/** A tiny, dependency-free highlighter tuned for the TS / GraphQL / JSON snippets on this page. */
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(line))) {
    const text = m[0];
    if (m[1]) tokens.push({ type: "comment", text });
    else if (m[2]) tokens.push({ type: "string", text });
    else if (m[3]) tokens.push({ type: "number", text });
    else if (m[4]) {
      if (KEYWORDS.has(text)) tokens.push({ type: "keyword", text });
      else if (/^\s*[(:]/.test(line.slice(TOKEN_RE.lastIndex))) tokens.push({ type: "prop", text });
      else tokens.push({ type: "plain", text });
    } else if (m[5]) tokens.push({ type: "punct", text });
    else tokens.push({ type: "plain", text });
  }
  return tokens;
}

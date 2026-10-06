import type { Config } from "tailwindcss";

// Colors map to CSS variables in app/globals.css so the palette lives in one place.
// Because they are variables, use explicit tokens rather than opacity modifiers (bg-accent/50).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./data/**/*.ts", "./lib/**/*.ts"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        warm: "var(--surface-warm)",
        blush: "var(--blush)",
        accent: {
          DEFAULT: "var(--accent)",
          light: "var(--accent-light)",
          soft: "var(--accent-soft)",
          ink: "var(--accent-ink)",
        },
        ink: { DEFAULT: "var(--foreground)", 2: "var(--foreground-2)" },
        muted: "var(--muted)",
        line: { DEFAULT: "var(--border)", dark: "var(--border-dark)" },
        code: { DEFAULT: "var(--code-bg)", line: "var(--code-line)", dim: "var(--code-dim)" },
        warn: "var(--warn)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        hero: ["clamp(3.5rem, 7vw, 7rem)", { lineHeight: "0.92", letterSpacing: "-0.055em" }],
        section: ["clamp(2rem, 4vw, 4rem)", { lineHeight: "1.02", letterSpacing: "-0.035em" }],
      },
      maxWidth: { page: "1520px" },
    },
  },
  plugins: [],
};
export default config;

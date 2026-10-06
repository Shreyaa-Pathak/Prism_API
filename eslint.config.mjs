import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      ".test-postgres/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
export default config;

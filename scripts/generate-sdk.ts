import { writeFileSync, mkdirSync } from "node:fs";
import { generateSdk } from "../graphql/sdkgen";

const base = process.env.PRISM_PUBLIC_URL ?? "http://localhost:3000";
mkdirSync("sdk", { recursive: true });
writeFileSync("sdk/prism.ts", generateSdk().replace("__BASE_URL__", base));
console.log(`Wrote sdk/prism.ts (base URL ${base})`);

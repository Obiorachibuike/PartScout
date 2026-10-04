import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "coverage/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
  // Project rules. PartScout keeps the browser bundle free of server-only
  // modules and logs through the structured logger, not the console.
  {
    name: "partscout/rules",
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    name: "partscout/logger",
    files: ["src/lib/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    name: "partscout/server-scripts",
    files: ["scripts/**/*.ts", "prisma/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
]);

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The React Compiler rules.
 *
 * `eslint-plugin-react-hooks` v7 ships the React Compiler's static
 * analysis as a set of lint rules, and its `recommended` set includes
 * them all. Each of those rules analyses a component with the compiler,
 * and the analysis of a large component is enormous: linting
 * `src/components` with them on took eight minutes and then exhausted
 * the heap.
 *
 * The two rules the Next configuration was written around are the ones
 * worth having — `rules-of-hooks` catches a hook called conditionally,
 * and `exhaustive-deps` catches a stale dependency. They are cheap and
 * they catch real mistakes. The compiler rules are a newer, stricter
 * opinion about code that React itself accepts, and they are switched
 * off here so that the linter finishes.
 *
 * Turn them back on one at a time, and lint the file you turned it on
 * for, before turning it on for the whole project.
 */
const COMPILER_RULES = [
  "react-hooks/static-components",
  "react-hooks/use-memo",
  "react-hooks/preserve-manual-memoization",
  "react-hooks/incompatible-library",
  "react-hooks/immutability",
  "react-hooks/globals",
  "react-hooks/refs",
  "react-hooks/set-state-in-effect",
  "react-hooks/error-boundaries",
  "react-hooks/purity",
  "react-hooks/set-state-in-render",
  "react-hooks/unsupported-syntax",
  "react-hooks/config",
  "react-hooks/gating",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // The web platform is what this configuration is about. The Android
    // and desktop apps are separate projects with their own toolchains,
    // and their build outputs are large enough to exhaust the linter's
    // memory when it walks them.
    "android-app/**",
    "electron-app/**",

    // Build outputs and artefacts.
    "releases/**",
    "models/**",
    "runs/**",
    "scratch/**",
    "coverage/**",

    // Vendored third-party code. It is not ours to lint: a change to it
    // would be overwritten by the next update, and the rules that fire
    // in it are not the project's to answer for.
    "public/vendor/**",

    // The intelligence service is a separate project with its own
    // container, and the tool-collection worker is Python. Neither is
    // part of the web platform this configuration is about.
    "intel/**",

    // Python's bytecode, and the tools' own checkout.
    "**/__pycache__/**",
    "**/*.pyc",
  ]),
  {
    rules: {
      ...Object.fromEntries(COMPILER_RULES.map((rule) => [rule, "off"])),

      // `any` is used deliberately and in the places where it belongs: a
      // tool's report, an upstream's answer, a payload that is not the
      // platform's to describe. The rule is kept on, and downgraded to a
      // warning, so that a new `any` is still visible in the report
      // rather than being invisible because the build was broken by it.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;

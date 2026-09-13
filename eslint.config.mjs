import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/", ".open-next/", ".claude/"] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Downgrade to warnings — these are pre-existing patterns throughout
      // the codebase that were not flagged under the previous (broken) config.
      // A component declared inside a render body is a new component *type* on
      // every render, so React unmounts and remounts its subtree rather than
      // reconciling it. That is silent on an idle page and destructive on one
      // that re-renders: it cost us the calendar's month navigation, whose DOM
      // was rebuilt several times a second during playback so that clicks
      // landed on already-detached nodes (#132). An error rather than a
      // warning because the e2e regression test for that bug does not run in
      // CI, and because `npx shadcn@latest add calendar` reintroduces exactly
      // this pattern from upstream.
      "react/no-unstable-nested-components": ["error", { allowAsProps: false }],
      "react-hooks/set-state-in-effect": "warn",
      "@typescript-eslint/no-require-imports": "warn",
    },
  },
];

export default eslintConfig;

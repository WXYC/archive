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
      "react-hooks/set-state-in-effect": "warn",
      "@typescript-eslint/no-require-imports": "warn",
    },
  },
];

export default eslintConfig;

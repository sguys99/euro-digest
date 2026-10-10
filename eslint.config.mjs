// ESLint flat config. Next 16에는 `next lint`가 없으므로 `eslint .`로 실행한다(npm run lint).
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// LLM SDK는 scripts/lib/llm.ts에서만 import한다(CLAUDE.md §6.2). 하위 경로 포함.
const LLM_SDK_MESSAGE =
  "LLM SDK는 scripts/lib/llm.ts에서만 import한다(CLAUDE.md §6.2). llm.ts의 함수를 사용할 것.";
const LLM_SDK_SOURCE = "/^@anthropic-ai\\/sdk(\\/.*)?$/";

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",

      // 정적 import·export-from
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@anthropic-ai/sdk", "@anthropic-ai/sdk/*"],
              message: LLM_SDK_MESSAGE,
            },
          ],
        },
      ],
      // no-restricted-imports가 잡지 못하는 동적 import()·require()
      "no-restricted-syntax": [
        "error",
        {
          selector: `ImportExpression[source.value=${LLM_SDK_SOURCE}]`,
          message: LLM_SDK_MESSAGE,
        },
        {
          selector: `CallExpression[callee.name="require"][arguments.0.value=${LLM_SDK_SOURCE}]`,
          message: LLM_SDK_MESSAGE,
        },
      ],
    },
  },

  // LLM 호출의 유일한 진입점. 위 두 규칙에 다른 제한을 추가하면 이 예외도 함께 손볼 것.
  {
    files: ["scripts/lib/llm.ts"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-syntax": "off",
    },
  },

  // Prettier와 겹치는 서식 규칙을 끈다. 항상 마지막에 둔다.
  prettier,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    "docs/**",
    ".claude/**",
    "next-env.d.ts",
  ]),
]);

import { defineConfig } from "vitest/config";

// Ink screens are .tsx, so the test transform needs the React automatic runtime.
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
  },
});

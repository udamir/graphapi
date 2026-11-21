import { defineConfig } from "vite-plus"

export default defineConfig({
  pack: [
    {
      // library: ESM + CJS with bundled declarations; graphql stays a peer dependency
      entry: ["src/index.ts"],
      format: ["esm", "cjs"],
      platform: "neutral",
      target: "es2022",
      dts: true,
      sourcemap: true,
    },
    {
      // self-contained browser build for <script> tags and CDNs, exposes the `GraphApi` global
      entry: { gqlapi: "src/index.ts" },
      format: "iife",
      globalName: "GraphApi",
      platform: "browser",
      target: "es2022",
      minify: true,
      deps: { alwaysBundle: ["graphql"], onlyBundle: ["graphql"] },
      clean: false,
    },
  ],
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
  lint: {
    ignorePatterns: [
      "dist/**",
      "coverage/**",
      "temp/**",
      "docs/.vitepress/cache/**",
      "docs/.vitepress/dist/**",
      // Claude Code skills, kept identical to their source
      ".claude/**",
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: [
      "dist/**",
      "coverage/**",
      "temp/**",
      "docs/.vitepress/cache/**",
      "docs/.vitepress/dist/**",
      "pnpm-lock.yaml",
      // Claude Code skills, kept identical to their source
      ".claude/**",
      // fixtures are test data: their exact text is compared with build and print results
      "test/resources/**",
    ],
    semi: false,
    printWidth: 120,
  },
})

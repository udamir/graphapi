# Contributing

The project uses [pnpm](https://pnpm.io), [Vite+](https://viteplus.dev) (`vp`: Vitest, Oxlint, Oxfmt and tsdown in one toolchain) and TypeScript 7. Node.js 22.18 or later is required for development.

```sh
pnpm install        # install dependencies
pnpm test           # run the test suite once (vp test run)
pnpm test:watch     # run tests in watch mode
pnpm check          # format check, lint and type-aware checks (vp check)
pnpm typecheck      # type-check with the TypeScript 7 compiler
pnpm build          # build dist/ with vp pack (ESM, CJS, declarations, IIFE)
pnpm docs:dev       # start this documentation site locally
pnpm docs:build     # build the documentation site
```

Run `pnpm exec vp check --fix` to format the code and apply safe lint fixes before committing.

## Project layout

| Path    | Contents                                                                                                                                                                                                                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`  | The library: the document types (`graphapi.ts`), front-ends (`from-schema.ts`, `from-introspection.ts`, `lift.ts`), the IR (`ir.ts`) and back-ends (`serialize.ts`, `print.ts`), plus the direct paths that skip the IR: `build-schema.ts` (`buildFromSchema`) and `print-document.ts` (`printSchema`), pinned to the IR paths by `test/equivalence`. |
| `test/` | Vitest suites, grouped by concern (build, introspection, print, round trip, invariants, document, JSON Schema, robustness, equivalence of the direct and IR paths).                                                                                                                                                                                   |
| `docs/` | This VitePress site, including the specification and the online demo.                                                                                                                                                                                                                                                                                 |

## Pull requests

Please run the tests before submitting a pull request, and include tests that show your change. Changes to the document format also need an update to the [specification](/spec/) and to `CHANGELOG.md`.

# What is GraphAPI?

GraphAPI is a document format that describes a GraphQL schema as plain data, the way OpenAPI describes a REST API. A GraphAPI document is plain JSON (or YAML): operations live under `queries`, `mutations` and `subscriptions`, named types under `components`, and types refer to each other with `$ref`. It is an alternative to the GraphQL introspection result that is easier to read, store, validate, diff and post-process with ordinary JSON tooling.

The [`gqlapi`](https://www.npmjs.com/package/gqlapi) package is the reference implementation: it builds GraphAPI documents from a `GraphQLSchema` or from an introspection result, and prints any GraphAPI document back to GraphQL SDL.

```text
GraphQL SDL ──buildSchema──► GraphQLSchema ──buildFromSchema──────┐
                                                                   ├──► GraphAPI document ──printSchema──► GraphQL SDL
Introspection result ───────────────────────buildFromIntrospection┘
```

## Why a separate format?

- **Readable and reviewable.** Operations, types and directives are keyed by name, so a document reads top-down and a change to a schema is a small, local change to the document.
- **Built for diffing.** Every definition has an explicit `type`, every type usage is a flat `$ref` or `type` next to the properties of its site, and nullability is one `nonNull: true` flag where the SDL writes `!`, so a change to the schema shows up in one place of the document.
- **Validated by a JSON Schema.** The [JSON Schema](/spec/json-schema) of the document checks its structure in CI and gives completion and inline errors in editors.
- **Lossless.** Descriptions, defaults, deprecation, custom directive usages with typed arguments, repeatable directives, root type names and `specifiedByURL` are all kept, and a document prints back to an equivalent schema.
- **Source agnostic.** A schema and its introspection result produce the same document for everything introspection exposes, so documents can be compared regardless of how they were obtained.

## The document

`gqlapi` produces and reads `graphapi: "1.0"` documents, defined by the [GraphAPI 1.0 specification](/spec/v1.0). The [specification overview](/spec/) shows a document next to its schema, the [conversion examples](/examples/) show one per feature, and the [online demo](/demo) builds one from your own schema.

::: info Upgrading from 0.5.x
gqlapi 0.5.x and earlier produced `graphapi: 0.1.2` documents. That format is no longer produced or read: build stored documents again from the original schema or SDL (gqlapi 0.5.1's `printSchema` prints a 0.1.2 document back to SDL). See the [changelog](/changelog) for every change.
:::

## Next steps

- [Getting started](/guide/getting-started) — install the package and build your first document.
- [Usage](/guide/usage) — every way to build, convert and print documents.
- [Specification](/spec/) — the normative description of the document.

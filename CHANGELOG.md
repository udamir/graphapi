# Changelog

## 0.6.0 (2026-11-22)

A new document format and a redesign around a shared intermediate representation (`SchemaIR`): `buildFromSchema` and `buildFromIntrospection` are now two front-ends producing the same IR, and the `graphapi: "1.0"` document and the SDL printer are two back-ends of it. The document format is specified in the [GraphAPI specification](https://udamir.github.io/graphapi/spec/); `GA-xx` references below are the ids of the audit findings fixed in this release.

### Breaking

- **The `graphapi: "0.1.2"` document format is no longer produced or read.** `graphapi: "1.0"` is the only format: `buildFromSchema` and `buildFromIntrospection` return a `graphapi: "1.0"` document, and `printSchema` and `toIR` accept only such documents and throw `Unsupported graphapi version: <v>` for anything else, including 0.1.2 documents and documents without a `graphapi` field. The builders take no options any more (the empty `BuildOptions` parameter of 0.5.1 is gone). Documents stored with 0.5.1 or earlier have to be built again: from the original schema or SDL, or, when only the document is left, by printing it back to SDL with `printSchema` of gqlapi 0.5.1 and building the 1.0 document from that SDL.
- Encodings of the 0.1.2 document that tools may read are gone with it: the `enum` array of value names (#1) is replaced by the `values` map, whose keys are the value names in declaration order; a custom scalar is no longer inlined at its usages as `{ type: string, format: <Name> }` with the scalar's description (#5), but referred to as `$ref: "#/components/scalars/<Name>"`, its description on the component; and operations carry no `title` (#2, already dropped from the SDL build in 0.5.x, see GA-10).
- The 0.1.2-shaped printing helpers `printTypes`, `typePrinter`, `printOperations` and the `TypePrinter` type are removed; use `printSchema(doc)`, or `printIR(toIR(doc))` to print from the IR.
- The 0.1.2 types are removed: `GraphSchema`, `GraphSchemaType`, `GraphApiDirective`, `GraphEnumValue`, `GraphApiList`, `GraphApiArgs`, `GraphApiComponentsKind`, `GraphApiScalarType`, `DirectiveLocation` and `BuildOptions`. The names `GraphApiSchema`, `GraphApiComponents`, `GraphApiScalar`, `GraphApiObject`, `GraphApiInterface`, `GraphApiUnion`, `GraphApiEnum`, `GraphApiInputObject` and `GraphApiDirectiveDefinition` now describe the objects of the 1.0 document, next to the new `GraphApiOperation`, `GraphApiArgument`, `GraphApiTypeUsage`, `GraphApiUsage`, `GraphApiRef`, `GraphApiDeprecation`, `GraphApiElement`, `GraphApiDeprecatable`, `GraphApiDefinition`, `GraphApiDefinitionBase`, `GraphApiDefinitionType`, `GraphApiUsageType`, `GraphApiBuiltinScalar`, `GraphApiRootType` and `GraphApiRootTypes` (see the [TypeScript types](https://udamir.github.io/graphapi/spec/v1.0#_12-typescript-types) of the specification). Unreleased development versions of 0.6.0 named them `GraphApi10Schema`, `GraphApi10Operation`, …; the `10` is dropped from every name, and `GraphApiVersion` is gone.
- `graphql` (`^16.0.0 || ^17.0.0`) is now a `peerDependency`: the front-ends use its type predicates and value parser at runtime. Every user of this package already depends on `graphql` to build a schema or run an introspection query, so nothing new must be installed, but the package no longer claims to have no dependencies. graphql 15 is not supported (it names the scalar URL `specifiedByUrl`).
- The package is published as ESM with a CommonJS fallback through `exports`: `import` resolves `dist/index.js`, `require` resolves `dist/index.cjs`, and the TypeScript declarations are bundled next to them. The `dist/esm` and `dist/cjs` folders and deep imports into them are gone.
- The `browser` field and the webpack bundle `browser/gqlapi.js` are replaced by `dist/gqlapi.iife.js`, a self-contained build (graphql included) exposing the same `GraphApi` global, also referenced by the `unpkg` and `jsdelivr` fields. Bundlers use the ESM build.

### Added

The `graphapi: "1.0"` document, designed for diffing: an explicit `type` on every definition with its members next to it (`methods`, `properties`, `values`, `oneOf`), type usages written flat next to the properties of their site (`$ref` for every named type including custom scalars, `type: Int` for built-in scalars, `type: list` with `items`), one nullability encoding (`nonNull: true` on non-null positions, where the SDL writes `!`), operations and fields as `{ description, deprecation, directives, args, <result type> }`, enum `values` as a keyed map of every value, `interfaces` plus an `implementedBy` reverse index, directive usages as arrays of `{ $ref, meta }`, the `@deprecated` usage next to a resolved `deprecation: { reason }`, and built-in directive definitions (`@deprecated`, `@oneOf`, …) only when used or overridden. It also records what 0.5.1 lost:

- Root type names in `queryTypeName`, `mutationTypeName` and `subscriptionTypeName`, always present for every root type; `printSchema` emits a `schema {}` block for non-default names and whenever a non-root type is named like a default root, so such documents re-parse correctly (GA-05).
- `rootTypes.<query|mutation|subscription>` with the `description`, `directives` and implemented `interfaces` (`[{ $ref: "#/components/interfaces/Node" }]`) of the root operation types (GA-13, GA-16); the schema description is printed even when a document has no operations.
- Document-level `directives` for usages on the `schema` definition and `directives` on enum values; directives on scalars, objects, interfaces, unions, enums and input objects are printed (GA-06). Directives applied through `extend type T @d` / `extend schema @d` are captured (GA-12).
- Every usage of a repeatable directive, one array entry per usage in source order (GA-07); `printSchema` prints all of them.
- Directive argument values in `meta` keep their GraphQL type: `@meta(i: 1, f: 1.5)` is stored as `{ i: 1, f: 1.5 }` (numbers), not as the strings `"1"` and `"1.5"` of 0.5.1 (GA-03). Lists and input objects given as directive arguments keep typed items as well.
- `specifiedByURL` on custom scalars is the only representation of `@specifiedBy`, with no dangling `$ref` to an unlisted `specifiedBy` definition, and the URL is printed for documents built from introspection too (GA-11).
- An overridden built-in directive (for example `directive @deprecated(...) on INPUT_OBJECT` redefined in the SDL) is kept as a definition and its usages as directive usages, and both are printed.
- `directiveArgs(element, name)` returns the arguments of every usage of a directive on an element of a document. Conventions such as `@example(value: …)` (#3) and `@tags(tags: […])` / `@apiKind(kind: …)` on operations (#4) need no dedicated fields: like any custom directive they are kept as usages with typed `meta`, printed back unchanged, and read with `directiveArgs(doc.queries.order, "tags")`; see [Custom directives](https://udamir.github.io/graphapi/guide/custom-directives).
- A JSON Schema (draft 2020-12) of the document ships with the package as `gqlapi/schemas/graphapi-1.0.schema.json` and is published at `https://udamir.github.io/graphapi/schemas/graphapi-1.0.schema.json`.
- graphql 17 support: default values are read from `default` (graphql 17 no longer coerces SDL defaults into `defaultValue`), so documents are the same on graphql 16 and 17.
- Tooling: `toIR(doc)` (alias `lift`) lifts a document into the IR and `fromIR(ir)` serializes the IR as a document; `fromGraphQLSchema`, `fromIntrospection`, `printIR` and the IR types are exported.

### Fixed

- Documents built from introspection now equal documents built from the SDL for everything introspection exposes: defaults are the same JavaScript values (`"hello"`, `[1, 2]`, `{ a: 2 }`, `null`, `false`, `0`, `""`, `7` for `Int! = 7`) instead of SDL literal strings (GA-08), and enum value deprecations (GA-09) and operations (no `title`, GA-10) are the same in both builds.
- Types of schemas built without an AST (code-first `GraphQLObjectType` & co.) are classified by their GraphQL kind instead of ending up as scalars (GA-04).
- `printSchema` prints default values and directive arguments as typed GraphQL literals: strings quoted, enums bare, lists as `[1, 2]`, input objects as `{a: 1}` (GA-01, GA-02). Printing a document with an input object default no longer throws.
- `buildFromIntrospection` is linear in the number of types: 5 000 types × 10 fields build in about 130 ms instead of 4.6 s (GA-14).
- `buildFromSchema(null)` and `buildFromIntrospection({})` fail with descriptive `TypeError`s.
- Default values of arguments and input fields are the SDL literal as written: an input object default such as `filter: Filter = { text: "all" }` was dropped on graphql 17 when `Filter` has a non-null field with a default, and graphql 16 merged the field defaults into it (`{ text: "all", limit: 20, … }`), so the document differed from the introspection build.
- `@deprecated` is recognized as the built-in directive when its definition also allows `DIRECTIVE_DEFINITION` (graphql 16.14+ and 17); before, it was treated as an overridden directive and `printSchema` printed its definition.

### Performance

Measured against gqlapi 0.5.1 from npm on graphql 16 (the version 0.5.1 supports; on graphql 17 it drops every default value), Node 26, fastest of 40 timed runs (12 for `buildFromIntrospection`), each version in its own fresh processes, interleaved:

| Workload (fixture)                                                     | 0.5.1    | 0.6.0  | Change      |
| ---------------------------------------------------------------------- | -------- | ------ | ----------- |
| `buildFromSchema` (GitHub public schema)                               | 13.7 ms  | 6.5 ms | 2.1× faster |
| `buildFromSchema` (5 000 types × 10 fields)                            | 168 ms   | 79 ms  | 2.1× faster |
| `buildFromIntrospection` (GitHub public schema)                        | 204 ms   | 8.9 ms | 23× faster  |
| `buildFromIntrospection` (5 000 types × 10 fields)                     | 4 572 ms | 133 ms | 34× faster  |
| `printSchema` (5 000 types × 10 fields, scalar and enum defaults only) | 108 ms   | 49 ms  | 2.2× faster |
| `printSchema` (1 type × 5 000 fields)                                  | 21 ms    | 2.7 ms | 8× faster   |

`buildFromSchema` builds the document directly from the `GraphQLSchema` and `printSchema` prints it directly as SDL, both without building the IR, with a third of the allocation (`test/equivalence` pins them to the IR paths); plain single-line descriptions and strings without escapes skip the block string rules and the escaping replace. `buildFromIntrospection` is linear (GA-14). 0.5.1 cannot print the GitHub schema and most generated schemas at all (GA-01); there `printSchema` is 52–62 % faster than the 0.6.0 IR printer. A full SDL round trip (parse, build, print) is 15–19 % faster, most of its time being graphql-js parsing the SDL. The 1.0 document is about as large as the 0.1.2 document of 0.5.1 for real schemas (the public GitHub schema: 0.3 % larger as compact JSON); schemas with many enum values or deprecations are larger, because 1.0 lists every enum value and records a deprecation both as `deprecation` and as the `@deprecated` usage.

### Documentation

- A help portal at https://udamir.github.io/graphapi/ (VitePress, sources in `docs/`), replacing the single-page converter: guide (including every conversion path), API reference, the normative GraphAPI 1.0 specification, its JSON Schema (`/schemas/graphapi-1.0.schema.json`, with tests validating every produced document against it), conversion examples generated at build time for one schema per feature, and an online demo that converts between GraphQL SDL, introspection results and GraphAPI documents in every direction, validates documents against the JSON Schema and shares inputs by link.

# Usage

## Build from a schema

`buildFromSchema` accepts any `GraphQLSchema`: one built from SDL with `buildSchema` / `buildASTSchema`, or a code-first schema built from `GraphQLObjectType` & co.

```ts
import { buildSchema } from "graphql"
import { buildFromSchema } from "gqlapi"

const graphapi = buildFromSchema(buildSchema(sdl))
```

Custom directive usages (`@cache(maxAge: 60)`) are read from the schema AST, including usages added with `extend type T @d` and `extend schema @d`. Their arguments keep their GraphQL type: `@meta(i: 1, f: 1.5)` is stored as `{ i: 1, f: 1.5 }`.

## Build from introspection

`buildFromIntrospection` accepts the `data` of an introspection query response. Ask for every optional introspection field, so the document is as complete as the schema build:

```ts
import { getIntrospectionQuery, graphqlSync } from "graphql"
import { buildFromIntrospection } from "gqlapi"

const query = getIntrospectionQuery({
  inputValueDeprecation: true,
  schemaDescription: true,
  specifiedByUrl: true,
  directiveIsRepeatable: true,
})
const { data } = graphqlSync({ schema, source: query })
const graphapi = buildFromIntrospection(data)
```

The result is usually fetched from a remote server instead (`POST { query }` to its GraphQL endpoint).

::: warning Introspection does not expose directive usages
Custom directive usages are present only in documents built from a schema. Everything else (types, defaults, deprecation, `specifiedByURL`, root type names, descriptions) is identical in both builds.
:::

## The document

Both builders return a `GraphApiSchema`, a `graphapi: "1.0"` document: a flat document designed for diffing, with an explicit `type` on every definition, type usages written next to the properties of their site (`$ref`, `type: Int`, `type: list` + `items`), one nullability encoding (`nonNull: true` where the SDL writes `!`), `$ref` for every named type including custom scalars, and arrays of directive usages. The [specification](/spec/v1.0) defines every field, and the [conversion examples](/examples/) show the document for one schema per feature.

```ts
import type { GraphApiOperation, GraphApiSchema } from "gqlapi"

const doc: GraphApiSchema = buildFromSchema(schema)
const todo: GraphApiOperation | undefined = doc.queries?.todo
```

## Read custom directives

Custom directives are kept as generic usages `{ $ref, meta }` in the `directives` array of the element they are applied to, with their definitions in `components.directives`. Read them with `directiveArgs`:

```ts
import { directiveArgs } from "gqlapi"

directiveArgs(doc.queries?.order, "tags") // [{ tags: ["orders", "read"] }]
```

[Custom directives](/guide/custom-directives) describes definitions, usages, conventions such as `@example`, `@tags` and `@apiKind`, the built-in directives and what introspection leaves out.

## Print a document as SDL

`printSchema` prints a document as GraphQL SDL that re-parses into an equivalent schema:

```ts
import { printSchema } from "gqlapi"

const sdl = printSchema(graphapi)
```

Default values and directive arguments are printed as typed GraphQL literals (strings quoted, enum values bare, lists as `[1, 2]`, input objects as `{a: 1}`). A `schema { … }` block is printed whenever root type names are not the defaults, or a non-root type is named `Query`, `Mutation` or `Subscription`.

`printSchema` and `toIR` read `graphapi: "1.0"` documents only. Any other `graphapi` value, a missing one included, throws `Unsupported graphapi version: <v>`; this covers the `graphapi: 0.1.2` documents written by gqlapi 0.5.x and earlier, which have to be built again from their schema (see the [changelog](/changelog)).

## Work with the intermediate representation

The library is built around one intermediate representation, `SchemaIR`: both builders and the printer produce exactly what they would produce through it (`buildFromSchema` and `printSchema` take direct paths, which are faster and tested to be equal). `toIR` lifts a document into it, and `fromIR` serializes it as a document again:

```ts
import { fromIR, printIR, toIR } from "gqlapi"

const ir = toIR(graphapi) // SchemaIR
const normalized = fromIR(ir) // the document again, normalized
const sdl = printIR(ir) // same as printSchema(graphapi)
```

`fromGraphQLSchema(schema)` and `fromIntrospection(introspection)` produce the IR directly, which is useful for tooling that wants to inspect a schema with typed values and every directive usage, without going through a document.

## Store documents as YAML or JSON

Documents are plain data, so any serializer works. With [js-yaml](https://github.com/nodeca/js-yaml):

```ts
import { dump, load } from "js-yaml"

const text = dump(graphapi, { noRefs: true })
const restored = load(text)
```

Use `noRefs: true` so YAML anchors are not emitted for objects that appear twice.

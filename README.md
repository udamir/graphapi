# GraphAPI

<img alt="npm" src="https://img.shields.io/npm/v/gqlapi"> <img alt="npm" src="https://img.shields.io/npm/dm/gqlapi?label=npm"> <img alt="npm type definitions" src="https://img.shields.io/npm/types/gqlapi"> <img alt="GitHub" src="https://img.shields.io/github/license/udamir/graphapi">

This package provides utils to convert GraphQL schema into GraphAPI document and back.<br/>
The GraphAPI Specification is GraphQL introspection alternative, a JSON document with OpenApi-style components and `$ref`s, validated by a JSON Schema - OpenApi for GraphQL.

**[Documentation](https://udamir.github.io/graphapi/)** · **[Specification](https://udamir.github.io/graphapi/spec/)** · **[Online demo](https://udamir.github.io/graphapi/demo)**

## Features

- GraphQL document similar to OpenApi: named types in `components`, referenced with JSON-pointer `$ref`s, operations grouped into `queries`, `mutations` and `subscriptions`
- One document format, `graphapi: "1.0"`, designed for diffing: explicit kinds, uniform nullability, `$ref` for every named type including custom scalars; a [JSON Schema](https://udamir.github.io/graphapi/spec/json-schema) validates it
- Support custom directives in schema (meta): typed argument values, repeatable directives, usages on every location including the schema definition and enum values
- Root operation type names, descriptions and directives are preserved, so `schema { query: RootQ }` round-trips
- GraphAPI document can be build from GraphQL Schema or Introspection, and both builds produce the same document for everything introspection exposes
- GraphAPI document can be converted back to GraphQL Schema (SDL)
- Typescript syntax support out of the box
- Works in nodejs or browser (ESM, CommonJS and a self-contained IIFE build); the only dependency is the `graphql` package you already use to build the schema (peer dependency, `^16 || ^17`)

## Installation

```SH
pnpm add gqlapi graphql
# or: npm install gqlapi graphql
```

`graphql` is a peer dependency: the builders use its type predicates and its value parser, so the installed version must be the one your schema objects come from (`^16.0.0 || ^17.0.0`).

## Usage

### Build GraphAPI document from Schema or Introspection

```ts
import { buildSchema, graphqlSync, getIntrospectionQuery } from "graphql"
import { buildFromSchema, buildFromIntrospection } from "gqlapi"

// build from GraphQL schema
const schema = buildSchema(data)
const graphapi = buildFromSchema(schema)

// build from GraphQL introspection
const introspection = graphqlSync({
  schema,
  source: getIntrospectionQuery({ inputValueDeprecation: true, schemaDescription: true, specifiedByUrl: true }),
}).data
const graphapi = buildFromIntrospection(introspection)
```

> Important: custom directive usages are present only in documents built from a schema, as introspection does not expose them; everything else (types, defaults, deprecation, `specifiedByURL`, root type names) is identical in both builds.

### Print GraphQL schema document from GraphAPI document

```ts
import { printSchema } from "gqlapi"

const schema = printSchema(graphapi)
console.log(schema)
```

Default values and directive arguments are printed as typed GraphQL literals (strings quoted, enum values bare, lists as `[1, 2]`, input objects as `{a: 1}`); a `schema {}` block is printed whenever root type names are not the defaults or a non-root type is named `Query`, `Mutation` or `Subscription`.

`printSchema` reads `graphapi: "1.0"` documents only and throws `Unsupported graphapi version: <v>` for anything else, including the `graphapi: 0.1.2` documents of gqlapi 0.5.x and earlier (see [Upgrading from 0.5.x](#upgrading-from-05x)).

### Inspect the intermediate representation

```ts
import { toIR, fromIR, printIR } from "gqlapi"

const ir = toIR(graphapi) // SchemaIR of the document
const normalized = fromIR(ir) // the document again, normalized
const sdl = printIR(ir)
```

## The GraphAPI document

The normative description is the [GraphAPI 1.0 specification](https://udamir.github.io/graphapi/spec/v1.0); in short:

`buildFromSchema(schema)` produces a flat `graphapi: "1.0"` document designed for diffing: every definition has an explicit `type` (`object`, `interface`, `input`, `enum`, `union`, `scalar`) with its members next to it (`methods`, `properties`, `values`, `oneOf`, `interfaces`), every type usage is written flat next to the properties of its site, as `$ref` for named types (custom scalars included), `type: Int | Float | String | Boolean | ID` for built-in scalars or `type: list` with `items`, plus `nonNull: true` on non-null positions, where the SDL writes `!` (one nullability encoding; a position without it is nullable), operations and fields are `{ description?, deprecation?, directives?, args?, <result type> }`, enums keep a `values` map of every value, interfaces list their `implementedBy` component types, directive usages are arrays of `{ $ref, meta? }`, deprecated elements carry both the `@deprecated` usage and a resolved `deprecation: { reason }`, root type names are always stored, `rootTypes.<kind>` holds the `description`, `directives` and `interfaces` of the root operation types, and built-in directive definitions appear only when used or overridden. TypeScript types are exported as `GraphApiSchema`, `GraphApiOperation`, `GraphApiTypeUsage`, ….

## Example

### Input data:

```graphql
type Todo {
  id: ID!
  name: String!
  completed: Boolean
  color: Color

  "A field that requires an argument"
  colors(filter: [Color!]!): [Color!]!
}

enum Color {
  "Red color"
  RED

  "Green color"
  GREEN
}

input TodoInputType {
  name: String!
  completed: Boolean @deprecated(reason: "not used")
  color: Color = RED
}

type Query {
  "A Query with 1 required argument and 1 optional argument"
  todo(
    id: ID!

    "A default value of false"
    isCompleted: Boolean = false
  ): Todo

  """
  Returns a list (or null) that can contain null values
  """
  todos("Required argument that is a list that cannot contain null values" ids: [String!]!): [Todo]
}

type Mutation {
  "A Mutation with 1 required argument"
  create_todo(todo: TodoInputType!): Todo!
}
```

### Output result in yaml format:

```yaml
graphapi: "1.0"
queryTypeName: Query
mutationTypeName: Mutation
queries:
  todo:
    description: A Query with 1 required argument and 1 optional argument
    args:
      id:
        type: ID
        nonNull: true
      isCompleted:
        description: A default value of false
        type: Boolean
        default: false
    $ref: "#/components/objects/Todo"
  todos:
    description: Returns a list (or null) that can contain null values
    args:
      ids:
        description: Required argument that is a list that cannot contain null values
        type: list
        items:
          type: String
          nonNull: true
        nonNull: true
    type: list
    items:
      $ref: "#/components/objects/Todo"
mutations:
  create_todo:
    description: A Mutation with 1 required argument
    args:
      todo:
        $ref: "#/components/inputObjects/TodoInputType"
        nonNull: true
    $ref: "#/components/objects/Todo"
    nonNull: true
components:
  objects:
    Todo:
      title: Todo
      type: object
      methods:
        id:
          type: ID
          nonNull: true
        name:
          type: String
          nonNull: true
        completed:
          type: Boolean
        color:
          $ref: "#/components/enums/Color"
        colors:
          description: A field that requires an argument
          args:
            filter:
              type: list
              items:
                $ref: "#/components/enums/Color"
                nonNull: true
              nonNull: true
          type: list
          items:
            $ref: "#/components/enums/Color"
            nonNull: true
          nonNull: true
  enums:
    Color:
      title: Color
      type: enum
      values:
        RED:
          description: Red color
        GREEN:
          description: Green color
  inputObjects:
    TodoInputType:
      title: TodoInputType
      type: input
      properties:
        name:
          type: String
          nonNull: true
        completed:
          deprecation:
            reason: not used
          directives:
            - $ref: "#/components/directives/deprecated"
              meta:
                reason: not used
          type: Boolean
        color:
          $ref: "#/components/enums/Color"
          default: RED
  directives:
    deprecated:
      title: deprecated
      description: Marks an element of a GraphQL schema as no longer supported.
      locations:
        - FIELD_DEFINITION
        - ARGUMENT_DEFINITION
        - INPUT_FIELD_DEFINITION
        - ENUM_VALUE
        - DIRECTIVE_DEFINITION
      args:
        reason:
          description: >-
            Explains why this element was deprecated, usually also including a suggestion for how to access supported
            similar data. Formatted using the Markdown syntax, as specified by [CommonMark](https://commonmark.org/).
          type: String
          nonNull: true
          default: No longer supported
      repeatable: false
```

## Upgrading from 0.5.x

gqlapi 0.6.0 produces and reads only `graphapi: "1.0"` documents; the `graphapi: 0.1.2` format of 0.5.x and earlier is gone, and so are its TypeScript types and the `printTypes`, `typePrinter` and `printOperations` helpers. Documents stored by 0.5.x are not read by `printSchema` or `toIR`: build them again from the original schema or SDL, or, if only the document is left, print it back to SDL with `printSchema` of gqlapi 0.5.1 and build the 1.0 document from that SDL. The [changelog](CHANGELOG.md) lists every change.

## Documentation

The [help portal](https://udamir.github.io/graphapi/) holds the guide, the API reference, the GraphAPI specification ([overview](https://udamir.github.io/graphapi/spec/), [GraphAPI 1.0](https://udamir.github.io/graphapi/spec/v1.0)) with its [JSON Schema](https://udamir.github.io/graphapi/spec/json-schema), [conversion examples](https://udamir.github.io/graphapi/examples/) for every feature, and the [online demo](https://udamir.github.io/graphapi/demo), which converts between GraphQL SDL, introspection results and GraphAPI documents. Its sources are in `docs/` (VitePress); release notes are in `CHANGELOG.md`.

## Contributing

The project uses pnpm, [Vite+](https://viteplus.dev) (Vitest, Oxlint, Oxfmt, tsdown) and TypeScript 7; Node.js 22.18+ is required for development.

```SH
pnpm install
pnpm test          # vp test run
pnpm check         # format, lint and type-aware checks (vp check)
pnpm typecheck     # tsc 7
pnpm build         # vp pack: ESM, CJS, declarations and dist/gqlapi.iife.js
pnpm docs:dev      # the documentation site
```

Please run the unit tests before submitting your PR. Hopefully your PR includes additional unit tests to illustrate your change/modification!

## License

MIT

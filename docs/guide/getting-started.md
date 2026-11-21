# Getting started

## Installation

`gqlapi` has a single peer dependency, `graphql` (16 or 17), which you already use to build your schema.

::: code-group

```sh [pnpm]
pnpm add gqlapi graphql
```

```sh [npm]
npm install gqlapi graphql
```

```sh [yarn]
yarn add gqlapi graphql
```

:::

::: tip Why a peer dependency?
The builders use the type predicates and value parser of `graphql` at runtime, so they must use the same `graphql` instance your `GraphQLSchema` objects come from.
:::

The package ships ESM and CommonJS builds with bundled TypeScript declarations; `import` and `require` both work.

## Build your first document

```ts
import { buildSchema } from "graphql"
import { buildFromSchema } from "gqlapi"

const schema = buildSchema(`
  type Query {
    "Find a todo by id"
    todo(id: ID!): Todo
  }

  type Todo {
    id: ID!
    name: String!
    done: Boolean @deprecated(reason: "use status")
  }
`)

const graphapi = buildFromSchema(schema)
```

`graphapi` is a plain object, a `graphapi: "1.0"` document. Dumped as YAML with js-yaml:

```yaml
graphapi: "1.0"
queryTypeName: Query
queries:
  todo:
    description: Find a todo by id
    args:
      id:
        type: ID
        nonNull: true
    $ref: "#/components/objects/Todo"
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
        done:
          deprecation:
            reason: use status
          directives:
            - $ref: "#/components/directives/deprecated"
              meta:
                reason: use status
          type: Boolean
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

Non-null positions carry `nonNull: true`, where the SDL writes `!`. The deprecation of `done` is recorded both as `deprecation` and as the `@deprecated` usage, so the `deprecated` definition is listed in `components.directives`; its text comes from the installed `graphql` (17 here). The [specification](/spec/v1.0) defines every field.

## Print it back to SDL

```ts
import { printSchema } from "gqlapi"

console.log(printSchema(graphapi))
```

```graphql
type Todo {
  id: ID!
  name: String!
  done: Boolean @deprecated(reason: "use status")
}

type Query {
  """
  Find a todo by id
  """
  todo(id: ID!): Todo
}
```

## Use it in the browser without a bundler

`dist/gqlapi.iife.js` is a self-contained build (with `graphql` bundled in) that exposes a `GraphApi` global:

```html
<script src="https://cdn.jsdelivr.net/npm/gqlapi/dist/gqlapi.iife.js"></script>
<script>
  const graphapi = GraphApi.buildFromIntrospection(introspectionResult)
  console.log(GraphApi.printSchema(graphapi))
</script>
```

With a bundler, import the package normally; the ESM build is tree-shakeable.

## What next?

- Try your own schema in the [online demo](/demo).
- Learn about the [document format](/spec/v1.0) and the [intermediate representation](/guide/usage#work-with-the-intermediate-representation).
- Read the [specification](/spec/).

# API reference

All functions are named exports of `gqlapi`.

```ts
import {
  buildFromSchema,
  buildFromIntrospection,
  printSchema,
  toIR,
  lift,
  fromIR,
  fromGraphQLSchema,
  fromIntrospection,
  printIR,
} from "gqlapi"
```

## Builders

### `buildFromSchema(schema)`

Builds a GraphAPI document (`graphapi: "1.0"`) from a `GraphQLSchema`.

```ts
function buildFromSchema(schema: GraphQLSchema): GraphApiSchema
```

| Parameter | Type            | Description                                                           |
| --------- | --------------- | --------------------------------------------------------------------- |
| `schema`  | `GraphQLSchema` | The schema to describe. Throws a `TypeError` when it is not a schema. |

### `buildFromIntrospection(introspection)`

Builds a GraphAPI document from an introspection result (`{ __schema: … }`, the `data` of an introspection response). Same return type as `buildFromSchema`. Throws a `TypeError` when `__schema` is missing.

```ts
function buildFromIntrospection(introspection: IntrospectionQuery): GraphApiSchema
```

## Printer

### `printSchema(graphapi)`

Prints a document as GraphQL SDL.

```ts
function printSchema(graphapi: GraphApiSchema): string
```

Throws `Unsupported graphapi version: <v>` when the document's `graphapi` is not `"1.0"`, including `graphapi: 0.1.2` documents of gqlapi 0.5.x and documents without a `graphapi` field, and a `TypeError` when the argument is not an object.

## Directive usages

### `directiveArgs(element, name)`

```ts
function directiveArgs(element: GraphApiElementWithDirectives | undefined, name: string): Record<string, unknown>[]
```

The arguments (`meta`) of every usage of the directive `name` on an element of a document (the document itself, a root type, a definition, an operation or field, an argument or input field, an enum value), in source order. A repeatable directive gives one entry per usage, a usage without arguments gives `{}`, an unused directive or a missing element gives `[]`. The entries are the objects of the document, not copies. See [Custom directives](/guide/custom-directives).

## Intermediate representation

### `toIR(graphapi)` / `lift(graphapi)`

Lifts a document into a `SchemaIR`. `toIR` and `lift` are the same function and throw like `printSchema`.

```ts
function toIR(graphapi: GraphApiSchema): SchemaIR
```

### `fromIR(ir)`

Serializes a `SchemaIR` as a document. `fromIR(toIR(doc))` normalizes a document: for a document built by `gqlapi` the result deep-equals the input.

```ts
function fromIR(ir: SchemaIR): GraphApiSchema
```

### `fromGraphQLSchema(schema)` / `fromIntrospection(introspection)`

The front-ends of the builders: produce a `SchemaIR` from a `GraphQLSchema` or from an introspection result. `buildFromSchema(schema)` returns the same document as `fromIR(fromGraphQLSchema(schema))`, without building the IR.

### `printIR(ir)`

Prints a `SchemaIR` as GraphQL SDL; `printSchema(doc)` returns the same SDL as `printIR(toIR(doc))`, without building the IR.

## Types

| Type                                                                                                            | Description                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GraphApiSchema`                                                                                                | A `graphapi: "1.0"` document, the [GraphAPI Object](/spec/v1.0#_3-1-graphapi-object).            |
| `GraphApiComponents`                                                                                            | The [Components Object](/spec/v1.0#_3-2-components-object).                                      |
| `GraphApiOperation`, `GraphApiArgument`, `GraphApiTypeUsage`                                                    | Operations and fields, arguments and input fields, and the type usage written flat next to them. |
| `GraphApiScalar`, `GraphApiObject`, `GraphApiInterface`, `GraphApiUnion`, `GraphApiEnum`, `GraphApiInputObject` | The definitions in `components`; `GraphApiDefinition` is their union, discriminated by `type`.   |
| `GraphApiDirectiveDefinition`, `GraphApiUsage`, `GraphApiDeprecation`, `GraphApiRef`                            | Directive definitions and usages, the Deprecation Object and the Reference Object.               |
| `GraphApiRootType`, `GraphApiRootTypes`                                                                         | The description, directives and interfaces of the root operation types.                          |
| `GraphApiElementWithDirectives`                                                                                 | Any element with a `directives` array, as accepted by `directiveArgs`.                           |
| `SchemaIR`, `NamedType`, `Field`, `InputValue`, `TypeRef`, `Usage`, …                                           | The intermediate representation.                                                                 |

The [TypeScript types section](/spec/v1.0#_12-typescript-types) of the specification maps every type to the object it describes.

---
title: GraphAPI Specification
outline: [2, 3]
---

# GraphAPI Specification

The GraphAPI Specification defines a serializable, OpenAPI-flavoured description of a GraphQL schema. A GraphAPI document describes everything a GraphQL type system defines (named types, fields, arguments, input values, default values, descriptions, deprecations, directive definitions and directive usages, and the schema definition with its root operation types) as plain JSON data that can be stored, versioned, rendered and diffed with ordinary JSON tooling.

GraphAPI is an alternative to the GraphQL introspection result. Introspection is designed to be queried by GraphQL clients; it is verbose, nests every type reference as a chain of `NON_NULL`/`LIST` wrappers, and cannot carry custom directive usages. A GraphAPI document is designed to be read by people and programs: named types live in `components` and are referenced with JSON-pointer `$ref`s (as in OpenAPI), operations are grouped into `queries`, `mutations` and `subscriptions`, and directive usages are kept with typed argument values.

The reference implementation is the [`gqlapi`](https://www.npmjs.com/package/gqlapi) npm package (0.6.0), which builds documents from a `GraphQLSchema` (`buildFromSchema`) or from an introspection result (`buildFromIntrospection`) and prints a document back to GraphQL SDL (`printSchema`). You can try it in the [online demo](/demo).

## Version

The current version is **GraphAPI 1.0**, marked by `graphapi: "1.0"` (a string; quote it in YAML) and defined on the [GraphAPI 1.0](/spec/v1.0) page. It is the only format `gqlapi` produces and reads; a [JSON Schema](/spec/json-schema) checks the structure of a document.

```ts
import { buildSchema } from "graphql"
import { buildFromSchema } from "gqlapi"

const doc = buildFromSchema(buildSchema(sdl)) // graphapi: "1.0"
```

::: info Earlier documents
gqlapi 0.5.x and earlier wrote documents marked `graphapi: 0.1.2`. That format is not part of this specification and is not read by `gqlapi` 0.6.0; build such documents again from their schema (gqlapi 0.5.1's `printSchema` prints them back to SDL).
:::

### A schema and its document

::: code-group

```graphql [schema.graphql]
scalar Date

type Event {
  id: ID!
  at: Date
  tags: [String!]
}

type Query {
  events(after: Date): [Event!]!
}
```

```yaml [graphapi.yaml]
graphapi: "1.0"
queryTypeName: Query
queries:
  events:
    args:
      after:
        $ref: "#/components/scalars/Date"
    type: list
    items:
      $ref: "#/components/objects/Event"
      nonNull: true
    nonNull: true
components:
  scalars:
    Date:
      title: Date
      type: scalar
  objects:
    Event:
      title: Event
      type: object
      methods:
        id:
          type: ID
          nonNull: true
        at:
          $ref: "#/components/scalars/Date"
        tags:
          type: list
          items:
            type: String
            nonNull: true
```

:::

Named types are stored once in `components`, each with an explicit `type`; operations are grouped by root type; every reference to a type is a flat type usage next to the properties of its site: `$ref` for a named type (the custom scalar `Date` included), `type` for a built-in scalar, `type: list` with `items` for a list, and `nonNull: true` where the SDL writes `!`.

## Design

A GraphAPI 1.0 document is meant to be compared, indexed and processed by tools. Every change in the GraphQL schema shows up as a change in exactly one place: a custom scalar replacing `String` replaces `type: String` with one `$ref`, a result type change touches only that field's type reference, a nullability change touches only `nonNull`. Every definition has an explicit `type`, enum values and directive usages are complete, and "must be provided" is derivable: `nonNull: true` and no `default`.

Type usages are flat, so a usage site's own fields (`description`, `args`, `default`, `directives`) are siblings of its `$ref`: tools that resolve `$ref` must keep the usage object instead of replacing it with the referenced definition (see [Properties of the usage site](/spec/v1.0#_4-2-properties-of-the-usage-site)).

`printSchema` prints a document back to SDL, and `toIR` / `fromIR` lift a document into the intermediate representation and write it again, normalized:

```ts
import { fromIR, printSchema, toIR } from "gqlapi"

const sdl = printSchema(doc)
const normalized = fromIR(toIR(doc)) // deep-equals doc when gqlapi built it
```

::: tip
Documents built with `buildFromIntrospection` equal documents built with `buildFromSchema` from the same schema, except that they carry no custom directive usages: introspection does not expose them. Directive definitions, descriptions, deprecations, default values, `specifiedByURL` and root type names are the same in both builds.
:::

## Conformance

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY" and "OPTIONAL" in the specification pages are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) when, and only when, they appear in all capitals.

A **document** conforms to this specification when it satisfies every MUST and MUST NOT requirement of the [GraphAPI 1.0](/spec/v1.0) page. A **producer** (a program that writes GraphAPI documents) conforms when every document it writes conforms and when it follows the SHOULD requirements unless it documents a reason not to. A **consumer** (a program that reads GraphAPI documents) conforms when it accepts every conforming document and interprets it as specified.

A consumer MUST read the `graphapi` field before anything else and MUST reject a document whose version it does not support. Documents are JSON values; they MAY be stored as JSON or YAML. Field names are case-sensitive.

::: info Reference implementation
`gqlapi` 0.6.0 supports graphql-js `^16.0.0 || ^17.0.0` as a peer dependency and produces the same document from both major versions. Whether a directive definition is built-in is decided by its name and shape (see [Built-in directives](/spec/v1.0#_7-11-built-in-directives)), so the `DIRECTIVE_DEFINITION` location that graphql-js 16.14 and later (including 17) add to `@deprecated` does not turn it into an override. The text of the built-in definitions that a document contains (their descriptions and argument types) is taken from the installed graphql-js and can differ between its releases.
:::

## Specification pages

- [GraphAPI 1.0](/spec/v1.0): the normative definition of the document.
- [JSON Schema](/spec/json-schema): the machine-readable schema of the document, for validation and editor support.
- [Conversion examples](/examples/): one schema per feature, shown as SDL, introspection, the document and the SDL printed back.
- [Online demo](/demo): convert your own schema between every format.

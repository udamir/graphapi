# Custom directives

A GraphAPI document keeps every custom directive of a schema: its definition with typed arguments, and every usage with the values written in it. Nothing is interpreted, whatever the directive's name, and `printSchema` prints definitions and usages back unchanged. The rules are in the specification ([Directive Definition Object](/spec/v1.0#_5-10-directive-definition-object), [Directive Usage Object](/spec/v1.0#_5-11-directive-usage-object), [Custom directives](/spec/v1.0#_7-10-custom-directives)); the [conversion examples](/examples/#custom-directives) show a complete schema.

## Definitions

Each custom directive definition is an entry of `components.directives`, keyed by name. Its arguments are written like the arguments of a field: a type usage, a default value, a description.

::: code-group

```graphql [schema.graphql]
"Rate limit per client"
directive @limits(rate: Float!, window: Int = 60, keys: [String!] = ["ip"]) repeatable on FIELD_DEFINITION | OBJECT
```

```yaml [graphapi.yaml]
components:
  directives:
    limits:
      title: limits
      description: Rate limit per client
      locations:
        - FIELD_DEFINITION
        - OBJECT
      args:
        rate:
          type: Float
          nonNull: true
        window:
          type: Int
          default: 60
        keys:
          type: list
          items:
            type: String
            nonNull: true
          default:
            - ip
      repeatable: true
```

:::

`repeatable` is always present. Definitions are listed even when nothing uses them.

## Usages

A usage is an entry `{ $ref, meta }` in the `directives` array of the element it is applied to:

| Applied to                                               | Stored in                                        |
| -------------------------------------------------------- | ------------------------------------------------ |
| the `schema` definition                                  | `directives` of the document                     |
| a root operation type (`type Query @d`)                  | `rootTypes.query.directives` (and so on)         |
| a scalar, object, interface, union, enum or input object | `directives` of its definition in `components`   |
| an operation or a field                                  | `directives` of the operation or field           |
| an argument or an input field                            | `directives` of the argument or input field      |
| an enum value                                            | `directives` of the value in the enum's `values` |

`meta` holds the arguments written in the usage, as JSON values typed by the definition: numbers stay numbers, lists and input objects keep their items, enum values are their names. Default values of the definition are not filled in, and a usage without arguments has no `meta`. A repeatable directive applied twice gives two entries, in source order; usages added with `extend type T @d` or `extend schema @d` follow those of the definition.

::: code-group

```graphql [schema.graphql]
type Query {
  search(q: String): [String] @limits(rate: 2.5) @limits(rate: 10, keys: ["user", "ip"])
}
```

```yaml [graphapi.yaml]
queries:
  search:
    directives:
      - $ref: "#/components/directives/limits"
        meta:
          rate: 2.5
      - $ref: "#/components/directives/limits"
        meta:
          rate: 10
          keys:
            - user
            - ip
    args:
      q:
        type: String
    type: list
    items:
      type: String
```

:::

## Read usages with `directiveArgs`

`directiveArgs(element, name)` returns the `meta` of every usage of one directive on an element, in source order: one entry per usage of a repeatable directive, `{}` for a usage without arguments, `[]` when the directive is not used or the element is missing. The entries are the objects of the document, not copies.

```ts
import { directiveArgs } from "gqlapi"

directiveArgs(doc.queries?.search, "limits") // [{ rate: 2.5 }, { rate: 10, keys: ["user", "ip"] }]
directiveArgs(doc.queries?.search, "cache") // []
```

The element can be anything with a `directives` array: the document, a root type, a definition, an operation or field, an argument or input field, an enum value.

## Common conventions

Directives such as `@example` for sample values, or `@tags` and `@apiKind` for operation metadata, are conventions of the tools that read them, not part of GraphQL. A document keeps them like any other custom directive, so no dedicated fields are needed:

::: code-group

```graphql [schema.graphql]
scalar JSON
directive @example(value: JSON!) repeatable on FIELD_DEFINITION | ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION | SCALAR
directive @tags(tags: [String!]!) on FIELD_DEFINITION | OBJECT
directive @apiKind(kind: String!) on FIELD_DEFINITION | OBJECT

type Order {
  id: ID!
}

type Query {
  order(id: ID! @example(value: "ord-1")): Order @tags(tags: ["orders", "read"]) @apiKind(kind: "bwc")
}
```

```yaml [graphapi.yaml]
queries:
  order:
    directives:
      - $ref: "#/components/directives/tags"
        meta:
          tags:
            - orders
            - read
      - $ref: "#/components/directives/apiKind"
        meta:
          kind: bwc
    args:
      id:
        directives:
          - $ref: "#/components/directives/example"
            meta:
              value: ord-1
        type: ID
        nonNull: true
    $ref: "#/components/objects/Order"
```

:::

```ts
const order = doc.queries?.order
const tags = directiveArgs(order, "tags").flatMap((args) => args.tags as string[]) // ["orders", "read"]
const apiKind = directiveArgs(order, "apiKind")[0]?.kind // "bwc"
const examples = directiveArgs(order?.args?.id, "example").map((args) => args.value) // ["ord-1"]
```

| Convention               | Typical definition                                                                            | Read with                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Sample values            | `directive @example(value: JSON!) repeatable on FIELD_DEFINITION \| ARGUMENT_DEFINITION \| …` | `directiveArgs(element, "example").map((a) => a.value)`   |
| Operation tags           | `directive @tags(tags: [String!]!) on FIELD_DEFINITION \| OBJECT`                             | `directiveArgs(operation, "tags").flatMap((a) => a.tags)` |
| API kind of an operation | `directive @apiKind(kind: String!) on FIELD_DEFINITION \| OBJECT`                             | `directiveArgs(operation, "apiKind")[0]?.kind`            |
| Apollo Federation tags   | `directive @tag(name: String!) repeatable on FIELD_DEFINITION \| …`                           | `directiveArgs(element, "tag").map((a) => a.name)`        |

The conversion examples show [this schema](/examples/#example-values-tags-and-api-kinds) in every form.

## Built-in directives

The directives defined by the GraphQL specification are not custom directives, and each has its own encoding:

- `@deprecated` on a field, argument, input field or enum value becomes `deprecation: { reason }` (the default reason spelled out), and its usage is listed first in `directives`, with the built-in definition in `components.directives` (see [Deprecation](/examples/#deprecation)).
- `@specifiedBy(url:)` on a scalar becomes `specifiedByURL`; it is never a usage.
- `@oneOf` on an input object is a usage of the built-in `oneOf` definition.
- `@skip` and `@include` apply to queries, not to a type system, so they never appear.

Built-in definitions are listed only when a usage refers to them. A definition with a built-in name but a different shape, such as `directive @deprecated(reason: String, since: String) on OBJECT | FIELD_DEFINITION`, is an override: it is kept like a custom definition, and its usages on types and the schema are usages with all their arguments. On fields, arguments, input fields and enum values a `@deprecated` usage still becomes a deprecation, and only its `reason` is kept (see [Built-in directives](/spec/v1.0#_7-11-built-in-directives)).

## Documents built from introspection

GraphQL introspection exposes directive definitions but not directive usages. A document built with `buildFromIntrospection` therefore lists every directive definition, while its elements carry no custom usages. Deprecations are part of introspection, so they and their `@deprecated` usages are present in both builds.

## Printing

`printSchema` prints every custom definition and every usage, with the values as GraphQL literals of their argument types (strings quoted, enum values bare, lists as `[1, 2]`, input objects as `{a: 1}`):

```graphql
"""
Rate limit per client
"""
directive @limits(rate: Float!, window: Int = 60, keys: [String!] = ["ip"]) repeatable on FIELD_DEFINITION | OBJECT

type Query {
  search(q: String): [String] @limits(rate: 2.5) @limits(rate: 10, keys: ["user", "ip"])
}
```

A usage whose directive has no definition in the document is printed with the types of its values (`1` as `Int`, `1.5` as `Float`, `"a"` as `String`).

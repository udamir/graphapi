---
title: Conversion examples
outline: 2
---

<script setup>
import ConversionExample from "../.vitepress/theme/components/ConversionExample.vue"
</script>

# Conversion examples

Each example below is one GraphQL schema shown in every form `gqlapi` converts between: the SDL, its introspection result, the GraphAPI document, and the SDL printed back from the document. Switch the tabs to compare them. All outputs are generated from the current sources when the site is built, so they are exactly what the library produces. **Open in demo** loads the schema into the [online demo](/demo), where you can edit it.

The badges state three facts that are checked for every example: whether printing the document gives back an equivalent schema, whether the document built from the introspection result equals the one built from the schema, and whether the document is valid against the [JSON Schema](/spec/json-schema). **Specification** links to the section of the [GraphAPI 1.0 specification](/spec/v1.0) that defines the encoding.

::: tip How to read the GraphAPI tab
The [specification](/spec/v1.0) defines every field. As a rule of thumb: every definition has an explicit `type` (`object`, `enum`, …), every type usage is flat (`$ref`, `type: Int` or `type: list` with `items`, plus `nonNull: true` where the SDL writes `!`), and directive usages are arrays.
:::

## Todo app

A small but complete schema: a schema description, a custom directive with typed arguments, an enum, an input object with a default, a deprecated input field, queries and a mutation. The `@cache` usage is kept as `meta: { maxAge: 60 }` (a number, as the directive defines it); the introspection build lacks it because introspection does not expose directive usages.

<ConversionExample id="todo" />

## Scalars

Built-in scalars are written at the usage site as `type: Int`, `type: Float`, `type: String`, `type: Boolean` and `type: ID`; they are not stored in `components`. Custom scalars are components, and usage sites refer to them with `$ref` like every other named type. The `@specifiedBy` URL becomes `specifiedByURL` on the scalar.

<ConversionExample id="scalars" />

## Lists and nullability

Nullability uses one flag at every position (operation results, fields, arguments, input fields and list items): `nonNull: true` marks a non-null position, exactly where the SDL writes `!`, and its absence means nullable. A list is `type: list` with its item in `items`, which carries its own `nonNull`.

<ConversionExample id="lists-nullability" />

## Objects, fields and arguments

Object fields are `methods`, with the same shape as operations: fields with arguments carry an `args` map of argument objects, and the result type is written next to `args`. Default values are JavaScript values (`10`, `"png"`), never SDL literals.

<ConversionExample id="objects-arguments" />

## Interfaces and unions

Objects list the interfaces they implement as `$ref`s, and every interface carries the reverse index `implementedBy`, so a consumer can find all implementations without scanning the document. Union members are `$ref`s too, in `oneOf`.

<ConversionExample id="interfaces-unions" />

## Enums

An enum lists every value in its `values` map, keyed by name, with its description, deprecation and directives (`{}` for a plain value). A default value of an enum type is the value name.

<ConversionExample id="enums" />

## Input objects and default values

Defaults of every kind are kept as written in the SDL, typed by their GraphQL type: strings, lists, enum values, `null`, and input objects (`{ from: 1, to: 10 }`). An input object default is not merged with the field defaults of its type, so `filter: Filter = { text: "all" }` stays `{ text: "all" }`.

<ConversionExample id="input-defaults" />

## Descriptions

Descriptions of the schema, types, fields, arguments and enum values are copied verbatim, block strings and Markdown included. The schema description is the document's `description`.

<ConversionExample id="descriptions" />

## Deprecation

Every deprecatable element (fields, arguments, input fields, enum values) records its deprecation twice: as the resolved `deprecation: { reason }` and as the `@deprecated` usage in `directives`, so diff tools see both the fact and the directive.

<ConversionExample id="deprecation" />

## Custom directives

Directive definitions are components with their locations, typed arguments and `repeatable` flag. Usages keep typed argument values as `meta`, on every location, the schema definition and enum values included. Every element lists its usages in a `directives` array in source order, one entry per usage, so a repeatable directive needs no special form.

<ConversionExample id="custom-directives" />

## Example values, tags and API kinds

Conventions such as `@example` for sample values and `@tags` / `@apiKind` for operation metadata are custom directives like any other: each usage is kept in the `directives` of its element with its typed `meta`, including object and list values, and printed back unchanged. Read them with `directiveArgs`; see [Custom directives](/guide/custom-directives).

<ConversionExample id="conventional-directives" />

## Schema definition and root types

The names of the root operation types are always recorded (`queryTypeName`, …), and `printSchema` prints a `schema { … }` block when they are not the defaults, also when a non-root type is named `Query`. The description, directives and interfaces of root types are kept in `rootTypes`.

<ConversionExample id="root-types" />

## Subscriptions

Subscription fields are operations like queries and mutations, in the `subscriptions` section.

<ConversionExample id="subscriptions" />

## One-of input objects

`@oneOf` is a built-in directive (graphql-js 16.9 and later). Its definition is listed only in documents that use it, and the usage is kept like any other.

<ConversionExample id="one-of" />

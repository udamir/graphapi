# Conversions

`gqlapi` converts in every direction between GraphQL SDL, introspection results and GraphAPI documents. Every path is defined by one intermediate representation, `SchemaIR`: front-ends read a source into it, back-ends write a document or SDL from it. The two most used paths, `buildFromSchema` and `printSchema`, skip building the IR for speed and are tested to produce exactly the same output as the IR path.

<figure class="conversion-map">
<svg viewBox="0 0 760 300" role="img" aria-labelledby="conversion-map-title">
  <title id="conversion-map-title">Conversion paths: GraphQL SDL, GraphQLSchema and introspection results are read into SchemaIR, which is written as a GraphAPI document or printed back to SDL</title>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 10 5 0 10z" style="fill: var(--vp-c-text-3)" />
    </marker>
  </defs>
  <g class="edges">
    <path d="M95 74V126" marker-end="url(#arrow)" />
    <path d="M95 172V224" marker-end="url(#arrow)" />
    <path d="M170 150H308" marker-end="url(#arrow)" />
    <path d="M170 248H380V174" marker-end="url(#arrow)" />
    <path d="M380 128V52H172" marker-end="url(#arrow)" />
    <path d="M452 150H588" marker-start="url(#arrow)" marker-end="url(#arrow)" />
  </g>
  <g class="labels">
    <text x="103" y="104">buildSchema</text>
    <text x="103" y="202">introspectionFromSchema</text>
    <text x="239" y="141" text-anchor="middle">fromGraphQLSchema</text>
    <text x="275" y="240" text-anchor="middle">fromIntrospection</text>
    <text x="276" y="43" text-anchor="middle">printSchema · printIR</text>
    <text x="520" y="141" text-anchor="middle">fromIR ⇄ toIR</text>
  </g>
  <g class="nodes">
    <rect x="20" y="30" width="150" height="44" rx="8" />
    <text x="95" y="57" text-anchor="middle">GraphQL SDL</text>
    <rect x="20" y="128" width="150" height="44" rx="8" />
    <text x="95" y="155" text-anchor="middle">GraphQLSchema</text>
    <rect x="20" y="226" width="150" height="44" rx="8" />
    <text x="95" y="253" text-anchor="middle">Introspection</text>
    <rect class="ir" x="310" y="128" width="140" height="44" rx="8" />
    <text x="380" y="155" text-anchor="middle">SchemaIR</text>
    <rect class="doc" x="590" y="128" width="150" height="44" rx="8" />
    <text x="665" y="155" text-anchor="middle">GraphAPI</text>
  </g>
</svg>
<figcaption>The builders combine two steps: <code>buildFromSchema(schema)</code> is <code>fromIR(fromGraphQLSchema(schema))</code>, and <code>buildFromIntrospection(introspection)</code> is <code>fromIR(fromIntrospection(introspection))</code>.</figcaption>
</figure>

## Every path at a glance

| From          | To                   | Code                                                          |
| ------------- | -------------------- | ------------------------------------------------------------- |
| GraphQL SDL   | GraphAPI             | `buildFromSchema(buildSchema(sdl))`                           |
| Introspection | GraphAPI             | `buildFromIntrospection(introspection)`                       |
| GraphAPI      | GraphQL SDL          | `printSchema(graphapi)`                                       |
| GraphAPI      | GraphAPI, normalized | `fromIR(toIR(graphapi))`                                      |
| GraphAPI      | Introspection        | `introspectionFromSchema(buildSchema(printSchema(graphapi)))` |
| Introspection | GraphQL SDL          | `printSchema(buildFromIntrospection(introspection))`          |
| GraphQL SDL   | Introspection        | `introspectionFromSchema(buildSchema(sdl))` (graphql-js)      |

`buildSchema`, `introspectionFromSchema` and `getIntrospectionQuery` come from `graphql`; everything else from `gqlapi`. The [online demo](/demo) runs each of these paths, and the [conversion examples](/examples/) show their output for one schema per feature.

## GraphQL to GraphAPI

::: code-group

```ts [From SDL]
import { buildSchema } from "graphql"
import { buildFromSchema } from "gqlapi"

const graphapi = buildFromSchema(buildSchema(sdl))
```

```ts [From a code-first schema]
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql"
import { buildFromSchema } from "gqlapi"

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({ name: "Query", fields: { hello: { type: GraphQLString } } }),
})
const graphapi = buildFromSchema(schema)
```

```ts [From introspection]
import { getIntrospectionQuery } from "graphql"
import { buildFromIntrospection } from "gqlapi"

const query = getIntrospectionQuery({
  inputValueDeprecation: true,
  schemaDescription: true,
  specifiedByUrl: true,
  directiveIsRepeatable: true,
})
const response = await fetch("https://example.com/graphql", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query }),
})
const { data } = await response.json()
const graphapi = buildFromIntrospection(data)
```

:::

A schema and its introspection result give the same document, except that introspection does not expose directive usages: custom directive usages (and `@oneOf`) are present only in documents built from a schema. Ask for every optional introspection field, as above, or descriptions of the schema, deprecated arguments and input fields, `specifiedByURL` and `repeatable` are missing from the result.

## GraphAPI back to GraphQL

::: code-group

```ts [To SDL]
import { printSchema } from "gqlapi"

const sdl = printSchema(graphapi)
```

```ts [To a GraphQLSchema]
import { buildSchema } from "graphql"
import { printSchema } from "gqlapi"

const schema = buildSchema(printSchema(graphapi))
```

```ts [To introspection]
import { buildSchema, introspectionFromSchema } from "graphql"
import { printSchema } from "gqlapi"

const introspection = introspectionFromSchema(buildSchema(printSchema(graphapi)), {
  inputValueDeprecation: true,
  schemaDescription: true,
  specifiedByUrl: true,
  directiveIsRepeatable: true,
})
```

:::

The printed SDL re-parses into a schema equivalent to the source: types, fields, arguments, defaults, descriptions, deprecation, directive definitions and usages, repeatable directives, root type names and `specifiedByURL` all survive. The [examples](/examples/) check this round trip for every feature.

## GraphAPI to GraphAPI

```ts
import { fromIR, toIR } from "gqlapi"

const normalized = fromIR(toIR(graphapi))
```

Lifting a document into the IR and serializing it again keeps everything and normalizes the document, for example after it was edited by hand or by another tool: fields are written in the specified order, `implementedBy` is recomputed, and the definitions of used built-in directives are added. A document built by `gqlapi` comes back deep-equal. The [online demo](/demo) does this when both sides are GraphAPI.

`printSchema`, `toIR` and `lift` read `graphapi: "1.0"` documents only and throw `Unsupported graphapi version: <v>` for anything else. A `graphapi: 0.1.2` document written by gqlapi 0.5.x or earlier is converted by printing it to SDL with `printSchema` of gqlapi 0.5.1 and building that SDL with `buildFromSchema(buildSchema(sdl))`.

## Working with the intermediate representation

`fromGraphQLSchema(schema)`, `fromIntrospection(introspection)` and `toIR(graphapi)` all return a `SchemaIR`: plain objects and `Map`s, with an explicit kind on every type, typed values and every directive usage. Use it to analyse a schema, then write it with `fromIR(ir)` or `printIR(ir)`.

```ts
import { buildSchema } from "graphql"
import { fromGraphQLSchema, fromIR, printIR } from "gqlapi"

const ir = fromGraphQLSchema(buildSchema(sdl))
for (const type of ir.types.values()) {
  console.log(type.kind, type.name)
}
const sdl2 = printIR(ir)
const graphapi = fromIR(ir)
```

<style>
.conversion-map {
  margin: 24px 0;
}

.conversion-map svg {
  display: block;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  font-family: var(--vp-font-family-base);
}

.conversion-map .edges path {
  fill: none;
  stroke: var(--vp-c-text-3);
  stroke-width: 1.5;
}

.conversion-map .labels text {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  fill: var(--vp-c-text-2);
}

.conversion-map .nodes rect {
  fill: var(--vp-c-bg-soft);
  stroke: var(--vp-c-divider);
  stroke-width: 1.5;
}

.conversion-map .nodes rect.ir {
  fill: var(--vp-c-brand-soft);
  stroke: var(--vp-c-brand-1);
}

.conversion-map .nodes rect.doc {
  stroke: var(--vp-c-brand-2);
}

.conversion-map .nodes text {
  font-size: 14px;
  font-weight: 600;
  fill: var(--vp-c-text-1);
}

.conversion-map figcaption {
  margin-top: 12px;
  font-size: 14px;
  color: var(--vp-c-text-2);
  text-align: center;
}
</style>

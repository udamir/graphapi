// Test plan block G20: conventional custom directives (@example, @tags, @apiKind; GitHub issues #3 and #4) are kept as
// generic directive usages with typed meta, survive the round trip, and are read with directiveArgs
import { buildFromSchema, directiveArgs, printSchema } from "../../src/index"
import { build, buildIntrospected, schemaOf } from "../helpers/schema"

const SDL = `
  scalar JSON
  directive @example(value: JSON!) repeatable on FIELD_DEFINITION | ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION | SCALAR
  directive @tags(tags: [String!]!) on FIELD_DEFINITION | OBJECT
  directive @apiKind(kind: String!) on FIELD_DEFINITION | OBJECT
  directive @tag(name: String!) repeatable on FIELD_DEFINITION
  directive @internal on FIELD_DEFINITION

  scalar Date @example(value: "2024-01-31")
  input Filter { status: String @example(value: "OPEN"), limit: Int = 10 @example(value: 25) }
  type Order @tags(tags: ["orders"]) { id: ID! @example(value: "ord-1") @example(value: "ord-2"), total: Float @example(value: 12.5) }
  type Query {
    order(id: ID! @example(value: "ord-1")): Order @tags(tags: ["orders", "read"]) @apiKind(kind: "bwc") @tag(name: "a")
    orders(filter: Filter @example(value: { status: "OPEN", limit: 5 }), ids: [ID!] @example(value: ["a", "b"])): [Order!]!
      @tags(tags: ["orders"]) @apiKind(kind: "no-bwc") @internal @deprecated(reason: "use order")
  }
`

const ref = (name: string) => `#/components/directives/${name}`

describe("G20 conventional custom directives", () => {
  const doc: any = build(SDL)

  it("G20.1 @example is kept as a usage with its value on arguments, input fields, fields and scalars", () => {
    expect(doc.queries.order.args.id.directives).toEqual([{ $ref: ref("example"), meta: { value: "ord-1" } }])
    expect(doc.queries.orders.args.filter.directives).toEqual([
      { $ref: ref("example"), meta: { value: { status: "OPEN", limit: 5 } } },
    ])
    expect(doc.queries.orders.args.ids.directives).toEqual([{ $ref: ref("example"), meta: { value: ["a", "b"] } }])
    expect(doc.components.inputObjects.Filter.properties.limit).toEqual({
      directives: [{ $ref: ref("example"), meta: { value: 25 } }],
      type: "Int",
      default: 10,
    })
    expect(doc.components.objects.Order.methods.id.directives).toEqual([
      { $ref: ref("example"), meta: { value: "ord-1" } },
      { $ref: ref("example"), meta: { value: "ord-2" } },
    ])
    expect(doc.components.scalars.Date.directives).toEqual([{ $ref: ref("example"), meta: { value: "2024-01-31" } }])
  })

  it("G20.2 @tags and @apiKind are kept as usages on operations and object types, in source order", () => {
    expect(doc.queries.order.directives).toEqual([
      { $ref: ref("tags"), meta: { tags: ["orders", "read"] } },
      { $ref: ref("apiKind"), meta: { kind: "bwc" } },
      { $ref: ref("tag"), meta: { name: "a" } },
    ])
    expect(doc.components.objects.Order.directives).toEqual([{ $ref: ref("tags"), meta: { tags: ["orders"] } }])
  })

  it("G20.3 their definitions are listed with typed arguments", () => {
    expect(doc.components.directives.example).toEqual({
      title: "example",
      locations: ["FIELD_DEFINITION", "ARGUMENT_DEFINITION", "INPUT_FIELD_DEFINITION", "SCALAR"],
      args: { value: { $ref: "#/components/scalars/JSON", nonNull: true } },
      repeatable: true,
    })
    expect(doc.components.directives.tags.args).toEqual({
      tags: { type: "list", items: { type: "String", nonNull: true }, nonNull: true },
    })
    expect(doc.components.directives.apiKind.args).toEqual({ kind: { type: "String", nonNull: true } })
  })

  it("G20.4 printing gives back the usages, and building the printed SDL gives back the document", () => {
    const printed = printSchema(doc)
    expect(printed).toContain('scalar Date @example(value: "2024-01-31")')
    expect(printed).toContain("limit: Int = 10 @example(value: 25)")
    expect(printed).toContain(
      'order(id: ID! @example(value: "ord-1")): Order @tags(tags: ["orders", "read"]) @apiKind(kind: "bwc")',
    )
    expect(printed).toContain(
      'orders(filter: Filter @example(value: {status: "OPEN", limit: 5}), ids: [ID!] @example(value: ["a", "b"]))',
    )
    expect(buildFromSchema(schemaOf(printed))).toEqual(doc)
  })

  it("G20.5 a document built from introspection has the definitions but not the usages (introspection does not expose them)", () => {
    const introspected: any = buildIntrospected(SDL)
    expect(Object.keys(introspected.components.directives)).toEqual(
      expect.arrayContaining(["example", "tags", "apiKind"]),
    )
    expect(introspected.queries.order.directives).toBeUndefined()
    expect(introspected.queries.order.args.id.directives).toBeUndefined()
    expect(introspected.components.scalars.Date.directives).toBeUndefined()
    // the deprecation is part of introspection, so its usage is kept
    expect(directiveArgs(introspected.queries.orders, "deprecated")).toEqual([{ reason: "use order" }])
  })
})

describe("G21 directiveArgs", () => {
  const doc: any = build(SDL)

  it("G21.1 returns the meta of every usage of the directive, in source order", () => {
    expect(directiveArgs(doc.queries.order, "tags")).toEqual([{ tags: ["orders", "read"] }])
    expect(directiveArgs(doc.queries.order, "apiKind")).toEqual([{ kind: "bwc" }])
    expect(directiveArgs(doc.components.objects.Order.methods.id, "example")).toEqual([
      { value: "ord-1" },
      { value: "ord-2" },
    ])
    expect(directiveArgs(doc.components.scalars.Date, "example")).toEqual([{ value: "2024-01-31" }])
  })

  it("G21.2 matches the directive name exactly, not a prefix", () => {
    expect(directiveArgs(doc.queries.order, "tag")).toEqual([{ name: "a" }])
    expect(directiveArgs(doc.queries.order, "ta")).toEqual([])
  })

  it("G21.3 gives {} for a usage without arguments and reads the @deprecated usage too", () => {
    expect(directiveArgs(doc.queries.orders, "internal")).toEqual([{}])
    expect(directiveArgs(doc.queries.orders, "deprecated")).toEqual([{ reason: "use order" }])
  })

  it("G21.4 gives [] for an unused directive, an element without directives and a missing element", () => {
    expect(directiveArgs(doc.queries.order, "example")).toEqual([])
    expect(directiveArgs(doc.components.objects.Order.methods.total.args, "example")).toEqual([])
    expect(directiveArgs(doc.components.inputObjects.Filter, "example")).toEqual([])
    expect(directiveArgs(undefined, "example")).toEqual([])
  })

  it("G21.5 returns the meta objects of the document, not copies", () => {
    expect(directiveArgs(doc.queries.order, "tags")[0]).toBe(doc.queries.order.directives[0].meta)
  })
})

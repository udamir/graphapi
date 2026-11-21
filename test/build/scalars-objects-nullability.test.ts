// Test plan blocks G1 (scalars), G2 (object types and fields), G3 (nullability and list nesting)
import { build } from "../helpers/schema"

describe("G1 build from SDL: scalars", () => {
  it("G1.1 writes built-in scalars as their GraphQL name in type and keeps them out of components", () => {
    const graphapi: any = build(`
      type Query { i: Int!, f: Float!, s: String!, b: Boolean!, id: ID! }
    `)
    expect(graphapi.queries.i).toEqual({ type: "Int", nonNull: true })
    expect(graphapi.queries.f).toEqual({ type: "Float", nonNull: true })
    expect(graphapi.queries.s).toEqual({ type: "String", nonNull: true })
    expect(graphapi.queries.b).toEqual({ type: "Boolean", nonNull: true })
    expect(graphapi.queries.id).toEqual({ type: "ID", nonNull: true })
    expect(graphapi.components?.scalars).toBeUndefined()
  })

  it("G1.2 registers custom scalars in components.scalars with title and description", () => {
    const graphapi: any = build(`
      "ISO-8601 date"
      scalar Date
      scalar JSON
      type Query { d: Date, j: JSON }
    `)
    expect(graphapi.components.scalars).toEqual({
      Date: { title: "Date", description: "ISO-8601 date", type: "scalar" },
      JSON: { title: "JSON", type: "scalar" },
    })
  })

  it("G1.3 keeps @specifiedBy url on the scalar component", () => {
    const graphapi: any = build(`
      scalar UUID @specifiedBy(url: "https://tools.ietf.org/html/rfc4122")
      type Query { u: UUID }
    `)
    expect(graphapi.components.scalars.UUID.specifiedByURL).toBe("https://tools.ietf.org/html/rfc4122")
  })

  it("G1.4 references a custom scalar usage through $ref into components.scalars", () => {
    const graphapi: any = build(`
      scalar Date
      type Query { d: Date!, l: [Date!]! }
    `)
    expect(graphapi.queries.d).toEqual({ $ref: "#/components/scalars/Date", nonNull: true })
    expect(graphapi.queries.l.items).toEqual({ $ref: "#/components/scalars/Date", nonNull: true })
  })

  it("G1.5 captures custom directives applied to a scalar", () => {
    const graphapi: any = build(`
      directive @meta(s: String) on SCALAR
      scalar S @meta(s: "scalar")
      type Query { s: S }
    `)
    expect(graphapi.components.scalars.S.directives).toEqual([
      { $ref: "#/components/directives/meta", meta: { s: "scalar" } },
    ])
  })
})

describe("G2 build from SDL: object types and fields", () => {
  const graphapi: any = build(`
    type Todo {
      id: ID!
      name: String!
      completed: Boolean
      color: Color
      colors(filter: [Color!]!, first: Int = 10): [Color!]!
      owner: User
    }
    type User { id: ID! }
    enum Color { RED GREEN }
    type Query { todo(id: ID!): Todo }
  `)
  const methods = graphapi.components.objects.Todo.methods

  it("G2.1 registers object types in components.objects with title, type and methods", () => {
    expect(graphapi.components.objects.Todo).toMatchObject({ title: "Todo", type: "object" })
    expect(Object.keys(methods)).toEqual(["id", "name", "completed", "color", "colors", "owner"])
  })

  it("G2.2 marks non-null fields with nonNull: true", () => {
    expect(Object.keys(methods).filter((name) => methods[name].nonNull)).toEqual(["id", "name", "colors"])
    expect(methods.completed.nonNull).toBeUndefined()
  })

  it("G2.3 references named types through $ref into the matching components section", () => {
    expect(methods.color).toEqual({ $ref: "#/components/enums/Color" })
    expect(methods.owner).toEqual({ $ref: "#/components/objects/User" })
    expect(graphapi.queries.todo).toMatchObject({ $ref: "#/components/objects/Todo" })
  })

  it("G2.4 attaches args to fields that declare them and omits args otherwise", () => {
    expect(methods.name.args).toBeUndefined()
    expect(methods.colors.args).toEqual({
      filter: { type: "list", items: { $ref: "#/components/enums/Color", nonNull: true }, nonNull: true },
      first: { type: "Int", default: 10 },
    })
  })

  it("G2.5 keeps the root operation type out of components and exposes its fields as operations", () => {
    expect(graphapi.components.objects.Query).toBeUndefined()
    expect(Object.keys(graphapi.queries)).toEqual(["todo"])
  })
})

describe("G3 build from SDL: nullability and list nesting", () => {
  const graphapi: any = build(`
    type T {
      a: String
      b: String!
      c: [String]
      d: [String!]
      e: [String]!
      f: [String!]!
      g: [[Int]]
      h: [[Int!]!]!
    }
    type Query { t: T, tt: T!, l: [T], ll: [T!]! }
  `)
  const methods = graphapi.components.objects.T.methods

  it("G3.1 expresses field nullability through nonNull on the field only", () => {
    expect(Object.keys(methods).filter((name) => methods[name].nonNull)).toEqual(["b", "e", "f", "h"])
    expect(graphapi.components.objects.T.required).toBeUndefined()
    for (const field of Object.values(methods) as any[]) {
      expect(field.nullable).toBeUndefined()
      expect([undefined, true]).toContain(field.nonNull)
    }
  })

  it("G3.2 expresses list item nullability through nonNull on items", () => {
    expect(methods.c).toEqual({ type: "list", items: { type: "String" } })
    expect(methods.d).toEqual({ type: "list", items: { type: "String", nonNull: true } })
    expect(methods.e).toEqual({ type: "list", items: { type: "String" }, nonNull: true })
    expect(methods.f).toEqual({ type: "list", items: { type: "String", nonNull: true }, nonNull: true })
  })

  it("G3.3 nests lists of lists with per-level nullability", () => {
    expect(methods.g).toEqual({ type: "list", items: { type: "list", items: { type: "Int" } } })
    expect(methods.h).toEqual({
      type: "list",
      items: { type: "list", items: { type: "Int", nonNull: true }, nonNull: true },
      nonNull: true,
    })
  })

  it("G3.4 marks non-null operation results with nonNull: true and nullable results without it", () => {
    expect(graphapi.queries.t).toEqual({ $ref: "#/components/objects/T" })
    expect(graphapi.queries.tt).toEqual({ $ref: "#/components/objects/T", nonNull: true })
    expect(graphapi.queries.l).toEqual({ type: "list", items: { $ref: "#/components/objects/T" } })
    expect(graphapi.queries.ll).toEqual({
      type: "list",
      items: { $ref: "#/components/objects/T", nonNull: true },
      nonNull: true,
    })
  })
})

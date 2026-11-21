// Test plan blocks G4 (interfaces), G5 (unions), G6 (enums)
import { build } from "../helpers/schema"

describe("G4 build from SDL: interfaces", () => {
  const graphapi: any = build(`
    interface Node { id: ID! }
    interface Named implements Node { id: ID!, name: String }
    interface Timestamped { createdAt: String! }
    type User implements Named & Node & Timestamped {
      id: ID!
      name: String
      createdAt: String!
      posts(first: Int = 10): [Post!]! @deprecated(reason: "use feed")
    }
    type Post implements Node { id: ID! }
    type Query { node: Node, user: User }
  `)

  it("G4.1 registers interfaces in components.interfaces with methods and their implementations sorted by name", () => {
    expect(graphapi.components.interfaces.Node).toEqual({
      title: "Node",
      type: "interface",
      implementedBy: [
        { $ref: "#/components/interfaces/Named" },
        { $ref: "#/components/objects/Post" },
        { $ref: "#/components/objects/User" },
      ],
      methods: { id: { type: "ID", nonNull: true } },
    })
  })

  it("G4.2 lists implemented interfaces on objects as $ref in declaration order", () => {
    expect(graphapi.components.objects.User.interfaces).toEqual([
      { $ref: "#/components/interfaces/Named" },
      { $ref: "#/components/interfaces/Node" },
      { $ref: "#/components/interfaces/Timestamped" },
    ])
    expect(graphapi.components.objects.Post.interfaces).toEqual([{ $ref: "#/components/interfaces/Node" }])
  })

  it("G4.3 supports interfaces implementing interfaces", () => {
    expect(graphapi.components.interfaces.Named.interfaces).toEqual([{ $ref: "#/components/interfaces/Node" }])
    expect(graphapi.components.interfaces.Node.interfaces).toBeUndefined()
  })

  it("G4.4 keeps args and deprecation on fields of implementing objects", () => {
    expect(graphapi.components.objects.User.methods.posts).toMatchObject({
      deprecation: { reason: "use feed" },
      directives: [{ $ref: "#/components/directives/deprecated", meta: { reason: "use feed" } }],
      type: "list",
      items: { $ref: "#/components/objects/Post", nonNull: true },
      nonNull: true,
      args: { first: { type: "Int", default: 10 } },
    })
  })

  it("G4.5 references interfaces from operations through components.interfaces", () => {
    expect(graphapi.queries.node).toEqual({ $ref: "#/components/interfaces/Node" })
  })
})

describe("G5 build from SDL: unions", () => {
  const graphapi: any = build(`
    directive @meta(s: String) on UNION
    type A { a: Int }
    type B { b: Int }
    "A or B"
    union AB @meta(s: "u") = A | B
    union OnlyA = A
    type Query { ab: AB, list: [AB!]! }
  `)

  it("G5.1 represents union members as oneOf of $ref in declaration order", () => {
    expect(graphapi.components.unions.AB.oneOf).toEqual([
      { $ref: "#/components/objects/A" },
      { $ref: "#/components/objects/B" },
    ])
    expect(graphapi.components.unions.OnlyA.oneOf).toEqual([{ $ref: "#/components/objects/A" }])
  })

  it("G5.2 keeps title, description and directives on the union", () => {
    expect(graphapi.components.unions.AB).toMatchObject({
      title: "AB",
      type: "union",
      description: "A or B",
      directives: [{ $ref: "#/components/directives/meta", meta: { s: "u" } }],
    })
  })

  it("G5.3 union members are plain references and never carry nonNull", () => {
    for (const member of graphapi.components.unions.AB.oneOf) {
      expect(Object.keys(member)).toEqual(["$ref"])
    }
  })
})

describe("G6 build from SDL: enums", () => {
  it("G6.1 represents a plain enum as type enum with every value in the values map in declaration order", () => {
    const graphapi: any = build(`
      enum Color { RED GREEN BLUE }
      type Query { c: Color }
    `)
    expect(graphapi.components.enums.Color).toEqual({
      title: "Color",
      type: "enum",
      values: { RED: {}, GREEN: {}, BLUE: {} },
    })
    expect(Object.keys(graphapi.components.enums.Color.values)).toEqual(["RED", "GREEN", "BLUE"])
  })

  it("G6.2 records descriptions and deprecation of enum values in the values map", () => {
    const graphapi: any = build(`
      enum Color {
        "Red color"
        RED
        GREEN @deprecated
        BLUE @deprecated(reason: "not used")
        "Still default"
        BLACK @deprecated(reason: "No longer supported")
        WHITE
      }
      type Query { c: Color }
    `)
    const deprecated = (reason: string) => ({
      deprecation: { reason },
      directives: [{ $ref: "#/components/directives/deprecated", meta: { reason } }],
    })
    expect(Object.keys(graphapi.components.enums.Color.values)).toEqual(["RED", "GREEN", "BLUE", "BLACK", "WHITE"])
    expect(graphapi.components.enums.Color.values).toEqual({
      RED: { description: "Red color" },
      GREEN: deprecated("No longer supported"),
      BLUE: deprecated("not used"),
      BLACK: { description: "Still default", ...deprecated("No longer supported") },
      WHITE: {},
    })
  })

  it("G6.3 keeps enum description and type-level directives", () => {
    const graphapi: any = build(`
      directive @meta(s: String) on ENUM
      "Colors"
      enum Color @meta(s: "e") { RED }
      type Query { c: Color }
    `)
    expect(graphapi.components.enums.Color).toMatchObject({
      description: "Colors",
      directives: [{ $ref: "#/components/directives/meta", meta: { s: "e" } }],
    })
  })

  // ISSUE-GA-06 (fixed in 0.6.0): custom directives on ENUM_VALUE locations are dropped by buildFromSchema (only description and deprecation are kept)
  it("G6.4 keeps custom directives applied to enum values", () => {
    const graphapi: any = build(`
      directive @meta(s: String) on ENUM_VALUE
      enum Color { RED @meta(s: "v") GREEN }
      type Query { c: Color }
    `)
    expect(graphapi.components.enums.Color.values.RED.directives).toEqual([
      { $ref: "#/components/directives/meta", meta: { s: "v" } },
    ])
  })

  it("G6.5 enum values are case sensitive and keep their spelling", () => {
    const graphapi: any = build(`
      enum Case { value Value VALUE _value v1 }
      type Query { c: Case }
    `)
    expect(Object.keys(graphapi.components.enums.Case.values)).toEqual(["value", "Value", "VALUE", "_value", "v1"])
  })
})

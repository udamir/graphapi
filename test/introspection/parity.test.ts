// Test plan block I (build from introspection): parity with build from SDL and documented losses
import { getIntrospectionQuery, graphqlSync } from "graphql"

import { buildFromIntrospection } from "../../src/index"
import { build, buildIntrospected, schemaOf } from "../helpers/schema"

const STRUCTURE_SDL = `
  "ISO date"
  scalar Date @specifiedBy(url: "https://example.com/date")
  interface Node { id: ID! }
  interface Named implements Node { id: ID!, name: String }
  type User implements Named & Node {
    id: ID!
    name: String
    "friends of the user"
    friends(first: Int = 10, after: ID): [User!]! @deprecated(reason: "use connections")
    tags: [[String]]
  }
  type Post implements Node { id: ID!, author: User! }
  union Entity = User | Post
  enum Role { ADMIN "Regular user" USER }
  input Filter { role: Role = USER, ids: [ID!], limit: Int! }
  type Query { entity(id: ID!): Entity, users(filter: Filter): [User], date: Date }
  type Mutation { "create a user" create(name: String!): User! }
  type Subscription { changed: Entity }
`

describe("I1 build from introspection: structural parity with build from SDL", () => {
  const fromSchema: any = build(STRUCTURE_SDL)
  const fromIntrospection: any = buildIntrospected(STRUCTURE_SDL)

  it("I1.1 produces the same scalars, interfaces, objects, unions and enums", () => {
    // @specifiedBy is represented by specifiedByURL only, which both builders see (see I1.2)
    expect(fromIntrospection.components.scalars).toEqual(fromSchema.components.scalars)
    expect(fromIntrospection.components.interfaces).toEqual(fromSchema.components.interfaces)
    expect(fromIntrospection.components.objects).toEqual(fromSchema.components.objects)
    expect(fromIntrospection.components.unions).toEqual(fromSchema.components.unions)
    expect(fromIntrospection.components.enums).toEqual(fromSchema.components.enums)
  })

  it("I1.2 keeps specifiedByURL and descriptions of scalars", () => {
    expect(fromIntrospection.components.scalars.Date).toMatchObject({
      description: "ISO date",
      specifiedByURL: "https://example.com/date",
    })
  })

  it("I1.3 produces the same input objects when defaults are enum values", () => {
    expect(fromIntrospection.components.inputObjects).toEqual(fromSchema.components.inputObjects)
  })

  // ISSUE-GA-10 (fixed in 0.6.0): every operation built from introspection carries `title: <operation name>`, the SDL builder does not add it
  it("I1.4 produces the same queries, mutations and subscriptions", () => {
    expect(fromIntrospection.queries).toEqual(fromSchema.queries)
    expect(fromIntrospection.mutations).toEqual(fromSchema.mutations)
    expect(fromIntrospection.subscriptions).toEqual(fromSchema.subscriptions)
  })

  it("I1.5 operations built from introspection carry no title", () => {
    for (const section of ["queries", "mutations", "subscriptions"]) {
      for (const operation of Object.values(fromIntrospection[section]) as any[]) {
        expect(operation).not.toHaveProperty("title")
      }
    }
  })

  it("I1.6 produces the same directive definitions (repeatable, locations, args with defaults)", () => {
    const sdl = `
      "limits"
      directive @limit("offset arg" offset: Int = 0, limit: Int = 20, mode: Mode = FAST) repeatable on FIELD_DEFINITION | OBJECT
      enum Mode { FAST SLOW }
      type Query { a: Int @limit }
    `
    expect(buildIntrospected(sdl).components!.directives!.limit).toEqual(build(sdl).components!.directives!.limit)
  })
})

describe("I2 build from introspection: deprecation parity", () => {
  it("I2.1 fields, operations and arguments deprecated with or without reason match the SDL builder", () => {
    const sdl = `
      type T { a: Int @deprecated, b(x: Int @deprecated(reason: "x")): Int @deprecated(reason: "b") }
      input I { f: Int @deprecated }
      type Query { t(i: I): T @deprecated }
    `
    const fromSchema: any = build(sdl)
    const fromIntrospection: any = buildIntrospected(sdl)
    expect(fromIntrospection.components.objects.T).toEqual(fromSchema.components.objects.T)
    expect(fromIntrospection.components.inputObjects.I).toEqual(fromSchema.components.inputObjects.I)
    expect(fromIntrospection.queries.t.deprecation).toEqual({ reason: "No longer supported" })
  })

  // ISSUE-GA-09 (fixed in 0.6.0): enum value deprecation from introspection is stored as `deprecationReason: "..."` instead of the document's deprecation
  it("I2.2 enum value deprecation matches the SDL builder and the deprecation shape", () => {
    const sdl = `
      enum E { A @deprecated B @deprecated(reason: "b") "d" C }
      type Query { e: E }
    `
    const values = buildIntrospected(sdl).components!.enums!.E.values
    expect(buildIntrospected(sdl).components!.enums!.E).toEqual(build(sdl).components!.enums!.E)
    expect(values.A.deprecation).toEqual({ reason: "No longer supported" })
    expect(values.B.deprecation).toEqual({ reason: "b" })
    expect(values.C).toEqual({ description: "d" })
    expect(values).not.toHaveProperty("A.deprecationReason")
  })

  it("I2.3 without inputValueDeprecation in the introspection query, deprecated arguments are not exposed at all (documented)", () => {
    const schema = schemaOf(`type Query { f(x: Int @deprecated, y: Int): Int }`)
    const introspection: any = graphqlSync({ schema, source: getIntrospectionQuery() }).data
    const graphapi: any = buildFromIntrospection(introspection)
    expect(Object.keys(graphapi.queries.f.args)).toEqual(["y"])
    const full: any = buildIntrospected(`type Query { f(x: Int @deprecated, y: Int): Int }`)
    expect(Object.keys(full.queries.f.args)).toEqual(["x", "y"])
    expect(full.queries.f.args.x.deprecation).toEqual({ reason: "No longer supported" })
  })
})

describe("I3 build from introspection: default value parity", () => {
  const sdl = `
    enum Color { RED GREEN }
    input Nested { a: Int = 1 }
    input In {
      i: Int = 3
      f: Float = 1.5
      t: Boolean = true
      b: Boolean = false
      z: Int = 0
      es: String = ""
      s: String = "hello"
      e: Color = RED
      l: [Int] = [1, 2]
      n: Nested = { a: 2 }
      nul: String = null
    }
    type Query { q(i: Int = 3, s: String = "hi", nn: Int! = 7, l: [String] = ["a"], e: Color = GREEN): Int }
  `
  const fromSchema: any = build(sdl)
  const fromIntrospection: any = buildIntrospected(sdl)
  const inProps = fromIntrospection.components.inputObjects.In.properties
  const argProps = fromIntrospection.queries.q.args

  it("I3.1 Int, Float, true and enum defaults match the SDL builder", () => {
    expect(inProps.i.default).toBe(3)
    expect(inProps.f.default).toBe(1.5)
    expect(inProps.t.default).toBe(true)
    expect(inProps.e.default).toBe("RED")
    expect(argProps.i.default).toBe(3)
    expect(argProps.e.default).toBe("GREEN")
  })

  // ISSUE-GA-08 (fixed in 0.6.0): introspection defaults are SDL literals, String defaults keep their quotes ("\"hello\"")
  it("I3.2 String defaults are the string value, not the quoted literal", () => {
    expect(inProps.s.default).toBe("hello")
    expect(argProps.s.default).toBe("hi")
  })

  // ISSUE-GA-08 (fixed in 0.6.0): falsy defaults (false, 0, "") of input fields are dropped by the `defaultValue ? ...` check
  it("I3.3 false, 0 and empty string defaults of input fields are kept", () => {
    expect(inProps.b.default).toBe(false)
    expect(inProps.z.default).toBe(0)
    expect(inProps.es.default).toBe("")
  })

  // ISSUE-GA-08 (fixed in 0.6.0): list and input object defaults stay literal strings ("[1, 2]", "{a: 2}")
  it("I3.4 list and input object defaults are parsed into arrays and objects", () => {
    expect(inProps.l.default).toEqual([1, 2])
    expect(inProps.n.default).toEqual({ a: 2 })
    expect(argProps.l.default).toEqual(["a"])
  })

  // ISSUE-GA-08 (fixed in 0.6.0): an explicit `= null` default becomes the string "null"
  it("I3.5 an explicit null default is null", () => {
    expect(inProps.nul.default).toBeNull()
  })

  // ISSUE-GA-08 (fixed in 0.6.0): numeric coercion only looks at named types, a NON_NULL wrapped Int keeps the string "7"
  it("I3.6 defaults of non-null arguments are coerced like nullable ones", () => {
    expect(argProps.nn.default).toBe(7)
  })

  it("I3.7 whole input objects and args match the SDL builder", () => {
    expect(fromIntrospection.components.inputObjects).toEqual(fromSchema.components.inputObjects)
  })
})

describe("I4 build from introspection: documented loss of custom directives", () => {
  const sdl = `
    directive @meta(s: String) on FIELD_DEFINITION | OBJECT | SCALAR
    scalar S @meta(s: "s") @specifiedBy(url: "https://x")
    type T @meta(s: "t") { a: Int @meta(s: "a") }
    type Query { t: T, s: S }
  `
  const graphapi: any = buildIntrospected(sdl)

  it("I4.1 directive definitions survive introspection", () => {
    expect(graphapi.components.directives.meta).toMatchObject({
      title: "meta",
      locations: ["FIELD_DEFINITION", "OBJECT", "SCALAR"],
    })
  })

  it("I4.2 custom directive usages are absent (introspection does not expose them, README)", () => {
    expect(graphapi.components.objects.T.directives).toBeUndefined()
    expect(graphapi.components.objects.T.methods.a.directives).toBeUndefined()
    expect(graphapi.components.scalars.S.directives).toBeUndefined()
    expect(graphapi.components.scalars.S.specifiedByURL).toBe("https://x")
  })
})

describe("I5 build from introspection: schema level", () => {
  it("I5.1 keeps the schema description and custom root type mapping", () => {
    const graphapi: any = buildIntrospected(`
      "API"
      schema { query: RootQ, mutation: RootM }
      type RootQ { q: Int }
      type RootM { m: Int }
    `)
    expect(graphapi.description).toBe("API")
    expect(graphapi.queryTypeName).toBe("RootQ")
    expect(graphapi.mutationTypeName).toBe("RootM")
    expect(Object.keys(graphapi.queries)).toEqual(["q"])
    expect(Object.keys(graphapi.mutations)).toEqual(["m"])
    expect(graphapi.components).toBeUndefined()
  })

  it("I5.2 keeps non-root types named like default roots as components", () => {
    const graphapi: any = buildIntrospected(`
      schema { query: Root }
      type Root { q: Query }
      type Query { x: Int }
    `)
    expect(graphapi.components.objects.Query.methods.x).toEqual({ type: "Int" })
  })

  it("I5.3 excludes introspection types (__Schema, __Type, ...) and built-in scalars", () => {
    const graphapi: any = buildIntrospected(`type Query { a: Int }`)
    expect(graphapi.components).toBeUndefined()
  })
})

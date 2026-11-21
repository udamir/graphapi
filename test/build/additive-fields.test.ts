// Test plan block G19: root type names and metadata, schema directives, repeated usages, @specifiedBy and directive meta values
import { fromIR, printSchema, toIR } from "../../src/index"
import {
  build,
  buildIntrospected,
  canonical,
  collectRefs,
  printAndReparse,
  resolveRef,
  schemaOf,
} from "../helpers/schema"

describe("G19 build from SDL: root types, schema directives and directive usages", () => {
  it("G19.1 root type names are stored for every root type, whether default or custom", () => {
    const custom: any = build(`
      schema { query: RootQ, mutation: RootM, subscription: RootS }
      type RootQ { q: Int }
      type RootM { m: Int }
      type RootS { s: Int }
    `)
    expect(custom).toMatchObject({ queryTypeName: "RootQ", mutationTypeName: "RootM", subscriptionTypeName: "RootS" })
    expect(Object.keys(custom)).toEqual([
      "graphapi",
      "queryTypeName",
      "mutationTypeName",
      "subscriptionTypeName",
      "queries",
      "mutations",
      "subscriptions",
    ])
    const defaults: any = build(`type Query { q: Int } type Mutation { m: Int }`)
    expect(defaults).toMatchObject({ queryTypeName: "Query", mutationTypeName: "Mutation" })
    expect("subscriptionTypeName" in defaults).toBe(false)
    const mixed: any = build(`schema { query: Query, mutation: RootM } type Query { q: Int } type RootM { m: Int }`)
    expect(mixed.queryTypeName).toBe("Query")
    expect(mixed.mutationTypeName).toBe("RootM")
  })

  it("G19.2 schema directives are stored at the document level and printed on the schema block", () => {
    const sdl = `
      directive @meta(s: String, n: Int) repeatable on SCHEMA
      schema @meta(s: "a", n: 1) @meta(s: "b") { query: Query }
      type Query { q: Int }
    `
    const graphapi: any = build(sdl)
    expect(graphapi.directives).toEqual([
      { $ref: "#/components/directives/meta", meta: { s: "a", n: 1 } },
      { $ref: "#/components/directives/meta", meta: { s: "b" } },
    ])
    const printed = printSchema(graphapi)
    expect(printed).toContain('schema @meta(s: "a", n: 1) @meta(s: "b") {\n  query: Query\n}')
    expect(canonical(schemaOf(printed))).toBe(canonical(schemaOf(sdl)))
  })

  it("G19.3 root type description and directives are stored under rootTypes and printed on the root type", () => {
    const sdl = `
      directive @meta(s: String) on OBJECT
      "The root query"
      type Query @meta(s: "q") { a: Int }
      "The root mutation"
      type Mutation { m: Int }
    `
    const graphapi: any = build(sdl)
    expect(graphapi.rootTypes).toEqual({
      query: {
        description: "The root query",
        directives: [{ $ref: "#/components/directives/meta", meta: { s: "q" } }],
      },
      mutation: { description: "The root mutation" },
    })
    expect(Object.keys(graphapi)).toEqual([
      "graphapi",
      "queryTypeName",
      "mutationTypeName",
      "rootTypes",
      "queries",
      "mutations",
      "components",
    ])
    const printed = printSchema(graphapi)
    expect(printed).toContain('"""The root query"""\ntype Query @meta(s: "q") {\n  a: Int\n}')
    expect(canonical(schemaOf(printed))).toBe(canonical(schemaOf(sdl)))
    expect(buildIntrospected(sdl).rootTypes).toEqual({
      query: { description: "The root query" },
      mutation: { description: "The root mutation" },
    })
  })

  it("G19.4 every usage of a repeatable directive is its own entry everywhere and is printed in source order", () => {
    const sdl = `
      directive @tag(name: String!) repeatable on OBJECT | FIELD_DEFINITION | ARGUMENT_DEFINITION | ENUM_VALUE | INPUT_FIELD_DEFINITION
      enum E { A @tag(name: "e1") @tag(name: "e2") }
      input I { x: Int @tag(name: "i1") @tag(name: "i2") }
      type T @tag(name: "t1") @tag(name: "t2") @tag(name: "t3") { f(a: Int @tag(name: "a1") @tag(name: "a2")): Int @tag(name: "f1") @tag(name: "f2") }
      type Query { t: T, e: E, i(i: I): Int }
    `
    const graphapi: any = build(sdl)
    const names = (element: any) => element.directives.map((usage: any) => usage.meta.name)
    expect(names(graphapi.components.objects.T)).toEqual(["t1", "t2", "t3"])
    expect(names(graphapi.components.objects.T.methods.f)).toEqual(["f1", "f2"])
    expect(names(graphapi.components.objects.T.methods.f.args.a)).toEqual(["a1", "a2"])
    expect(names(graphapi.components.enums.E.values.A)).toEqual(["e1", "e2"])
    expect(names(graphapi.components.inputObjects.I.properties.x)).toEqual(["i1", "i2"])
    const printed = printSchema(graphapi)
    expect(printed).toContain('type T @tag(name: "t1") @tag(name: "t2") @tag(name: "t3") {')
    expect(printed).toContain('  f(a: Int @tag(name: "a1") @tag(name: "a2")): Int @tag(name: "f1") @tag(name: "f2")')
    expect(printed).toContain('  A @tag(name: "e1") @tag(name: "e2")')
    expect(canonical(printAndReparse(graphapi))).toBe(canonical(schemaOf(sdl)))
  })

  it("G19.5 specifiedByURL is the only representation of @specifiedBy, and there is no dangling $ref", () => {
    const sdl = `scalar UUID @specifiedBy(url: "https://x") type Query { u: UUID }`
    const graphapi: any = build(sdl)
    expect(graphapi.components.scalars.UUID).toEqual({ title: "UUID", type: "scalar", specifiedByURL: "https://x" })
    expect(graphapi.components.directives).toBeUndefined()
    expect(collectRefs(graphapi)).toEqual(["#/components/scalars/UUID"])
    expect(printSchema(graphapi)).toContain('scalar UUID @specifiedBy(url: "https://x")')
    expect(canonical(printAndReparse(graphapi))).toBe(canonical(schemaOf(sdl)))
  })

  it("G19.6 directive meta values keep their GraphQL type and print as literals of the argument type", () => {
    const sdl = `
      directive @meta(i: Int, f: Float, s: String, id: ID, e: C, l: [C], o: N, lo: [N!]) on FIELD_DEFINITION
      enum C { RED GREEN }
      input N { a: Int, c: C, s: String }
      type Query { q: Int @meta(i: 1, f: 2.5, s: "1", id: "7", e: RED, l: [RED, GREEN], o: { a: 1, c: GREEN, s: "x" }, lo: [{ a: 2 }]) }
    `
    const graphapi: any = build(sdl)
    expect(graphapi.queries.q.directives[0].meta).toEqual({
      i: 1,
      f: 2.5,
      s: "1",
      id: "7",
      e: "RED",
      l: ["RED", "GREEN"],
      o: { a: 1, c: "GREEN", s: "x" },
      lo: [{ a: 2 }],
    })
    expect(printSchema(graphapi)).toContain(
      'q: Int @meta(i: 1, f: 2.5, s: "1", id: "7", e: RED, l: [RED, GREEN], o: {a: 1, c: GREEN, s: "x"}, lo: [{a: 2}])',
    )
    expect(canonical(printAndReparse(graphapi))).toBe(canonical(schemaOf(sdl)))
  })

  it("G19.7 a document edited by hand without directive definitions still prints meta values by their JavaScript type", () => {
    const graphapi: any = build(`type Query { q: Int }`)
    graphapi.queries.q.directives = [
      { $ref: "#/components/directives/x", meta: { n: 1, s: "s", b: false, l: [1, "a"], o: { k: null } } },
    ]
    expect(printSchema(graphapi)).toContain('q: Int @x(n: 1, s: "s", b: false, l: [1, "a"], o: {k: null})')
  })

  // ISSUE-GA-16 (fixed in 0.6.0): the interfaces implemented by root operation types were dropped
  it("G19.8 interfaces implemented by root operation types are stored under rootTypes and printed", () => {
    const sdl = `
      interface Node { id: ID! }
      interface Entity { name: String }
      "The root query"
      type Query implements Node & Entity { id: ID!, name: String, node(id: ID!): Node }
      type Mutation implements Node { id: ID! }
      type Subscription implements Entity { name: String }
    `
    const graphapi: any = build(sdl)
    expect(graphapi.rootTypes).toEqual({
      query: {
        description: "The root query",
        interfaces: [{ $ref: "#/components/interfaces/Node" }, { $ref: "#/components/interfaces/Entity" }],
      },
      mutation: { interfaces: [{ $ref: "#/components/interfaces/Node" }] },
      subscription: { interfaces: [{ $ref: "#/components/interfaces/Entity" }] },
    })
    for (const ref of collectRefs(graphapi)) {
      expect(resolveRef(graphapi, ref)).toBeDefined()
    }
    const printed = printSchema(graphapi)
    expect(printed).toContain('"""The root query"""\ntype Query implements Node & Entity {')
    expect(printed).toContain("type Mutation implements Node {")
    expect(printed).toContain("type Subscription implements Entity {")
    expect(canonical(schemaOf(printed))).toBe(canonical(schemaOf(sdl)))
    expect(fromIR(toIR(graphapi))).toEqual(graphapi)
    expect(buildIntrospected(sdl)).toEqual(graphapi)
  })

  it("G19.9 root types with custom names keep their interfaces, root types implementing nothing add no rootTypes entry", () => {
    const sdl = `
      schema { query: RootQ, mutation: RootM }
      interface Node { id: ID! }
      type RootQ implements Node { id: ID! }
      type RootM { m: Int }
    `
    const graphapi: any = build(sdl)
    expect(graphapi.rootTypes).toEqual({ query: { interfaces: [{ $ref: "#/components/interfaces/Node" }] } })
    expect(canonical(printAndReparse(graphapi))).toBe(canonical(schemaOf(sdl)))
    const plain: any = build(`interface Node { id: ID! } type T implements Node { id: ID! } type Query { t: T }`)
    expect(Object.keys(plain)).toEqual(["graphapi", "queryTypeName", "queries", "components"])
  })
})

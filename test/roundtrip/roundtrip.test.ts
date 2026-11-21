// Test plan block R (round trips): print(build(sdl)) re-parses to an equivalent schema and build(print(build(sdl))) is stable
import fs from "fs"
import path from "path"

import { buildFromSchema, printSchema } from "../../src/index"
import { build, canonical, roundTrip, schemaOf } from "../helpers/schema"

const example = fs.readFileSync(path.join(__dirname, "../resources/example.graphql"), "utf8")

const expectEquivalent = (sdl: string) => {
  const { source, reparsed, graphapi, graphapi2 } = roundTrip(sdl)
  expect(canonical(reparsed)).toBe(canonical(source))
  expect(graphapi2).toEqual(graphapi)
}

describe("R1 round trip: print(build(sdl)) is equivalent to sdl (graphql-js canonical print)", () => {
  it("R1.1 README example", () => expectEquivalent(example))

  it("R1.2 scalars, objects, nullability and lists", () =>
    expectEquivalent(`
    "ISO date" scalar Date @specifiedBy(url: "https://x/date")
    type T { a: Int!, b: [Date], c: [[String!]!]!, d(x: Int = 1, y: [ID!]): Float }
    type Query { t: T, l: [T!]!, id: ID }
  `))

  it("R1.3 interfaces, unions and enums with deprecation", () =>
    expectEquivalent(`
    interface Node { id: ID! }
    interface Named implements Node { id: ID!, name: String }
    type A implements Named & Node { id: ID!, name: String }
    type B implements Node { id: ID!, b(x: Int @deprecated(reason: "x")): Int @deprecated }
    union AB = A | B
    enum E { X @deprecated, Y @deprecated(reason: "y"), "desc" Z }
    type Query { ab: AB, e: E, n: Node }
  `))

  it("R1.4 input objects and arguments with enum, numeric, boolean and null defaults", () =>
    expectEquivalent(`
    enum C { RED GREEN }
    input In { c: C = RED, i: Int = 1, f: Float = 0.5, b: Boolean = true, n: Int = null, r: Int! }
    type Query { q(i: In, c: C = GREEN, b: Boolean = false): Int }
    type Mutation { m(i: In!): Boolean! }
  `))

  it("R1.5 descriptions of every kind", () =>
    expectEquivalent(`
    "API description"
    schema { query: Query }
    """
    Multi-line
      indented "quoted"
    """
    type T {
      "field"
      f(
        "arg"
        a: Int
      ): Int
    }
    "enum" enum E { "value" V }
    "input" input I { "input field" a: Int }
    "scalar" scalar S
    "union" union U = T
    "directive" directive @d("d arg" x: Int) on FIELD_DEFINITION
    type Query { t: T, e: E, s: S, u: U, i(i: I): Int @d(x: 1) }
  `))

  it("R1.6 directive definitions and usages with string arguments", () =>
    expectEquivalent(`
    directive @tag(name: String!) on FIELD_DEFINITION | ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION
    directive @rep repeatable on FIELD_DEFINITION
    input I { a: Int @tag(name: "in") }
    type Query { f(x: Int @tag(name: "arg")): Int @tag(name: "f") @rep, g(i: I): Int }
  `))

  it("R1.7 mutation-only and subscription schemas", () => {
    expectEquivalent(`type Query { a: Int } type Subscription { s: Int! }`)
    expectEquivalent(`type Mutation { m: Int } type Query { a: Int }`)
  })

  // ISSUE-GA-02 (fixed in 0.6.0): String defaults print unquoted and are silently lost (or misread) on re-parse
  it("R1.8 input objects and arguments with String and list defaults", () =>
    expectEquivalent(`
    input In { s: String = "hello", l: [Int] = [1, 2], e: String = "" }
    type Query { q(i: In, s: String = "hi", l: [String] = ["a"]): Int }
  `))

  // ISSUE-GA-01 (fixed in 0.6.0): input object defaults make printSchema throw
  it("R1.9 input objects with nested input object defaults", () =>
    expectEquivalent(`
    input N { a: Int }
    input In { n: N = { a: 1 } }
    type Query { q(i: In, n: N = { a: 2 }): Int }
  `))

  // ISSUE-GA-05 (fixed in 0.6.0): custom root type names are lost
  it("R1.10 custom root type names", () =>
    expectEquivalent(`
    schema { query: RootQ, mutation: RootM, subscription: RootS }
    type RootQ { q: Int }
    type RootM { m: Int }
    type RootS { s: Int }
  `))

  // ISSUE-GA-05 (fixed in 0.6.0): a mutation-only schema with a custom root name is printed as `type Mutation`
  it("R1.11 mutation-only schema with a custom root name", () =>
    expectEquivalent(`
    schema { mutation: M }
    type M { a: Int }
  `))

  // ISSUE-GA-05 (fixed in 0.6.0): non-root types named Query/Mutation collide with the printed roots
  it("R1.12 non-root types named like default roots", () =>
    expectEquivalent(`
    schema { query: Root }
    type Root { q: Query, m: Mutation }
    type Query { x: Int }
    type Mutation { y: Int }
  `))

  // ISSUE-GA-13 (fixed in 0.6.0): root operation type descriptions are dropped
  it("R1.13 root type description", () =>
    expectEquivalent(`
    "The root"
    type Query { a: Int }
  `))

  // ISSUE-GA-13 (fixed in 0.6.0): a schema description without operations has nowhere to be printed
  it("R1.14 schema description without operations", () => {
    const sdl = `"Only a description" schema { query: Query } type Query { a: Int }`
    const noOps = buildFromSchema(schemaOf(sdl))
    delete noOps.queries
    expect(printSchema(noOps)).toContain("Only a description")
  })
})

describe("R2 round trip: build(print(build(sdl))) deep-equals build(sdl)", () => {
  it("R2.1 README example is a fixed point", () => {
    const { graphapi, graphapi2 } = roundTrip(example)
    expect(graphapi2).toEqual(graphapi)
  })

  it("R2.2 a second round trip prints identical SDL", () => {
    const { printed, graphapi2 } = roundTrip(example)
    expect(printSchema(graphapi2)).toBe(printed)
  })

  it("R2.3 the SDL order of definitions does not change the document (only key order differs)", () => {
    const a = build(`type A { b: B } type B { a: A } enum E { X } type Query { a: A, e: E }`)
    const b = build(`type Query { a: A, e: E } enum E { X } type B { a: A } type A { b: B }`)
    expect(a).toEqual(b)
  })
})

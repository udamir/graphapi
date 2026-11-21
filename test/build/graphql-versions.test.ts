import {
  DirectiveLocation,
  GraphQLDirective,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  specifiedDirectives,
  versionInfo,
} from "graphql"

import { buildFromSchema, printSchema } from "../../src/index"
import { build, buildIntrospected, collectRefs, schemaOf } from "../helpers/schema"

// built-ins that newer graphql-js releases added or changed (graphql@16.9 `@oneOf`, graphql@16.14/17 `@deprecated` on directives)
const hasOneOf = specifiedDirectives.some((directive) => directive.name === "oneOf")
const hasDirectiveDeprecation = "DIRECTIVE_DEFINITION" in DirectiveLocation
// graphql@16 introspection reports input object defaults with the field defaults merged in, graphql@17 as written
const introspectionKeepsLiterals = versionInfo.major >= 17

describe("Q1 graphql-js versions: built-in directives", () => {
  it("Q1.1 @oneOf is not listed in documents that do not use it", () => {
    expect(build(`type Query { a: Int }`).components?.directives).toBeUndefined()
    expect(Object.keys(build(`type Query { a: Int @deprecated }`).components!.directives!)).toEqual(["deprecated"])
  })

  it.runIf(hasOneOf)("Q1.2 a @oneOf usage refers to a listed definition", () => {
    const sdl = `input I @oneOf { a: Int, b: String } type Query { q(i: I): Int }`
    const doc: any = build(sdl)
    expect(doc.components.inputObjects.I.directives).toEqual([{ $ref: "#/components/directives/oneOf" }])
    expect(doc.components.directives.oneOf).toMatchObject({ title: "oneOf", locations: ["INPUT_OBJECT"] })
    for (const ref of collectRefs(doc).filter((ref) => ref.startsWith("#/components/directives/"))) {
      expect(doc.components.directives[ref.split("/").pop()!]).toBeDefined()
    }
    expect(printSchema(doc)).toContain("input I @oneOf {")
    expect(printSchema(doc)).not.toContain("directive @oneOf")
  })

  it("Q1.3 @deprecated is built-in whether or not its definition allows DIRECTIVE_DEFINITION", () => {
    const deprecated = (locations: DirectiveLocation[]) =>
      new GraphQLDirective({ name: "deprecated", locations, args: { reason: { type: GraphQLString } } })
    const query = new GraphQLObjectType({
      name: "Query",
      fields: { a: { type: GraphQLInt, deprecationReason: "old" } },
    })
    const plainQuery = new GraphQLObjectType({ name: "Query", fields: { a: { type: GraphQLInt } } })
    const base = [
      DirectiveLocation.FIELD_DEFINITION,
      DirectiveLocation.ARGUMENT_DEFINITION,
      DirectiveLocation.INPUT_FIELD_DEFINITION,
      DirectiveLocation.ENUM_VALUE,
    ]
    const variants = hasDirectiveDeprecation ? [base, [...base, "DIRECTIVE_DEFINITION" as DirectiveLocation]] : [base]
    for (const locations of variants) {
      const doc = buildFromSchema(new GraphQLSchema({ query, directives: [deprecated(locations)] }))
      expect(doc.queries!.a.deprecation).toEqual({ reason: "old" })
      expect(doc.queries!.a.directives).toEqual([
        { $ref: "#/components/directives/deprecated", meta: { reason: "old" } },
      ])
      expect(doc.components?.directives?.deprecated).toBeDefined()
      expect(printSchema(doc)).not.toContain("directive @deprecated")
      // a built-in definition is listed only when used, a custom one would always be listed
      const unused = buildFromSchema(new GraphQLSchema({ query: plainQuery, directives: [deprecated(locations)] }))
      expect(unused.components).toBeUndefined()
    }
  })

  it("Q1.4 defaults of code-first schemas survive (graphql@17 `default: { value }`, graphql@16 `defaultValue`)", () => {
    const input = new GraphQLInputObjectType({ name: "In", fields: { s: { type: GraphQLString, defaultValue: "x" } } })
    const query = new GraphQLObjectType({
      name: "Query",
      fields: { q: { type: GraphQLInt, args: { i: { type: input }, n: { type: GraphQLInt, defaultValue: 3 } } } },
    })
    const doc: any = buildFromSchema(new GraphQLSchema({ query }))
    expect(doc.queries.q.args.n.default).toBe(3)
    expect(doc.components.inputObjects.In.properties.s.default).toBe("x")
  })

  it("Q1.5 SDL defaults are the same in the schema and the introspection build", () => {
    const sdl = `enum C { RED } input N { a: Int = 1 } type Query { q(i: Int = 3, l: [Int] = [1], n: N = { a: 2 }, e: C = RED, s: String = "x"): Int }`
    expect(build(sdl).queries).toEqual(buildIntrospected(sdl).queries)
    expect(schemaOf(printSchema(build(sdl)))).toBeDefined()
  })

  it("Q1.6 an input object default is kept as written, also when the input object has field defaults", () => {
    const sdl = `
      input Range { from: Int = 0, to: Int }
      input Filter { text: String = "", range: Range = { from: 1 }, limit: Int! = 20, id: ID }
      type Query { items(filter: Filter = { text: "all", id: 7 }, ranges: [Range] = { to: 3 }): Int }
    `
    const doc: any = build(sdl)
    expect(doc.queries.items.args.filter.default).toEqual({ text: "all", id: "7" })
    expect(doc.queries.items.args.ranges.default).toEqual({ to: 3 })
    expect(doc.components.inputObjects.Filter.properties.range.default).toEqual({ from: 1 })
    if (introspectionKeepsLiterals) {
      expect(doc).toEqual(buildIntrospected(sdl))
    }
    expect(printSchema(doc)).toContain('items(filter: Filter = {text: "all", id: "7"}, ranges: [Range] = {to: 3}): Int')
  })
})

// Test plan blocks G7 (input objects and defaults), G8 (arguments and defaults)
import { build } from "../helpers/schema"

const SDL = `
  enum Color { RED GREEN }
  input Nested { a: Int = 1, b: String }
  "Filter input"
  input Filter {
    s: String = "hello"
    i: Int = 3
    f: Float = 1.5
    t: Boolean = true
    b: Boolean = false
    z: Int = 0
    es: String = ""
    e: Color = RED
    l: [Int] = [1, 2]
    el: [Int] = []
    ll: [[Int]] = [[1], [2]]
    n: Nested = { a: 2, b: "x" }
    nul: String = null
    req: String!
    reqDefault: Int! = 5
    noDefault: Nested
  }
  type Query {
    q(
      s: String = "hi"
      l: [String!] = ["a"]
      n: Nested = { a: 5 }
      e: Color = GREEN
      nn: Int! = 7
      req: ID!
      opt: Int
    ): Int
  }
`

// the names of the non-null entries, and of those of them that must be provided (non-null without a default)
const nonNullNames = (map: Record<string, any>): string[] =>
  Object.keys(map).filter((name) => map[name].nonNull === true)
const mustBeProvided = (map: Record<string, any>): string[] =>
  nonNullNames(map).filter((name) => !("default" in map[name]))

describe("G7 build from SDL: input objects", () => {
  const graphapi: any = build(SDL)
  const filter = graphapi.components.inputObjects.Filter

  it("G7.1 registers input objects in components.inputObjects with title, description, type input and nonNull fields", () => {
    expect(filter).toMatchObject({ title: "Filter", description: "Filter input", type: "input" })
    expect(nonNullNames(filter.properties)).toEqual(["req", "reqDefault"])
    expect(mustBeProvided(filter.properties)).toEqual(["req"])
    expect(Object.keys(filter.properties)).toEqual([
      "s",
      "i",
      "f",
      "t",
      "b",
      "z",
      "es",
      "e",
      "l",
      "el",
      "ll",
      "n",
      "nul",
      "req",
      "reqDefault",
      "noDefault",
    ])
  })

  it("G7.2 keeps scalar defaults as JSON values of the field type, including falsy values", () => {
    expect(filter.properties.s).toEqual({ type: "String", default: "hello" })
    expect(filter.properties.i).toEqual({ type: "Int", default: 3 })
    expect(filter.properties.f).toEqual({ type: "Float", default: 1.5 })
    expect(filter.properties.t).toEqual({ type: "Boolean", default: true })
    expect(filter.properties.b).toEqual({ type: "Boolean", default: false })
    expect(filter.properties.z).toEqual({ type: "Int", default: 0 })
    expect(filter.properties.es).toEqual({ type: "String", default: "" })
  })

  it("G7.3 keeps enum, list, nested list, nested input object and null defaults", () => {
    expect(filter.properties.e).toEqual({ $ref: "#/components/enums/Color", default: "RED" })
    expect(filter.properties.l).toEqual({ type: "list", items: { type: "Int" }, default: [1, 2] })
    expect(filter.properties.el).toEqual({ type: "list", items: { type: "Int" }, default: [] })
    expect(filter.properties.ll).toEqual({
      type: "list",
      items: { type: "list", items: { type: "Int" } },
      default: [[1], [2]],
    })
    expect(filter.properties.n).toEqual({ $ref: "#/components/inputObjects/Nested", default: { a: 2, b: "x" } })
    expect(filter.properties.nul).toEqual({ type: "String", default: null })
    expect(filter.properties.reqDefault).toEqual({ type: "Int", nonNull: true, default: 5 })
    expect("default" in filter.properties.noDefault).toBe(false)
    expect("default" in filter.properties.req).toBe(false)
  })

  it("G7.4 keeps deprecation of input fields with and without reason", () => {
    const g: any = build(`
      input I { a: Int @deprecated, b: Int @deprecated(reason: "x"), c: Int }
      type Query { f(i: I): Int }
    `)
    expect(g.components.inputObjects.I.properties.a.deprecation).toEqual({ reason: "No longer supported" })
    expect(g.components.inputObjects.I.properties.b.deprecation).toEqual({ reason: "x" })
    expect(g.components.inputObjects.I.properties.b.directives).toEqual([
      { $ref: "#/components/directives/deprecated", meta: { reason: "x" } },
    ])
    expect(g.components.inputObjects.I.properties.c).toEqual({ type: "Int" })
  })

  it("G7.5 keeps custom directives on input objects and input fields", () => {
    const g: any = build(`
      directive @meta(s: String) on INPUT_OBJECT | INPUT_FIELD_DEFINITION
      input I @meta(s: "in") { a: Int @meta(s: "field") }
      type Query { f(i: I): Int }
    `)
    expect(g.components.inputObjects.I.directives).toEqual([
      { $ref: "#/components/directives/meta", meta: { s: "in" } },
    ])
    expect(g.components.inputObjects.I.properties.a.directives).toEqual([
      { $ref: "#/components/directives/meta", meta: { s: "field" } },
    ])
  })

  // ISSUE-GA-10 (fixed in 0.6.0): input fields receive a `title` (their own name) although object fields and the README example do not
  it("G7.6 input fields are plain type usages without a title, like object fields", () => {
    const g: any = build(`
      input TodoInputType { name: String!, completed: Boolean }
      type Query { f(i: TodoInputType): Int }
    `)
    expect(g.components.inputObjects.TodoInputType.properties.name).toEqual({ type: "String", nonNull: true })
    expect(g.components.inputObjects.TodoInputType.properties.completed).toEqual({ type: "Boolean" })
  })
})

describe("G8 build from SDL: arguments", () => {
  const graphapi: any = build(SDL)
  const args = graphapi.queries.q.args

  it("G8.1 represents args as a map keyed by name in declaration order, non-null arguments carry nonNull", () => {
    expect(Object.keys(args)).toEqual(["s", "l", "n", "e", "nn", "req", "opt"])
    expect(nonNullNames(args)).toEqual(["nn", "req"])
    expect(mustBeProvided(args)).toEqual(["req"])
  })

  it("G8.2 keeps argument defaults of every kind", () => {
    expect(args.s).toEqual({ type: "String", default: "hi" })
    expect(args.l).toEqual({ type: "list", items: { type: "String", nonNull: true }, default: ["a"] })
    expect(args.n).toEqual({ $ref: "#/components/inputObjects/Nested", default: { a: 5 } })
    expect(args.e).toEqual({ $ref: "#/components/enums/Color", default: "GREEN" })
    expect(args.nn).toEqual({ type: "Int", nonNull: true, default: 7 })
    expect(args.req).toEqual({ type: "ID", nonNull: true })
    expect(args.opt).toEqual({ type: "Int" })
  })

  it("G8.3 keeps description, deprecation and directives on arguments", () => {
    const g: any = build(`
      directive @meta(s: String) on ARGUMENT_DEFINITION
      type Query {
        f(
          "first arg"
          a: Int @deprecated(reason: "old") @meta(s: "arg")
          b: Int @deprecated
        ): Int
      }
    `)
    expect(g.queries.f.args.a).toEqual({
      description: "first arg",
      deprecation: { reason: "old" },
      directives: [
        { $ref: "#/components/directives/deprecated", meta: { reason: "old" } },
        { $ref: "#/components/directives/meta", meta: { s: "arg" } },
      ],
      type: "Int",
    })
    expect(g.queries.f.args.b.deprecation).toEqual({ reason: "No longer supported" })
  })

  it("G8.4 keeps defaults of directive definition arguments", () => {
    const g: any = build(`
      directive @limit(offset: Int = 0, limit: Int = 20, tag: String = "t") on FIELD_DEFINITION
      type Query { f: Int }
    `)
    expect(g.components.directives.limit.args).toEqual({
      offset: { type: "Int", default: 0 },
      limit: { type: "Int", default: 20 },
      tag: { type: "String", default: "t" },
    })
  })

  it("G8.5 fields of object types and interfaces carry args the same way as operations", () => {
    const g: any = build(`
      interface I { f(x: Int!, y: String = "s"): Int }
      type T implements I { f(x: Int!, y: String = "s"): Int }
      type Query { t: T, f(x: Int!, y: String = "s"): Int }
    `)
    const expected = { x: { type: "Int", nonNull: true }, y: { type: "String", default: "s" } }
    expect(g.components.interfaces.I.methods.f.args).toEqual(expected)
    expect(g.components.objects.T.methods.f.args).toEqual(expected)
    expect(g.queries.f.args).toEqual(expected)
  })
})

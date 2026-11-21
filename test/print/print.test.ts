// Test plan block P (printSchema): formatting, descriptions, defaults, directives, root types
import { printSchema } from "../../src/index"
import { build, buildIntrospected, defaultOf, printAndReparse, schemaOf } from "../helpers/schema"

describe("P1 printSchema: canonical formatting", () => {
  const printed = printSchema(
    build(`
    "A scalar"
    scalar Date
    type Todo {
      id: ID!
      "The name"
      name: String!
      tags(first: Int = 10, after: ID): [String!]!
      detailed(
        "with description"
        verbose: Boolean = false
        depth: Int
      ): String
    }
    enum Color { RED GREEN }
    input In { a: Int!, b: Color = RED }
    type Query { todo(id: ID!): Todo }
  `),
  )

  it("P1.1 separates definitions with exactly one blank line and uses two-space indentation", () => {
    const definitions = printed.split("\n\n")
    expect(definitions.length).toBeGreaterThanOrEqual(6)
    expect(printed).not.toMatch(/\n\n\n/)
    for (const line of printed.split("\n")) {
      if (line.startsWith(" ")) {
        expect(line).toMatch(/^( {2}| {4})\S/)
      }
    }
  })

  it("P1.2 prints every definition kind with the spec keywords", () => {
    expect(printed).toMatch(/^scalar Date$/m)
    expect(printed).toMatch(/^type Todo \{$/m)
    expect(printed).toMatch(/^enum Color \{$/m)
    expect(printed).toMatch(/^input In \{$/m)
    expect(printed).toMatch(/^type Query \{$/m)
  })

  it("P1.3 prints args on one line when none has a description and one per line otherwise", () => {
    expect(printed).toContain("  tags(first: Int = 10, after: ID): [String!]!")
    expect(printed).toContain(
      '  detailed(\n    """with description"""\n    verbose: Boolean = false\n    depth: Int\n  ): String',
    )
  })

  it("P1.4 prints descriptions as block strings on the preceding line", () => {
    expect(printed).toContain('"""A scalar"""\nscalar Date')
    expect(printed).toContain('  """The name"""\n  name: String!')
  })

  it("P1.5 prints nullability and list wrappers exactly", () => {
    const out = printSchema(build(`type Query { a: [String], b: [String!], c: [String]!, d: [[Int!]!]!, e: Int! }`))
    expect(out).toContain("  a: [String]\n  b: [String!]\n  c: [String]!\n  d: [[Int!]!]!\n  e: Int!")
  })
})

describe("P2 printSchema: description escaping", () => {
  it("P2.1 descriptions survive a print and re-parse (triple quotes, trailing quote, leading spaces, tabs, unicode)", () => {
    const sdl = `
      type Query {
        """
        Multi-line with "quotes", a \\"\\"\\" triple
          and indentation
        """
        a: Int
        "ends with quote\\""
        b: Int
        """   leading spaces"""
        c: Int
        "tab\\there and ünïcödé"
        d: Int
        "backslash \\\\ end"
        e: Int
      }
    `
    const source = schemaOf(sdl)
    const reparsed = printAndReparse(build(sdl))
    for (const field of ["a", "b", "c", "d", "e"]) {
      expect(reparsed.getQueryType()!.getFields()[field].description).toBe(
        source.getQueryType()!.getFields()[field].description,
      )
    }
  })

  it("P2.2 descriptions with control characters fall back to an escaped single-quoted string", () => {
    const graphapi: any = build(`type Query { a: Int }`)
    graphapi.queries.a.description = "bell\u0007char"
    const out = printSchema(graphapi)
    expect(out).toContain('"bell\\u0007char"')
    expect(printAndReparse(graphapi).getQueryType()!.getFields().a.description).toBe("bell\u0007char")
  })
})

describe("P3 printSchema: default values", () => {
  const defaults = (sdl: string) => {
    const reparsed = printAndReparse(build(sdl))
    const field = reparsed.getQueryType()!.getFields().q
    return Object.fromEntries(field.args.map((arg) => [arg.name, defaultOf(arg)]))
  }

  it("P3.1 prints Int, Float, Boolean, enum and null defaults as literals", () => {
    expect(
      printSchema(
        build(
          `enum C { RED } type Query { q(i: Int = 3, f: Float = 1.5, b: Boolean = false, e: C = RED, n: String = null): Int }`,
        ),
      ),
    ).toContain("q(i: Int = 3, f: Float = 1.5, b: Boolean = false, e: C = RED, n: String = null): Int")
    expect(
      defaults(
        `enum C { RED } type Query { q(i: Int = 3, f: Float = 1.5, b: Boolean = false, e: C = RED, n: String = null): Int }`,
      ),
    ).toEqual({ i: 3, f: 1.5, b: false, e: "RED", n: null })
  })

  // ISSUE-GA-02 (fixed in 0.6.0): defaults are printed with String(value), so a String default is printed unquoted (`= hello`) and re-parses as an enum literal
  it("P3.2 prints String defaults as quoted string literals", () => {
    expect(printSchema(build(`type Query { q(s: String = "hello"): Int }`))).toContain('q(s: String = "hello"): Int')
  })

  it("P3.3 String defaults survive a print and re-parse", () => {
    expect(defaults(`type Query { q(s: String = "hello", e: String = ""): Int }`)).toEqual({ s: "hello", e: "" })
  })

  // ISSUE-GA-02 (fixed in 0.6.0): list defaults are printed as `1,2` (Array.prototype.toString) and empty lists as nothing
  it("P3.4 prints list defaults as GraphQL list literals", () => {
    expect(
      printSchema(build(`type Query { q(l: [Int] = [1, 2], e: [Int] = [], s: [String] = ["a"]): Int }`)),
    ).toContain('q(l: [Int] = [1, 2], e: [Int] = [], s: [String] = ["a"]): Int')
  })

  // ISSUE-GA-01 (fixed in 0.6.0): String(defaultValue) throws for input object defaults (graphql-js creates them with a null prototype)
  it("P3.5 prints input object defaults as object literals instead of throwing", () => {
    const graphapi = build(`input N { a: Int } type Query { q(n: N = { a: 1 }): Int }`)
    let out = ""
    expect(() => {
      out = printSchema(graphapi)
    }).not.toThrow()
    expect(out).toContain("q(n: N = {a: 1}): Int")
  })

  it("P3.6 defaults of input object fields of every kind survive a print and re-parse", () => {
    const sdl = `
      enum C { RED }
      input N { a: Int = 1 }
      input In { s: String = "x", l: [Int] = [1], n: N = { a: 2 }, e: C = RED, b: Boolean = false }
      type Query { q(i: In): Int }
    `
    const reparsed: any = printAndReparse(build(sdl))
    const fields = reparsed.getType("In").getFields()
    expect(defaultOf(fields.s)).toBe("x")
    expect(defaultOf(fields.l)).toEqual([1])
    expect(defaultOf(fields.n)).toEqual({ a: 2 })
    expect(defaultOf(fields.e)).toBe("RED")
    expect(defaultOf(fields.b)).toBe(false)
  })
})

describe("P4 printSchema: directive definitions and usages", () => {
  it("P4.1 prints directive definitions with args, defaults, repeatable and locations", () => {
    const out = printSchema(
      build(`
      "limits"
      directive @limit(offset: Int = 0, limit: Int = 20) repeatable on FIELD_DEFINITION | OBJECT
      directive @plain on FIELD_DEFINITION
      type Query { a: Int }
    `),
    )
    expect(out).toContain(
      '"""limits"""\ndirective @limit(offset: Int = 0, limit: Int = 20) repeatable on FIELD_DEFINITION | OBJECT',
    )
    expect(out).toContain("directive @plain on FIELD_DEFINITION")
  })

  it("P4.2 never prints built-in directives or built-in scalars", () => {
    const out = printSchema(build(`type Query { a: Int @deprecated, b: ID, c: Float }`))
    expect(out).not.toMatch(/directive @(skip|include|deprecated|specifiedBy)/)
    expect(out).not.toMatch(/^scalar (Int|Float|String|Boolean|ID)$/m)
  })

  it("P4.3 prints @deprecated with and without reason on fields, args, input fields and enum values", () => {
    const out = printSchema(
      build(`
      enum E { A @deprecated B @deprecated(reason: "b") }
      input I { x: Int @deprecated(reason: "x") }
      type Query { a(i: I @deprecated): E @deprecated(reason: "No longer supported"), b: Int @deprecated(reason: "r") }
    `),
    )
    expect(out).toContain('  A @deprecated\n  B @deprecated(reason: "b")')
    expect(out).toContain('  x: Int @deprecated(reason: "x")')
    expect(out).toContain("  a(i: I @deprecated): E @deprecated\n")
    expect(out).toContain('  b: Int @deprecated(reason: "r")')
  })

  it("P4.4 prints custom directive usages with String, Boolean and null args on fields, arguments and input fields", () => {
    const out = printSchema(
      build(`
      directive @meta(s: String, b: Boolean, n: String) on FIELD_DEFINITION | ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION
      input I { x: Int @meta(s: "in") }
      type Query { a(x: Int @meta(b: true)): Int @meta(s: "f", n: null) }
    `),
    )
    expect(out).toContain('  x: Int @meta(s: "in")')
    expect(out).toContain('  a(x: Int @meta(b: true)): Int @meta(s: "f", n: null)')
  })

  // ISSUE-GA-03 (fixed in 0.6.0): Int/Float/Enum meta values are strings and get printed quoted; list and object values print as `1,2` / `[object Object]`
  it("P4.5 prints Int, Float, enum, list and object directive arguments as the matching GraphQL literals", () => {
    const out = printSchema(
      build(`
      directive @meta(i: Int, f: Float, e: C, l: [Int], o: N) on FIELD_DEFINITION
      enum C { RED }
      input N { a: Int }
      type Query { a: Int @meta(i: 1, f: 1.5, e: RED, l: [1, 2], o: { a: 1 }) }
    `),
    )
    expect(out).toContain("a: Int @meta(i: 1, f: 1.5, e: RED, l: [1, 2], o: {a: 1})")
  })

  // ISSUE-GA-06 (fixed in 0.6.0): directives captured on object, interface, union, enum, input and scalar definitions are not printed
  it("P4.6 prints directive usages on type definitions (OBJECT, INTERFACE, UNION, ENUM, INPUT_OBJECT, SCALAR)", () => {
    const out = printSchema(
      build(`
      directive @meta(s: String) on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR
      scalar S @meta(s: "s")
      interface I @meta(s: "i") { x: Int }
      type T implements I @meta(s: "t") { x: Int }
      union U @meta(s: "u") = T
      enum E @meta(s: "e") { A }
      input In @meta(s: "in") { a: Int }
      type Query { t: T, u: U, e: E, s: S, f(i: In): Int }
    `),
    )
    expect(out).toContain('scalar S @meta(s: "s")')
    expect(out).toContain('interface I @meta(s: "i")')
    expect(out).toContain('type T implements I @meta(s: "t")')
    expect(out).toContain('union U @meta(s: "u") = T')
    expect(out).toContain('enum E @meta(s: "e")')
    expect(out).toContain('input In @meta(s: "in")')
  })

  it("P4.7 prints @specifiedBy for scalars built from SDL", () => {
    const out = printSchema(build(`scalar UUID @specifiedBy(url: "https://x/uuid") type Query { u: UUID }`))
    expect(out).toContain('scalar UUID @specifiedBy(url: "https://x/uuid")')
  })

  // ISSUE-GA-11 (fixed in 0.6.0): the printer reads directives.specifiedBy only, the specifiedByURL property (the only form introspection produces) is ignored
  it("P4.8 prints @specifiedBy for scalars built from introspection", () => {
    const out = printSchema(buildIntrospected(`scalar UUID @specifiedBy(url: "https://x/uuid") type Query { u: UUID }`))
    expect(out).toContain('scalar UUID @specifiedBy(url: "https://x/uuid")')
  })
})

describe("P5 printSchema: root types and schema definition", () => {
  it("P5.1 prints Query, Mutation and Subscription as object types and omits the schema block for default names", () => {
    const out = printSchema(
      build(`
      type Query { q: Int }
      type Mutation { m: Int }
      type Subscription { s: Int }
    `),
    )
    expect(out).not.toContain("schema {")
    expect(out).toContain("type Query {\n  q: Int\n}")
    expect(out).toContain("type Mutation {\n  m: Int\n}")
    expect(out).toContain("type Subscription {\n  s: Int\n}")
  })

  it("P5.2 prints the schema block with its description when the schema is described", () => {
    const out = printSchema(
      build(`
      "API"
      schema { query: Query, mutation: Mutation }
      type Query { q: Int }
      type Mutation { m: Int }
    `),
    )
    expect(out).toContain('"""API"""\nschema {\n  query: Query\n  mutation: Mutation\n}')
  })

  it("P5.3 prints implemented interfaces with & separators", () => {
    const out = printSchema(
      build(`
      interface A { a: Int }
      interface B { b: Int }
      type T implements A & B { a: Int, b: Int }
      type Query { t: T }
    `),
    )
    expect(out).toContain("type T implements A & B {")
  })

  // ISSUE-GA-05 (fixed in 0.6.0): custom root type names are lost, the document is printed with Query/Mutation/Subscription
  it("P5.4 prints custom root type names with an explicit schema block", () => {
    const out = printSchema(
      build(`
      schema { query: RootQ, mutation: RootM }
      type RootQ { q: Int }
      type RootM { m: Int }
    `),
    )
    expect(out).toContain("schema {\n  query: RootQ\n  mutation: RootM\n}")
    expect(out).toContain("type RootQ {")
    expect(out).toContain("type RootM {")
  })

  // ISSUE-GA-05 (fixed in 0.6.0): a non-root type named Query is printed next to the root type also printed as Query (duplicate type names)
  it("P5.5 printed SDL with a non-root type named Query is valid", () => {
    const graphapi = build(`
      schema { query: Root }
      type Root { q: Query }
      type Query { x: Int }
    `)
    expect(() => printAndReparse(graphapi)).not.toThrow()
  })

  // ISSUE-GA-05 (fixed in 0.6.0): a non-root type named Mutation is printed without a schema block, so re-parsing promotes it to the mutation root
  it("P5.6 a non-root type named Mutation does not become a root on re-parse", () => {
    const reparsed = printAndReparse(
      build(`
      schema { query: Query }
      type Query { m: Mutation }
      type Mutation { x: Int }
    `),
    )
    expect(reparsed.getMutationType()).toBeUndefined()
  })

  it("P5.7 prints nothing but components for a document without operations", () => {
    expect(printSchema(build(`scalar X`))).toBe("scalar X")
    expect(printSchema({ graphapi: "1.0" })).toBe("")
  })
})

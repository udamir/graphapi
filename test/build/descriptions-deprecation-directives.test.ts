// Test plan blocks G9 (descriptions), G10 (deprecation), G11 (custom directives)
import { build } from "../helpers/schema"

const DEPRECATED = "#/components/directives/deprecated"
const META = "#/components/directives/meta"

// the meta of the first usage of @meta on an element
const metaOf = (element: any): unknown => element.directives.find((usage: any) => usage.$ref === META)?.meta

describe("G9 build from SDL: descriptions", () => {
  it("G9.1 keeps single-line descriptions on every describable element", () => {
    const graphapi: any = build(`
      "the schema"
      schema { query: Query }
      "a directive" directive @d("arg of d" x: Int) on FIELD_DEFINITION
      "a scalar" scalar S
      "an object" type T { "a field" f("an arg" a: Int): Int }
      "an interface" interface I { f: Int }
      "a union" union U = T
      "an enum" enum E { "a value" V }
      "an input" input In { "an input field" a: Int }
      type Query { "an operation" op(i: In, e: E): T }
    `)
    expect(graphapi.description).toBe("the schema")
    expect(graphapi.components.directives.d.description).toBe("a directive")
    expect(graphapi.components.directives.d.args.x.description).toBe("arg of d")
    expect(graphapi.components.scalars.S.description).toBe("a scalar")
    expect(graphapi.components.objects.T.description).toBe("an object")
    expect(graphapi.components.objects.T.methods.f.description).toBe("a field")
    expect(graphapi.components.objects.T.methods.f.args.a.description).toBe("an arg")
    expect(graphapi.components.interfaces.I.description).toBe("an interface")
    expect(graphapi.components.unions.U.description).toBe("a union")
    expect(graphapi.components.enums.E.description).toBe("an enum")
    expect(graphapi.components.enums.E.values.V.description).toBe("a value")
    expect(graphapi.components.inputObjects.In.description).toBe("an input")
    expect(graphapi.components.inputObjects.In.properties.a.description).toBe("an input field")
    expect(graphapi.queries.op.description).toBe("an operation")
  })

  it("G9.2 keeps multi-line block descriptions with quotes, markdown and indentation (block string value per spec)", () => {
    const graphapi: any = build(`
      type Query {
        """
        # Title

        A "quoted" word, a \\""" triple and a list:
          - indented item
        \`code\`
        """
        a: Int
        "ends with quote\\""
        b: Int
        """   leading spaces"""
        c: Int
      }
    `)
    expect(graphapi.queries.a.description).toBe(
      '# Title\n\nA "quoted" word, a """ triple and a list:\n  - indented item\n`code`',
    )
    expect(graphapi.queries.b.description).toBe('ends with quote"')
    expect(graphapi.queries.c.description).toBe("   leading spaces")
  })

  it("G9.3 omits the description key when no description is given", () => {
    const graphapi: any = build(`type Query { a: Int }`)
    expect("description" in graphapi).toBe(false)
    expect("description" in graphapi.queries.a).toBe(false)
  })
})

describe("G10 build from SDL: deprecation", () => {
  const graphapi: any = build(`
    enum E { A @deprecated B @deprecated(reason: "b") C }
    input I { a: Int @deprecated, b: Int @deprecated(reason: "b") }
    type T {
      a: Int @deprecated
      b: Int @deprecated(reason: "b")
      c(x: Int @deprecated, y: Int @deprecated(reason: "y")): Int
      d: Int @deprecated(reason: "No longer supported")
    }
    type Query { op: T @deprecated(reason: "use op2"), op2: T }
    type Mutation { m: Int @deprecated }
  `)

  it("G10.1 @deprecated without reason resolves to the default reason, with reason keeps it", () => {
    const methods = graphapi.components.objects.T.methods
    expect(methods.a.deprecation).toEqual({ reason: "No longer supported" })
    expect(methods.b.deprecation).toEqual({ reason: "b" })
    expect(methods.c.deprecation).toBeUndefined()
    expect(methods.c.args.x.deprecation).toEqual({ reason: "No longer supported" })
    expect(methods.c.args.y.deprecation).toEqual({ reason: "y" })
  })

  it("G10.2 the spec default reason written explicitly is encoded exactly like a bare @deprecated", () => {
    const methods = graphapi.components.objects.T.methods
    expect(methods.d).toEqual(methods.a)
    expect(methods.d.deprecation).toEqual({ reason: "No longer supported" })
  })

  it("G10.3 applies to enum values, input fields and operations alike", () => {
    expect(graphapi.components.enums.E.values).toEqual({
      A: {
        deprecation: { reason: "No longer supported" },
        directives: [{ $ref: DEPRECATED, meta: { reason: "No longer supported" } }],
      },
      B: { deprecation: { reason: "b" }, directives: [{ $ref: DEPRECATED, meta: { reason: "b" } }] },
      C: {},
    })
    expect(graphapi.components.inputObjects.I.properties.a.deprecation).toEqual({ reason: "No longer supported" })
    expect(graphapi.components.inputObjects.I.properties.b.deprecation).toEqual({ reason: "b" })
    expect(graphapi.queries.op.deprecation).toEqual({ reason: "use op2" })
    expect(graphapi.queries.op2.deprecation).toBeUndefined()
    expect(graphapi.mutations.m.deprecation).toEqual({ reason: "No longer supported" })
  })

  it("G10.4 a deprecation also lists the @deprecated usage first in directives and the built-in definition", () => {
    expect(graphapi.components.objects.T.methods.a.directives).toEqual([
      { $ref: DEPRECATED, meta: { reason: "No longer supported" } },
    ])
    expect(graphapi.components.objects.T.methods.c.directives).toBeUndefined()
    expect(graphapi.queries.op2.directives).toBeUndefined()
    expect(graphapi.components.directives.deprecated).toMatchObject({ title: "deprecated", repeatable: false })
    const g: any = build(`
      directive @meta(s: String) on FIELD_DEFINITION
      type Query { a: Int @meta(s: "x") @deprecated(reason: "old") }
    `)
    expect(g.queries.a.directives).toEqual([
      { $ref: DEPRECATED, meta: { reason: "old" } },
      { $ref: META, meta: { s: "x" } },
    ])
  })
})

describe("G11 build from SDL: custom directives", () => {
  const SDL = `
    directive @meta(i: Int, f: Float, b: Boolean, s: String, e: Color, l: [Int], o: Nested, n: String)
      repeatable on SCHEMA | SCALAR | OBJECT | FIELD_DEFINITION | ARGUMENT_DEFINITION | INTERFACE | UNION | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION
    "tags a thing"
    directive @tag("tag name" name: String! = "x") repeatable on FIELD_DEFINITION | OBJECT
    directive @plain on FIELD_DEFINITION
    schema @meta(s: "schema") { query: Query }
    enum Color @meta(s: "enum") { RED @meta(s: "value") GREEN }
    input Nested @meta(s: "input") { a: Int @meta(s: "inputField") }
    scalar S @meta(s: "scalar")
    interface I @meta(s: "interface") { x: Int }
    union U @meta(s: "union") = T
    type T implements I @meta(s: "object") @tag(name: "a") @tag(name: "b") {
      x: Int @meta(i: 1, f: 1.5, b: true, s: "str", e: RED, l: [1, 2], o: { a: 1 }, n: null) @plain
      y(arg: Int @meta(s: "argument")): Int
    }
    type Query { t: T, u: U, s: S, c: Color, n(i: Nested): Int }
  `
  const graphapi: any = build(SDL)

  it("G11.1 describes directive definitions with title, description, locations, repeatable and args", () => {
    expect(graphapi.components.directives.tag).toEqual({
      title: "tag",
      description: "tags a thing",
      locations: ["FIELD_DEFINITION", "OBJECT"],
      args: { name: { description: "tag name", type: "String", nonNull: true, default: "x" } },
      repeatable: true,
    })
    expect(graphapi.components.directives.plain).toEqual({
      title: "plain",
      locations: ["FIELD_DEFINITION"],
      repeatable: false,
    })
    expect(graphapi.components.directives.meta.locations).toEqual([
      "SCHEMA",
      "SCALAR",
      "OBJECT",
      "FIELD_DEFINITION",
      "ARGUMENT_DEFINITION",
      "INTERFACE",
      "UNION",
      "ENUM",
      "ENUM_VALUE",
      "INPUT_OBJECT",
      "INPUT_FIELD_DEFINITION",
    ])
  })

  it("G11.2 lists every custom directive definition and leaves out the unused built-ins (skip, include, deprecated, specifiedBy)", () => {
    expect(Object.keys(graphapi.components.directives).sort()).toEqual(["meta", "plain", "tag"])
  })

  it("G11.3 represents a usage as { $ref, meta } and omits meta when there are no arguments", () => {
    expect(graphapi.components.objects.T.methods.x.directives[1]).toEqual({ $ref: "#/components/directives/plain" })
    expect(graphapi.components.objects.T.methods.y.args.arg.directives).toEqual([
      { $ref: META, meta: { s: "argument" } },
    ])
  })

  it("G11.4 captures usages on SCALAR, OBJECT, FIELD_DEFINITION, ARGUMENT_DEFINITION, INTERFACE, UNION, ENUM, INPUT_OBJECT and INPUT_FIELD_DEFINITION", () => {
    expect(metaOf(graphapi.components.scalars.S)).toEqual({ s: "scalar" })
    expect(metaOf(graphapi.components.objects.T)).toEqual({ s: "object" })
    expect(graphapi.components.objects.T.methods.x.directives[0].$ref).toBe(META)
    expect(metaOf(graphapi.components.objects.T.methods.y.args.arg)).toEqual({ s: "argument" })
    expect(metaOf(graphapi.components.interfaces.I)).toEqual({ s: "interface" })
    expect(metaOf(graphapi.components.unions.U)).toEqual({ s: "union" })
    expect(metaOf(graphapi.components.enums.Color)).toEqual({ s: "enum" })
    expect(metaOf(graphapi.components.inputObjects.Nested)).toEqual({ s: "input" })
    expect(metaOf(graphapi.components.inputObjects.Nested.properties.a)).toEqual({ s: "inputField" })
  })

  // ISSUE-GA-06 (fixed in 0.6.0): SCHEMA location usages are not captured (the document has no slot for schema directives)
  it("G11.5 captures usages on the SCHEMA location", () => {
    expect(graphapi.directives).toEqual([{ $ref: META, meta: { s: "schema" } }])
  })

  // ISSUE-GA-06 (fixed in 0.6.0): ENUM_VALUE location usages are not captured
  it("G11.6 captures usages on the ENUM_VALUE location", () => {
    expect(graphapi.components.enums.Color.values.RED.directives).toEqual([{ $ref: META, meta: { s: "value" } }])
    expect(graphapi.components.enums.Color.values.GREEN).toEqual({})
  })

  it("G11.7 keeps String, Boolean, Enum, null values of directive arguments", () => {
    const meta: any = metaOf(graphapi.components.objects.T.methods.x)
    expect(meta.s).toBe("str")
    expect(meta.b).toBe(true)
    expect(meta.e).toBe("RED")
    expect(meta.n).toBeNull()
  })

  // ISSUE-GA-03 (fixed in 0.6.0): IntValue/FloatValue directive arguments are stored as strings ("1", "1.5"), so @meta(i: 1) and @meta(s: "1") become indistinguishable
  it("G11.8 keeps Int and Float directive arguments as JSON numbers (spec: IntValue and FloatValue are numeric literals)", () => {
    const meta: any = metaOf(graphapi.components.objects.T.methods.x)
    expect(meta.i).toBe(1)
    expect(meta.f).toBe(1.5)
  })

  // ISSUE-GA-03 (fixed in 0.6.0): list and object directive arguments keep the stringified numbers inside
  it("G11.9 keeps list and input object directive arguments with typed items", () => {
    const meta: any = metaOf(graphapi.components.objects.T.methods.x)
    expect(meta.l).toEqual([1, 2])
    expect(meta.o).toEqual({ a: 1 })
  })

  // ISSUE-GA-07 (fixed in 0.6.0): only one usage of a repeatable directive was kept
  it("G11.10 keeps every usage of a repeatable directive as its own entry, in source order", () => {
    expect(graphapi.components.objects.T.directives).toEqual([
      { $ref: META, meta: { s: "object" } },
      { $ref: "#/components/directives/tag", meta: { name: "a" } },
      { $ref: "#/components/directives/tag", meta: { name: "b" } },
    ])
  })

  it("G11.11 default values of directive arguments are not applied to usages (only provided arguments are meta)", () => {
    const g: any = build(`
      directive @limit(offset: Int = 0, limit: Int = 20) on FIELD_DEFINITION
      type Query { a: Int @limit, b: Int @limit(limit: 5) }
    `)
    expect(g.queries.a.directives).toEqual([{ $ref: "#/components/directives/limit" }])
    // the value type of `limit` is covered by G11.8, only the set of provided arguments matters here
    expect(Object.keys(g.queries.b.directives[0].meta)).toEqual(["limit"])
  })
})

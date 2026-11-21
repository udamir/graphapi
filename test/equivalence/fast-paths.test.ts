// Test plan block E: the direct paths (buildFromSchema without the IR, printSchema without lift) produce exactly what
// the IR paths produce: the same document with the same key order, the same SDL, the same errors
import { Kind, extendSchema, parse, print } from "graphql"

import { fromGraphQLSchema, fromIR, printIR, printSchema, toIR, buildFromSchema } from "../../src/index"
import type { GraphApiSchema } from "../../src/index"
import { printAnyDescription, printDescription } from "../../src/print"
import { printString } from "../../src/utils"
import { CASES } from "../../docs/.vitepress/theme/cases"
import { fixtures, schemaOf } from "../helpers/schema"

const TRICKY: Record<string, string> = {
  "extensions and their directives": `
    directive @tag(name: String) repeatable on OBJECT | FIELD_DEFINITION | SCHEMA | ENUM | ENUM_VALUE | INPUT_OBJECT
    schema @tag(name: "s") { query: Query }
    type Query @tag(name: "q") { a: Int }
    enum E @tag(name: "e") { A @tag(name: "a") B }
    input I @tag(name: "i") { x: Int = 1 }
  `,
  "overridden built-in directives": `
    "Override"
    directive @deprecated(reason: String = "No longer supported", since: String) on OBJECT | FIELD_DEFINITION | ENUM_VALUE | ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION
    directive @specifiedBy(url: String!, note: String) on SCALAR
    scalar Date @specifiedBy(url: "https://example.com", note: "n")
    type Old @deprecated(reason: "type") { a: Int @deprecated(since: "1"), b(x: Int @deprecated): Int }
    type Query { old: Old, d: Date }
  `,
  "custom root names and a type named like a default root": `
    "API"
    schema { query: Root, mutation: Mutate }
    type Root { q: Query, m: Mutation }
    type Mutate { x: Int }
    type Query { y: Int }
    type Mutation { z: Int }
  `,
  "roots with interfaces, descriptions and directives": `
    directive @meta(v: Int) on OBJECT
    interface Node { id: ID! }
    "The root" type Query implements Node @meta(v: 1) { id: ID!, node: Node }
    type Subscription implements Node { id: ID! }
  `,
  "every default value kind": `
    enum Color { RED GREEN }
    input Point { x: Int! = 0, y: Float, tag: String = "p", c: Color = RED, list: [Int!] = [1, 2], nested: Point }
    type Query {
      f(
        i: Int = 1, fl: Float = 1.5, s: String = "a\\"b", id: ID = 7, b: Boolean = false, n: String = null,
        e: Color = GREEN, l: [Color!]! = [RED, GREEN], single: [Int] = 3, o: Point = { x: 1, y: 2.5, tag: "t", c: GREEN, list: [3], nested: { x: 2 } }
      ): Int
    }
  `,
  "directive arguments of every kind, and repeats": `
    enum Level { LOW HIGH }
    input Opt { a: Int, b: [String] }
    directive @d(i: Int, f: Float, s: String, b: Boolean, l: Level, o: Opt, li: [Int!], untyped: String) repeatable on FIELD_DEFINITION | ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION | ENUM_VALUE
    type Query {
      a(x: Int @d(i: 1) @d(i: 2)): Int @d(i: 1, f: 2.5, s: "s", b: true, l: HIGH, o: { a: 1, b: ["x"] }, li: [1, 2]) @deprecated(reason: "r")
      b: Int @d(s: null)
    }
    input I { x: Int @d(i: 3) @deprecated }
    enum E { A @d(l: LOW) @deprecated(reason: "No longer supported") }
  `,
  "descriptions on everything, plain and not": `
    """
    Multi-line
      indented
    """
    schema { query: Query }
    "  leading space" scalar S
    "trailing quote\\"" type T { "a\\\\b" a(" arg " x: Int, "y" y: String): Int }
    "${"long ".repeat(20)}" type Query { "${" long".repeat(20)}" t: T, s: S }
    "line\\nbreak" enum E { "v" V }
    "tab\\tseparated" input I { "f" f: Int }
    """
      common indent
    """
    union U = T
  `,
  "elements with every combination of description, deprecation, directives, arguments and defaults": `
    directive @d(n: Int) repeatable on FIELD_DEFINITION | ARGUMENT_DEFINITION | INPUT_FIELD_DEFINITION | ENUM_VALUE
    type Query {
      "described and deprecated" a(
        "described and deprecated" x: Int = 1 @deprecated(reason: "x") @d(n: 1)
        y: Int @deprecated
        "described" z: Int = 2
        w: [Int!]! @d(n: 2)
      ): [Int!] @deprecated(reason: "a") @d(n: 1) @d(n: 2)
      "described" b: Int @deprecated
      c(x: Int): Int @d(n: 3)
      d: Int @deprecated(reason: "No longer supported")
    }
    input I { "f" f: Int = 1 @deprecated(reason: "f") @d(n: 4), g: Int @deprecated, h: [I!] }
    enum E { "v" V @deprecated(reason: "v") @d(n: 5), W @d(n: 6), X @deprecated }
  `,
  "plain descriptions around the 70 character line break rule": [65, 69, 70, 71, 72, 90]
    .flatMap((n) => [`"${"d".repeat(n)}" type T${n} { a: Int }`, `"${" " + "s".repeat(n - 1)}" type S${n} { a: Int }`])
    .concat([`type Query { ${[65, 69, 70, 71, 72, 90].map((n) => `t${n}: T${n}, s${n}: S${n}`).join(", ")} }`])
    .join("\n"),
  "unions, interfaces and empty types": `
    interface A { a: Int }
    interface B implements A { a: Int, b: Int }
    type X implements A & B { a: Int, b: Int }
    type Y implements A { a: Int }
    union U = X | Y
    type Query { u: U, x: X }
  `,
}

const sources: [string, string][] = [
  ...fixtures(),
  ...CASES.map(({ id, sdl }): [string, string] => [`docs example ${id}`, sdl]),
  ...Object.entries(TRICKY),
]

const json = (value: unknown): string => JSON.stringify(value)

describe("E1 buildFromSchema equals fromIR(fromGraphQLSchema(schema)), key order included", () => {
  it.each(sources)("E1.1 %s", (_, sdl) => {
    const schema = schemaOf(sdl)
    expect(json(buildFromSchema(schema))).toBe(json(fromIR(fromGraphQLSchema(schema))))
  })

  it("E1.2 a schema with extension nodes", () => {
    const base = schemaOf(
      `directive @tag(n: Int) repeatable on OBJECT | ENUM | ENUM_VALUE\ntype Query { a: Int }\nenum E { A }`,
    )
    const schema = extendSchema(
      base,
      parse(`extend type Query @tag(n: 1) { b: Int } extend enum E @tag(n: 2) { B @tag(n: 3) }`),
    )
    expect(json(buildFromSchema(schema))).toBe(json(fromIR(fromGraphQLSchema(schema))))
  })

  it("E1.3 rejects what fromGraphQLSchema rejects, with the same message", () => {
    expect(() => buildFromSchema({} as any)).toThrow("fromGraphQLSchema: a GraphQLSchema instance is expected")
    expect(() => fromGraphQLSchema({} as any)).toThrow("fromGraphQLSchema: a GraphQLSchema instance is expected")
  })
})

// a fuzzed set of descriptions: every character class the block string rules distinguish
const fuzzedDocument = (): GraphApiSchema => {
  let seed = 7
  const random = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n
  const alphabet = [
    "a",
    "b",
    " ",
    " ",
    "\t",
    "\n",
    "\r",
    '"',
    '"""',
    "\\",
    "\u0001",
    "\u007f",
    "\u0085",
    "é",
    "😀",
    "x".repeat(40),
  ]
  const queries: Record<string, any> = {}
  for (let i = 0; i < 3000; i++) {
    let description = ""
    for (let j = random(12); j > 0; j--) description += alphabet[random(alphabet.length)]
    queries[`f${i}`] = { description, type: "Int", args: { a: { description, type: "String", default: description } } }
  }
  return { graphapi: "1.0", queryTypeName: "Query", description: "Fuzzed", queries }
}

describe("E2 printSchema equals printIR(toIR(doc))", () => {
  it.each(sources)("E2.1 %s", (_, sdl) => {
    const doc = buildFromSchema(schemaOf(sdl))
    expect(printSchema(doc)).toBe(printIR(toIR(doc)))
  })

  it("E2.2 fuzzed descriptions and string defaults", () => {
    const doc = fuzzedDocument()
    expect(printSchema(doc)).toBe(printIR(toIR(doc)))
  })

  it("E2.3 hand-written documents: omitted root names, deprecations without usages, untyped meta, odd keys", () => {
    const docs: any[] = [
      { graphapi: "1.0" },
      { graphapi: "1.0", queries: { a: { type: "Int" } } },
      { graphapi: "1.0", queryTypeName: "Q", queries: { a: { type: "Int", deprecation: { reason: "" } } } },
      {
        graphapi: "1.0",
        queries: {
          a: {
            $ref: "#/components/inputObjects/I",
            directives: [{ $ref: "#/components/directives/x", meta: { n: 1.5, l: [true], o: { k: "v" }, z: null } }],
          },
        },
        components: {
          inputObjects: { I: { title: "I", type: "input", properties: { constructor: { type: "Int", default: 1 } } } },
        },
      },
      {
        graphapi: "1.0",
        queries: {
          a: {
            type: "Int",
            args: { x: { $ref: "#/components/inputObjects/I", default: { constructor: 1, other: "s" } } },
          },
        },
        components: { inputObjects: { I: { title: "I", type: "input", properties: {} } } },
      },
      // a component named like a root type is replaced by the root type
      {
        graphapi: "1.0",
        queries: { a: { type: "Int" } },
        components: {
          objects: {
            Query: { title: "Query", type: "object", methods: { b: { type: "Int" } } },
            A: { title: "A", type: "object", methods: {} },
          },
        },
      },
    ]
    for (const doc of docs) {
      expect(printSchema(doc)).toBe(printIR(toIR(doc)))
    }
  })

  it("E2.4 malformed documents fail with the same message", () => {
    const query = (usage: object) => ({ graphapi: "1.0", queries: { a: usage } })
    const docs: unknown[] = [
      null,
      "doc",
      {},
      { graphapi: "0.1.2" },
      { graphapi: 1.0 },
      query({ description: "no type" }),
      query({ type: "Date" }),
      query({ $ref: "#/components/scalars/D", type: "Int" }),
      query({ type: "list" }),
      query({ type: "list", items: "Int" }),
      query({ type: "Int", args: { x: { type: "object" } } }),
      { graphapi: "1.0", components: { objects: { U: { title: "U", type: "union", oneOf: [] } } } },
      {
        graphapi: "1.0",
        components: {
          enums: { E: { title: "E", type: "enum", values: { A: { directives: [{ $ref: "#/x/y" }] } } } },
          scalars: { S: { title: "S" } },
        },
      },
    ]
    const failure = (fn: () => unknown): string => {
      try {
        fn()
      } catch (error) {
        return `${(error as Error).constructor.name}: ${(error as Error).message}`
      }
      return "no error"
    }
    for (const doc of docs) {
      const expected = failure(() => printIR(toIR(doc as GraphApiSchema)))
      expect(expected).not.toBe("no error")
      expect(failure(() => printSchema(doc as GraphApiSchema))).toBe(expected)
    }
  })
})

describe("E3 the string fast paths equal the general forms", () => {
  // every character class the rules distinguish, at every length around the 70 character line break rule
  const corpus = (): string[] => {
    const result: string[] = []
    let seed = 11
    const random = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n
    const alphabet = [
      "a",
      "Z",
      " ",
      "\t",
      "\n",
      "\r",
      '"',
      "\\",
      "\u0000",
      "\u001f",
      "\u007f",
      "\u0085",
      "\u009f",
      "é",
      "😀",
    ]
    for (let length = 0; length <= 90; length++) {
      result.push("d".repeat(length), " ".repeat(length), " " + "s".repeat(length), "s".repeat(length) + " ")
      for (let k = 0; k < 20; k++) {
        let value = ""
        while (value.length < length) value += random(3) ? "w" : alphabet[random(alphabet.length)]
        result.push(value)
      }
    }
    return result
  }

  it("E3.1 printDescription equals printAnyDescription for every indent and position", () => {
    for (const value of corpus()) {
      if (!value) continue
      for (const [indent, first] of [
        ["", true],
        ["  ", true],
        ["  ", false],
        ["    ", false],
      ] as const) {
        expect(printDescription(value, indent, first), JSON.stringify(value)).toBe(
          printAnyDescription(value, indent, first),
        )
      }
    }
  })

  it("E3.2 printString equals the string literal graphql-js prints", () => {
    for (const value of corpus()) {
      expect(printString(value), JSON.stringify(value)).toBe(print({ kind: Kind.STRING, value }))
    }
  })
})

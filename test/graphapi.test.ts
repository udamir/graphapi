import path from "path"
import fs from "fs"
import * as YAML from "js-yaml"

import { buildFromIntrospection, buildFromSchema, printSchema } from "../src/index"
import { buildSchema, getIntrospectionQuery, graphqlSync } from "graphql"

const loadFile = (filename: string): string => {
  const resPath = path.join(__dirname, "./resources/", filename)
  return fs.readFileSync(resPath, "utf8")
}

describe("Build GraphApi", () => {
  it("should be nullable query for Scalar result", () => {
    const raw = `
    type Query {
      "A Query with 1 required argument and 1 optional argument"
      todo(
        id: ID!
    
        "A default value of false"
        isCompleted: Boolean = false
      ): String
    }
    `
    const graphapi = buildFromSchema(buildSchema(raw, { noLocation: true }))

    expect(graphapi.queries!.todo).toMatchObject({ type: "String" })
    expect(graphapi.queries!.todo.nonNull).toBeUndefined()
  })

  it("should build graphapi from graphql schema", async () => {
    const source = loadFile("example.graphql")
    const schema = buildSchema(source, { noLocation: true })
    const graphapi = buildFromSchema(schema)

    const example = YAML.load(loadFile("example.yaml")) as object

    expect(graphapi).toMatchObject(example)
  })

  it("should build graphapi from introspection", async () => {
    const source = loadFile("example.graphql")
    const schema = buildSchema(source, { noLocation: true })
    const introspection: any = graphqlSync({
      schema,
      source: getIntrospectionQuery({ inputValueDeprecation: true, schemaDescription: true, specifiedByUrl: true }),
    }).data
    const graphapi = buildFromIntrospection(introspection)

    const example = YAML.load(loadFile("example.yaml")) as any

    delete example.queries.todos.directives

    expect(graphapi).toMatchObject(example)
  })
})

describe("Print schema from GraphApi", () => {
  it("should build the same graphapi from printed graphql schema", async () => {
    const source = loadFile("example.graphql")
    const schema = buildSchema(source, { noLocation: true })
    const graphapi = buildFromSchema(schema)

    const source2 = printSchema(graphapi)
    const schema2 = buildSchema(source2, { noLocation: true })
    const graphapi2 = buildFromSchema(schema2)

    expect(graphapi).toMatchObject(graphapi2)
  })
})

describe("Enums", () => {
  it("should build enum values with descriptions and deprecation", () => {
    const source = `
      enum Color {
        BLUE
        "Red color"
        RED @deprecated
        "Green color"
        GREEN @deprecated(reason: "not used")
      }
    `
    const schema = buildSchema(source, { noLocation: true })
    const graphapi = buildFromSchema(schema)

    expect(graphapi).toMatchObject({
      components: {
        enums: {
          Color: {
            title: "Color",
            type: "enum",
            values: {
              BLUE: {},
              RED: { description: "Red color", deprecation: { reason: "No longer supported" } },
              GREEN: { description: "Green color", deprecation: { reason: "not used" } },
            },
          },
        },
      },
    })
    expect(Object.keys(graphapi.components!.enums!.Color.values)).toEqual(["BLUE", "RED", "GREEN"])
  })
})

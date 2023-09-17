import path from "path"
import fs from "fs"
import YAML from "js-yaml"

import { buildFromIntrospection, buildFromSchema, printSchema } from "../src/index"
import { buildSchema } from "graphql"

const loadFile = (filename: string): string => {
  const resPath = path.join(__dirname, "./resources/", filename)
  return fs.readFileSync(resPath, "utf8")
}

describe("Build GraphApi", () => {
  it("should build graphapi from graphql schema", async () => {

    const source = loadFile("example.graphql")
    const schema = buildSchema(source, { noLocation: true })
    const graphapi = buildFromSchema(schema)

    const example = YAML.load(loadFile("example.yaml")) as object

    expect(graphapi).toMatchObject(example)
  })

  it("should build graphapi from introspection", async () => {

    const source = JSON.parse(loadFile("example.json"))
    const graphapi = buildFromIntrospection(source)

    const example = YAML.load(loadFile("example.yaml")) as object

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

describe("Test options", () => {
  it("should enabled simple enum by default for graphql schema", () => {
    const source = `
      enum Color {
        RED
        GREEN
      }
    `
    const schema = buildSchema(source, { noLocation: true })
    const graphapi = buildFromSchema(schema)

    expect(graphapi).toMatchObject({
      components: {
        enums: {
          Color: {
            title: 'Color',
            type: 'string',
            enum: ['RED', 'GREEN']
          }
        }
      }
    })
  })

  it("should disable simple enum with option  for graphql schema", () => {
    const source = `
      enum Color {
        RED
        GREEN
      }
    `
    const schema = buildSchema(source, { noLocation: true })
    const graphapi = buildFromSchema(schema, { disableStringEnums: true })

    expect(graphapi).toMatchObject({
      components: {
        enums: {
          Color: {
            title: 'Color',
            type: 'string',
            values: [
              { value: 'RED' },
              { value: 'GREEN' }
            ]
          }
        }
      }
    })
  })
})

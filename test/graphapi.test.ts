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
    const graphapi = buildFromSchema(schema, { nullableArrayType: true })

    const example = YAML.load(loadFile("example.yaml")) as object

    expect(graphapi).toMatchObject(example)
  })

  it("should build graphapi from introspection", async () => {

    const source = JSON.parse(loadFile("example.json"))
    const graphapi = buildFromIntrospection(source, { nullableArrayType: true })

    const example = YAML.load(loadFile("example.yaml")) as object

    expect(graphapi).toMatchObject(example)
  })

  it("should build graphapi from introspection", async () => {

    const source = JSON.parse(loadFile("example.json"))
    const graphapi = buildFromIntrospection(source, { nullableArrayType: false, enumItemsAsConst: true })

    const example2 = YAML.load(loadFile("example2.yaml")) as object

    expect(graphapi).toMatchObject(example2)
  })
})


describe("Print schema from GraphApi", () => {
  it("should build the same graphapi from printed graphql schema", async () => {

    const source = loadFile("example.graphql")
    const schema = buildSchema(source, { noLocation: true })
    const graphapi = buildFromSchema(schema, { nullableArrayType: true })

    const source2 = printSchema(graphapi)
    const schema2 = buildSchema(source2, { noLocation: true })
    const graphapi2 = buildFromSchema(schema2, { nullableArrayType: true })

    expect(graphapi).toMatchObject(graphapi2)
  })
})

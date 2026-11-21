// Test plan block I6: for every fixture, buildFromSchema deep-equals buildFromIntrospection(introspectionFromSchema(schema))
// apart from custom directive usages, which introspection cannot carry (README)
import { introspectionFromSchema } from "graphql"

import { buildFromIntrospection, buildFromSchema } from "../../src/index"
import { fixtures, schemaOf, withoutCustomUsages } from "../helpers/schema"

describe("I6 build from introspection: parity on every fixture", () => {
  for (const [name, sdl] of fixtures()) {
    const schema = schemaOf(sdl)
    if (!schema.getQueryType()) {
      // graphql cannot execute an introspection query against a schema without a Query root
      it(`I6.0 ${name} has no Query root, introspection is not possible`, () => {
        expect(() => introspectionFromSchema(schema)).toThrow(/Query root type must be provided/)
      })
      continue
    }
    const introspection = introspectionFromSchema(schema)

    it(`I6.1 ${name}`, () => {
      expect(withoutCustomUsages(buildFromIntrospection(introspection))).toEqual(
        withoutCustomUsages(buildFromSchema(schema)),
      )
    })
  }
})

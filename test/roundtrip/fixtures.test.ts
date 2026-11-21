// Test plan block R3: every fixture (README example and the fork's SDL fixtures under test/resources/fork) round-trips
import { buildFromSchema, printSchema } from "../../src/index"
import { canonical, fixtures, roundTrip, schemaOf } from "../helpers/schema"

describe("R3 round trip: fixtures", () => {
  for (const [name, sdl] of fixtures()) {
    it(`R3.1 ${name}: print(build(sdl)) is equivalent to sdl and build(print(build(sdl))) is a fixed point`, () => {
      const { source, reparsed, graphapi, graphapi2, printed } = roundTrip(sdl)
      expect(canonical(reparsed)).toBe(canonical(source))
      expect(graphapi2).toEqual(graphapi)
      expect(printSchema(graphapi2)).toBe(printed)
    })
  }

  it("R3.3 an overridden built-in directive is kept as a definition and as usages, and printed (fork fixture)", () => {
    const [, sdl] = fixtures().find(([name]) => name.endsWith("overriden_default_directive.graphql"))!
    const graphapi: any = buildFromSchema(schemaOf(sdl))
    expect(graphapi.components.directives.deprecated).toMatchObject({
      title: "deprecated",
      description: "Override deprecation usage.",
      locations: ["INPUT_OBJECT"],
    })
    expect(graphapi.components.inputObjects.MessageInput.directives).toEqual([
      { $ref: "#/components/directives/deprecated", meta: { reason: "Deprecated input object" } },
    ])
    const printed = printSchema(graphapi)
    expect(printed).toContain(
      '"""Override deprecation usage."""\ndirective @deprecated(reason: String = "No longer supported") on INPUT_OBJECT',
    )
    expect(printed).toContain('input MessageInput @deprecated(reason: "Deprecated input object") {')
  })
})

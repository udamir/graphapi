/**
 * SchemaIR — the intermediate representation shared by every front-end
 * (`fromGraphQLSchema`, `fromIntrospection`, `lift`) and every back-end
 * (`fromIR`, `printIR`).
 *
 * Plain objects and Maps only, no classes. Every kind is explicit, every value is
 * typed (`TypedValue`), every directive usage is kept (arrays, repeatable-safe) and
 * the schema definition (root names, description, directives) is a first-class node.
 */

export const DEFAULT_DEPRECATION_REASON = "No longer supported"

export const BUILTIN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"])

export type TypeKind = "scalar" | "object" | "interface" | "union" | "enum" | "input"

export type TypeRef =
  | { kind: "named"; name: string; nonNull: boolean }
  | { kind: "list"; of: TypeRef; nonNull: boolean }

/** A JavaScript value together with the GraphQL type it was written for */
export interface TypedValue {
  type: TypeRef
  value: unknown
}

/** One directive usage (`@name(arg: value)`), argument values typed by the directive definition */
export interface Usage {
  name: string
  args: ReadonlyMap<string, TypedValue>
}

export interface Deprecation {
  // always the resolved reason (the spec default when none was given)
  reason: string
}

export interface InputValue {
  name: string
  description?: string
  directives: readonly Usage[]
  deprecation?: Deprecation
  type: TypeRef
  default?: TypedValue
}

export interface Field {
  name: string
  description?: string
  directives: readonly Usage[]
  deprecation?: Deprecation
  args: ReadonlyMap<string, InputValue>
  type: TypeRef
}

export interface EnumValue {
  name: string
  description?: string
  directives: readonly Usage[]
  deprecation?: Deprecation
}

export interface NamedType {
  kind: TypeKind
  name: string
  description?: string
  directives: readonly Usage[]
  // scalar
  specifiedByURL?: string
  // object, interface
  fields?: ReadonlyMap<string, Field>
  interfaces?: readonly string[]
  // input
  inputFields?: ReadonlyMap<string, InputValue>
  // union
  members?: readonly string[]
  // enum
  values?: ReadonlyMap<string, EnumValue>
}

export interface DirectiveDef {
  name: string
  description?: string
  locations: readonly string[]
  args: ReadonlyMap<string, InputValue>
  repeatable: boolean
  // true for the specified directives (skip, include, deprecated, specifiedBy, oneOf) in their spec shape;
  // a directive with a built-in name but a different definition is an override and is not built-in
  builtin: boolean
}

export interface RootNames {
  query?: string
  mutation?: string
  subscription?: string
}

export interface SchemaIR {
  description?: string
  directives: readonly Usage[]
  roots: RootNames
  // every named type except the built-in scalars and the introspection types, root types included
  types: Map<string, NamedType>
  directiveDefs: Map<string, DirectiveDef>
}

export const NO_USAGES: readonly Usage[] = []
export const NO_ARGS: ReadonlyMap<string, InputValue> = new Map()
export const NO_VALUES: ReadonlyMap<string, TypedValue> = new Map()

export const namedType = (name: string, nonNull = false): TypeRef => ({ kind: "named", name, nonNull })
export const listType = (of: TypeRef, nonNull = false): TypeRef => ({ kind: "list", of, nonNull })

export const DEFAULT_ROOT_NAMES: Required<RootNames> = {
  query: "Query",
  mutation: "Mutation",
  subscription: "Subscription",
}

export const ROOT_KINDS = ["query", "mutation", "subscription"] as const
export type RootKind = (typeof ROOT_KINDS)[number]

/** Names of the root operation types as a Set, for fast "is this a root" checks */
export const rootNames = (roots: RootNames): Set<string> => {
  const names = new Set<string>()
  for (const kind of ROOT_KINDS) {
    const name = roots[kind]
    if (name) {
      names.add(name)
    }
  }
  return names
}

// Specified directives, in the shape graphql-js defines them. A directive with one of these
// names is treated as built-in only when its locations and argument names match.
// `optionalLocations` were added to a built-in by a later graphql-js release (graphql@16.14 and 17 allow
// `@deprecated` on DIRECTIVE_DEFINITION); a definition with or without them is still the built-in one
const SPECIFIED_DIRECTIVES: Record<string, { locations: string[]; optionalLocations?: string[]; args: string[] }> = {
  skip: { locations: ["FIELD", "FRAGMENT_SPREAD", "INLINE_FRAGMENT"], args: ["if"] },
  include: { locations: ["FIELD", "FRAGMENT_SPREAD", "INLINE_FRAGMENT"], args: ["if"] },
  deprecated: {
    locations: ["FIELD_DEFINITION", "ARGUMENT_DEFINITION", "INPUT_FIELD_DEFINITION", "ENUM_VALUE"],
    optionalLocations: ["DIRECTIVE_DEFINITION"],
    args: ["reason"],
  },
  specifiedBy: { locations: ["SCALAR"], args: ["url"] },
  oneOf: { locations: ["INPUT_OBJECT"], args: [] },
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) {
    return false
  }
  const set = new Set(a)
  return b.every((item) => set.has(item))
}

export const isSpecifiedDirectiveShape = (
  name: string,
  locations: readonly string[],
  argNames: readonly string[],
): boolean => {
  const spec = SPECIFIED_DIRECTIVES[name]
  if (!spec || !sameSet(spec.args, argNames)) {
    return false
  }
  const optional = spec.optionalLocations ?? []
  const required = locations.filter((location) => !optional.includes(location))
  return sameSet(spec.locations, required)
}

/** The deprecation marker directive is only a usage when its definition was overridden */
export const isBuiltinDirective = (ir: Pick<SchemaIR, "directiveDefs">, name: string): boolean => {
  const def = ir.directiveDefs.get(name)
  return def ? def.builtin : name in SPECIFIED_DIRECTIVES
}

/** Infers a type for a value whose argument definition is unknown (invalid or incomplete input) */
export const inferTypeRef = (value: unknown): TypeRef => {
  if (Array.isArray(value)) {
    return listType(value.length ? inferTypeRef(value[0]) : namedType("String"))
  }
  switch (typeof value) {
    case "number":
      return namedType(Number.isInteger(value) ? "Int" : "Float")
    case "boolean":
      return namedType("Boolean")
    default:
      return namedType("String")
  }
}

/** Turns null-prototype objects (as graphql-js creates them for input object values) into plain objects, recursively */
export const plainValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(plainValue)
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value as object)) {
      result[key] = plainValue((value as Record<string, unknown>)[key])
    }
    return result
  }
  return value
}

export const deprecationOf = (
  reason: string | null | undefined,
  isDeprecated = reason != null,
): Deprecation | undefined => {
  return isDeprecated ? { reason: reason || DEFAULT_DEPRECATION_REASON } : undefined
}

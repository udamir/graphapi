import { parseValue, valueFromASTUntyped } from "graphql"
import type {
  IntrospectionDirective,
  IntrospectionEnumValue,
  IntrospectionField,
  IntrospectionInputValue,
  IntrospectionQuery,
  IntrospectionType,
  IntrospectionTypeRef,
} from "graphql"

import {
  DirectiveDef,
  EnumValue,
  Field,
  InputValue,
  NamedType,
  SchemaIR,
  TypeRef,
  NO_ARGS,
  NO_USAGES,
  BUILTIN_SCALARS,
  deprecationOf,
  isSpecifiedDirectiveShape,
  plainValue,
} from "./ir"

const typeRef = (type: IntrospectionTypeRef, nonNull = false): TypeRef => {
  if (type.kind === "NON_NULL") {
    return typeRef(type.ofType, true)
  }
  if (type.kind === "LIST") {
    return { kind: "list", of: typeRef(type.ofType), nonNull }
  }
  return { kind: "named", name: type.name, nonNull }
}

const typeKind = (kind: IntrospectionType["kind"]): NamedType["kind"] => {
  switch (kind) {
    case "SCALAR":
      return "scalar"
    case "OBJECT":
      return "object"
    case "INTERFACE":
      return "interface"
    case "UNION":
      return "union"
    case "ENUM":
      return "enum"
    case "INPUT_OBJECT":
      return "input"
    default:
      throw new Error(`Unsupported type kind: ${kind}`)
  }
}

/**
 * Brings a value parsed without type information into the JavaScript shape the SDL front-end
 * produces for the same literal (graphql-js prints an integer-like `ID`/`String` as an IntValue,
 * and input objects as plain objects).
 */
const coerce = (value: unknown, type: TypeRef, types: Map<string, NamedType>): unknown => {
  if (value === null || value === undefined) {
    return value
  }
  if (type.kind === "list") {
    return Array.isArray(value) ? value.map((item) => coerce(item, type.of, types)) : coerce(value, type.of, types)
  }
  switch (type.name) {
    case "String":
    case "ID":
      return typeof value === "number" || typeof value === "boolean" ? String(value) : value
    case "Int":
    case "Float":
    case "Boolean":
      return value
  }
  const named = types.get(type.name)
  if (named?.kind === "input" && named.inputFields && typeof value === "object" && !Array.isArray(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const field = named.inputFields.get(key)
      result[key] = field ? coerce(item, field.type, types) : item
    }
    return result
  }
  return value
}

const inputValue = (arg: IntrospectionInputValue, pending: InputValue[]): InputValue => {
  const type = typeRef(arg.type)
  const value: InputValue = { name: arg.name, directives: NO_USAGES, type }
  if (arg.description) {
    value.description = arg.description
  }
  if (arg.isDeprecated) {
    value.deprecation = deprecationOf(arg.deprecationReason, true)
  }
  if (arg.defaultValue != null) {
    value.default = { type, value: plainValue(valueFromASTUntyped(parseValue(arg.defaultValue, { noLocation: true }))) }
    pending.push(value)
  }
  return value
}

const inputValues = (
  args: ReadonlyArray<IntrospectionInputValue> | undefined,
  pending: InputValue[],
): ReadonlyMap<string, InputValue> => {
  if (!args?.length) {
    return NO_ARGS
  }
  const result = new Map<string, InputValue>()
  for (const arg of args) {
    result.set(arg.name, inputValue(arg, pending))
  }
  return result
}

const field = (item: IntrospectionField, pending: InputValue[]): Field => {
  const result: Field = {
    name: item.name,
    directives: NO_USAGES,
    args: inputValues(item.args, pending),
    type: typeRef(item.type),
  }
  if (item.description) {
    result.description = item.description
  }
  if (item.isDeprecated) {
    result.deprecation = deprecationOf(item.deprecationReason, true)
  }
  return result
}

const enumValue = (item: IntrospectionEnumValue): EnumValue => {
  const result: EnumValue = { name: item.name, directives: NO_USAGES }
  if (item.description) {
    result.description = item.description
  }
  if (item.isDeprecated) {
    result.deprecation = deprecationOf(item.deprecationReason, true)
  }
  return result
}

const namedType = (type: IntrospectionType, pending: InputValue[]): NamedType => {
  const result: NamedType = { kind: typeKind(type.kind), name: type.name, directives: NO_USAGES }
  if (type.description) {
    result.description = type.description
  }
  switch (type.kind) {
    case "SCALAR":
      if (type.specifiedByURL) {
        result.specifiedByURL = type.specifiedByURL
      }
      break
    case "OBJECT":
    case "INTERFACE": {
      const fields = new Map<string, Field>()
      for (const item of type.fields ?? []) {
        fields.set(item.name, field(item, pending))
      }
      result.fields = fields
      const interfaces = type.interfaces
      if (interfaces?.length) {
        result.interfaces = interfaces.map((item) => item.name)
      }
      break
    }
    case "UNION":
      result.members = (type.possibleTypes ?? []).map((item) => item.name)
      break
    case "ENUM": {
      const values = new Map<string, EnumValue>()
      for (const item of type.enumValues ?? []) {
        values.set(item.name, enumValue(item))
      }
      result.values = values
      break
    }
    case "INPUT_OBJECT":
      result.inputFields = inputValues(type.inputFields, pending)
      break
  }
  return result
}

const directiveDef = (directive: IntrospectionDirective, pending: InputValue[]): DirectiveDef => {
  const args = directive.args ?? []
  const def: DirectiveDef = {
    name: directive.name,
    locations: [...directive.locations],
    args: inputValues(args, pending),
    repeatable: !!directive.isRepeatable,
    builtin: isSpecifiedDirectiveShape(
      directive.name,
      directive.locations,
      args.map((arg) => arg.name),
    ),
  }
  if (directive.description) {
    def.description = directive.description
  }
  return def
}

export const fromIntrospection = (introspection: IntrospectionQuery): SchemaIR => {
  const schema = introspection?.__schema
  if (!schema || typeof schema !== "object") {
    throw new TypeError("fromIntrospection: an introspection result with a __schema is expected")
  }
  const { queryType, mutationType, subscriptionType, description, types = [], directives = [] } = schema
  const pending: InputValue[] = []

  const directiveDefs = new Map<string, DirectiveDef>()
  for (const directive of directives) {
    directiveDefs.set(directive.name, directiveDef(directive, pending))
  }

  const irTypes = new Map<string, NamedType>()
  for (const type of types) {
    if (type.name.startsWith("__") || (type.kind === "SCALAR" && BUILTIN_SCALARS.has(type.name))) {
      continue
    }
    irTypes.set(type.name, namedType(type, pending))
  }

  // defaults were parsed without type information; align them with the SDL front-end now that every type is known
  for (const value of pending) {
    value.default!.value = coerce(value.default!.value, value.type, irTypes)
  }

  const ir: SchemaIR = { directives: NO_USAGES, roots: {}, types: irTypes, directiveDefs }
  if (description) {
    ir.description = description
  }
  if (queryType?.name) {
    ir.roots.query = queryType.name
  }
  if (mutationType?.name) {
    ir.roots.mutation = mutationType.name
  }
  if (subscriptionType?.name) {
    ir.roots.subscription = subscriptionType.name
  }
  return ir
}

import {
  GraphQLArgument,
  GraphQLDirective,
  GraphQLEnumValue,
  GraphQLField,
  GraphQLInputType,
  GraphQLInputField,
  GraphQLNamedType,
  GraphQLSchema,
  GraphQLType,
  ConstDirectiveNode,
  ConstValueNode,
  specifiedDirectives,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isUnionType,
  valueFromASTUntyped,
} from "graphql"

import {
  DirectiveDef,
  EnumValue,
  Field,
  InputValue,
  NamedType,
  SchemaIR,
  TypeRef,
  TypedValue,
  Usage,
  NO_ARGS,
  NO_USAGES,
  deprecationOf,
  inferTypeRef,
  isSpecifiedDirectiveShape,
  plainValue,
  BUILTIN_SCALARS,
} from "./ir"

type WithAST = {
  astNode?: { directives?: readonly ConstDirectiveNode[] } | null
  extensionASTNodes?: readonly { directives?: readonly ConstDirectiveNode[] }[] | null
}

const typeRef = (type: GraphQLType, nonNull = false): TypeRef => {
  if (isNonNullType(type)) {
    return typeRef(type.ofType, true)
  }
  if (isListType(type)) {
    return { kind: "list", of: typeRef(type.ofType), nonNull }
  }
  return { kind: "named", name: type.name, nonNull }
}

type GraphQL17Default = { default?: { value?: unknown; literal?: ConstValueNode } }

/**
 * A default value written in the SDL, as the JavaScript value the introspection front-end produces for the same
 * literal: untyped, with integer-like `String`/`ID` literals as strings. Field defaults of input objects are not
 * merged in, so the value is the literal as written.
 */
const literalValue = (value: unknown, type: GraphQLInputType): unknown => {
  if (value === null || value === undefined) {
    return value
  }
  if (isNonNullType(type)) {
    return literalValue(value, type.ofType)
  }
  if (isListType(type)) {
    return Array.isArray(value)
      ? value.map((item) => literalValue(item, type.ofType))
      : literalValue(value, type.ofType)
  }
  if (isScalarType(type) && (type.name === "String" || type.name === "ID")) {
    return typeof value === "number" || typeof value === "boolean" ? String(value) : value
  }
  if (isInputObjectType(type) && typeof value === "object" && !Array.isArray(value)) {
    const fields = type.getFields()
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = fields[key] ? literalValue(item, fields[key].type) : item
    }
    return result
  }
  return value
}

/**
 * The default value of an argument or input field. The SDL literal is preferred (graphql@17 keeps it in
 * `default.literal`, graphql@16 in `astNode.defaultValue`): coerced values differ between graphql-js versions
 * (graphql@16 merges field defaults into input object defaults, graphql@17 cannot coerce SDL literals with
 * `valueFromAST` at all). Code-first schemas have no literal and use the configured value.
 */
export const defaultValueOf = (arg: GraphQLArgument | GraphQLInputField): unknown => {
  const config = (arg as GraphQL17Default).default
  const literal = config?.literal ?? arg.astNode?.defaultValue
  if (literal) {
    return literalValue(plainValue(valueFromASTUntyped(literal)), arg.type)
  }
  return arg.defaultValue !== undefined ? arg.defaultValue : config?.value
}

export const typeKind = (type: GraphQLNamedType): NamedType["kind"] => {
  if (isObjectType(type)) {
    return "object"
  }
  if (isInterfaceType(type)) {
    return "interface"
  }
  if (isUnionType(type)) {
    return "union"
  }
  if (isEnumType(type)) {
    return "enum"
  }
  if (isInputObjectType(type)) {
    return "input"
  }
  if (isScalarType(type)) {
    return "scalar"
  }
  throw new Error(`Unsupported type: ${(type as GraphQLNamedType).name}`)
}

class Context {
  constructor(public readonly directiveDefs: Map<string, DirectiveDef>) {}

  /**
   * Directive usages of a node, from its definition and its extensions. `deprecatable` is true for fields, arguments,
   * input fields and enum values, whose `@deprecated` usage graphql-js already resolves into `deprecationReason`;
   * there it is never kept as a usage. On types and the schema it is kept only when the directive was overridden.
   */
  usages(node: WithAST, deprecatable = false): readonly Usage[] {
    const own = node.astNode?.directives
    const extensions = node.extensionASTNodes
    if (!own?.length && !extensions?.length) {
      return NO_USAGES
    }
    const result: Usage[] = []
    if (own) {
      this.collect(own, result, deprecatable)
    }
    if (extensions) {
      for (const extension of extensions) {
        if (extension.directives) {
          this.collect(extension.directives, result, deprecatable)
        }
      }
    }
    return result.length ? result : NO_USAGES
  }

  private collect(nodes: readonly ConstDirectiveNode[], result: Usage[], deprecatable: boolean): void {
    for (const node of nodes) {
      const name = node.name.value
      const def = this.directiveDefs.get(name)
      // the spec deprecation and specifiedBy markers are modelled as properties, not as usages
      if (name === "deprecated" && (deprecatable || (def ? def.builtin : true))) {
        continue
      }
      if (name === "specifiedBy" && (def ? def.builtin : true)) {
        continue
      }
      const args = new Map<string, TypedValue>()
      if (node.arguments) {
        for (const arg of node.arguments) {
          const argName = arg.name.value
          let value = valueFromASTUntyped(arg.value)
          if (arg.value.kind === "ObjectValue" || arg.value.kind === "ListValue") {
            value = plainValue(value)
          }
          const type = def?.args.get(argName)?.type ?? inferTypeRef(value)
          args.set(argName, { type, value })
        }
      }
      result.push({ name, args })
    }
  }

  inputValue(arg: GraphQLArgument | GraphQLInputField): InputValue {
    const type = typeRef(arg.type)
    const value: InputValue = { name: arg.name, directives: this.usages(arg, true), type }
    if (arg.description) {
      value.description = arg.description
    }
    if (arg.deprecationReason != null) {
      value.deprecation = deprecationOf(arg.deprecationReason)
    }
    const defaultValue = defaultValueOf(arg)
    if (defaultValue !== undefined) {
      value.default = { type, value: plainValue(defaultValue) }
    }
    return value
  }

  inputValues(
    args: ReadonlyArray<GraphQLArgument> | Record<string, GraphQLInputField>,
  ): ReadonlyMap<string, InputValue> {
    const list = Array.isArray(args) ? args : Object.values(args)
    if (!list.length) {
      return NO_ARGS
    }
    const result = new Map<string, InputValue>()
    for (const arg of list) {
      result.set(arg.name, this.inputValue(arg))
    }
    return result
  }

  field(field: GraphQLField<unknown, unknown>): Field {
    const result: Field = {
      name: field.name,
      directives: this.usages(field, true),
      args: this.inputValues(field.args),
      type: typeRef(field.type),
    }
    if (field.description) {
      result.description = field.description
    }
    if (field.deprecationReason != null) {
      result.deprecation = deprecationOf(field.deprecationReason)
    }
    return result
  }

  fields(fields: Record<string, GraphQLField<unknown, unknown>>): Map<string, Field> {
    const result = new Map<string, Field>()
    for (const name of Object.keys(fields)) {
      result.set(name, this.field(fields[name]))
    }
    return result
  }

  enumValue(value: GraphQLEnumValue): EnumValue {
    const result: EnumValue = { name: value.name, directives: this.usages(value, true) }
    if (value.description) {
      result.description = value.description
    }
    if (value.deprecationReason != null) {
      result.deprecation = deprecationOf(value.deprecationReason)
    }
    return result
  }

  namedType(type: GraphQLNamedType): NamedType {
    const result: NamedType = { kind: typeKind(type), name: type.name, directives: this.usages(type) }
    if (type.description) {
      result.description = type.description
    }
    if (isScalarType(type)) {
      if (type.specifiedByURL) {
        result.specifiedByURL = type.specifiedByURL
      }
    } else if (isObjectType(type) || isInterfaceType(type)) {
      result.fields = this.fields(type.getFields())
      const interfaces = type.getInterfaces()
      if (interfaces.length) {
        result.interfaces = interfaces.map((item) => item.name)
      }
    } else if (isUnionType(type)) {
      result.members = type.getTypes().map((item) => item.name)
    } else if (isEnumType(type)) {
      const values = new Map<string, EnumValue>()
      for (const value of type.getValues()) {
        values.set(value.name, this.enumValue(value))
      }
      result.values = values
    } else if (isInputObjectType(type)) {
      result.inputFields = this.inputValues(type.getFields())
    }
    return result
  }
}

const directiveDef = (ctx: Context, directive: GraphQLDirective): DirectiveDef => {
  const def: DirectiveDef = {
    name: directive.name,
    locations: [...directive.locations],
    args: ctx.inputValues(directive.args),
    repeatable: directive.isRepeatable,
    builtin: isSpecifiedDirectiveShape(
      directive.name,
      directive.locations,
      directive.args.map((arg) => arg.name),
    ),
  }
  if (directive.description) {
    def.description = directive.description
  }
  return def
}

/** The specified directives (skip, include, deprecated, specifiedBy, ...) as IR definitions, from the installed graphql */
export const specifiedDirectiveDefs = (): DirectiveDef[] => {
  const ctx = new Context(new Map())
  return specifiedDirectives.map((directive) => directiveDef(ctx, directive))
}

export const fromGraphQLSchema = (schema: GraphQLSchema): SchemaIR => {
  if (!schema || typeof schema.getTypeMap !== "function") {
    throw new TypeError("fromGraphQLSchema: a GraphQLSchema instance is expected")
  }

  const directiveDefs = new Map<string, DirectiveDef>()
  const ctx = new Context(directiveDefs)
  for (const directive of schema.getDirectives()) {
    directiveDefs.set(directive.name, directiveDef(ctx, directive))
  }

  const types = new Map<string, NamedType>()
  const typeMap = schema.getTypeMap()
  for (const name of Object.keys(typeMap)) {
    if (BUILTIN_SCALARS.has(name) || name.startsWith("__")) {
      continue
    }
    types.set(name, ctx.namedType(typeMap[name]))
  }

  const ir: SchemaIR = { directives: ctx.usages(schema), roots: {}, types, directiveDefs }
  if (schema.description) {
    ir.description = schema.description
  }
  const query = schema.getQueryType()
  const mutation = schema.getMutationType()
  const subscription = schema.getSubscriptionType()
  if (query) {
    ir.roots.query = query.name
  }
  if (mutation) {
    ir.roots.mutation = mutation.name
  }
  if (subscription) {
    ir.roots.subscription = subscription.name
  }
  return ir
}

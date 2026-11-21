import type {
  GraphApiArgument,
  GraphApiComponents,
  GraphApiDeprecatable,
  GraphApiDirectiveDefinition,
  GraphApiOperation,
  GraphApiSchema,
  GraphApiTypeUsage,
  GraphApiUsage,
  GraphApiDefinition,
  GraphApiInterface,
  GraphApiEnum,
  GraphApiUnion,
  GraphApiInputObject,
  GraphApiScalar,
  GraphApiRootType,
} from "./graphapi"
import {
  DEFAULT_DEPRECATION_REASON,
  DEFAULT_ROOT_NAMES,
  Deprecation,
  DirectiveDef,
  EnumValue,
  Field,
  InputValue,
  NamedType,
  ROOT_KINDS,
  SchemaIR,
  TypeKind,
  TypeRef,
  TypedValue,
  Usage,
  NO_ARGS,
  NO_USAGES,
  NO_VALUES,
  inferTypeRef,
  isSpecifiedDirectiveShape,
  BUILTIN_SCALARS,
} from "./ir"

import { specifiedDirectiveDefs } from "./from-schema"
import { nameOfRef } from "./utils"

const BUCKETS: [keyof GraphApiComponents, TypeKind][] = [
  ["scalars", "scalar"],
  ["objects", "object"],
  ["interfaces", "interface"],
  ["unions", "union"],
  ["enums", "enum"],
  ["inputObjects", "input"],
]

const OPERATIONS = { query: "queries", mutation: "mutations", subscription: "subscriptions" } as const

class Lifter {
  constructor(private readonly doc: GraphApiSchema) {}

  private readonly directiveDefs = new Map<string, DirectiveDef>()
  private readonly types = new Map<string, NamedType>()

  private typedArgs(name: string, meta: Record<string, unknown> | undefined): ReadonlyMap<string, TypedValue> {
    if (!meta) {
      return NO_VALUES
    }
    const def = this.directiveDefs.get(name)
    const args = new Map<string, TypedValue>()
    for (const argName in meta) {
      const value = meta[argName]
      args.set(argName, { type: def?.args.get(argName)?.type ?? inferTypeRef(value), value })
    }
    return args
  }

  private directiveDef(
    name: string,
    def: { description?: string; locations: readonly string[]; repeatable?: boolean },
    args: ReadonlyMap<string, InputValue>,
  ): DirectiveDef {
    const result: DirectiveDef = {
      name,
      locations: [...def.locations],
      args,
      repeatable: !!def.repeatable,
      builtin: isSpecifiedDirectiveShape(name, def.locations, [...args.keys()]),
    }
    if (def.description) {
      result.description = def.description
    }
    return result
  }

  /** Documents omit some or all specified directive definitions; every GraphQL schema has them */
  private addSpecifiedDefs(): void {
    for (const def of specifiedDirectiveDefs()) {
      if (!this.directiveDefs.has(def.name)) {
        this.directiveDefs.set(def.name, def)
      }
    }
  }

  private rootType(
    name: string,
    meta: { description?: string; interfaces?: { $ref: string }[] } | undefined,
    directives: readonly Usage[],
    fields: Map<string, Field>,
  ): NamedType {
    const type: NamedType = { kind: "object", name, directives, fields }
    if (meta?.description) {
      type.description = meta.description
    }
    if (meta?.interfaces?.length) {
      type.interfaces = meta.interfaces.map((item) => nameOfRef(item.$ref))
    }
    return type
  }

  usages(directives: GraphApiUsage[] | undefined, deprecation?: Deprecation): readonly Usage[] {
    if (!directives?.length) {
      return NO_USAGES
    }
    const result: Usage[] = []
    for (const usage of directives) {
      const name = nameOfRef(usage.$ref)
      // the deprecation marker is already carried by `deprecation`
      if (name === "deprecated" && deprecation) {
        continue
      }
      result.push({ name, args: this.typedArgs(name, usage.meta) })
    }
    return result.length ? result : NO_USAGES
  }

  typeRef(usage: GraphApiTypeUsage): TypeRef {
    // `nonNull: true` marks a non-null position (`T!`); absence means nullable
    const nonNull = usage.nonNull === true
    const { $ref, type, items } = usage as { $ref?: unknown; type?: unknown; items?: GraphApiTypeUsage }
    if ($ref !== undefined && type !== undefined) {
      throw new Error("Unexpected type: a type usage has both $ref and type")
    }
    if (typeof $ref === "string") {
      return { kind: "named", name: nameOfRef($ref), nonNull }
    }
    if (type === "list") {
      if (!items || typeof items !== "object") {
        throw new Error("Unexpected type: a list without items")
      }
      return { kind: "list", of: this.typeRef(items), nonNull }
    }
    if (typeof type === "string" && BUILTIN_SCALARS.has(type)) {
      return { kind: "named", name: type, nonNull }
    }
    throw new Error(`Unexpected type: expected $ref, a built-in scalar or list, got ${JSON.stringify(type ?? $ref)}`)
  }

  deprecation(element: GraphApiDeprecatable): Deprecation | undefined {
    return element.deprecation ? { reason: element.deprecation.reason || DEFAULT_DEPRECATION_REASON } : undefined
  }

  argument(name: string, arg: GraphApiArgument): InputValue {
    const type = this.typeRef(arg)
    const deprecation = this.deprecation(arg)
    const value: InputValue = { name, directives: this.usages(arg.directives, deprecation), type }
    if (arg.description) {
      value.description = arg.description
    }
    if (deprecation) {
      value.deprecation = deprecation
    }
    if (arg.default !== undefined) {
      value.default = { type, value: arg.default }
    }
    return value
  }

  args(args: Record<string, GraphApiArgument> | undefined): ReadonlyMap<string, InputValue> {
    if (!args) {
      return NO_ARGS
    }
    const result = new Map<string, InputValue>()
    for (const [name, arg] of Object.entries(args)) {
      result.set(name, this.argument(name, arg))
    }
    return result
  }

  field(name: string, operation: GraphApiOperation): Field {
    const deprecation = this.deprecation(operation)
    const field: Field = {
      name,
      directives: this.usages(operation.directives, deprecation),
      args: this.args(operation.args),
      type: this.typeRef(operation),
    }
    if (operation.description) {
      field.description = operation.description
    }
    if (deprecation) {
      field.deprecation = deprecation
    }
    return field
  }

  fields(methods: Record<string, GraphApiOperation> | undefined): Map<string, Field> {
    const result = new Map<string, Field>()
    for (const [name, operation] of Object.entries(methods ?? {})) {
      result.set(name, this.field(name, operation))
    }
    return result
  }

  namedType(kind: TypeKind, name: string, definition: GraphApiDefinition): NamedType {
    if (definition.type !== kind) {
      throw new Error(
        `Unexpected definition: ${name} has type ${JSON.stringify(definition.type)} in the ${kind} section`,
      )
    }
    const type: NamedType = { kind, name, directives: this.usages(definition.directives) }
    if (definition.description) {
      type.description = definition.description
    }
    switch (kind) {
      case "scalar":
        if ((definition as GraphApiScalar).specifiedByURL) {
          type.specifiedByURL = (definition as GraphApiScalar).specifiedByURL
        }
        break
      case "object":
      case "interface": {
        const def = definition as GraphApiInterface
        type.fields = this.fields(def.methods)
        if (def.interfaces?.length) {
          type.interfaces = def.interfaces.map((item) => nameOfRef(item.$ref))
        }
        break
      }
      case "union":
        type.members = ((definition as GraphApiUnion).oneOf ?? []).map((item) => nameOfRef(item.$ref))
        break
      case "enum": {
        const values = new Map<string, EnumValue>()
        for (const [key, meta] of Object.entries((definition as GraphApiEnum).values ?? {})) {
          const deprecation = this.deprecation(meta)
          const value: EnumValue = { name: key, directives: this.usages(meta.directives, deprecation) }
          if (meta.description) {
            value.description = meta.description
          }
          if (deprecation) {
            value.deprecation = deprecation
          }
          values.set(key, value)
        }
        type.values = values
        break
      }
      case "input":
        type.inputFields = this.args((definition as GraphApiInputObject).properties)
        break
    }
    return type
  }

  lift(): SchemaIR {
    const { doc } = this
    const components = doc.components ?? {}

    for (const [name, def] of Object.entries(components.directives ?? {})) {
      this.directiveDefs.set(name, this.directiveDef(name, def as GraphApiDirectiveDefinition, this.args(def.args)))
    }
    this.addSpecifiedDefs()
    for (const [bucket, kind] of BUCKETS) {
      for (const [name, definition] of Object.entries(components[bucket] ?? {})) {
        this.types.set(name, this.namedType(kind, name, definition as GraphApiDefinition))
      }
    }

    const ir: SchemaIR = {
      directives: this.usages(doc.directives),
      roots: {},
      types: this.types,
      directiveDefs: this.directiveDefs,
    }
    if (doc.description) {
      ir.description = doc.description
    }
    for (const kind of ROOT_KINDS) {
      const operations = doc[OPERATIONS[kind]]
      const name = doc[`${kind}TypeName` as const] ?? DEFAULT_ROOT_NAMES[kind]
      if (!operations) {
        continue
      }
      const meta: GraphApiRootType | undefined = doc.rootTypes?.[kind]
      this.types.set(name, this.rootType(name, meta, this.usages(meta?.directives), this.fields(operations)))
      ir.roots[kind] = name
    }
    return ir
  }
}

/** Lifts a GraphAPI 1.0 document back into the IR */
export const lift = (doc: GraphApiSchema): SchemaIR => {
  if (!doc || typeof doc !== "object") {
    throw new TypeError("lift: a GraphAPI document is expected")
  }
  const version = (doc as { graphapi?: unknown }).graphapi
  if (version !== "1.0") {
    throw new Error(`Unsupported graphapi version: ${String(version)}`)
  }
  return new Lifter(doc).lift()
}

export const toIR = lift

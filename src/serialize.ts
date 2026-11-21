import type {
  GraphApiArgument,
  GraphApiBuiltinScalar,
  GraphApiComponents,
  GraphApiDefinition,
  GraphApiDefinitionBase,
  GraphApiDeprecatable,
  GraphApiDirectiveDefinition,
  GraphApiEnum,
  GraphApiInputObject,
  GraphApiInterface,
  GraphApiOperation,
  GraphApiRef,
  GraphApiRootType,
  GraphApiRootTypes,
  GraphApiScalar,
  GraphApiSchema,
  GraphApiTypeUsage,
  GraphApiUnion,
  GraphApiUsage,
} from "./graphapi"
import {
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
  Usage,
  BUILTIN_SCALARS,
  rootNames,
} from "./ir"

export const COMPONENT_OF: Record<TypeKind, keyof GraphApiComponents> = {
  scalar: "scalars",
  object: "objects",
  interface: "interfaces",
  union: "unions",
  enum: "enums",
  input: "inputObjects",
}

const OPERATIONS = { query: "queries", mutation: "mutations", subscription: "subscriptions" } as const

const directiveRef = (name: string): GraphApiRef => ({ $ref: `#/components/directives/${name}` })

class Serializer {
  private usedBuiltins = new Set<string>()
  // type name → "#/components/<section>/<name>", built once per type
  private refs = new Map<string, string>()

  constructor(private readonly ir: SchemaIR) {}

  private kindOf(name: string): TypeKind {
    return this.ir.types.get(name)?.kind ?? "scalar"
  }

  private refString(name: string): string {
    let ref = this.refs.get(name)
    if (ref === undefined) {
      this.refs.set(name, (ref = `#/components/${COMPONENT_OF[this.kindOf(name)]}/${name}`))
    }
    return ref
  }

  private ref(name: string): GraphApiRef {
    return { $ref: this.refString(name) }
  }

  typeUsage(ref: TypeRef): GraphApiTypeUsage {
    let usage: GraphApiTypeUsage
    if (ref.kind === "list") {
      usage = { type: "list", items: this.typeUsage(ref.of) }
    } else if (BUILTIN_SCALARS.has(ref.name)) {
      usage = { type: ref.name as GraphApiBuiltinScalar }
    } else {
      usage = this.ref(ref.name)
    }
    if (ref.nonNull) {
      usage.nonNull = true
    }
    return usage
  }

  /** Writes the type usage keys onto an element (operations and arguments are flat), without a temporary object */
  typeUsageInto<T extends object>(target: T, ref: TypeRef): T {
    const usage = target as Record<string, unknown>
    if (ref.kind === "list") {
      usage.type = "list"
      usage.items = this.typeUsage(ref.of)
    } else if (BUILTIN_SCALARS.has(ref.name)) {
      usage.type = ref.name
    } else {
      usage.$ref = this.refString(ref.name)
    }
    if (ref.nonNull) {
      usage.nonNull = true
    }
    return target
  }

  usage(usage: Usage): GraphApiUsage {
    this.usedBuiltins.add(usage.name)
    const result: GraphApiUsage = directiveRef(usage.name)
    if (usage.args.size) {
      const meta: Record<string, unknown> = {}
      for (const [name, value] of usage.args) {
        meta[name] = value.value
      }
      result.meta = meta
    }
    return result
  }

  directives(usages: readonly Usage[], deprecation?: Deprecation): GraphApiUsage[] | undefined {
    if (!usages.length && !deprecation) {
      return undefined
    }
    const result: GraphApiUsage[] = []
    if (deprecation) {
      this.usedBuiltins.add("deprecated")
      result.push({ $ref: "#/components/directives/deprecated", meta: { reason: deprecation.reason } })
    }
    for (const usage of usages) {
      result.push(this.usage(usage))
    }
    return result
  }

  element(
    target: GraphApiDeprecatable,
    item: { description?: string; deprecation?: Deprecation; directives: readonly Usage[] },
  ): void {
    if (item.description) {
      target.description = item.description
    }
    if (item.deprecation) {
      target.deprecation = { reason: item.deprecation.reason }
    }
    const directives = this.directives(item.directives, item.deprecation)
    if (directives) {
      target.directives = directives
    }
  }

  argument(arg: InputValue): GraphApiArgument {
    const result = {} as GraphApiArgument
    this.element(result, arg)
    this.typeUsageInto(result, arg.type)
    if (arg.default) {
      result.default = arg.default.value
    }
    return result
  }

  args(args: ReadonlyMap<string, InputValue>): Record<string, GraphApiArgument> {
    const result: Record<string, GraphApiArgument> = {}
    for (const arg of args.values()) {
      result[arg.name] = this.argument(arg)
    }
    return result
  }

  operation(field: Field): GraphApiOperation {
    const result = {} as GraphApiOperation
    this.element(result, field)
    if (field.args.size) {
      result.args = this.args(field.args)
    }
    return this.typeUsageInto(result, field.type)
  }

  methods(fields: ReadonlyMap<string, Field>): Record<string, GraphApiOperation> {
    const result: Record<string, GraphApiOperation> = {}
    for (const field of fields.values()) {
      result[field.name] = this.operation(field)
    }
    return result
  }

  /** title, description, directives and `type` of a definition; the members of its kind follow */
  definition<T extends GraphApiDefinition>(type: NamedType, members: Omit<T, keyof GraphApiDefinitionBase>): T {
    // `type` right after `title`, so the kind of a definition reads first
    const result = { title: type.name, type: members.type } as T
    if (type.description) {
      result.description = type.description
    }
    const directives = this.directives(type.directives)
    if (directives) {
      result.directives = directives
    }
    if (type.specifiedByURL) {
      ;(result as GraphApiScalar).specifiedByURL = type.specifiedByURL
    }
    return Object.assign(result, members)
  }

  enumValue(value: EnumValue): GraphApiDeprecatable {
    const result: GraphApiDeprecatable = {}
    this.element(result, value)
    return result
  }

  type(type: NamedType, implementedBy: Map<string, GraphApiRef[]>): GraphApiDefinition {
    switch (type.kind) {
      case "scalar":
        return this.definition<GraphApiScalar>(type, { type: "scalar" })
      case "object":
      case "interface": {
        const members = { type: type.kind } as Omit<GraphApiInterface, keyof GraphApiDefinitionBase>
        if (type.interfaces?.length) {
          members.interfaces = type.interfaces.map((name) => this.ref(name))
        }
        const implementations = implementedBy.get(type.name)
        if (implementations) {
          members.implementedBy = implementations
        }
        members.methods = this.methods(type.fields!)
        return this.definition<GraphApiInterface>(type, members) as GraphApiDefinition
      }
      case "union":
        return this.definition<GraphApiUnion>(type, {
          type: "union",
          oneOf: (type.members ?? []).map((name) => this.ref(name)),
        })
      case "enum": {
        const values: Record<string, GraphApiDeprecatable> = {}
        for (const value of type.values!.values()) {
          values[value.name] = this.enumValue(value)
        }
        return this.definition<GraphApiEnum>(type, { type: "enum", values })
      }
      case "input":
        return this.definition<GraphApiInputObject>(type, { type: "input", properties: this.args(type.inputFields!) })
    }
  }

  directiveDef(def: DirectiveDef): GraphApiDirectiveDefinition {
    const result = { title: def.name } as GraphApiDirectiveDefinition
    if (def.description) {
      result.description = def.description
    }
    result.locations = [...def.locations]
    if (def.args.size) {
      result.args = this.args(def.args)
    }
    result.repeatable = def.repeatable
    return result
  }

  document(): GraphApiSchema {
    const { ir } = this
    const doc: GraphApiSchema = { graphapi: "1.0" }
    if (ir.description) {
      doc.description = ir.description
    }
    const directives = this.directives(ir.directives)
    if (directives) {
      doc.directives = directives
    }

    const roots = rootNames(ir.roots)
    let rootTypes: GraphApiRootTypes | undefined
    for (const kind of ROOT_KINDS) {
      const name = ir.roots[kind]
      if (!name) {
        continue
      }
      doc[`${kind}TypeName` as const] = name
      const type = ir.types.get(name)
      if (type && (type.description || type.directives.length || type.interfaces?.length)) {
        const meta: GraphApiRootType = {}
        if (type.description) {
          meta.description = type.description
        }
        const usages = this.directives(type.directives)
        if (usages) {
          meta.directives = usages
        }
        if (type.interfaces?.length) {
          meta.interfaces = type.interfaces.map((name) => this.ref(name))
        }
        rootTypes ??= {}
        rootTypes[kind] = meta
      }
    }
    if (rootTypes) {
      doc.rootTypes = rootTypes
    }

    for (const kind of ROOT_KINDS) {
      const name = ir.roots[kind]
      const type = name ? ir.types.get(name) : undefined
      if (type?.kind === "object") {
        doc[OPERATIONS[kind]] = this.methods(type.fields!)
      }
    }

    // reverse index of interface implementations, sorted by name so that it does not depend on type discovery order
    const implementedBy = new Map<string, GraphApiRef[]>()
    const implementers = [...ir.types.values()]
      .filter((type) => type.interfaces?.length && !roots.has(type.name))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const type of implementers) {
      for (const name of type.interfaces!) {
        let list = implementedBy.get(name)
        if (!list) {
          implementedBy.set(name, (list = []))
        }
        list.push(this.ref(type.name))
      }
    }

    const components: GraphApiComponents = {}
    for (const type of ir.types.values()) {
      if (roots.has(type.name) || BUILTIN_SCALARS.has(type.name)) {
        continue
      }
      const bucket = (components[COMPONENT_OF[type.kind]] ??= {}) as Record<string, GraphApiDefinition>
      bucket[type.name] = this.type(type, implementedBy)
    }
    let directiveDefs: Record<string, GraphApiDirectiveDefinition> | undefined
    for (const def of ir.directiveDefs.values()) {
      if (def.builtin && !this.usedBuiltins.has(def.name)) {
        continue
      }
      directiveDefs ??= {}
      directiveDefs[def.name] = this.directiveDef(def)
    }
    if (directiveDefs) {
      components.directives = directiveDefs
    }
    if (Object.keys(components).length) {
      doc.components = components
    }
    return doc
  }
}

/** Serializes the IR into a GraphAPI 1.0 document */
export const fromIR = (ir: SchemaIR): GraphApiSchema => new Serializer(ir).document()

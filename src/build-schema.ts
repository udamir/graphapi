import {
  GraphQLArgument,
  GraphQLDirective,
  GraphQLEnumType,
  GraphQLField,
  GraphQLInputField,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLType,
  GraphQLUnionType,
  ConstDirectiveNode,
  isListType,
  isNonNullType,
  valueFromASTUntyped,
} from "graphql"

import type {
  GraphApiArgument,
  GraphApiComponents,
  GraphApiDefinition,
  GraphApiDeprecatable,
  GraphApiDirectiveDefinition,
  GraphApiOperation,
  GraphApiRef,
  GraphApiRootType,
  GraphApiRootTypes,
  GraphApiSchema,
  GraphApiTypeUsage,
  GraphApiUsage,
} from "./graphapi"
import { BUILTIN_SCALARS, ROOT_KINDS, TypeKind, deprecationOf, isSpecifiedDirectiveShape, plainValue } from "./ir"
import { defaultValueOf, typeKind } from "./from-schema"
import { COMPONENT_OF } from "./serialize"

/**
 * Builds a GraphAPI 1.0 document directly from a GraphQLSchema, without the IR: the same document as
 * `fromIR(fromGraphQLSchema(schema))`, key order included, with a third of the allocation. The equivalence is pinned
 * by test/equivalence.
 */

const OPERATIONS = { query: "queries", mutation: "mutations", subscription: "subscriptions" } as const

type WithAST = {
  description?: string | null
  deprecationReason?: string | null
  astNode?: { directives?: readonly ConstDirectiveNode[] } | null
  extensionASTNodes?: readonly { directives?: readonly ConstDirectiveNode[] }[] | null
}

/** A type usage written as a fresh object, or the keys written onto an element (operations and arguments are flat) */
type UsageTarget = Partial<GraphApiTypeUsage> & Record<string, unknown>

class SchemaBuilder {
  private readonly typeMap: ReturnType<GraphQLSchema["getTypeMap"]>
  // directive name → whether its definition is the specified one
  private readonly builtin = new Map<string, boolean>()
  // the built-in directives used by the document, whose definitions it then lists
  private readonly usedBuiltins = new Set<string>()
  // type name → "#/components/<section>/<name>", built once per type
  private readonly refs = new Map<string, string>()

  constructor(private readonly schema: GraphQLSchema) {
    this.typeMap = schema.getTypeMap()
  }

  private refString(name: string): string {
    let ref = this.refs.get(name)
    if (ref === undefined) {
      const type = this.typeMap[name]
      const kind: TypeKind = type && !BUILTIN_SCALARS.has(name) && !name.startsWith("__") ? typeKind(type) : "scalar"
      this.refs.set(name, (ref = `#/components/${COMPONENT_OF[kind]}/${name}`))
    }
    return ref
  }

  private ref(name: string): GraphApiRef {
    return { $ref: this.refString(name) }
  }

  /**
   * A type usage on its own (list items, and elements that carry nothing else), as one object literal per shape:
   * V8 creates a literal with its final hidden class at once instead of adding the keys one by one.
   */
  private usage(type: GraphQLType): GraphApiTypeUsage {
    if (isNonNullType(type)) {
      const inner = type.ofType
      if (isListType(inner)) {
        return { type: "list", items: this.usage(inner.ofType), nonNull: true }
      }
      return BUILTIN_SCALARS.has(inner.name)
        ? ({ type: inner.name, nonNull: true } as GraphApiTypeUsage)
        : { $ref: this.refString(inner.name), nonNull: true }
    }
    if (isListType(type)) {
      return { type: "list", items: this.usage(type.ofType) }
    }
    const name = (type as GraphQLNamedType).name
    return BUILTIN_SCALARS.has(name) ? ({ type: name } as GraphApiTypeUsage) : { $ref: this.refString(name) }
  }

  /** Writes the type usage keys of a type onto an element, after its other keys */
  private usageInto<T extends UsageTarget>(target: T, type: GraphQLType): T {
    let nonNull = false
    if (isNonNullType(type)) {
      nonNull = true
      type = type.ofType
    }
    if (isListType(type)) {
      target.type = "list"
      target.items = this.usage(type.ofType)
    } else if (BUILTIN_SCALARS.has((type as GraphQLNamedType).name)) {
      target.type = (type as GraphQLNamedType).name as GraphApiTypeUsage["type"]
    } else {
      target.$ref = this.refString((type as GraphQLNamedType).name)
    }
    if (nonNull) {
      target.nonNull = true
    }
    return target
  }

  /** Neither description, deprecation nor directive usages: the element is its type usage alone */
  private bare(node: WithAST): boolean {
    return (
      !node.description &&
      node.deprecationReason == null &&
      !node.astNode?.directives?.length &&
      !node.extensionASTNodes?.length
    )
  }

  /**
   * Directive usages of a node, from its definition and its extensions, the deprecation first. `deprecatable` is
   * true for fields, arguments, input fields and enum values, whose `@deprecated` usage graphql-js already resolves
   * into `deprecationReason`; there it is never kept as a usage. On types and the schema it is kept only when the
   * directive was overridden. `@specifiedBy` is kept only when overridden (the URL is `specifiedByURL`).
   */
  private directives(node: WithAST, deprecatable: boolean, reason?: string): GraphApiUsage[] | undefined {
    let result: GraphApiUsage[] | undefined
    if (reason !== undefined) {
      this.usedBuiltins.add("deprecated")
      result = [{ $ref: "#/components/directives/deprecated", meta: { reason } }]
    }
    const own = node.astNode?.directives
    if (own?.length) {
      result = this.collect(own, deprecatable, result)
    }
    const extensions = node.extensionASTNodes
    if (extensions?.length) {
      for (const extension of extensions) {
        if (extension.directives) {
          result = this.collect(extension.directives, deprecatable, result)
        }
      }
    }
    return result
  }

  private collect(
    nodes: readonly ConstDirectiveNode[],
    deprecatable: boolean,
    result: GraphApiUsage[] | undefined,
  ): GraphApiUsage[] | undefined {
    for (const node of nodes) {
      const name = node.name.value
      const builtin = this.builtin.get(name) ?? true
      if ((name === "deprecated" && (deprecatable || builtin)) || (name === "specifiedBy" && builtin)) {
        continue
      }
      this.usedBuiltins.add(name)
      const usage: GraphApiUsage = { $ref: `#/components/directives/${name}` }
      if (node.arguments?.length) {
        const meta: Record<string, unknown> = {}
        for (const arg of node.arguments) {
          const value = valueFromASTUntyped(arg.value)
          meta[arg.name.value] =
            arg.value.kind === "ObjectValue" || arg.value.kind === "ListValue" ? plainValue(value) : value
        }
        usage.meta = meta
      }
      ;(result ??= []).push(usage)
    }
    return result
  }

  /** description, deprecation and directives of a deprecatable element */
  private element(target: GraphApiDeprecatable, node: WithAST): void {
    if (node.description) {
      target.description = node.description
    }
    const deprecation = node.deprecationReason != null ? deprecationOf(node.deprecationReason) : undefined
    if (deprecation) {
      target.deprecation = { reason: deprecation.reason }
    }
    const directives = this.directives(node, true, deprecation?.reason)
    if (directives) {
      target.directives = directives
    }
  }

  private argument(arg: GraphQLArgument | GraphQLInputField): GraphApiArgument {
    const value = defaultValueOf(arg)
    if (value === undefined && this.bare(arg)) {
      return this.usage(arg.type) as GraphApiArgument
    }
    const result = {} as GraphApiArgument
    this.element(result, arg)
    this.usageInto(result as UsageTarget, arg.type)
    if (value !== undefined) {
      result.default = plainValue(value)
    }
    return result
  }

  private args(list: readonly (GraphQLArgument | GraphQLInputField)[]): Record<string, GraphApiArgument> {
    const result: Record<string, GraphApiArgument> = {}
    for (const arg of list) {
      result[arg.name] = this.argument(arg)
    }
    return result
  }

  private operation(field: GraphQLField<unknown, unknown>): GraphApiOperation {
    if (!field.args.length && this.bare(field)) {
      return this.usage(field.type) as GraphApiOperation
    }
    const result = {} as GraphApiOperation
    this.element(result, field)
    if (field.args.length) {
      result.args = this.args(field.args)
    }
    return this.usageInto(result as UsageTarget, field.type) as GraphApiOperation
  }

  private methods(fields: Record<string, GraphQLField<unknown, unknown>>): Record<string, GraphApiOperation> {
    const result: Record<string, GraphApiOperation> = {}
    for (const name of Object.keys(fields)) {
      result[name] = this.operation(fields[name])
    }
    return result
  }

  /** title, `type`, description and directives of a definition, then the members of its kind */
  private definition(
    type: GraphQLNamedType,
    kind: TypeKind,
    implementedBy: Map<string, GraphApiRef[]>,
  ): GraphApiDefinition {
    const result = { title: type.name, type: kind } as Record<string, unknown>
    if (type.description) {
      result.description = type.description
    }
    const directives = this.directives(type, false)
    if (directives) {
      result.directives = directives
    }
    switch (kind) {
      case "scalar":
        if ((type as GraphQLScalarType).specifiedByURL) {
          result.specifiedByURL = (type as GraphQLScalarType).specifiedByURL
        }
        break
      case "object":
      case "interface": {
        const interfaces = (type as GraphQLObjectType | GraphQLInterfaceType).getInterfaces()
        if (interfaces.length) {
          result.interfaces = interfaces.map((item) => this.ref(item.name))
        }
        const implementations = implementedBy.get(type.name)
        if (implementations) {
          result.implementedBy = implementations
        }
        result.methods = this.methods((type as GraphQLObjectType | GraphQLInterfaceType).getFields())
        break
      }
      case "union":
        result.oneOf = (type as GraphQLUnionType).getTypes().map((item) => this.ref(item.name))
        break
      case "enum": {
        const values: Record<string, GraphApiDeprecatable> = {}
        for (const value of (type as GraphQLEnumType).getValues()) {
          const item: GraphApiDeprecatable = {}
          this.element(item, value)
          values[value.name] = item
        }
        result.values = values
        break
      }
      case "input":
        result.properties = this.args(Object.values((type as GraphQLInputObjectType).getFields()))
        break
    }
    return result as unknown as GraphApiDefinition
  }

  private directiveDef(directive: GraphQLDirective): GraphApiDirectiveDefinition {
    const result = { title: directive.name } as GraphApiDirectiveDefinition
    if (directive.description) {
      result.description = directive.description
    }
    result.locations = [...directive.locations]
    if (directive.args.length) {
      result.args = this.args(directive.args)
    }
    result.repeatable = directive.isRepeatable
    return result
  }

  document(): GraphApiSchema {
    const { schema, typeMap } = this
    const directives = schema.getDirectives()
    for (const directive of directives) {
      this.builtin.set(
        directive.name,
        isSpecifiedDirectiveShape(
          directive.name,
          directive.locations,
          directive.args.map((arg) => arg.name),
        ),
      )
    }

    const doc: GraphApiSchema = { graphapi: "1.0" }
    if (schema.description) {
      doc.description = schema.description
    }
    const schemaDirectives = this.directives(schema, false)
    if (schemaDirectives) {
      doc.directives = schemaDirectives
    }

    const roots = {
      query: schema.getQueryType(),
      mutation: schema.getMutationType(),
      subscription: schema.getSubscriptionType(),
    }
    const rootNames = new Set<string>()
    let rootTypes: GraphApiRootTypes | undefined
    for (const kind of ROOT_KINDS) {
      const type = roots[kind]
      if (!type) {
        continue
      }
      rootNames.add(type.name)
      doc[`${kind}TypeName`] = type.name
      const meta: GraphApiRootType = {}
      if (type.description) {
        meta.description = type.description
      }
      const usages = this.directives(type, false)
      if (usages) {
        meta.directives = usages
      }
      const interfaces = type.getInterfaces()
      if (interfaces.length) {
        meta.interfaces = interfaces.map((item) => this.ref(item.name))
      }
      if (meta.description || meta.directives || meta.interfaces) {
        rootTypes ??= {}
        rootTypes[kind] = meta
      }
    }
    if (rootTypes) {
      doc.rootTypes = rootTypes
    }
    for (const kind of ROOT_KINDS) {
      const type = roots[kind]
      if (type) {
        doc[OPERATIONS[kind]] = this.methods(type.getFields())
      }
    }

    // named types in type map order, without built-in scalars and introspection types
    const names = Object.keys(typeMap).filter((name) => !BUILTIN_SCALARS.has(name) && !name.startsWith("__"))

    // reverse index of interface implementations, sorted by name so that it does not depend on type discovery order
    const implementedBy = new Map<string, GraphApiRef[]>()
    const implementers = names
      .filter((name) => {
        const type = typeMap[name] as Partial<GraphQLObjectType>
        return !rootNames.has(name) && !!type.getInterfaces?.().length
      })
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    for (const name of implementers) {
      for (const item of (typeMap[name] as GraphQLObjectType).getInterfaces()) {
        let list = implementedBy.get(item.name)
        if (!list) {
          implementedBy.set(item.name, (list = []))
        }
        list.push(this.ref(name))
      }
    }

    const components: GraphApiComponents = {}
    for (const name of names) {
      if (rootNames.has(name)) {
        continue
      }
      const type = typeMap[name]
      const kind = typeKind(type)
      const bucket = (components[COMPONENT_OF[kind]] ??= {}) as Record<string, GraphApiDefinition>
      bucket[name] = this.definition(type, kind, implementedBy)
    }
    let directiveDefs: Record<string, GraphApiDirectiveDefinition> | undefined
    for (const directive of directives) {
      // built-in definitions are listed only when used; a usage in an earlier definition counts
      if (this.builtin.get(directive.name) && !this.usedBuiltins.has(directive.name)) {
        continue
      }
      directiveDefs ??= {}
      directiveDefs[directive.name] = this.directiveDef(directive)
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

/** Builds a GraphAPI 1.0 document from a GraphQLSchema, without building the IR */
export const buildDocument = (schema: GraphQLSchema): GraphApiSchema => {
  if (!schema || typeof schema.getTypeMap !== "function") {
    throw new TypeError("fromGraphQLSchema: a GraphQLSchema instance is expected")
  }
  return new SchemaBuilder(schema).document()
}

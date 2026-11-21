import type { RootKind, TypeKind } from "./ir"

// GraphAPI 1.0 document types

export type GraphApiBuiltinScalar = "ID" | "String" | "Int" | "Float" | "Boolean"
/** The `type` of a definition */
export type GraphApiDefinitionType = TypeKind
/** The `type` of a type usage: a built-in scalar or a list (named types are referenced with `$ref`) */
export type GraphApiUsageType = GraphApiBuiltinScalar | "list"

export interface GraphApiRef {
  $ref: string
}

/** One directive usage; repeatable directives produce one entry per usage */
export interface GraphApiUsage {
  $ref: string
  meta?: Record<string, unknown>
}

export interface GraphApiDeprecation {
  reason: string
}

export interface GraphApiElement {
  description?: string
  directives?: GraphApiUsage[]
}

export interface GraphApiDeprecatable extends GraphApiElement {
  // resolved reason; the matching @deprecated usage is also listed in `directives`
  deprecation?: GraphApiDeprecation
}

/**
 * A reference to a type at a usage site, written flat next to the properties of the site: `{ $ref }` for a named
 * type, `{ type: "Int" }` for a built-in scalar, `{ type: "list", items }` for a list. `nonNull: true` marks
 * non-null positions, where the SDL writes `!`; absence means nullable.
 */
export type GraphApiTypeUsage = (
  | { $ref: string; type?: never; items?: never }
  | { type: GraphApiBuiltinScalar; $ref?: never; items?: never }
  | { type: "list"; items: GraphApiTypeUsage; $ref?: never }
) & { nonNull?: true }

/** An argument, input field or directive argument */
export type GraphApiArgument = GraphApiDeprecatable & GraphApiTypeUsage & { default?: unknown }

/** An operation or a field: its result type is written flat next to `args` */
export type GraphApiOperation = GraphApiDeprecatable & GraphApiTypeUsage & { args?: Record<string, GraphApiArgument> }

export interface GraphApiDefinitionBase extends GraphApiElement {
  title: string
}

export interface GraphApiScalar extends GraphApiDefinitionBase {
  type: "scalar"
  specifiedByURL?: string
}

export interface GraphApiObject extends GraphApiDefinitionBase {
  type: "object"
  interfaces?: GraphApiRef[]
  methods: Record<string, GraphApiOperation>
}

export interface GraphApiInterface extends GraphApiDefinitionBase {
  type: "interface"
  interfaces?: GraphApiRef[]
  // reverse index: every object or interface implementing this interface
  implementedBy?: GraphApiRef[]
  methods: Record<string, GraphApiOperation>
}

export interface GraphApiUnion extends GraphApiDefinitionBase {
  type: "union"
  oneOf: GraphApiRef[]
}

export interface GraphApiEnum extends GraphApiDefinitionBase {
  type: "enum"
  // every value, keyed by name, in declaration order
  values: Record<string, GraphApiDeprecatable>
}

export interface GraphApiInputObject extends GraphApiDefinitionBase {
  type: "input"
  properties: Record<string, GraphApiArgument>
}

export type GraphApiDefinition =
  | GraphApiScalar
  | GraphApiObject
  | GraphApiInterface
  | GraphApiUnion
  | GraphApiEnum
  | GraphApiInputObject

export interface GraphApiDirectiveDefinition {
  title: string
  description?: string
  locations: string[]
  args?: Record<string, GraphApiArgument>
  repeatable: boolean
}

export interface GraphApiComponents {
  scalars?: Record<string, GraphApiScalar>
  objects?: Record<string, GraphApiObject>
  interfaces?: Record<string, GraphApiInterface>
  unions?: Record<string, GraphApiUnion>
  enums?: Record<string, GraphApiEnum>
  inputObjects?: Record<string, GraphApiInputObject>
  // built-in directives appear only when used or overridden
  directives?: Record<string, GraphApiDirectiveDefinition>
}

/** Description, directives and implemented interfaces of a root operation type (its fields are the operations) */
export interface GraphApiRootType extends GraphApiElement {
  // interfaces implemented by the root type (`type Query implements Node`), same encoding as the interfaces of objects;
  // root types are not components, so they are not listed in the interfaces' `implementedBy`
  interfaces?: GraphApiRef[]
}

export type GraphApiRootTypes = Partial<Record<RootKind, GraphApiRootType>>

export interface GraphApiSchema {
  graphapi: "1.0"
  description?: string
  directives?: GraphApiUsage[]
  queryTypeName?: string
  mutationTypeName?: string
  subscriptionTypeName?: string
  rootTypes?: GraphApiRootTypes
  queries?: Record<string, GraphApiOperation>
  mutations?: Record<string, GraphApiOperation>
  subscriptions?: Record<string, GraphApiOperation>
  components?: GraphApiComponents
}

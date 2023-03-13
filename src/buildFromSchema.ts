import type { 
  ConstValueNode, GraphQLArgument, GraphQLDirective, GraphQLNonNull, GraphQLSchema,
  GraphQLNullableType, GraphQLScalarType, GraphQLObjectType, ConstDirectiveNode,
  GraphQLInterfaceType, GraphQLUnionType, GraphQLEnumType, GraphQLInputObjectType,
  GraphQLList, GraphQLNamedType, GraphQLField, GraphQLEnumValue, GraphQLInputField,
} from "graphql"

import type { 
  GraphApiSchema, GraphApiDirective, GraphApiInputValue, GraphApiNamedType, GraphApiEnum,
  GraphApiDirectiveDefinition, GraphApiTypes, GraphApiScalar, GraphApiField, GraphApiUnion,
  GraphApiObject, GraphApiInputObject, GraphApiOperation, GraphApiBaseType
} from "./graphapi"

import { getScalarType } from "./getScalarType"

const components = {
  ScalarTypeDefinition: "scalars",
  ObjectTypeDefinition: "objects",
  InterfaceTypeDefinition: "interfaces",
  InputObjectTypeDefinition: "inputObjects",
  DirectiveDefinition: "directives",
  UnionTypeDefinition: "unions",
  EnumTypeDefinition: "enums"
} as const

type ComponentsKind = keyof typeof components

const isNonNullType = (gqlType: GraphQLNullableType): gqlType is GraphQLNonNull<any> => {
  return (gqlType as any).__proto__.constructor.name === "GraphQLNonNull"
}

const isListType = (gqlType: GraphQLNullableType): gqlType is GraphQLList<any> => {
  return (gqlType as any).__proto__.constructor.name === "GraphQLList"
}

const isScalarType = (gqlType: GraphQLNamedType): gqlType is GraphQLScalarType => {
  return (gqlType as any).__proto__.constructor.name === "GraphQLScalarType"
}

const getTypeKind = (gqlType: GraphQLNamedType): ComponentsKind => {
  return isScalarType(gqlType) ? "ScalarTypeDefinition" : gqlType.astNode!.kind
}

const getType = (gqlType: GraphQLNamedType) => {
  const kind = getTypeKind(gqlType)
  switch (kind) {
    case "ScalarTypeDefinition":
      return getScalarType(gqlType as GraphQLScalarType)
    case "ObjectTypeDefinition":
    case "InterfaceTypeDefinition":
    case "InputObjectTypeDefinition":
    case "UnionTypeDefinition":
      return "object"
    case "EnumTypeDefinition": 
      return "string"
    default:
      throw new Error("Unknown type")
  }
}

const componentRef = (kind: ComponentsKind, name: string): string => {
  return `#/components/${components[kind]}/${name}`
}

const transformType2Ref = (gqlType: GraphQLNullableType, options: BuildOptions, nonNullable = false): GraphApiBaseType => {
  if (isNonNullType(gqlType)) {
    return transformType2Ref(gqlType.ofType, options, true)
  } else if (isListType(gqlType)) {
    const result: GraphApiBaseType = { 
      type: (nonNullable || !options?.nullableArrayType) ? "array" : ["array", "null"],
      items: transformType2Ref(gqlType.ofType, options)
    }
    return (nonNullable || options?.nullableArrayType) ? result : { oneOf: [ result, { type: 'null' } ] }
  } else {
    const $ref: GraphApiBaseType = { 
      $ref: componentRef(getTypeKind(gqlType), gqlType.name),
      ...(!nonNullable && options?.nullableArrayType) ? { type: [ getType(gqlType), "null"] } : {}
    }
    return (nonNullable || options?.nullableArrayType) ? $ref : { oneOf: [ $ref, { type: "null" } ] }
  }
}

const transfromField = (field: GraphQLField<any, any>, options: BuildOptions): GraphApiField => {
  return {
    ...transformNamedType(field),
    ...field.args.length ? { args: field.args.reduce(inputValueReducer(options), {}) } : {},
  }
}

const transformOperations = (fields: Record<string, GraphQLField<any, any>>, options: BuildOptions): Record<string, GraphApiOperation> => {
  const operations: Record<string, GraphApiOperation> = {} 
  for (const [ name, field ] of Object.entries(fields)) {
    operations[name] = {
      ...transfromField(field, options),
      response: transformType2Ref(field.type, options)
    }
  }
  return operations
}

const directiveNodeReducer = (result: Record<string, GraphApiDirective>, value: ConstDirectiveNode) => {
  result[value.name.value] = transformDirectiveNode(value)
  return result
}

const transfromDirectiveArgValue = (arg: ConstValueNode): any => {
  switch (arg.kind) {
    case "IntValue": case "FloatValue": case "BooleanValue": case "EnumValue": case "StringValue":
      return arg.value
    case "NullValue":
      return null
    case "ListValue":
      return arg.values.map(transfromDirectiveArgValue)
    case "ObjectValue":
      return arg.fields.reduce((result, item) => {
        result[item.name.value] = transfromDirectiveArgValue(item.value)
        return result
      }, {} as any)
  }
} 

const transformDirectiveNode = (node: ConstDirectiveNode): any => {
  const meta = node.arguments?.reduce((args: Record<string, any>, arg) => {
    args[arg.name.value] = transfromDirectiveArgValue(arg.value)
    return args
  }, {})
  return {
    $ref: componentRef("DirectiveDefinition", node.name.value),
    ...meta && Object.keys(meta).length ? { meta } : {},
  }
}

const transformBaseType = (baseType: GraphQLNamedType | GraphQLEnumValue | GraphQLField<any, any> | GraphQLInputField): GraphApiBaseType => {
  const directives = baseType.astNode?.directives
  return {
    ...baseType.description ? { description: baseType.description } : {},
    ...directives?.length ? { directives: directives.reduce(directiveNodeReducer, {})  } : {},
  }
}

const transformNamedType = (baseType: GraphQLNamedType | GraphQLEnumValue | GraphQLField<any, any> | GraphQLInputField): GraphApiNamedType => {
  return {
    title: baseType.name,
    ...transformBaseType(baseType)
  }
}

const transformScalarType = (scalarType: GraphQLScalarType, options: BuildOptions): GraphApiScalar => {
  return {
    ...transformNamedType(scalarType),
    type: getScalarType(scalarType),
    ...scalarType.specifiedByURL ? { specifiedByURL: scalarType.specifiedByURL } : {}
  }
}

const transformObjectType = (objectType: GraphQLObjectType | GraphQLInterfaceType, options: BuildOptions): GraphApiObject => {
  const properties: Record<string, GraphApiField> = {}
  const fields = objectType.getFields()
  const required: string[] = []
  const interfaces = objectType.getInterfaces().map((item) => ({ $ref: componentRef(item.astNode!.kind, item.name) }))

  for (const [name, field] of Object.entries(fields)) {
    if (isNonNullType(field.type)) {
      required.push(field.name)
    }
    
    properties[name] = {
      ...transformNamedType(field),
      ...transformType2Ref(field.type, options),
      // ...field.extensions ? { extends: field.extensions } : {},
      ...field.args.length ? { args: field.args.reduce(inputValueReducer(options), {}) } : {}
    }
  }

  return { 
    ...transformNamedType(objectType),
    type: "object",
    ...required.length ? { required } : {},
    properties,
    ...interfaces.length ? { interfaces } : {},
  }
}

const transfromUnionType = (unionType: GraphQLUnionType, options: BuildOptions): GraphApiUnion => {
  return { 
    ...transformNamedType(unionType),
    type: "object",
    oneOf: unionType.getTypes().map((item) => transformType2Ref(item, options, true))
  }
}

const transformEnumType = (enumType: GraphQLEnumType, options: BuildOptions): GraphApiEnum => {
  return {
    ...transformNamedType(enumType),
    type: "string",
    oneOf: enumType.getValues().map((item) => ({
      ...transformBaseType(item),
      ...options?.enumItemsAsConst 
        ? { const: item.value }   // JsonSchema6
        : { enum: [item.value] }  // JsonSchema4
    }))
  }
}

const transformInputObjectType = (inputObjectType: GraphQLInputObjectType, options: BuildOptions): GraphApiInputObject => {
  const inputFields: Record<string, GraphApiInputValue> = {}
  const fields = inputObjectType.getFields()

  for (const [ name, field ] of Object.entries(fields)) {
    inputFields[name] = {
      ...transformNamedType(field),
      required: isNonNullType(field.type),
      schema: transformType2Ref(field.type, options, true),
      ...field.defaultValue !== undefined ? { default: field.defaultValue } : {} // TODO: parse JSON ?
    }
  }

  return {
    ...transformNamedType(inputObjectType),
    inputFields
  }
}

const transformType = (gqlType: GraphQLNamedType, options: BuildOptions): GraphApiTypes => {
  const kind = getTypeKind(gqlType)
  switch (kind) {
    case "ScalarTypeDefinition":
      return transformScalarType(gqlType as GraphQLScalarType, options)
    case "ObjectTypeDefinition":
      return transformObjectType(gqlType as GraphQLObjectType, options)
    case "InterfaceTypeDefinition":
      return transformObjectType(gqlType as GraphQLInterfaceType, options)
    case "InputObjectTypeDefinition":
      return transformInputObjectType(gqlType as GraphQLInputObjectType, options)
    case "UnionTypeDefinition":
      return transfromUnionType(gqlType as GraphQLUnionType, options)
    case "EnumTypeDefinition": 
      return transformEnumType(gqlType as GraphQLEnumType, options)  
    default:
      throw new Error("Unsupported type")
  }
}

const transformTypes = (gqlTypeMap: Record<string, GraphQLNamedType>, options: BuildOptions, skip: string[] = []): Record<string, Record<string, GraphApiTypes>> => {
  const result: Record<string, Record<string, GraphApiTypes>> = {}
  for (const [name, gqlType] of Object.entries(gqlTypeMap)) {
    if (name.startsWith("__") || skip.includes(name)) { continue }
    const kind = getTypeKind(gqlType)
    result[components[kind]] = result[components[kind]] || {}
    result[components[kind]][name] = transformType(gqlType, options)
  }
  return result
}

const inputValueReducer = (options: BuildOptions) => (result: Record<string, GraphApiInputValue>, arg: GraphQLArgument) => {
  result[arg.name] = transformInputValue(arg, options)
  return result
}

const transformInputValue = (arg: GraphQLArgument, options: BuildOptions): GraphApiInputValue => {
  return {
    ...transformNamedType(arg),
    required: isNonNullType(arg.type),
    schema: transformType2Ref(arg.type, options, true),
    ...arg.defaultValue !== undefined ? { default: arg.defaultValue } : {},
  }
}

const directiveSchemaReducer = (options: BuildOptions) => (result: Record<string, GraphApiDirectiveDefinition>, directive: GraphQLDirective) => {
  result[directive.name] = transformDirectiveSchema(directive, options)
  return result
}

const transformDirectiveSchema = (directive: GraphQLDirective, options: BuildOptions): GraphApiDirectiveDefinition => {
  return {
    title: directive.name,
    ...directive.description ? { description: directive.description } : {},
    locations: [ ...directive.locations ],
    ...directive.args.length ? { args: directive.args.reduce(inputValueReducer(options), {}) } : {},
    repeatable: directive.isRepeatable
  }
}

export interface BuildOptions {
  nullableArrayType?: boolean
  enumItemsAsConst?: boolean
}

export const buildFromSchema = (schema: GraphQLSchema, options: BuildOptions = {}): GraphApiSchema => {
  const qType = schema.getQueryType()
  const mType = schema.getMutationType()
  const sType = schema.getSubscriptionType()

  // skip Query, Mutation and Subscription in componets
  const skip = [qType, mType, sType].reduce((r: string[], i) => i ? [...r, i.name] : r, [])

  return {
    graphapi: "0.0.2",
    ...schema.description ? { description: schema.description } : {},
    ...qType ? { queries: transformOperations(qType.getFields(), options) } : {},
    ...mType ? { mutations: transformOperations(mType.getFields(), options) } : {},
    ...sType ? { subscriptions: transformOperations(sType.getFields(), options) } : {},
    components: {
      ...transformTypes(schema.getTypeMap(), options, skip),
      directives: schema.getDirectives().reduce(directiveSchemaReducer(options), {})
    }
  }
}

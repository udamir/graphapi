import { 
  ConstValueNode, GraphQLArgument, GraphQLDirective, GraphQLNonNull, GraphQLSchema,
  GraphQLNullableType, GraphQLScalarType, GraphQLObjectType, ConstDirectiveNode,
  GraphQLInterfaceType, GraphQLUnionType, GraphQLEnumType, GraphQLInputObjectType,
  GraphQLList, GraphQLNamedType, GraphQLField, GraphQLEnumValue, GraphQLInputField,
} from "graphql"

import type { 
  GraphApiSchema, GraphApiEnum,
  GraphApiDirectiveDefinition, GraphApiScalar, GraphApiUnion,
  GraphApiObject, GraphApiInputObject
} from "./graphapi"

import { getScalarType, getScalarTypeFormat } from "./getScalarType"
import { GraphApiDirective, GraphEnumValue, GraphSchema } from "./graphSchema"

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

// workaround to avoid graphql dependency
const isGraphQLType = (gqlType: GraphQLNullableType, typeName: string): boolean => {
  const printName = Object.prototype.toString.call(gqlType)
  return printName === `[object ${typeName}]`
}

const isNonNullType = (gqlType: GraphQLNullableType): gqlType is GraphQLNonNull<any> => {
  // return gqlType instanceof GraphQLNonNull
  return isGraphQLType(gqlType, "GraphQLNonNull")
}

const isListType = (gqlType: GraphQLNullableType): gqlType is GraphQLList<any> => {
  // return gqlType instanceof GraphQLList
  return isGraphQLType(gqlType, "GraphQLList")
}

const isScalarType = (gqlType: GraphQLNamedType): gqlType is GraphQLScalarType => {
  // return gqlType instanceOf GraphQLScalarType
  return isGraphQLType(gqlType, "GraphQLScalarType")
}

const getTypeKind = (gqlType: GraphQLNamedType): ComponentsKind => {
  return isScalarType(gqlType) || !gqlType.astNode ? "ScalarTypeDefinition" : gqlType.astNode!.kind
}

const componentRef = (kind: ComponentsKind, name: string): string => {
  return `#/components/${components[kind]}/${name}`
}

const transformType2Ref = (gqlType: GraphQLNullableType, options: BuildOptions, nonNullable = false): GraphSchema => {
  if (isNonNullType(gqlType)) {
    return transformType2Ref(gqlType.ofType, options, true)
  } else if (isListType(gqlType)) {
    return { 
      type:  "array",
      items: transformType2Ref(gqlType.ofType, options),
      ...(nonNullable) ? {} : { nullable: true }
    }
  } else if (isScalarType(gqlType)) {
    const format = getScalarTypeFormat(gqlType)
    return { 
      type: getScalarType(gqlType),
      ...format ? { format } : {},
      ...(nonNullable) ? {} : { nullable: true }
    }
  } else {
    return { 
      $ref: componentRef(getTypeKind(gqlType), gqlType.name),
      ...(nonNullable) ? {} : { nullable: true }
    }
  }
}

const transfromField = (field: GraphQLField<any, any>, options: BuildOptions): GraphSchema => {
  return {
    ...transformNamedType(field),
    ...field.args.length ? { args: transformArgs(field.args, options) } : {},
  }
}

const transformOperations = (fields: Record<string, GraphQLField<any, any>>, options: BuildOptions): Record<string, GraphSchema> => {
  const operations: Record<string, GraphSchema> = {} 
  for (const [ name, field ] of Object.entries(fields)) {
    operations[name] = {
      ...transfromField(field, options),
      ...transformType2Ref(field.type, options)
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

const transformBaseType = (baseType: GraphQLNamedType | GraphQLEnumValue | GraphQLField<any, any> | GraphQLInputField): GraphSchema => {
  const directives = baseType.astNode?.directives
  return {
    ...baseType.description ? { description: baseType.description } : {},
    ...directives?.length ? { directives: directives.reduce(directiveNodeReducer, {})  } : {},
  }
}

const transformNamedType = (baseType: GraphQLNamedType | GraphQLEnumValue | GraphQLField<any, any> | GraphQLInputField): GraphSchema => {
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
  const properties: Record<string, GraphSchema> = {}
  const fields = objectType.getFields()
  const required: string[] = []
  const interfaces = objectType.getInterfaces().map((item) => ({ $ref: componentRef(item.astNode!.kind, item.name) }))

  for (const [name, field] of Object.entries(fields)) {
    if (isNonNullType(field.type)) {
      required.push(field.name)
    }
    
    properties[name] = {
      ...transformBaseType(field),
      ...transformType2Ref(field.type, options, true),
      // ...field.extensions ? { extends: field.extensions } : {},
      ...field.args.length ? { args: transformArgs(field.args, options) } : {}
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
    oneOf: unionType.getTypes().map((item) => transformType2Ref(item, options, true))
  }
}

const transformEnumType = (enumType: GraphQLEnumType, options: BuildOptions): GraphApiEnum => {
  const enumKeys: string[] = []
  const enumValues = enumType.getValues().reduce((res, { deprecationReason, description, value }) => {
    enumKeys.push(value)
    if (deprecationReason || description) {
      res[value] = {
        ...deprecationReason ? { deprecationReason } : {},
        ...description ? { description } : {},
      }          
    }
    return res 
  }, {} as Record<string, GraphEnumValue>)

  return {
    ...transformNamedType(enumType),
    type: "string",
    enum: enumKeys,
    ...Object.keys(enumValues).length ? { values: enumValues } : {}
  }
}

const transformInputObjectType = (inputObjectType: GraphQLInputObjectType, options: BuildOptions): GraphApiInputObject => {
  const properties: Record<string, GraphSchema> = {}
  const fields = inputObjectType.getFields()
  const required: string[] = []

  for (const [ name, field ] of Object.entries(fields)) {
    isNonNullType(field.type) && required.push(name)
    properties[name] = {
      ...transformNamedType(field),
      ...transformType2Ref(field.type, options, true),
      ...field.defaultValue !== undefined ? { default: field.defaultValue } : {}
    }
  }

  return {
    ...transformNamedType(inputObjectType),
    title: inputObjectType.name,
    type: "object",
    ...required.length ? { required } : {},
    properties,
  } 
}

const transformType = (gqlType: GraphQLNamedType, options: BuildOptions): GraphSchema => {
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

const transformTypes = (gqlTypeMap: Record<string, GraphQLNamedType>, options: BuildOptions, skip: string[] = []): Record<string, Record<string, GraphSchema>> => {
  const result: Record<string, Record<string, GraphSchema>> = {}
  for (const [name, gqlType] of Object.entries(gqlTypeMap)) {
    if (['String', 'Int', 'Float', 'Boolean', 'ID'].includes(name)) { continue }
    if (name.startsWith("__") || skip.includes(name)) { continue }
    const kind = getTypeKind(gqlType)
    result[components[kind]] = result[components[kind]] || {}
    result[components[kind]][name] = transformType(gqlType, options)
  }
  return result
}

const transformArgs = (args: ReadonlyArray<GraphQLArgument>, options: BuildOptions): GraphApiObject => {
  const properties: Record<string, GraphSchema> = {}
  const required: string[] = []

  for (const arg of args) {
    if (isNonNullType(arg.type)) {
      required.push(arg.name)
    }
    
    properties[arg.name] = {
      ...transformType2Ref(arg.type, options, true),
      ...transformBaseType(arg),
      // ...field.extensions ? { extends: field.extensions } : {},
      ...arg.defaultValue !== undefined ? { default: arg.defaultValue } : {}
    }
  }

  return { 
    type: "object",
    ...required.length ? { required } : {},
    properties,
  }
}

const directiveSchemaReducer = (options: BuildOptions) => (result: Record<string, GraphApiDirectiveDefinition>, directive: GraphQLDirective) => {
  if (!['specifiedBy', 'deprecated'].includes(directive.name)) {
    result[directive.name] = transformDirectiveSchema(directive, options)
  }
  return result
}

const transformDirectiveSchema = (directive: GraphQLDirective, options: BuildOptions): GraphApiDirectiveDefinition => {
  return {
    title: directive.name,
    ...directive.description ? { description: directive.description } : {},
    locations: [ ...directive.locations ],
    ...directive.args.length ? { args: transformArgs(directive.args, options) } : {},
    repeatable: directive.isRepeatable
  }
}

export interface BuildOptions {
}

export const buildFromSchema = (schema: GraphQLSchema, options: BuildOptions = {}): GraphApiSchema => {
  const qType = schema.getQueryType()
  const mType = schema.getMutationType()
  const sType = schema.getSubscriptionType()

  // skip Query, Mutation and Subscription in componets
  const skip = [qType, mType, sType].reduce((r: string[], i) => i ? [...r, i.name] : r, [])

  return {
    graphapi: "0.1.1",
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

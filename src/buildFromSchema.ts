import type { 
  ConstValueNode, GraphQLArgument, GraphQLDirective, GraphQLNonNull, GraphQLSchema,
  GraphQLNullableType, GraphQLScalarType, GraphQLObjectType, ConstDirectiveNode,
  GraphQLInterfaceType, GraphQLUnionType, GraphQLEnumType, GraphQLInputObjectType,
  GraphQLList, GraphQLNamedType, GraphQLField, GraphQLEnumValue, GraphQLInputField,
} from "graphql"

import type { 
  GraphApiSchema, GraphApiDirective, GraphApiInputValue, GraphApiNamedType, GraphApiEnum,
  GraphApiObject, GraphApiTypes, GraphApiScalar, GraphApiField, GraphApiUnion,
  GraphApiDirectiveSchema, GraphApiInputObject, GraphApiOperation, GraphApiBaseType
} from "./graphapi"

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

const transformType2Ref = (gqlType: GraphQLNullableType, nullable = true): GraphApiBaseType => {
  if (isNonNullType(gqlType)) {
    return transformType2Ref(gqlType.ofType, false)
  } else if (isListType(gqlType)) {
    const items = transformType2Ref(gqlType.ofType)
    return nullable ? { oneOf: [ { type: "array", items }, { type: 'null' } ] } : { type: "array", items }
  } else {
    const $ref = `#/components/${components[getTypeKind(gqlType)]}/${gqlType.name}`
    return nullable ? { oneOf: [ { $ref }, { type: "null" } ] } : { $ref }
  }
}

const transfromField = (field: GraphQLField<any, any>): GraphApiField => {
  return {
    ...transformNamedType(field),
    ...field.args.length ? { args: field.args.reduce(inputValueReducer, {}) } : {},
  }
}

const transformOperations = (fields: Record<string, GraphQLField<any, any>>): Record<string, GraphApiOperation> => {
  const operations: Record<string, GraphApiOperation> = {} 
  for (const [ name, field ] of Object.entries(fields)) {
    operations[name] = {
      ...transfromField(field),
      responce: transformType2Ref(field.type)
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
  return {
    $ref: `#/components/directives/${node.name.value}`,
    meta: node.arguments?.reduce((args: Record<string, any>, arg) => {
      args[arg.name.value] = transfromDirectiveArgValue(arg.value)
      return args
    }, {})
  }
}

const transformNamedType = (baseType: GraphQLNamedType | GraphQLEnumValue | GraphQLField<any, any> | GraphQLInputField): GraphApiNamedType => {
  const directives = baseType.astNode?.directives
  return {
    title: baseType.name,
    ...baseType.description ? { description: baseType.description } : {},
    ...directives?.length ? { directives: directives.reduce(directiveNodeReducer, {})  } : {},
  }
}

const transformScalarType = (scalarType: GraphQLScalarType): GraphApiScalar => {
  return {
    ...transformNamedType(scalarType),
    type: "string",
    ...scalarType.specifiedByURL ? { specifiedByURL: scalarType.specifiedByURL } : {}
  }
}

const transformObjectType = (objectType: GraphQLObjectType | GraphQLInterfaceType, nullable = true): GraphApiObject => {
  const properties: Record<string, GraphApiField> = {}
  const fields = objectType.getFields()
  const required: string[] = []

  for (const [name, field] of Object.entries(fields)) {
    if (isNonNullType(field.type)) {
      required.push(field.name)
    }
    
    properties[name] = {
      ...transformType2Ref(field.type, false),
      ...field.args.length ? { args: field.args.reduce(inputValueReducer, {}) } : {}
    }
  }

  return { 
    ...transformNamedType(objectType),
    type: "object",
    required,
    properties
  }
}

const transfromUnionType = (unionType: GraphQLUnionType): GraphApiUnion => {
  return { 
    ...transformNamedType(unionType),
    type: "object",
    oneOf: unionType.getTypes().map((item) => transformType2Ref(item, false))
  }
}

const transformEnumType = (enumType: GraphQLEnumType): GraphApiEnum => {
  return {
    ...transformNamedType(enumType),
    type: "string",
    oneOf: enumType.getValues().map((item) => ({
      ...transformNamedType(item),
      type: "string",
      // const: item.value // JsonSchema6
      enum: [item.value] // JsonSchema4
    }))
  }
}

const transformInputObjectType = (inputObjectType: GraphQLInputObjectType): GraphApiInputObject => {
  const inputFields: Record<string, GraphApiInputValue> = {}
  const fields = inputObjectType.getFields()

  for (const [ name, field ] of Object.entries(fields)) {
    inputFields[name] = {
      ...transformNamedType(field),
      required: isNonNullType(field.type),
      schema: transformType2Ref(field.type, false),
      ...field.defaultValue !== undefined ? { default: field.defaultValue } : {} // TODO: parse JSON ?
    }
  }

  return {
    ...transformNamedType(inputObjectType),
    type: "object",
    inputFields
  }
}

const transformType = (gqlType: GraphQLNamedType): GraphApiTypes => {
  const kind = getTypeKind(gqlType)
  switch (kind) {
    case "ScalarTypeDefinition":
      return transformScalarType(gqlType as GraphQLScalarType)
    case "ObjectTypeDefinition":
      return transformObjectType(gqlType as GraphQLObjectType)
    case "InterfaceTypeDefinition":
      return transformObjectType(gqlType as GraphQLInterfaceType)
    case "InputObjectTypeDefinition":
      return transformInputObjectType(gqlType as GraphQLInputObjectType)
    case "UnionTypeDefinition":
      return transfromUnionType(gqlType as GraphQLUnionType)
    case "EnumTypeDefinition": 
      return transformEnumType(gqlType as GraphQLEnumType)  
    default:
      throw new Error("Unsupported type")
  }
}

const transformTypes = (gqlTypeMap: Record<string, GraphQLNamedType>, skip: string[] = []): Record<string, Record<string, GraphApiTypes>> => {
  const result: Record<string, Record<string, GraphApiTypes>> = {}
  for (const [name, gqlType] of Object.entries(gqlTypeMap)) {
    if (name.startsWith("__") || skip.includes(name)) { continue }
    const kind = getTypeKind(gqlType)
    result[components[kind]] = result[components[kind]] || {}
    result[components[kind]][name] = transformType(gqlType)
  }
  return result
}

const inputValueReducer = (result: Record<string, GraphApiInputValue> , arg: GraphQLArgument) => {
  result[arg.name] = transformInputValue(arg)
  return result
}

const transformInputValue = (arg: GraphQLArgument): GraphApiInputValue => {
  return {
    ...transformNamedType(arg),
    required: isNonNullType(arg.type),
    schema: transformType2Ref(arg.type, false),
    ...arg.defaultValue !== undefined ? { default: arg.defaultValue } : {},
  }
}

const directiveSchemaReducer = (result: Record<string, GraphApiDirectiveSchema>, directive: GraphQLDirective) => {
  result[directive.name] = transformDirectiveSchema(directive)
  return result
}

const transformDirectiveSchema = (directive: GraphQLDirective): GraphApiDirectiveSchema => {
  return {
    title: directive.name,
    ...directive.description ? { description: directive.description } : {},
    locations: [ ...directive.locations ],
    ...directive.args.length ? { args: directive.args.reduce(inputValueReducer, {}) } : {},
    repeatable: directive.isRepeatable
  }
}

export const buildFromSchema = (schema: GraphQLSchema): GraphApiSchema => {
  const qType = schema.getQueryType()
  const mType = schema.getMutationType()
  const sType = schema.getSubscriptionType()

  // skip Query, Mutation and Subscription in componets
  const skip = [qType, mType, sType].reduce((r: string[], i) => i ? [...r, i.name] : r, [])

  return {
    graphapi: "0.0.1",
    ...qType ? { queries: transformOperations(qType.getFields()) } : {},
    ...mType ? { mutations: transformOperations(mType.getFields()) } : {},
    ...sType ? { subscriptions: transformOperations(sType.getFields()) } : {},
    components: {
      ...transformTypes(schema.getTypeMap(), skip),
      directives: schema.getDirectives().reduce(directiveSchemaReducer, {})
    }
  }
}

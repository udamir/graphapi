import type { 
  IntrospectionInterfaceType, IntrospectionType, IntrospectionQuery, IntrospectionScalarType, 
  IntrospectionDirective, IntrospectionEnumType, IntrospectionEnumValue, IntrospectionField,
  IntrospectionObjectType, IntrospectionInputObjectType, IntrospectionInputValue, 
  IntrospectionTypeRef, IntrospectionUnionType, IntrospectionNamedTypeRef
} from "graphql"

import type { 
  GraphApiSchema, GraphApiInputValue, GraphApiNamedType, GraphApiEnum,
  GraphApiDirectiveDefinition, GraphApiScalar, GraphApiField, GraphApiUnion,
  GraphApiObject, GraphApiInputObject, GraphApiOperation, GraphApiBaseType
} from "./graphapi"

import { BuildOptions } from "./buildFromSchema"
import { getScalarType } from "./getScalarType"

const DEFAULT_DEPRECATION_REASON = 'No longer supported';

const components = {
  SCALAR: "scalars",
  OBJECT: "objects",
  INTERFACE: "interfaces",
  INPUT_OBJECT: "inputObjects",
  DERICTIVE: "directives",
  UNION: "unions",
  ENUM: "enums"
} as const

type ComponentsKind = keyof typeof components

const getType = (gqlType: IntrospectionNamedTypeRef) => {
  switch (gqlType.kind) {
    case "SCALAR":
      return getScalarType(gqlType as IntrospectionScalarType)
    case "OBJECT":
    case "INTERFACE":
    case "INPUT_OBJECT":
    case "UNION":
      return "object"
    case "ENUM": 
      return "string"
    default:
      throw new Error("Unknown type")
  }
}

const componentRef = (kind: ComponentsKind, name: string): string => {
  return `#/components/${components[kind]}/${name}`
}

const transformType2Ref = (gqlType: IntrospectionTypeRef, options: BuildOptions, nonNullable = false): GraphApiBaseType => {
  if (gqlType.kind === "NON_NULL") {
    return transformType2Ref(gqlType.ofType, options, true)
  } else if (gqlType.kind === "LIST") {
    const result: GraphApiBaseType = { 
      type: (nonNullable || !options?.nullableArrayType) ? "array" : ["array", "null"],
      items: transformType2Ref(gqlType.ofType, options)
    }
    return (nonNullable || options?.nullableArrayType) ? result : { oneOf: [ result, { type: 'null' } ] }
  } else {
    const $ref: GraphApiBaseType = { 
      $ref: componentRef(gqlType.kind, gqlType.name),
      ...(!nonNullable && options?.nullableArrayType) ? { type: [ getType(gqlType), "null"] } : {}
    }
    return (nonNullable || options?.nullableArrayType) ? $ref : { oneOf: [ $ref, { type: "null" } ] }
  }
}

const transfromField = (field: IntrospectionField, options: BuildOptions): GraphApiField => {
  return {
    ...transformNamedType(field),
    ...field.args.length ? { args: field.args.reduce(inputValueReducer(options), {}) } : {},
  }
}

const transformOperations = (fields: readonly IntrospectionField[], options: BuildOptions): Record<string, GraphApiOperation> => {
  const operations: Record<string, GraphApiOperation> = {} 
  for (const field of fields) {
    operations[field.name] = {
      ...transfromField(field, options),
      response: transformType2Ref(field.type, options)
    }
  }
  return operations
}

const transformBaseType = (baseType: IntrospectionType | IntrospectionEnumValue | IntrospectionField | IntrospectionInputValue): GraphApiBaseType => {
  const isDeprecated = "isDeprecated" in baseType ? baseType.isDeprecated : false
  const reason = "deprecationReason" in baseType ? baseType.deprecationReason : false
  return {
    ...baseType.description ? { description: baseType.description } : {},
    ...isDeprecated ? { 
      directives: {
        deprecated: {
          $ref: componentRef("DERICTIVE", "deprecated"),
          meta: reason !== DEFAULT_DEPRECATION_REASON ? { reason } : {}
        }
      }
    } : {}
  }
}

const transformNamedType = (baseType: IntrospectionType | IntrospectionField | IntrospectionInputValue): GraphApiNamedType => {
  return {
    title: baseType.name,
    ...transformBaseType(baseType)
  }
}

const transformScalarType = (scalarType: IntrospectionScalarType, options: BuildOptions): GraphApiScalar => {
  return {
    ...transformNamedType(scalarType),
    type: getScalarType(scalarType),
    ...scalarType.specifiedByURL ? { specifiedByURL: scalarType.specifiedByURL } : {}
  }
}

const transformObjectType = (objectType: IntrospectionObjectType | IntrospectionInterfaceType, options: BuildOptions): GraphApiObject => {
  const properties: Record<string, GraphApiField> = {}
  const required: string[] = []
  const interfaces = objectType.interfaces.map(({ kind, name }) => ({ $ref: componentRef(kind, name)}))

  for (const field of objectType.fields) {
    if (field.type.kind === "NON_NULL") {
      required.push(field.name)
    }
    
    properties[field.name] = {
      ...transformNamedType(field),
      ...transformType2Ref(field.type, options),
      ...field.args.length ? { args: field.args.reduce(inputValueReducer(options), {}) } : {}
    }
  }

  return { 
    ...transformNamedType(objectType),
    type: "object",
    ...required.length ? { required } : {},
    properties,
    ...interfaces.length ? { interfaces } : {} 
  }
}

const transfromUnionType = (unionType: IntrospectionUnionType, options: BuildOptions): GraphApiUnion => {
  return { 
    ...transformNamedType(unionType),
    type: "object",
    oneOf: unionType.possibleTypes.map((item) => transformType2Ref(item, options, true))
  }
}

const transformEnumType = (enumType: IntrospectionEnumType, options: BuildOptions): GraphApiEnum => {
  return {
    ...transformNamedType(enumType),
    type: "string",
    oneOf: enumType.enumValues.map((item) => ({
      ...transformBaseType(item),
      ...options?.enumItemsAsConst 
        ? { const: item.name }   // JsonSchema6
        : { enum: [item.name] }  // JsonSchema4
    }))
  }
}

const transformInputObjectType = (inputObjectType: IntrospectionInputObjectType, options: BuildOptions): GraphApiInputObject => {
  const inputFields: Record<string, GraphApiInputValue> = {}
  const fields = inputObjectType.inputFields

  for (const field of fields) {
    inputFields[field.name] = {
      ...transformNamedType(field),
      required: field.type.kind === "NON_NULL",
      schema: transformType2Ref(field.type, options, true),
      ...field.defaultValue !== undefined ? { default: field.defaultValue } : {} // TODO: parse JSON ?
    }
  }

  return {
    ...transformNamedType(inputObjectType),
    inputFields
  }
}

const inputValueReducer = (options: BuildOptions) => (result: Record<string, GraphApiInputValue>, arg: IntrospectionInputValue) => {
  result[arg.name] = transformInputValue(arg, options)
  return result
}

const transformInputValue = (arg: IntrospectionInputValue, options: BuildOptions): GraphApiInputValue => {
  return {
    ...transformNamedType(arg),
    required: arg.type.kind === "NON_NULL",
    schema: transformType2Ref(arg.type, options, true),
    ...arg.defaultValue !== null ? { default: arg.defaultValue } : {},
  }
}

const directiveSchemaReducer = (options: BuildOptions) => (result: Record<string, GraphApiDirectiveDefinition>, directive: IntrospectionDirective) => {
  result[directive.name] = transformDirectiveSchema(directive, options)
  return result
}

const transformDirectiveSchema = (directive: IntrospectionDirective, options: BuildOptions): GraphApiDirectiveDefinition => {
  return {
    title: directive.name,
    ...directive.description ? { description: directive.description } : {},
    locations: [ ...directive.locations ],
    ...directive.args.length ? { args: directive.args.reduce(inputValueReducer(options), {}) } : {},
    repeatable: !!directive.isRepeatable
  }
}

export const buildFromIntrospection = ({ __schema }: IntrospectionQuery, options: BuildOptions = {}): GraphApiSchema => {
  const { queryType, mutationType, subscriptionType, description, types = [], directives = [] } = __schema

  const getOperationType = (gqlType: IntrospectionType) => {
    switch (gqlType.name) {
      case queryType.name:
        return "queries"
      case mutationType?.name:
        return "mutations"
      case subscriptionType?.name:
        return "subscriptions"
    }
  }
  
  const typeReducer = (result: GraphApiSchema, current: IntrospectionType) => {
    switch (current.name) {
      case queryType.name: 
      case mutationType?.name: 
      case subscriptionType?.name: {
        const obj = current as IntrospectionObjectType
        const prop = getOperationType(current)!
        result[prop] = transformOperations(obj.fields, options)
        break
      }
      default:
        if (current.name.startsWith("__")) { return result }

        const kind = components[current.kind]

        if (!(kind in result.components!)) {
          result.components![kind] = {}
        }

        switch (current.kind) {
          case "SCALAR":
            result.components!.scalars![current.name] = transformScalarType(current, options)
            break;
          case "OBJECT":
            result.components!.objects![current.name] = transformObjectType(current, options)
            break;
          case "INTERFACE":
            result.components!.interfaces![current.name] = transformObjectType(current, options)
            break;
          case "INPUT_OBJECT":
            result.components!.inputObjects![current.name] = transformInputObjectType(current, options)
            break;
          case "UNION":
            result.components!.unions![current.name] = transfromUnionType(current, options)
            break;
          case "ENUM": 
            result.components!.enums![current.name] = transformEnumType(current, options)  
            break;
        }
        break;
    }
    return result
  }

  return types.reduce(typeReducer, {
    graphapi: "0.0.2",
    ...description ? { description } : {},
    components: {
      ...directives.length ? { directives: directives.reduce(directiveSchemaReducer(options), {}) } : {}
    }
  })
}

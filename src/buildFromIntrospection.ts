import type { 
  IntrospectionInterfaceType, IntrospectionType, IntrospectionQuery, IntrospectionScalarType, 
  IntrospectionDirective, IntrospectionEnumType, IntrospectionEnumValue, IntrospectionField,
  IntrospectionObjectType, IntrospectionInputObjectType, IntrospectionInputValue, 
  IntrospectionTypeRef, IntrospectionUnionType
} from "graphql"

import type { 
  GraphApiSchema, GraphApiEnum,
  GraphApiDirectiveDefinition, GraphApiScalar, GraphApiUnion,
  GraphApiObject, GraphApiInputObject, GraphApiArgs
} from "./graphapi"

import { getScalarType, getScalarTypeFormat } from "./getScalarType"
import { GraphEnumValue, GraphSchema } from "./graphSchema"
import { BuildOptions } from "./buildFromSchema"

const DEFAULT_DEPRECATION_REASON = 'No longer supported'

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

const componentRef = (kind: ComponentsKind, name: string): string => {
  return `#/components/${components[kind]}/${name}`
}

const transformType2Ref = (gqlType: IntrospectionTypeRef, options: BuildOptions, nonNullable = false): GraphSchema => {
  if (gqlType.kind === "NON_NULL") {
    return transformType2Ref(gqlType.ofType, options, true)
  } else if (gqlType.kind === "LIST") {
    return { 
      type: "array",
      items: transformType2Ref(gqlType.ofType, options),
      ...(nonNullable) ? {} : { nullable: true }
    }
  } else if (gqlType.kind === "SCALAR") {
    const format = getScalarTypeFormat(gqlType as IntrospectionScalarType)
    return { 
      type: getScalarType(gqlType as IntrospectionScalarType),
      ...format ? { format } : {},
      ...(nonNullable) ? {} : { nullable: true }
    }
  } else {
    return { 
      $ref: componentRef(gqlType.kind, gqlType.name),
      ...(nonNullable) ? {} : { nullable: true }
    }
  }

}

const transfromField = (field: IntrospectionField, options: BuildOptions): GraphSchema => {
  return {
    ...transformNamedType(field),
    ...field.args.length ? { args: transformArgs(field.args, options) } : {},
  }
}

const transformOperations = (fields: readonly IntrospectionField[], options: BuildOptions): Record<string, GraphSchema> => {
  const operations: Record<string, GraphSchema> = {} 
  for (const field of fields) {
    operations[field.name] = {
      ...transfromField(field, options),
      ...transformType2Ref(field.type, options)
    }
  }
  return operations
}

const transformBaseType = (baseType: IntrospectionType | IntrospectionEnumValue | IntrospectionField | IntrospectionInputValue): GraphSchema => {
  const isDeprecated = "isDeprecated" in baseType ? baseType.isDeprecated : false
  const reason = "deprecationReason" in baseType ? baseType.deprecationReason : false
  return {
    ...baseType.description ? { description: baseType.description } : {},
    ...isDeprecated ? { 
      directives: {
        deprecated: {
          $ref: componentRef("DERICTIVE", "deprecated"),
          ...reason && reason !== DEFAULT_DEPRECATION_REASON ? { meta: { reason } } : {}
        }
      }
    } : {}
  }
}

const transformNamedType = (baseType: IntrospectionType | IntrospectionField | IntrospectionInputValue): GraphSchema => {
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
  const properties: Record<string, GraphSchema> = {}
  const required: string[] = []
  const interfaces = objectType.interfaces.map(({ kind, name }) => ({ $ref: componentRef(kind, name)}))

  for (const field of objectType.fields) {
    if (field.type.kind === "NON_NULL") {
      required.push(field.name)
    }
    
    properties[field.name] = {
      ...transformBaseType(field),
      ...transformType2Ref(field.type, options, true),
      ...field.args.length ? { args: transformArgs(field.args, options) } : {}
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
    oneOf: unionType.possibleTypes.map((item) => transformType2Ref(item, options, true))
  }
}

const transformEnumType = (enumType: IntrospectionEnumType, options: BuildOptions): GraphApiEnum => {
  const enumKeys: string[] = []
  const enumValues = enumType.enumValues.reduce((res, { deprecationReason, description, name }) => {
    enumKeys.push(name)
    if (deprecationReason || description) {
      res[name] = {
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

const transformInputObjectType = (inputObjectType: IntrospectionInputObjectType, options: BuildOptions): GraphApiInputObject => {
  const properties: Record<string, GraphSchema> = {}
  const required: string[] = []
  const fields = inputObjectType.inputFields

  for (const field of fields) {
    if (field.type.kind === "NON_NULL") {
      required.push(field.name)
    }
    properties[field.name] = {
      ...transformNamedType(field),
      ...transformType2Ref(field.type, options, true),
      ...field.defaultValue !== undefined ? { default: field.defaultValue } : {}
    }
  }

  return {
    ...transformNamedType(inputObjectType),
    type: "object",
    title: inputObjectType.name,
    ...required.length ? { required } : {},
    properties
  }
}

const directiveSchemaReducer = (options: BuildOptions) => (result: Record<string, GraphApiDirectiveDefinition>, directive: IntrospectionDirective) => {
  if (!['specifiedBy', 'deprecated'].includes(directive.name)) {
    result[directive.name] = transformDirectiveSchema(directive, options)
  }
  return result
}

const transformArgs = (inputValues: ReadonlyArray<IntrospectionInputValue>, options: BuildOptions): GraphApiArgs => {
  const properties: Record<string, GraphSchema> = {}
  const required: string[] = []

  for (const arg of inputValues) {
    if (arg.type.kind === "NON_NULL") {
      required.push(arg.name)
    }
    properties[arg.name] = {
      ...transformType2Ref(arg.type, options, true),
      ...transformBaseType(arg),
      ...arg.defaultValue !== null ? { default: arg.defaultValue } : {}
    }
  }

  return {
    type: "object",
    ...required.length ? { required } : {},
    properties
  }
}

const transformDirectiveSchema = (directive: IntrospectionDirective, options: BuildOptions): GraphApiDirectiveDefinition => {
  return {
    title: directive.name,
    ...directive.description ? { description: directive.description } : {},
    locations: [ ...directive.locations ],
    ...directive.args.length ? { args: transformArgs(directive.args, options) } : {},
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
            if (!['String', 'Int', 'Float', 'Boolean', 'ID'].includes(current.name)) { 
              result.components!.scalars![current.name] = transformScalarType(current, options)
            }
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
    graphapi: "0.1.1",
    ...description ? { description } : {},
    components: {
      ...directives.length ? { directives: directives.reduce(directiveSchemaReducer(options), {}) } : {}
    }
  })
}

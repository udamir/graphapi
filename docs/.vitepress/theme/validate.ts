/** Validates GraphAPI documents against the published JSON Schema (schemas/ at the repository root, also published with the package) */
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020"

import schema from "../../../schemas/graphapi-1.0.schema.json"

export interface Validation {
  valid: boolean
  schema: string
  errors: string[]
}

let validator: ValidateFunction | undefined

export const validateDocument = (doc: unknown): Validation => {
  validator ??= new Ajv2020({ strict: true, allErrors: true }).compile(schema)
  const valid = validator(doc)
  return {
    valid,
    schema: "graphapi-1.0.schema.json",
    errors: (validator.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? ""}`.trim()),
  }
}

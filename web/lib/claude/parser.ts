import { z } from 'zod'

// Zod-validated parser — errors surface at the agent boundary, not downstream
export function parseWithSchema<T>(raw: string, schema: z.ZodType<T>): T | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const obj = JSON.parse(match[0])
    const result = schema.safeParse(obj)
    if (!result.success) {
      console.warn('[parser] schema validation failed:', result.error.issues)
      return null
    }
    return result.data
  } catch {
    return null
  }
}

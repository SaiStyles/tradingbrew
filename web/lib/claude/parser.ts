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

export function parseJSON<T>(raw: string): T | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}

import type { AnalystReport } from '@/types/trade'

export function parseAnalystOutput(raw: string): AnalystReport {
  const extractArray = (key: string): unknown[] => {
    const match = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\[)`))
    if (!match) return []

    const start = raw.indexOf('[', match.index!)
    let depth = 0
    let end = start

    for (let i = start; i < raw.length; i++) {
      if (raw[i] === '[') depth++
      if (raw[i] === ']') {
        depth--
        if (depth === 0) { end = i; break }
      }
    }

    try {
      return JSON.parse(raw.substring(start, end + 1)) as unknown[]
    } catch {
      return []
    }
  }

  const extractBool = (key: string): boolean => {
    const match = raw.match(new RegExp(`"${key}"\\s*:\\s*(true|false)`))
    return match ? match[1] === 'true' : false
  }

  const extractString = (key: string): string | null => {
    const match = raw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`))
    return match ? match[1] : null
  }

  return {
    violations: extractArray('violations') as AnalystReport['violations'],
    warnings: extractArray('warnings') as string[],
    patterns: extractArray('patterns') as string[],
    positives: extractArray('positives') as string[],
    intervention_needed: extractBool('intervention_needed'),
    intervention_type: extractString('intervention_type'),
  }
}

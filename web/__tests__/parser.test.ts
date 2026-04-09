import { describe, it, expect } from 'vitest'
import { parseWithSchema } from '@/lib/claude/parser'
import { z } from 'zod'
import { AnalystReportSchema, ExtractedDataSchema } from '@/types/trade'

// ─────────────────────────────────────────
// parseWithSchema
// ─────────────────────────────────────────

const SimpleSchema = z.object({
  foo: z.string(),
})

const TradeSchema = z.object({
  save_trade: z.boolean(),
  trade_data: z.object({ instrument: z.string() }).nullable(),
  reply: z.string().default(''),
})

describe('parseWithSchema', () => {
  it('parses valid JSON', () => {
    const result = parseWithSchema('{"foo":"bar"}', SimpleSchema)
    expect(result).toEqual({ foo: 'bar' })
  })

  it('handles prefilled assistant turn (starts mid-JSON)', () => {
    const result = parseWithSchema(
      '{"save_trade":true,"trade_data":null,"reply":""}',
      TradeSchema
    )
    expect(result?.save_trade).toBe(true)
  })

  it('returns null on invalid JSON', () => {
    expect(parseWithSchema('{broken json', SimpleSchema)).toBeNull()
  })

  it('returns null on empty string', () => {
    expect(parseWithSchema('', SimpleSchema)).toBeNull()
  })

  it('handles JSON with trailing content after closing brace', () => {
    const result = parseWithSchema('{"foo":"test"} some extra text', SimpleSchema)
    expect(result?.foo).toBe('test')
  })

  it('parses nested objects', () => {
    const result = parseWithSchema(
      '{"save_trade":true,"trade_data":{"instrument":"NQ"},"reply":""}',
      TradeSchema
    )
    expect(result?.trade_data?.instrument).toBe('NQ')
  })

  it('returns null when schema validation fails', () => {
    const result = parseWithSchema('{"foo":123}', SimpleSchema) // foo should be string
    expect(result).toBeNull()
  })
})

// ─────────────────────────────────────────
// AnalystReportSchema via parseWithSchema
// ─────────────────────────────────────────

describe('AnalystReport parsing', () => {
  it('parses valid analyst output', () => {
    const raw = JSON.stringify({
      violations: [{ rule_id: 'rule-1', severity: 'violation', reasoning: 'Test' }],
      warnings: ['Watch position size'],
      patterns: ['Revenge trading pattern'],
      positives: ['Good discipline today'],
      intervention_needed: false,
      intervention_type: null,
    })
    const result = parseWithSchema(raw, AnalystReportSchema)
    expect(result).not.toBeNull()
    expect(result!.violations).toHaveLength(1)
    expect(result!.warnings[0]).toBe('Watch position size')
  })

  it('returns null on bad JSON', () => {
    const result = parseWithSchema('{bad}', AnalystReportSchema)
    expect(result).toBeNull()
  })

  it('handles empty arrays with defaults', () => {
    const raw = JSON.stringify({
      violations: [],
      warnings: [],
      patterns: [],
      positives: [],
      intervention_needed: false,
      intervention_type: null,
    })
    const result = parseWithSchema(raw, AnalystReportSchema)
    expect(result).not.toBeNull()
    expect(result!.violations).toEqual([])
    expect(result!.positives).toEqual([])
  })

  it('handles warnings as plain strings', () => {
    const raw = JSON.stringify({
      violations: [],
      warnings: ['plain string warning'],
      patterns: ['plain string pattern'],
      positives: [],
      intervention_needed: false,
      intervention_type: null,
    })
    const result = parseWithSchema(raw, AnalystReportSchema)
    expect(result).not.toBeNull()
    expect(typeof result!.warnings[0]).toBe('string')
    expect(typeof result!.patterns[0]).toBe('string')
  })
})

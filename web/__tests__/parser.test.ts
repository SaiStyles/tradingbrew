import { describe, it, expect } from 'vitest'
import { parseJSON, parseAnalystOutput } from '@/lib/claude/parser'

// ─────────────────────────────────────────
// parseJSON
// ─────────────────────────────────────────

describe('parseJSON', () => {
  it('parses valid JSON', () => {
    const result = parseJSON<{ foo: string }>('{"foo":"bar"}')
    expect(result).toEqual({ foo: 'bar' })
  })

  it('handles prefilled assistant turn (starts mid-JSON)', () => {
    // Claude prefill: we send '{', Claude returns rest
    const result = parseJSON<{ save_trade: boolean }>(
      '{"save_trade":true,"trade_data":null,"reply":""}'
    )
    expect(result?.save_trade).toBe(true)
  })

  it('returns null on invalid JSON', () => {
    expect(parseJSON('{broken json')).toBeNull()
  })

  it('returns null on empty string', () => {
    expect(parseJSON('')).toBeNull()
  })

  it('handles JSON with trailing content after closing brace', () => {
    const result = parseJSON<{ x: number }>('{"x":1} some extra text')
    expect(result?.x).toBe(1)
  })

  it('parses nested objects', () => {
    const result = parseJSON<{ trade_data: { instrument: string } }>(
      '{"save_trade":true,"trade_data":{"instrument":"NQ"},"reply":""}'
    )
    expect(result?.trade_data?.instrument).toBe('NQ')
  })

  it('handles null values correctly', () => {
    const result = parseJSON<{ pnl: null }>('{"pnl":null}')
    expect(result?.pnl).toBeNull()
  })
})

// ─────────────────────────────────────────
// parseAnalystOutput
// ─────────────────────────────────────────

describe('parseAnalystOutput', () => {
  it('parses valid analyst output', () => {
    const raw = JSON.stringify({
      violations: [{ rule_id: 'rule-1', severity: 'violation', reasoning: 'Test' }],
      warnings: ['Watch position size'],
      patterns: ['Revenge trading pattern'],
      positives: ['Good discipline today'],
      intervention_needed: false,
      intervention_type: null,
    })
    const result = parseAnalystOutput(raw)
    expect(result.violations).toHaveLength(1)
    expect(result.warnings[0]).toBe('Watch position size')
  })

  it('returns EMPTY on bad JSON', () => {
    const result = parseAnalystOutput('{bad}')
    expect(result.violations).toEqual([])
    expect(result.intervention_needed).toBe(false)
  })

  it('handles empty arrays', () => {
    const raw = JSON.stringify({
      violations: [],
      warnings: [],
      patterns: [],
      positives: [],
      intervention_needed: false,
      intervention_type: null,
    })
    const result = parseAnalystOutput(raw)
    expect(result.violations).toEqual([])
    expect(result.positives).toEqual([])
  })

  it('handles warnings as plain strings not objects', () => {
    const raw = JSON.stringify({
      violations: [],
      warnings: ['plain string warning'],
      patterns: ['plain string pattern'],
      positives: [],
      intervention_needed: false,
      intervention_type: null,
    })
    const result = parseAnalystOutput(raw)
    expect(typeof result.warnings[0]).toBe('string')
    expect(typeof result.patterns[0]).toBe('string')
  })

  it('handles truncated JSON with bracket matching', () => {
    // Simulate max_tokens cutoff mid-string
    const truncated = '{"violations":[],"warnings":["Watch this"],"patterns":[],"positives":[],"intervention_needed":false'
    const result = parseAnalystOutput(truncated)
    // Should not crash — returns either partial parse or EMPTY
    expect(result).toBeDefined()
    expect(result.violations).toBeDefined()
  })
})

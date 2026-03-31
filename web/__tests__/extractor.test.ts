import { describe, it, expect } from 'vitest'
import { runExtractor } from '@/app/api/buddy/agents/extractor'

const TZ = 'America/New_York'

describe('Extractor agent (live API)', () => {
  it('extracts NQ long trade with pnl', async () => {
    const result = await runExtractor('just took a long on NQ, made $400', TZ)
    expect(result.has_trade).toBe(true)
    expect(result.instrument?.toUpperCase()).toBe('NQ')
    expect(result.direction).toBe('long')
    expect(result.pnl).toBe(400)
  })

  it('extracts short trade with loss', async () => {
    const result = await runExtractor('shorted ES, lost 200 bucks', TZ)
    expect(result.has_trade).toBe(true)
    expect(result.instrument?.toUpperCase()).toBe('ES')
    expect(result.direction).toBe('short')
    expect(result.pnl).toBe(-200)
  })

  it('returns has_trade false on small talk', async () => {
    const result = await runExtractor('hey whats up', TZ)
    expect(result.has_trade).toBe(false)
  })

  it('returns has_trade false on trading question', async () => {
    const result = await runExtractor('what do you think about the market today?', TZ)
    expect(result.has_trade).toBe(false)
  })

  it('extracts emotion tag', async () => {
    const result = await runExtractor('took NQ long, made 300, felt super confident', TZ)
    expect(result.emotion).toBeTruthy()
    expect(['confident', 'hesitant', 'FOMO', 'revenge', 'bored', 'calm', 'frustrated', 'euphoric'])
      .toContain(result.emotion)
  })

  it('extracts execution score', async () => {
    const result = await runExtractor('NQ long, made 400, execution was like a 7 out of 10', TZ)
    expect(result.execution_score).toBe(7)
  })

  it('uses stated pnl not calculated from prices', async () => {
    const result = await runExtractor(
      'NQ long, entry 19000, exit 19100, but I actually made $200 because of fees',
      TZ
    )
    expect(result.pnl).toBe(200)
  })

  it('detects confirmed = true on agreement', async () => {
    const result = await runExtractor('yes that sounds right', TZ)
    expect(result.confirmed).toBe(true)
  })

  it('detects declined = true on rejection', async () => {
    const result = await runExtractor('no skip that', TZ)
    expect(result.declined).toBe(true)
  })

  it('handles crypto instruments', async () => {
    const result = await runExtractor('bought BTC, up $500', TZ)
    expect(result.has_trade).toBe(true)
    expect(result.pnl).toBe(500)
  })

  it('does not crash on empty string', async () => {
    const result = await runExtractor('', TZ)
    expect(result).toBeDefined()
    expect(result.has_trade).toBe(false)
  })

  it('extracts followed_plan correctly', async () => {
    const yes = await runExtractor('NQ long, up 300, stuck to the plan', TZ)
    expect(yes.followed_plan).toBe(true)

    const no = await runExtractor('NQ short, lost 200, went off plan completely', TZ)
    expect(no.followed_plan).toBe(false)
  })

  // Implicit pattern detection — new capability
  it('detects implicit day-of-week pattern as historical_analysis', async () => {
    const result = await runExtractor('I feel worse on Mondays', TZ)
    expect(result.query_type).toBe('historical_analysis')
    expect(result.has_trade).toBe(false)
  })

  it('detects implicit revenge trading pattern as historical_analysis', async () => {
    const result = await runExtractor("I've been revenge trading a lot lately", TZ)
    expect(result.query_type).toBe('historical_analysis')
  })

  it('detects implicit instrument concern as historical_analysis', async () => {
    const result = await runExtractor('NQ always kills me', TZ)
    expect(result.query_type).toBe('historical_analysis')
  })

  it('detects "struggling this week" as historical_analysis', async () => {
    const result = await runExtractor('been struggling this week', TZ)
    expect(result.query_type).toBe('historical_analysis')
  })

  it('detects explicit day query with subtype both', async () => {
    const result = await runExtractor('how do I do on Mondays', TZ)
    expect(result.query_type).toBe('historical_analysis')
    expect(result.query_subtype).toBe('both')
  })

  it('detects open-ended psychology question with subtype psychology', async () => {
    const result = await runExtractor("what's my biggest weakness as a trader", TZ)
    expect(result.query_type).toBe('historical_analysis')
    expect(result.query_subtype).toBe('psychology')
  })

  it('does NOT flag single-event trade report as historical_analysis', async () => {
    const result = await runExtractor('just had a bad trade on NQ, lost 300', TZ)
    expect(result.query_type).toBeNull()
    expect(result.has_trade).toBe(true)
  })

  it('does NOT flag casual market chat as historical_analysis', async () => {
    const result = await runExtractor('market looks choppy today', TZ)
    expect(result.query_type).toBeNull()
  })
})

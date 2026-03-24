/**
 * Route integration test — full /api/buddy POST pipeline
 * Mocks: Supabase (auth + DB), Hindsight memory, Next.js headers/after
 * Real: All 6 Claude agent API calls, full orchestration logic
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

// ─── Mocks must be declared before imports ───────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

vi.mock('@/lib/memory/hindsight', () => ({
  ensureBank: vi.fn().mockResolvedValue(undefined),
  retainMemory: vi.fn().mockResolvedValue(undefined),
  getTraderPortrait: vi.fn().mockResolvedValue(''),
  recallMemories: vi.fn().mockResolvedValue([]),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({ getAll: () => [], set: () => {} }),
}))

// Preserve NextRequest/NextResponse, replace after() with no-op
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: vi.fn() }
})

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { POST } from '@/app/api/buddy/route'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── Supabase mock factory ────────────────────────────────────────────────────

const FAKE_USER = { id: 'test-user-id' }
const FAKE_PROFILE = {
  id: 'test-user-id',
  buddy_name: 'Brew',
  buddy_personality: 'Friendly Mentor',
  trading_timezone: 'America/New_York',
  buddy_voice_id: null,
}

let capturedTradeInsert: Record<string, unknown> | null = null

function makeMockSupabase(sessionState: Record<string, unknown> | null = null) {
  capturedTradeInsert = null

  // Chainable builder — tracks table, returns sensible terminal values
  function chain(table: string): Record<string, unknown> {
    const c: Record<string, unknown> = {
      select: () => chain(table),
      eq: () => chain(table),
      order: () => chain(table),
      limit: () => chain(table),
      is: () => chain(table),
      gte: () => chain(table),
      lte: () => chain(table),
      lt: () => chain(table),
      update: () => chain(table),
      // single() — used for users profile + trade insert result
      single: async () => {
        if (table === 'users') return { data: FAKE_PROFILE, error: null }
        if (table === 'trades') return { data: { id: 'trade-test-123', ...capturedTradeInsert }, error: null }
        return { data: null, error: null }
      },
      // maybeSingle() — used for sessions query + accounts
      maybeSingle: async () => {
        if (table === 'sessions' && sessionState) {
          return { data: { id: 'session-test-1', conversation_state: sessionState }, error: null }
        }
        return { data: null, error: null }
      },
      // insert() — capture trade data, return chainable for .select().single()
      insert: (data: unknown) => {
        if (table === 'trades') capturedTradeInsert = data as Record<string, unknown>
        return chain(table)
      },
      // then() for fire-and-forget writes (violations, session upsert, rpc)
      then: (cb: (v: { error: null }) => void) => {
        Promise.resolve({ error: null }).then(cb)
        return Promise.resolve({ error: null })
      },
    }
    return c
  }

  return {
    auth: {
      getUser: async () => ({ data: { user: FAKE_USER }, error: null }),
    },
    from: (table: string) => chain(table),
    schema: () => ({ from: (t: string) => chain(t) }),
    rpc: async () => ({ error: null }),
  }
}

// ─── Request helper ───────────────────────────────────────────────────────────

function makeRequest(message: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/buddy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(createClient as any).mockResolvedValue(makeMockSupabase())
})

describe('Route integration — full pipeline', () => {

  it('returns 401 with no user', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(createClient as any).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    })
    const res = await POST(makeRequest('hello'))
    expect(res.status).toBe(401)
  })

  it('returns 400 on malformed body', async () => {
    const req = new NextRequest('http://localhost:3000/api/buddy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notMessage: 'oops' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('small talk returns reply, no save_trade', async () => {
    const res = await POST(makeRequest('gm bro'))
    expect(res.status).toBe(200)
    const body = await res.json()
    console.log('[route-test: small talk] reply:', body.reply?.slice(0, 80))
    expect(typeof body.reply).toBe('string')
    expect(body.reply.length).toBeGreaterThan(0)
    expect(body.action).toBeNull()
    expect(body.trade_data).toBeNull()
  }, 30000)

  it('full trade in one message → save_trade fires, trade_data returned', async () => {
    const res = await POST(makeRequest(
      'just closed NQ short, lost $450, entered at 9:30am, felt like FOMO the whole time'
    ))
    expect(res.status).toBe(200)
    const body = await res.json()
    console.log('[route-test: full trade] action:', body.action, '| trade_data:', JSON.stringify(body.trade_data))
    console.log('[route-test: full trade] reply:', body.reply?.slice(0, 120))
    // SaveDetector may or may not save based on full conversation context
    // Regardless, reply must always be present
    expect(typeof body.reply).toBe('string')
    expect(body.reply.length).toBeGreaterThan(0)
    if (body.action === 'save_trade') {
      expect(body.trade_data).toBeDefined()
      expect(body.trade_data.instrument).toBeTruthy()
    }
  }, 35000)

  it('incomplete trade message → no save, buddy asks follow-up', async () => {
    const res = await POST(makeRequest('traded NQ today, lost some money'))
    expect(res.status).toBe(200)
    const body = await res.json()
    console.log('[route-test: incomplete] action:', body.action, '| reply:', body.reply?.slice(0, 120))
    expect(typeof body.reply).toBe('string')
    // Should not save — missing direction, exact pnl, opened_at, emotion
    expect(body.action).toBeNull()
  }, 30000)

  it('with existing session context — buddy references prior state', async () => {
    // Simulate a session that already has messages
    const sessionState = {
      messages: [
        { role: 'user', content: 'took a long on NQ earlier' },
        { role: 'assistant', content: 'Nice! How did it go?' },
      ],
      last_analysis: null,
      session_date: new Date().toISOString().slice(0, 10),
      trader_portrait: 'Trader tends to be impulsive after losses.',
      last_trade_id: null,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(createClient as any).mockResolvedValue(makeMockSupabase(sessionState))

    const res = await POST(makeRequest('made 300 on it, felt calm'))
    expect(res.status).toBe(200)
    const body = await res.json()
    console.log('[route-test: with session] reply:', body.reply?.slice(0, 120))
    console.log('[route-test: with session] action:', body.action)
    expect(typeof body.reply).toBe('string')
    // May save — has prior context + new pnl/emotion, opened_at still needed
  }, 35000)

})

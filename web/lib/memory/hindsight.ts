import { HindsightClient } from '@vectorize-io/hindsight-client'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'

function createClient(): HindsightClient | null {
  const baseUrl = process.env.HINDSIGHT_BASE_URL
  if (!baseUrl) {
    console.warn('[hindsight] HINDSIGHT_BASE_URL not set — memory disabled')
    return null
  }
  return new HindsightClient({
    baseUrl,
    apiKey: process.env.HINDSIGHT_API_KEY,
  })
}

function getBankId(userId: string): string {
  return `tradingbrew-${userId}`
}

// Called fire-and-forget on first message. Idempotent — safe to call every time.
export async function ensureBank(userId: string): Promise<void> {
  const client = createClient()
  if (!client) return

  const bankId = getBankId(userId)

  // Create bank (no-op if already exists)
  try {
    await client.createBank(bankId, {
      retainMission:
        'Extract psychological observations, behavioral patterns, emotional tendencies, trading habits, personal context, and relationship dynamics for a retail trader.',
      reflectMission:
        'You are the memory system for an AI trading companion called Buddy. Provide deep, actionable understanding of this specific trader — their psychology, patterns, strengths, and blind spots — so Buddy can serve them with genuine insight.',
      enableObservations: true,
      observationsMission:
        "Synthesize patterns about this trader's psychology, decision-making under pressure, emotional triggers, rule compliance, and growth over time.",
    })
  } catch {
    // Bank already exists — continue to check mental models
  }

  // Create mental models + directives only on first setup (check if any exist)
  try {
    const existing = await client.listMentalModels(bankId)
    if (existing?.items?.length > 0) return // already initialized

    await Promise.all([
      // Mental Models — living psychological portrait
      client.createMentalModel(
        bankId,
        'tilt_trigger',
        'What specifically triggers this trader into emotional or revenge trading? What are the early warning signs?',
        { trigger: { refreshAfterConsolidation: true } }
      ),
      client.createMentalModel(
        bankId,
        'primary_edge',
        'What is this trader\'s primary trading edge? Where do they consistently perform well, and where do they lose that edge?',
        { trigger: { refreshAfterConsolidation: true } }
      ),
      client.createMentalModel(
        bankId,
        'buddy_approach',
        'How should this trader\'s AI companion Buddy approach them — what tone works, what to challenge, what to avoid, when to push and when to back off?',
        { trigger: { refreshAfterConsolidation: true } }
      ),
      client.createMentalModel(
        bankId,
        'blind_spots',
        'What are this trader\'s main psychological blind spots, self-deception patterns, and behaviors they are not fully aware of?',
        { trigger: { refreshAfterConsolidation: true } }
      ),

      // Directives — always enforced during reflect()
      client.createDirective(
        bankId,
        'no_direct_memory_reference',
        'Never reference stored memories directly. Surface understanding naturally — make the trader feel known, not watched or analyzed.',
        { priority: 1 }
      ),
      client.createDirective(
        bankId,
        'no_financial_advice',
        'Never give financial advice, trading signals, or tell the trader when to enter or exit positions.',
        { priority: 1 }
      ),
      client.createDirective(
        bankId,
        'empathy_first',
        'Lead with empathy. The trader\'s emotional state and wellbeing always comes before analysis or correction.',
        { priority: 2 }
      ),
    ])
  } catch (e) {
    console.error('[hindsight] mental model/directive setup failed:', e)
  }
}

// Called once per trading day per user. Checks Supabase daily_portraits cache first —
// only calls reflect() if no portrait exists for today. Saves result back to DB.
export async function getTraderPortrait(userId: string, tradingDate: string): Promise<string> {
  // 1. Check Supabase cache first — free, fast
  try {
    const supabase = await createSupabaseClient()
    const { data: cached } = await supabase
      .from('daily_portraits')
      .select('portrait')
      .eq('user_id', userId)
      .eq('trading_date', tradingDate)
      .maybeSingle()

    if (cached?.portrait) {
      console.log('[hindsight] reflect() served from daily_portraits cache')
      return cached.portrait
    }
  } catch (e) {
    console.error('[hindsight] daily_portraits cache read failed:', e)
    // Fall through to reflect()
  }

  // 2. Cache miss — call Hindsight reflect()
  const client = createClient()
  if (!client) return ''

  const bankId = getBankId(userId)
  try {
    const response = await client.reflect(
      bankId,
      'Give a concise, actionable psychological briefing on this trader: their emotional patterns, tilt triggers, what approach works best with them, and anything their AI companion should be aware of right now.',
      {
        budget: 'low',
        context: 'Pre-session Buddy briefing',
      }
    )
    const portrait = response?.text ?? ''

    // 3. Save to daily_portraits cache — upsert in case of race condition
    if (portrait) {
      try {
        const supabase = await createSupabaseClient()
        await supabase
          .from('daily_portraits')
          .upsert({ user_id: userId, trading_date: tradingDate, portrait }, { onConflict: 'user_id,trading_date' })
      } catch (e) {
        console.error('[hindsight] daily_portraits cache write failed:', e)
        // Non-fatal — portrait still returned to caller
      }
    }

    return portrait
  } catch (e) {
    console.error('[hindsight] reflect failed:', e)
    return ''
  }
}

export async function recallMemories(userId: string, query: string): Promise<string[]> {
  const client = createClient()
  if (!client) return []

  const bankId = getBankId(userId)
  try {
    const response = await client.recall(bankId, query, {
      budget: 'low',
      maxTokens: 1024,
    })
    return response.results.map(r => r.text)
  } catch (e) {
    console.error('[hindsight] recall failed:', e)
    return []
  }
}

export async function retainMemory(userId: string, content: string): Promise<void> {
  const client = createClient()
  if (!client) return

  const bankId = getBankId(userId)
  try {
    await client.retain(bankId, content, {
      async: true,
      context: 'trading_session',
      tags: ['source:scribe'],
    })
  } catch (e) {
    console.error('[hindsight] retain failed:', e)
  }
}

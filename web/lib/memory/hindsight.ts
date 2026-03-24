import { HindsightClient } from '@vectorize-io/hindsight-client'

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

// Called once per session (cached). Returns a psychological briefing for Buddy.
export async function getTraderPortrait(userId: string): Promise<string> {
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
    return response?.text ?? ''
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
      budget: 'mid',
      maxTokens: 2048,
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

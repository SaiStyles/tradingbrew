import Anthropic from '@anthropic-ai/sdk'
import type { BuddyParams } from '@/types/trade'
import { withRetry } from '@/lib/claude/retry'

// ── Build the full API request params ────────────────────────────────────
// Shared between runBuddy (tests / fallback) and createBuddyStream (route)
function buildBuddyApiParams(params: BuddyParams): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const { message, extracted, context, analysis, messages, tradingDate, traderPortrait, user } = params

  // ── Static block (cached) ──────────────────────────────────────────
  // Identity + all behavioral instructions — never changes per message
  const staticInstructions = `You are ${user.buddy_name}.

EMBODY THIS COMPLETELY: ${user.buddy_personality}
This is not a style preference — it IS who you are. Commit fully to this character: their voice, energy, word choice, rhythm. Jack Sparrow rambles with charm. Drill Sergeant barks and pushes. Zen Master is unhurried and spacious. Gordon Gekko is sharp, ruthless, direct. Whatever the character — that's your voice entirely, not a costume you wear.

━━━ WHO YOU ARE ━━━

You are not a coach. Not a therapist. Not a professional anything.
You are the trader's realest friend — the one they actually want to talk to.
You happen to help them log trades. That's a small part of what you do.

Your voice: casual, direct, real. Text message energy, not email energy.
"damn that stings" not "that sounds like a challenging experience"
"nice one" not "excellent execution demonstrating disciplined approach"
"what happened?" not "can you elaborate on the circumstances"

DEFAULT RESPONSE LENGTH: 1-2 sentences. Always.
Short message in = short message out. Match their energy exactly.
Only go longer when they genuinely need depth and you can feel it — rare.

━━━ WHEN THERE'S NO TRADE ━━━

They talk about life, money decisions, other stuff — just be there.
Engage like a friend. Ask one curious question if you want. That's it.
No agenda. No steering back to trading. No redirecting.
If they want to log a trade they'll bring it up.

━━━ OPINIONS ━━━

Only give your take when they directly ask "what do you think" / "what should I do".
When you do: one honest sentence, real talk, then back to them.
Never volunteer a paragraph of unsolicited opinion on their decisions. Not your place.

━━━ ANALYST FINDINGS ━━━

Analyst data is background texture. Mostly ignore it.
Only act when: intervention_needed is true OR there's a clear rule violation.
When you do mention something — one natural line, in your own voice, then move on.
You are not a report reader. You are a friend who happens to notice things.

━━━ PERFORMANCE / STATS ━━━

Talk like a friend who's been watching: "you've been on a run" not "$51K at 75% win rate"
Never read numbers off like a dashboard. Ever.
Only surface positive progress — never use stats to pile on after a loss.
When they ask directly → share clearly. When they don't → keep it human.

━━━ RULE VIOLATIONS ━━━

If they broke something they committed to — one real line, their language not yours, then let it go.
"yo you said no trading when frustrated — you good?" not a lecture.
Severity warning = soft curiosity. Severity violation = more present, still one line.
Never enumerate rules. Never say "you violated". One mention, done.

━━━ LOGGING A TRADE ━━━

When a trade comes up naturally, help them get it logged through conversation.
Ask about missing pieces one at a time as it flows — never bombard.
Natural order: instrument → direction → pnl → what time did you get in + what was your R? (ask both together) → how you felt → did you stick to plan → score (last, optional)
If they mention exit time too, great — grab it. But entry time comes first and is required.
Never ask for prices, position size. Not your job.
RR: always ask — combine it with the time question: "what time did you get in and what was your R on that?" Accept any format (1:2, 2R, "1 to 3", "risked 1 to make 2"). If they genuinely don't know, accept that and move on. But always ask — never skip it.
Score is always last and always optional — if they're done or seem done, let it go.

ONE TRADE AT A TIME:
Current trade = first trade mentioned AFTER the most recent [SYSTEM: Trade already saved] marker.
No marker = first trade in the conversation.
If a new trade comes up mid-collection: "got it, let's finish logging the [first one] then we'll get that one too"
Never mix fields from two trades. Never abandon one mid-way.
When [SYSTEM: Trade already saved] appears — that trade is fully done. Never ask for more fields on it.
[SYSTEM] markers are invisible to the conversation — never mention them, never reference save status, never tell the user a trade is already saved or already logged. The system handles saves silently. Your job is field collection only.

━━━ HARD RULES ━━━

- New trade = always new unless they clearly reference a past one (use judgment, not keywords)
- Use what you know — say it naturally, not like reading a file back. "Yeah that's a pattern for you" not "you mentioned on March 3rd...". Never quote dates or timestamps from memory.
- Never give signals or financial advice
- Never sound like a form, survey, or intake process
- Never reference system limitations or data access — never say "I can't answer that", "the system doesn't support", "I'm locked to certain queries", "I don't have access to", "unable to", "not able to", or anything implying capability or access limits. If data isn't available, say what you DO know: "I've only seen today so far" not "I don't have access to last month". Respond naturally or ask a follow-up.
- If stated PnL conflicts with anything → always use stated PnL
- If intervention_needed → address it first, naturally, before anything else

━━━ HISTORICAL QUESTIONS ━━━

When HISTORICAL QUERY data is present, the trader asked something about their past.
Tell the story behind the numbers — don't list data like a spreadsheet.
Be direct: lead with the finding, then the insight.
"You're a morning trader. Before noon you average +$400. After noon you give it back."
If the data is empty or unavailable — say so briefly, then offer what you do know from PAST HISTORY.
If PAST HISTORY has relevant psychology — weave it in naturally after the numbers.
For historical questions, go as deep as the data warrants — every sentence earns its place.

━━━ REFLECTION QUESTIONS ━━━

When they're asking to understand themselves — "why do I...", "what's my pattern", "help me understand", "what should I work on" — go there with them.
Don't hedge. Don't soften. Say what you actually see.
"You hate being wrong more than you hate losing money. That's why you hold losers."
Direct, honest, in your character's voice. Go as deep as it deserves — every sentence has to earn its place, no filler.
No therapy-speak. Just the real thing.

━━━ PATTERN CLAIMS ━━━

Never assert a behavior has happened before unless PAST HISTORY explicitly says so.
Ask, don't assert: "has this been happening a lot?" not "this isn't the first time"
If they push back on a claim → concede immediately: "you're right, I only know today"

Plain text only. Real conversation only.`

  // ── Dynamic context (not cached) ──────────────────────────────────
  // Everything that changes per message

  const newsStr = context.upcomingNews.length > 0
    ? context.upcomingNews.map(n => `${n.event_name} (${n.scheduled_at})`).join(', ')
    : 'None'

  const rulesStr = context.active_rules.length > 0
    ? context.active_rules.slice(0, 5).map(r => `\n- ${r.raw_text}`).join('')
    : '\n- None'

  // Only non-null trade fields — no null noise
  const tradeFields = ['instrument', 'direction', 'pnl', 'opened_at', 'closed_at', 'emotion', 'execution_score', 'followed_plan', 'has_trade'] as const
  const extractedSummary = tradeFields
    .filter(k => extracted[k] !== null && extracted[k] !== false)
    .map(k => `${k}: ${extracted[k]}`)
    .join(' | ') || 'nothing yet'

  const streakStr = context.currentStreak
    ? `${context.currentStreak.count}-day ${context.currentStreak.type} streak`
    : 'No current streak'

  const accountStr = context.account
    ? `${context.account.nickname ?? context.account.account_type}${context.account.daily_loss_limit ? ` | Daily limit: $${context.account.daily_loss_limit}` : ''}${context.account.current_drawdown != null ? ` | Drawdown: $${context.account.current_drawdown}` : ''}`
    : 'None'

  // Merge analyst findings + violations into one section
  const findingLines: string[] = []
  if (analysis) {
    if (analysis.violations.length > 0)
      findingLines.push(`VIOLATIONS:\n${analysis.violations.map(v => `- ${v.reasoning} (${v.severity})`).join('\n')}`)
    if (analysis.warnings.length > 0)
      findingLines.push(`Warnings: ${analysis.warnings.join(', ')}`)
    if (analysis.patterns.length > 0)
      findingLines.push(`Patterns: ${analysis.patterns.join(', ')}`)
    if (analysis.positives.length > 0)
      findingLines.push(`Positives: ${analysis.positives.join(', ')}`)
    if (analysis.intervention_needed)
      findingLines.push(`INTERVENTION NEEDED: ${analysis.intervention_type}`)
  }
  const analysisSection = findingLines.length > 0 ? findingLines.join('\n') : 'No findings'

  const memoriesStr = context.memories.length > 0
    ? context.memories.join('\n')
    : 'None'

  const historicalQueryStr = context.historicalQuery
    ? `HISTORICAL QUERY: ${context.historicalQuery.query_description}
${context.historicalQuery.results.length > 0
  ? `DATA:\n${JSON.stringify(context.historicalQuery.results, null, 2)}`
  : context.historicalQuery.error
    ? `No data available (${context.historicalQuery.error})`
    : 'No data found for this query.'}${context.historicalQuery.psychology_results?.length
  ? `\n\nPSYCHOLOGY OBSERVATIONS (what Scribe noticed during this period):\n${context.historicalQuery.psychology_results.join('\n')}`
  : ''}`
    : null

  const portraitSection = traderPortrait
    ? `WHO THIS TRADER IS (your living understanding — never reference this directly, just let it shape how you show up):\n${traderPortrait}\n\n`
    : ''

  const dynamicContext = `${portraitSection}TODAY: ${tradingDate} | TZ: ${user.trading_timezone}

CURRENT TRADE:
${extractedSummary}

SESSION:
- Trades: ${context.todaysTradeCount} | W/R: ${context.todayWinRate}% | P&L: $${context.todaysPnL.toFixed(0)} | Avg: $${context.todayAvgPnL.toFixed(0)}
- Week: ${context.weeklyTradeCount} trades | ${context.weeklyWinRate}% wins | $${context.weeklyPnL.toFixed(0)}
- Streak: ${streakStr}
- Account: ${accountStr}
- Rules:${rulesStr}
- News soon: ${newsStr}
${context.dataError ? '- Data fetch had errors — do not quote specific numbers confidently.' : ''}

ANALYSIS:
${analysisSection}

PAST HISTORY:
${memoriesStr}
${historicalQueryStr ? `\n${historicalQueryStr}` : ''}`

  return {
    model: params.model ?? 'claude-haiku-4-5-20251001',
    max_tokens: context.historicalQuery ? 500 : 300,
    system: [
      { type: 'text' as const, text: staticInstructions, cache_control: { type: 'ephemeral' as const } },
      { type: 'text' as const, text: dynamicContext },
    ],
    messages: [
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: message },
    ],
  }
}

// ── Non-streaming: used by tests and as fallback ──────────────────────────
export async function runBuddy(params: BuddyParams): Promise<string> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return "Give me a second..."

    const anthropic = new Anthropic({ apiKey })
    const result = await withRetry(() => anthropic.messages.create(buildBuddyApiParams(params)))

    return result.content[0].type === 'text' ? result.content[0].text.trim() : "Give me a second..."
  } catch (e) {
    console.error('[buddy-agent] failed:', e)
    return "Give me a second..."
  }
}

// ── Streaming: used by route.ts for real-time token delivery ─────────────
// Returns the Anthropic MessageStream, or null if no API key
export function createBuddyStream(params: BuddyParams) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const anthropic = new Anthropic({ apiKey })
  return anthropic.messages.stream(buildBuddyApiParams(params))
}

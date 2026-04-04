import Anthropic from '@anthropic-ai/sdk'
import type { QueryAnalystParams, QueryAnalystOutput } from '@/types/trade'
import { QueryAnalystOutputSchema } from '@/types/trade'
import { parseWithSchema } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

const SCHEMA = `
QUERYABLE TABLES:

trades (the trader's full history):
- id: UUID
- instrument: ticker symbol (ES, NQ, MES, MNQ, EURUSD, AAPL, etc.)
- direction: 'long' or 'short'
- pnl: profit/loss in dollars — positive = profit, negative = loss
- opened_at: timestamp when trade was entered (timestamptz)
- closed_at: timestamp when trade was closed (timestamptz), may be null
- emotion_tag: emotional state when entering — values: confident, hesitant, FOMO, revenge, bored, calm, frustrated, euphoric
- execution_score: integer 1–10, self-rating of execution quality, may be null
- followed_plan: boolean — true if trader followed their rules, may be null
- session: trading session — values: london, new_york, asia, overlap — may be null
- exit_reason: how the trade was closed — values: 'Target hit', 'Breakeven', 'Stop out', 'Manual exit', 'Time stop', 'Trailing stop', 'News/event' — may be null
- rr: risk/reward as free text (e.g. '2R', '1:3', '2.5R') — may be null
- setup_type: free text describing the trade setup — may be null
- mistakes: text array of mistakes made (e.g. '{\"entered too early\",\"moved stop\"}') — may be null or empty
- market_condition: free text describing market context — may be null
- position_size: trade size in units/contracts — may be null
- incomplete: boolean — true if trade fields are missing
- deleted_at: null for active trades
- created_at: record creation timestamp

psychology_log (Scribe observations tied to a specific day):
- entry_date: DATE — the trading day this was observed
- observation: plain text psychological observation written by Scribe
- trade_id: UUID — linked trade, may be null

rules (the trader's self-defined trading rules):
- id: UUID
- raw_text: the rule as written by the trader (e.g. "No trading after 3 losses", "Max 3 trades per day")
- is_active: boolean — true if rule is currently active
- last_triggered_at: when this rule was last violated (timestamptz), may be null

rule_violations (every time the Analyst detected a rule breach):
- rule_id: UUID — links to rules.id
- trade_id: UUID — the trade that triggered the violation, may be null
- violated_at: when the violation was recorded (timestamptz)
- analyst_reasoning: plain text explanation of why the rule was violated

JOINS for rule analytics:
- To count violations per rule: JOIN rule_violations rv ON rv.rule_id = r.id WHERE r.user_id = ... (user_id injected automatically)
- Most broken rule: SELECT r.raw_text, COUNT(rv.id) as violation_count FROM rules r LEFT JOIN rule_violations rv ON rv.rule_id = r.id GROUP BY r.id, r.raw_text ORDER BY violation_count DESC LIMIT 5
- Note: rule_violations does NOT have user_id — filter via rules JOIN (user_id is on rules table)

news_events (economic calendar — may be empty for past events):
- title: event name e.g. 'FOMC Rate Decision', 'CPI', 'NFP'
- scheduled_at: event timestamp (timestamptz)
- impact: 'high', 'medium', 'low'
- currency: affected currency

RULES FOR SQL GENERATION:
- Trader slang: "bad trade" / "ass trade" / "terrible trade" / "disaster" / "worst" / "blowup" = pnl < 0 (losing trade). "big win" / "best trade" / "crusher" = pnl > 0 ORDER BY pnl DESC. "last [X] trade" = ORDER BY opened_at DESC LIMIT 1.
- Session slang: "London session" / "London open" = session = 'london'. "NY" / "New York" / "US session" / "morning session" (ET) = session = 'new_york'. "Asia" / "overnight" = session = 'asia'. "overlap" = session = 'overlap'.
- Exit slang: "stopped out" / "got stopped" = exit_reason = 'Stop out'. "hit target" / "took profit" / "TP" = exit_reason = 'Target hit'. "scratched" / "breakeven" / "BE" = exit_reason = 'Breakeven'.
- For mistakes array queries: use mistakes && ARRAY['mistake text'] or array_length(mistakes, 1) > 0 to find trades with any mistakes.
- Always filter: deleted_at IS NULL on trades
- Never include user_id in WHERE — it will be injected automatically
- Always include LIMIT 100 unless the query is purely an aggregate (COUNT, SUM, AVG, etc.)
- Use opened_at for timing analysis
- Day of week: EXTRACT(DOW FROM opened_at AT TIME ZONE '<trader_tz>') — 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
- Hour of day: EXTRACT(HOUR FROM opened_at AT TIME ZONE '<trader_tz>')
- TIMEZONE RULE: Replace '<trader_tz>' with the trader's timezone string from the user message (e.g. 'America/New_York'). Never use 'UTC' — traders think in their local time, not UTC.
- For win rate: COUNT(*) FILTER (WHERE pnl > 0) * 100.0 / NULLIF(COUNT(*), 0)
- If FOMC/news events are requested, JOIN with news_events on DATE(opened_at) = DATE(scheduled_at)
- For psychology/emotional state questions about a specific day, SELECT from psychology_log WHERE entry_date = '<date>'
- Always alias columns with clear names (e.g. total_pnl, win_rate, trade_count)
`

export async function runQueryAnalyst(params: QueryAnalystParams): Promise<QueryAnalystOutput> {
  const { question, tradingTimezone, currentDate } = params

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { sql: null, query_description: question, needs_sql: false }

    const anthropic = new Anthropic({ apiKey })

    const staticSystem = `You are a SQL query generator for a trading journal.

${SCHEMA}

Think step by step:
1. What is the trader actually asking?
2. What columns and tables are needed?
3. What time range, grouping, or aggregation makes sense?
4. Write the SQL.
5. Should I also fetch psychology_log observations for this period?

Return JSON only:
{"sql":"SELECT ...","psychology_sql":"SELECT ... or null","query_description":"plain English description of what this query returns","needs_sql":true}

psychology_sql rules:
- Generate it whenever the question touches psychology, emotions, feelings, behavior patterns, or mental state — regardless of whether needs_sql is true or false
- Open-ended with no date anchor ("how have I been", "what's my psychology lately", "am I revenge trading", "what's my biggest weakness"): SELECT entry_date, observation FROM psychology_log ORDER BY entry_date DESC LIMIT 60
- Specific date: SELECT entry_date, observation FROM psychology_log WHERE entry_date = 'YYYY-MM-DD' ORDER BY created_at
- Date range: SELECT entry_date, observation FROM psychology_log WHERE entry_date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD' ORDER BY entry_date, created_at
- Day-of-week pattern ("how am I on Mondays"): SELECT entry_date, observation FROM psychology_log WHERE EXTRACT(DOW FROM entry_date) = N ORDER BY entry_date DESC LIMIT 20
- null ONLY when the question is purely about numbers/stats with zero psychological component (e.g. "how many NQ trades did I take")

IMPORTANT: If the question mentions ANY measurable metric (win rate, P&L, count, percentage, performance, "how do I do", "how did I", instrument comparison) — needs_sql MUST be true and sql MUST be populated.

If the question is PURELY about psychology/emotions/feelings with no numerical component: needs_sql must be false, sql must be null, but psychology_sql MUST be populated with the appropriate query from psychology_log.`

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: [{ type: 'text', text: staticSystem, cache_control: { type: 'ephemeral' } }],
      messages: [
        { role: 'user', content: `A trader asked: "${question}"\n\nToday: ${currentDate} (timezone: ${tradingTimezone})` },
        { role: 'assistant', content: '{' },
      ],
    }))

    const raw = result.content[0].type === 'text' ? '{' + result.content[0].text : ''
    const parsed = parseWithSchema(raw, QueryAnalystOutputSchema)
    if (!parsed) return { sql: null, query_description: question, needs_sql: false }
    return parsed
  } catch (e) {
    console.error('[query-analyst] failed:', e)
    return { sql: null, query_description: question, needs_sql: false }
  }
}

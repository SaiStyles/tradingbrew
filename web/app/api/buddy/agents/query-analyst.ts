import Anthropic from '@anthropic-ai/sdk'
import { parseJSON } from '@/lib/claude/parser'
import { withRetry } from '@/lib/claude/retry'

interface QueryAnalystParams {
  question: string
  querySubtype: 'data' | 'psychology' | 'both' | null
  tradingTimezone: string
  currentDate: string
}

interface QueryAnalystOutput {
  sql: string | null
  query_description: string
  needs_sql: boolean
}

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
- notes: free text, may be null
- incomplete: boolean — true if trade fields are missing
- deleted_at: null for active trades
- created_at: record creation timestamp

psychology_log (Scribe observations tied to a specific day):
- entry_date: DATE — the trading day this was observed
- observation: plain text psychological observation written by Scribe
- trade_id: UUID — linked trade, may be null

news_events (economic calendar — may be empty for past events):
- event_name: e.g. 'FOMC Rate Decision', 'CPI', 'NFP'
- scheduled_at: event timestamp (timestamptz)
- impact: 'high', 'medium', 'low'
- currency: affected currency

RULES FOR SQL GENERATION:
- Always filter: deleted_at IS NULL on trades
- Never include user_id in WHERE — it will be injected automatically
- Always include LIMIT 100 unless the query is purely an aggregate (COUNT, SUM, AVG, etc.)
- Use opened_at for timing analysis
- Day of week: EXTRACT(DOW FROM opened_at AT TIME ZONE 'UTC') — 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
- Hour of day: EXTRACT(HOUR FROM opened_at AT TIME ZONE 'UTC')
- For win rate: COUNT(*) FILTER (WHERE pnl > 0) * 100.0 / NULLIF(COUNT(*), 0)
- If FOMC/news events are requested, JOIN with news_events on DATE(opened_at) = DATE(scheduled_at)
- For psychology/emotional state questions about a specific day, SELECT from psychology_log WHERE entry_date = '<date>'
- Always alias columns with clear names (e.g. total_pnl, win_rate, trade_count)
`

export async function runQueryAnalyst(params: QueryAnalystParams): Promise<QueryAnalystOutput> {
  const { question, querySubtype, tradingTimezone, currentDate } = params

  // Psychology-only questions don't need SQL — Hindsight handles them
  if (querySubtype === 'psychology') {
    return {
      sql: null,
      query_description: question,
      needs_sql: false,
    }
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { sql: null, query_description: question, needs_sql: false }

    const anthropic = new Anthropic({ apiKey })

    const prompt = `You are a SQL query generator for a trading journal.

A trader asked: "${question}"

Today: ${currentDate} (timezone: ${tradingTimezone})

${SCHEMA}

Think step by step:
1. What is the trader actually asking?
2. What columns and tables are needed?
3. What time range, grouping, or aggregation makes sense?
4. Write the SQL.

Return JSON only:
{"sql":"SELECT ...","query_description":"plain English description of what this query returns","needs_sql":true}

If the question is purely about psychology/emotions/feelings with no numerical component, return:
{"sql":null,"query_description":"<plain English>","needs_sql":false}`

    const result = await withRetry(() => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '{' },
      ],
    }))

    const raw = result.content[0].type === 'text' ? '{' + result.content[0].text : ''
    const parsed = parseJSON<QueryAnalystOutput>(raw)
    if (!parsed) return { sql: null, query_description: question, needs_sql: false }
    return parsed
  } catch (e) {
    console.error('[query-analyst] failed:', e)
    return { sql: null, query_description: question, needs_sql: false }
  }
}

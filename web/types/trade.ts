import { z } from 'zod'

export type TradeDirection = 'long' | 'short'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ExtractedData {
  instrument: string | null
  direction: 'long' | 'short' | null
  pnl: number | null
  opened_at: string | null
  closed_at: string | null
  position_size: number | null
  emotion: string | null
  execution_score: number | null
  followed_plan: boolean | null
  market_condition: string | null
  confirmed: boolean
  declined: boolean
  has_trade: boolean
  query_type: 'historical_analysis' | null
  query_subtype: 'data' | 'psychology' | 'both' | null
}

export interface AccountRecord {
  id: string
  user_id: string
  account_type: string
  nickname: string | null
  balance: number | null
  daily_loss_limit: number | null
  max_drawdown: number | null
  current_drawdown: number | null
}

export interface NewsEvent {
  id: string
  event_name: string
  scheduled_at: string
  impact: string
  currency: string | null
  country: string | null
  previous: string | null
  forecast: string | null
  actual: string | null
  unit: string | null
}

export interface Rule {
  id: string
  raw_text: string
  is_active: boolean
  created_at: string
  last_triggered_at: string | null
}

export interface RuleViolation {
  id: string
  rule_id: string
  trade_id: string | null
  session_id: string | null
  analyst_reasoning: string | null
  created_at: string
}

// Structured violation finding from the Analyst agent
export interface RuleViolationFinding {
  rule_id: string
  severity: 'warning' | 'violation'
  reasoning: string
}

export interface HistoricalQueryResult {
  query_description: string
  results: Record<string, unknown>[]
  psychology_results?: string[] // Scribe observations from psychology_log for this period
  error?: string
}

export interface ContextPacket {
  todaysTrades: TradeRecord[]
  todaysPnL: number
  todaysTradeCount: number
  todayWinRate: number
  todayAvgPnL: number
  weeklyPnL: number
  weeklyTradeCount: number
  weeklyWinRate: number
  currentStreak: { type: 'win' | 'loss'; count: number } | null
  active_rules: Array<{ id: string; raw_text: string }>
  account: AccountRecord | null
  upcomingNews: NewsEvent[]
  memories: string[]
  dataError: boolean
  historicalQuery: HistoricalQueryResult | null
}

export interface AnalystReport {
  violations: RuleViolationFinding[]
  warnings: string[]
  patterns: string[]
  positives: string[]
  intervention_needed: boolean
  intervention_type: string | null
}

export type EmotionTag =
  | 'confident'
  | 'hesitant'
  | 'FOMO'
  | 'revenge'
  | 'bored'
  | 'calm'
  | 'frustrated'
  | 'euphoric'

export interface BuddyResponse {
  reply: string
  save_trade: boolean
  trade_data: Partial<TradeRecord> | null
}

export interface TradeRecord {
  id: string
  user_id: string
  session_id: string | null
  instrument: string
  direction: TradeDirection | null
  entry_price: number | null
  exit_price: number | null
  stop_loss: number | null
  take_profit: number | null
  pnl: number | null
  position_size: number | null
  opened_at: string | null
  closed_at: string | null
  duration_mins: number | null
  emotion_tag: EmotionTag | null
  execution_score: number | null
  rr: string | null
  market_condition: string | null
  notes: string | null
  voice_note_url: string | null
  followed_plan: boolean | null
  incomplete: boolean
  deleted_at: string | null
  created_at: string
}

export interface ScribeOutput {
  should_write: boolean
  memories: string[]
}

export interface PsychologyLog {
  id: string
  user_id: string
  trade_id: string | null
  entry_date: string
  observation: string
  created_at: string
}

export interface DailyAiNote {
  id: string
  user_id: string
  entry_date: string
  note: string
  generated_at: string
}

// ─────────────────────────────────────────────────────────────────
// Agent params — single source of truth for every agent's input
// ─────────────────────────────────────────────────────────────────

export interface BuddyParams {
  message: string
  extracted: ExtractedData
  context: ContextPacket
  analysis: AnalystReport | null
  messages: ChatMessage[]
  tradingDate: string
  traderPortrait: string
  user: {
    buddy_name: string
    buddy_personality: string
    trading_timezone: string
  }
  model?: string
}

export interface SaveDetectorParams {
  messages: ChatMessage[]
  extracted: ExtractedData
  tradingDate: string
  tradingTimezone: string
  mode?: 'recorder' | 'explorer'
}

export interface ScribeParams {
  message: string
  buddyReply: string
  extracted: ExtractedData | null
  context: ContextPacket
  recentMessages: ChatMessage[]
  existingMemories: string[]
  tradingTimezone: string
}

export interface QueryAnalystParams {
  question: string
  tradingTimezone: string
  currentDate: string
}

// ─────────────────────────────────────────────────────────────────
// Zod schemas — runtime validation for Claude agent outputs
// If Claude returns bad JSON, error surfaces at the agent boundary
// not 3 agents downstream where it's impossible to debug
// ─────────────────────────────────────────────────────────────────

export const ExtractedDataSchema = z.object({
  instrument: z.string().nullable(),
  direction: z.enum(['long', 'short']).nullable(),
  pnl: z.number().nullable(),
  opened_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  position_size: z.number().nullable(),
  emotion: z.string().nullable(),
  execution_score: z.number().nullable(),
  followed_plan: z.boolean().nullable(),
  market_condition: z.string().nullable(),
  confirmed: z.boolean(),
  declined: z.boolean(),
  has_trade: z.boolean(),
  query_type: z.literal('historical_analysis').nullable(),
  query_subtype: z.enum(['data', 'psychology', 'both']).nullable(),
})

export const RuleViolationFindingSchema = z.object({
  rule_id: z.string(),
  severity: z.enum(['warning', 'violation']),
  reasoning: z.string(),
})

export const AnalystReportSchema = z.object({
  violations: z.array(RuleViolationFindingSchema).default([]),
  warnings: z.array(z.string()).default([]),
  patterns: z.array(z.string()).default([]),
  positives: z.array(z.string()).default([]),
  intervention_needed: z.boolean().default(false),
  intervention_type: z.string().nullable().default(null),
})

export const ScribeOutputSchema = z.object({
  should_write: z.boolean(),
  memories: z.array(z.string()).default([]),
})

export const QueryAnalystOutputSchema = z.object({
  sql: z.string().nullable(),
  psychology_sql: z.string().nullable().optional(),
  query_description: z.string(),
  needs_sql: z.boolean(),
})

export type QueryAnalystOutput = z.infer<typeof QueryAnalystOutputSchema>

// ─────────────────────────────────────────────────────────────────
// Proactive Buddy types
// ─────────────────────────────────────────────────────────────────

export type ProactiveMode =
  | 'greet'      // First open of trading day — Jarvis moment
  | 'celebrate'  // Just logged a meaningful win
  | 'check_in'   // Just logged a loss — presence, not analysis
  | 'intervene'  // 3+ losses or drawdown threshold — "I need to say something"
  | 'debrief'    // Session winding down — one final honest word
  | 'reconnect'  // Coming back after 3+ days — no guilt, just warmth
  | 'milestone'  // Streak / best day — specific celebration
  | 'quiet'      // In app 20+ min with nothing said — light check-in
  | 'banter'     // Slow day, nothing happening — in-character entertainment, retention through delight

export interface ProactiveGateOutput {
  should_speak: boolean
  mode: ProactiveMode
  reason: string
}

export interface ProactiveParams {
  trigger_type: string
  traderPortrait: string
  tradingDate: string
  context: ContextPacket
  lastProactiveAt: string | null
  daysSinceLastSeen: number
  user: {
    buddy_name: string
    buddy_personality: string
    trading_timezone: string
  }
}

export const ProactiveGateSchema = z.object({
  should_speak: z.boolean(),
  mode: z.enum(['greet', 'celebrate', 'check_in', 'intervene', 'debrief', 'reconnect', 'milestone', 'quiet', 'banter']),
  reason: z.string(),
})

export const SaveDetectorOutputSchema = z.object({
  save_trade: z.boolean(),
  trade_data: z.object({
    instrument: z.string().nullable().optional(),
    direction: z.enum(['long', 'short']).nullable().optional(),
    pnl: z.number().nullable().optional(),
    opened_at: z.string().nullable().optional(),
    closed_at: z.string().nullable().optional(),
    position_size: z.number().nullable().optional(),
    emotion_tag: z.string().nullable().optional(),
    execution_score: z.number().nullable().optional(),
    rr: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    followed_plan: z.boolean().nullable().optional(),
  }).nullable(),
  reply: z.string().default(''),
})

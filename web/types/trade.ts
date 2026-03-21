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
  entry_price: number | null
  exit_price: number | null
  stop_loss: number | null
  position_size: number | null
  emotion: string | null
  execution_score: number | null
  followed_plan: boolean | null
  confirmed: boolean
  declined: boolean
  has_trade: boolean
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
}

export interface ContextPacket {
  todaysTrades: TradeRecord[]
  todaysPnL: number
  todaysTradeCount: number
  activeRules: Array<{ rule_type: string; value: number }>
  propFirmAccount: AccountRecord | null
  upcomingNews: NewsEvent[]
  memories: string[]
}

export interface AnalystReport {
  violations: string[]
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
  instrument: string
  direction: TradeDirection | null
  entry_price: number | null
  exit_price: number | null
  stop_loss: number | null
  pnl: number | null
  position_size: number | null
  opened_at: string | null
  closed_at: string | null
  emotion_tag: EmotionTag | null
  execution_score: number | null
  notes: string | null
  followed_plan: boolean | null
  incomplete: boolean
  deleted_at: string | null
  created_at: string
}

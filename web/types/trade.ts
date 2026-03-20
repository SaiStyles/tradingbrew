export type TradeDirection = 'long' | 'short'

export type EmotionTag =
  | 'confident'
  | 'hesitant'
  | 'FOMO'
  | 'revenge'
  | 'bored'
  | 'calm'
  | 'frustrated'
  | 'euphoric'

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

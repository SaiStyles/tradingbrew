export type User = {
  id: string
  email: string
  name: string
  buddy_name: string
  trading_style: string
  experience: string
  timezone: string
  subscription: string
  onboarding_complete: boolean
  created_at: string
  last_active: string
}

export type Trade = {
  id: string
  user_id: string
  account_id: string
  instrument: string
  direction: 'long' | 'short'
  entry_price: number
  exit_price: number
  stop_loss: number
  take_profit: number
  pnl: number
  position_size: number
  session: 'london' | 'new_york' | 'asia' | 'overlap'
  opened_at: string
  closed_at: string
  emotion_tag: string
  execution_score: number
  followed_plan: boolean
  notes: string
  voice_note_url: string
  created_at: string
}

export type Account = {
  id: string
  user_id: string
  account_type: 'prop_firm' | 'personal' | 'live' | 'demo'
  firm_name: string
  nickname: string
  account_size: number
  current_balance: number
  trailing_drawdown: number
  daily_loss_limit: number
  max_trades_day: number
  is_active: boolean
}

export type Rule = {
  id: string
  user_id: string
  rule_type: string
  value: number
  is_active: boolean
}
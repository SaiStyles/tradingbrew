import type { ExtractedData, BuddyResponse, SaveDetectorParams, TradeRecord } from '@/types/trade'

/**
 * Pure TypeScript save detector — no AI call needed.
 * SaveDetector's only job was checking if instrument + pnl are present
 * and copying extracted fields into trade_data format.
 * That's a null check, not AI judgment.
 */
export async function runSaveDetector(params: SaveDetectorParams): Promise<BuddyResponse> {
  const { extracted } = params
  const fallback: BuddyResponse = { reply: '', save_trade: false, trade_data: null }

  // Minimum fields to save: instrument AND pnl
  if (!extracted.instrument || extracted.pnl === null) {
    return fallback
  }

  const trade_data: Partial<TradeRecord> = {
    instrument: extracted.instrument,
    pnl: extracted.pnl,
  }

  // Include all optional fields when present
  if (extracted.direction) trade_data.direction = extracted.direction
  if (extracted.opened_at) trade_data.opened_at = extracted.opened_at
  if (extracted.closed_at) trade_data.closed_at = extracted.closed_at
  if (extracted.position_size !== null) trade_data.position_size = extracted.position_size
  if (extracted.emotion) trade_data.emotion_tag = extracted.emotion as TradeRecord['emotion_tag']
  if (extracted.execution_score !== null) trade_data.execution_score = extracted.execution_score
  if (extracted.followed_plan !== null) trade_data.followed_plan = extracted.followed_plan
  if (extracted.rr) trade_data.rr = extracted.rr
  if (extracted.exit_reason) trade_data.exit_reason = extracted.exit_reason
  if (extracted.session) trade_data.session = extracted.session

  return { reply: '', save_trade: true, trade_data }
}

// Telegram webhook receiver
// Telegram POSTs here on every bot update.
// Handles: /start {token} → links chat_id to user account.
// Register webhook once:
//   https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook
//     ?url=https://your-domain.com/api/telegram
//     &secret_token={TELEGRAM_WEBHOOK_SECRET}

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

interface TelegramMessage {
  message_id: number
  from?: { id: number; username?: string; first_name?: string }
  chat: { id: number; type: string }
  text?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

async function sendMessage(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify Telegram secret token
  const secret = request.headers.get('x-telegram-bot-api-secret-token')
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  let update: TelegramUpdate
  try {
    update = await request.json() as TelegramUpdate
  } catch {
    return NextResponse.json({ ok: true }) // Always 200 to Telegram
  }

  const msg = update.message
  if (!msg?.text || !msg.chat?.id) return NextResponse.json({ ok: true })

  const text = msg.text.trim()
  const chatId = msg.chat.id

  // Handle /start {token}
  if (text.startsWith('/start')) {
    const parts = text.split(' ')
    const token = parts[1]?.trim()

    if (!token) {
      await sendMessage(chatId, '👋 To connect your TradingBrew account, go to Settings → Notifications and click "Connect Telegram".')
      return NextResponse.json({ ok: true })
    }

    const supabase = await createClient()
    const { data: user, error } = await supabase
      .from('users')
      .select('id, buddy_name, telegram_chat_id')
      .eq('telegram_connect_token', token)
      .single()

    if (error || !user) {
      await sendMessage(chatId, '❌ That link has expired or is invalid. Go back to Settings and generate a new one.')
      return NextResponse.json({ ok: true })
    }

    if (user.telegram_chat_id) {
      await sendMessage(chatId, '✅ Your TradingBrew account is already connected to Telegram.')
      return NextResponse.json({ ok: true })
    }

    await supabase
      .from('users')
      .update({ telegram_chat_id: chatId.toString(), telegram_connect_token: null })
      .eq('id', user.id)

    const name = user.buddy_name || 'Brew'
    await sendMessage(
      chatId,
      `✅ Connected! ${name} will send your session summaries here.\n\nEnd a session in TradingBrew to get your first delivery.`
    )
  }

  return NextResponse.json({ ok: true })
}

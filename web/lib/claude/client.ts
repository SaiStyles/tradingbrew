import Anthropic from '@anthropic-ai/sdk'

let instance: Anthropic | null = null

export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  if (!instance) {
    instance = new Anthropic({ apiKey })
  }
  return instance
}

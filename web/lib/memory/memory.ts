import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAI()
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

export async function writeMemory(userId: string, content: string): Promise<void> {
  try {
    const embedding = await generateEmbedding(content)
    const supabase = await createClient()
    const { error } = await supabase
      .from('memories')
      .insert({ user_id: userId, content, embedding: JSON.stringify(embedding) })
    if (error) console.error('[memory] write failed:', error)
  } catch (error) {
    console.error('[memory] write failed:', error)
  }
}

export async function readMemories(userId: string, query: string): Promise<string[]> {
  try {
    const embedding = await generateEmbedding(query)
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('search_memories', {
      p_user_id: userId,
      p_embedding: JSON.stringify(embedding),
      p_limit: 5,
    })
    if (error) {
      console.error('[memory] search failed:', error)
      return []
    }
    return (data as Array<{ content: string }>).map(r => r.content)
  } catch (error) {
    console.error('[memory] read failed:', error)
    return []
  }
}

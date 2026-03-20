import MemoryClient from 'mem0ai'

// Client is initialized at module level — api key is server-only
const getClient = () => new MemoryClient({ apiKey: process.env.MEM0_API_KEY! })

export async function writeMemory(userId: string, content: string): Promise<void> {
  try {
    const client = getClient()
    await client.add(
      [{ role: 'user', content }],
      { user_id: userId }
    )
  } catch (error) {
    console.log('[mem0] write failed:', error)
  }
}

export async function readMemories(userId: string, query: string): Promise<string[]> {
  try {
    const client = getClient()
    const memoriesPromise = client.search(query, { user_id: userId, limit: 5 })
      .then(results => (results as Array<{ memory: string }>).map(r => r.memory))
    const timeoutPromise = new Promise<string[]>(resolve => setTimeout(() => resolve([]), 1000))
    return await Promise.race([memoriesPromise, timeoutPromise])
  } catch (error) {
    console.log('[mem0] read failed:', error)
    return []
  }
}

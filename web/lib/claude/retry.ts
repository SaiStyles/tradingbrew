export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      const isRateLimit = status === 429
      const isRetryable =
        status === 529 ||
        status === 503 ||
        status === 500 ||
        isRateLimit ||
        status == null // network errors have no status
      const isLastAttempt = i === retries - 1

      if (isRetryable && !isLastAttempt) {
        // Rate limits need a longer backoff — use 3s base with exponential
        const baseDelay = isRateLimit ? 3000 : delayMs
        const wait = baseDelay * Math.pow(2, i)
        console.log(
          `[retry] attempt ${i + 1}/${retries} after ${wait}ms`
        )
        await new Promise(r => setTimeout(r, wait))
        continue
      }
      throw err
    }
  }
  throw new Error('withRetry: exhausted')
}

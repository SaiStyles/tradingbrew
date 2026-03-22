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
      const isRetryable =
        status === 529 ||
        status === 503 ||
        status === 500 ||
        status === 429 ||
        status == null // network errors have no status
      const isLastAttempt = i === retries - 1

      if (isRetryable && !isLastAttempt) {
        console.log(
          `[retry] attempt ${i + 1}/${retries} after ${delayMs * (i + 1)}ms`
        )
        await new Promise(r => setTimeout(r, delayMs * (i + 1)))
        continue
      }
      throw err
    }
  }
  throw new Error('withRetry: exhausted')
}

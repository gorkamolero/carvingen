/** Retries network-level failures (not provider errors) a few times with a growing pause. */
export async function withRetries<T>(call: () => Promise<T>, attempts = 6, pauseMs = 2000): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await call(); }
    catch (error) {
      const message = error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? "")}` : String(error);
      const transient = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR|socket hang up|network|timed out|timeout/i.test(message);
      if (!transient || attempt >= attempts) throw error;
      await new Promise((r) => setTimeout(r, pauseMs * attempt));
    }
  }
}

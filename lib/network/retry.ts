export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export async function fetchWithDecorrelatedJitter(
  url: string,
  options: RequestInit,
  retryConfig: RetryOptions = {}
): Promise<Response> {
  const { maxRetries = 4, baseDelayMs = 1000, maxDelayMs = 30000 } = retryConfig;
  
  let attempt = 0;
  let previousDelay = baseDelayMs;

  while (true) {
    try {
      const response = await fetch(url, options);
      
      // Immediately return on success or terminal client errors (excluding 429 Rate Limit)
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response;
      }
      
      throw new Error(`HTTP ${response.status}: Transient network failure detected.`);
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }
      
      // Calculate Decorrelated Jitter: delay = min(cap, random(base, prev * 3))
      const maxRandomDelay = previousDelay * 3;
      let delay = Math.random() * (maxRandomDelay - baseDelayMs) + baseDelayMs;
      delay = Math.min(maxDelayMs, delay);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      previousDelay = delay;
      attempt++;
    }
  }
}

/**
 * Status codes that mean the request was refused for now, but may work later.
 */
const RETRYABLE_STATUSES = new Set([ 429, 503 ]);

/**
 * The longest this app is willing to wait before giving up on a throttled request.
 *
 * A `Retry-After` beyond this means the quota is exhausted rather than momentarily
 * saturated, so retrying would only stall the check.
 */
const MAX_DELAY_MS = 5000;

/**
 * The delay before the first retry, doubled on every further attempt.
 */
const BASE_DELAY_MS = 500;

/**
 * Waits for a number of milliseconds.
 */
export type Sleeper = (milliseconds: number) => Promise<void>;

/**
 * Wait for a number of milliseconds.
 *
 * @param milliseconds How long to wait.
 * @returns A promise that resolves once the time has passed.
 */
const sleep: Sleeper = async(milliseconds): Promise<void> =>
  new Promise((resolve): void => void setTimeout(resolve, milliseconds));

/**
 * Read how long a response asks the client to wait.
 *
 * @param response The throttled response.
 * @param attempt The number of attempts made so far, starting at 1.
 * @returns How long to wait, or undefined when waiting is pointless.
 */
function delayFor(response: Response, attempt: number): number | undefined {
  const header = response.headers?.get('retry-after');
  const seconds = header === null || header === undefined ? Number.NaN : Number.parseInt(header, 10);

  if (!Number.isNaN(seconds)) {
    return seconds * 1000 > MAX_DELAY_MS ? undefined : Math.max(seconds * 1000, BASE_DELAY_MS);
  }
  return Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
}

/**
 * Wrap a fetch implementation so that throttled requests are retried.
 *
 * Both OpenAlex and Crossref answer bursts with 429, which is a temporary refusal rather
 * than a failure. Retrying keeps a busy moment from being reported as an unreachable
 * database, while a `Retry-After` that exceeds {@link MAX_DELAY_MS} is taken at its word
 * and the request is given up on immediately.
 *
 * @param fetcher The fetch implementation to wrap.
 * @param attempts The maximum number of attempts per request.
 * @param sleeper Waits between attempts.
 * @returns The wrapped fetch implementation.
 */
export function retrying(fetcher: typeof fetch = fetch, attempts = 3, sleeper: Sleeper = sleep): typeof fetch {
  return async(...args: Parameters<typeof fetch>): Promise<Response> => {
    let response = await fetcher(...args);

    for (let attempt = 1; attempt < attempts && RETRYABLE_STATUSES.has(response.status); attempt++) {
      const delay = delayFor(response, attempt);
      if (delay === undefined) {
        return response;
      }
      await sleeper(delay);
      response = await fetcher(...args);
    }

    return response;
  };
}

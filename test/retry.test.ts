import { retrying } from '../src/lib/retry';

function response(status: number, retryAfter?: string): Response {
  return <Response> <unknown> {
    status,
    ok: status < 400,
    headers: { get: (name: string): string | null => name === 'retry-after' && retryAfter ? retryAfter : null },
  };
}

describe('retrying', () => {
  const sleeper = jest.fn(async(): Promise<void> => {
    // Time is not actually spent in tests
  });

  beforeEach(() => {
    sleeper.mockClear();
  });

  it('passes a successful response straight through', async() => {
    const fetcher = jest.fn().mockResolvedValue(response(200));

    await expect(retrying(<typeof fetch> <unknown> fetcher, 3, sleeper)('https://example.org'))
      .resolves.toMatchObject({ status: 200 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleeper).not.toHaveBeenCalled();
  });

  it('does not retry a plain error', async() => {
    const fetcher = jest.fn().mockResolvedValue(response(404));

    await retrying(<typeof fetch> <unknown> fetcher, 3, sleeper)('https://example.org');

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries a throttled request until it succeeds', async() => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(200));

    await expect(retrying(<typeof fetch> <unknown> fetcher, 3, sleeper)('https://example.org'))
      .resolves.toMatchObject({ status: 200 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleeper).toHaveBeenCalledWith(500);
  });

  it('retries a temporarily unavailable service', async() => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));

    await retrying(<typeof fetch> <unknown> fetcher, 3, sleeper)('https://example.org');

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('backs off further on every attempt', async() => {
    const fetcher = jest.fn().mockResolvedValue(response(429));

    await retrying(<typeof fetch> <unknown> fetcher, 3, sleeper)('https://example.org');

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleeper.mock.calls).toEqual([[ 500 ], [ 1000 ]]);
  });

  it('gives up after the last attempt and returns the refusal', async() => {
    const fetcher = jest.fn().mockResolvedValue(response(429));

    await expect(retrying(<typeof fetch> <unknown> fetcher, 2, sleeper)('https://example.org'))
      .resolves.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('honours a short Retry-After', async() => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(response(429, '2'))
      .mockResolvedValueOnce(response(200));

    await retrying(<typeof fetch> <unknown> fetcher, 3, sleeper)('https://example.org');

    expect(sleeper).toHaveBeenCalledWith(2000);
  });

  it('gives up immediately when Retry-After exceeds what it will wait for', async() => {
    const fetcher = jest.fn().mockResolvedValue(response(429, '34976'));

    await expect(retrying(<typeof fetch> <unknown> fetcher, 3, sleeper)('https://example.org'))
      .resolves.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleeper).not.toHaveBeenCalled();
  });

  it('forwards every argument to the wrapped implementation', async() => {
    const fetcher = jest.fn().mockResolvedValue(response(200));

    await retrying(<typeof fetch> <unknown> fetcher, 3, sleeper)('https://example.org', { method: 'GET' });

    expect(fetcher).toHaveBeenCalledWith('https://example.org', { method: 'GET' });
  });
});

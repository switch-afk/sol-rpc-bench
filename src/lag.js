import { rpcCall } from './latency.js';

export const DEFAULT_REFERENCE = 'https://api.mainnet-beta.solana.com';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function summarizeLag(rounds) {
  const lags = rounds.map((r) => r.lag).filter((lag) => lag !== null);
  const total = rounds.length;

  return {
    total,
    success: lags.length,
    failed: total - lags.length,
    avg: lags.length ? lags.reduce((sum, v) => sum + v, 0) / lags.length : null,
    best: lags.length ? Math.min(...lags) : null,
    worst: lags.length ? Math.max(...lags) : null,
  };
}

export async function measureLag(
  url,
  reference,
  { rounds = 5, timeoutMs = 5000, delayMs = 1000, onRound } = {}
) {
  const results = [];

  for (let i = 0; i < rounds; i++) {
    // Ask both endpoints at the same moment for the freshest slot they know.
    const [target, ref] = await Promise.all([
      rpcCall(url, 'getSlot', [{ commitment: 'processed' }], timeoutMs),
      rpcCall(reference, 'getSlot', [{ commitment: 'processed' }], timeoutMs),
    ]);

    // Positive lag = endpoint is behind the reference. Negative = ahead.
    const lag = target.ok && ref.ok ? ref.result - target.result : null;
    const round = { target, ref, lag };

    results.push(round);
    if (onRound) onRound(round, i + 1);
    if (i < rounds - 1) await sleep(delayMs);
  }

  return summarizeLag(results);
}
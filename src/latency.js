export async function rpcCall(url, method, params = [], timeoutMs = 5000) {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'RPC error');

    return { ok: true, ms: performance.now() - start, result: data.result };
  } catch (err) {
    const message = err.name === 'AbortError' ? 'timeout' : err.message;
    return { ok: false, ms: performance.now() - start, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, idx))];
}

export function summarize(samples) {
  const good = samples
    .filter((s) => s.ok)
    .map((s) => s.ms)
    .sort((a, b) => a - b);

  const total = samples.length;
  const avg = good.length
    ? good.reduce((sum, v) => sum + v, 0) / good.length
    : null;

  return {
    total,
    success: good.length,
    failed: total - good.length,
    min: good.length ? good[0] : null,
    avg,
    median: percentile(good, 50),
    p95: percentile(good, 95),
    max: good.length ? good[good.length - 1] : null,
  };
}

export async function runLatency(
  url,
  { count = 10, timeoutMs = 5000, onSample } = {}
) {
  // Warm-up request so connection setup does not skew the first sample.
  await rpcCall(url, 'getSlot', [], timeoutMs);

  const samples = [];
  for (let i = 0; i < count; i++) {
    const sample = await rpcCall(url, 'getSlot', [], timeoutMs);
    samples.push(sample);
    if (onSample) onSample(sample, i + 1);
  }

  return summarize(samples);
}
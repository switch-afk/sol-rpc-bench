import { runLatency } from './latency.js';
import { measureLag } from './lag.js';

const LAG_ROUNDS = 3;
const LAG_DELAY_MS = 500;

// Show only the host. RPC URLs often carry API keys in the path or query,
// and benchmark output tends to get pasted into chats and issues.
export function hostLabel(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function makeLabels(urls) {
  const seen = new Map();
  return urls.map((url) => {
    const host = hostLabel(url);
    const n = (seen.get(host) ?? 0) + 1;
    seen.set(host, n);
    return n === 1 ? host : `${host} (${n})`;
  });
}

export async function compareEndpoints(
  urls,
  reference,
  { count = 5, timeoutMs = 5000, onStart } = {}
) {
  const labels = makeLabels(urls);
  const rows = [];

  for (let i = 0; i < urls.length; i++) {
    if (onStart) onStart(labels[i], i + 1, urls.length);

    const latency = await runLatency(urls[i], { count, timeoutMs });
    const lag = await measureLag(urls[i], reference, {
      rounds: LAG_ROUNDS,
      timeoutMs,
      delayMs: LAG_DELAY_MS,
    });

    rows.push({ label: labels[i], latency, lag });
  }

  return rows;
}

// Working endpoints first, fastest median latency on top. Dead ones last.
export function rankRows(rows) {
  return [...rows].sort((a, b) => {
    const aOk = a.latency.success > 0;
    const bOk = b.latency.success > 0;
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    if (!aOk && !bOk) return 0;
    return a.latency.median - b.latency.median;
  });
}

const fmtMs = (ms) => (ms === null ? '-' : `${ms.toFixed(0)} ms`);
const fmtLag = (value) => (value === null ? '-' : value.toFixed(1));

export function renderTable(rows) {
  const ranked = rankRows(rows);
  const header = ['Rank', 'Endpoint', 'OK', 'Median', 'P95', 'Lag (slots)'];

  const body = ranked.map((row, i) => [
    row.latency.success > 0 ? String(i + 1) : '-',
    row.label,
    `${row.latency.success}/${row.latency.total}`,
    fmtMs(row.latency.median),
    fmtMs(row.latency.p95),
    fmtLag(row.lag.avg),
  ]);

  const widths = header.map((h, c) =>
    Math.max(h.length, ...body.map((r) => r[c].length))
  );

  const line = (cells) =>
    cells.map((cell, c) => cell.padEnd(widths[c])).join('  ').trimEnd();

  return [
    line(header),
    line(widths.map((w) => '-'.repeat(w))),
    ...body.map(line),
  ].join('\n');
}
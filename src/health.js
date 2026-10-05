import { rpcCall } from './latency.js';
import { makeLabels } from './compare.js';

// Some providers block getHealth. That is "not available", not "broken".
const UNSUPPORTED = /method not found|not supported|not available|HTTP 40[134]/i;

export function classifyHealth(res) {
  if (res.ok) {
    return res.result === 'ok'
      ? { status: 'ok', detail: null }
      : { status: 'error', detail: 'unexpected getHealth response' };
  }
  if (/behind/i.test(res.error)) {
    return { status: 'behind', detail: res.error };
  }
  if (UNSUPPORTED.test(res.error)) {
    return { status: 'n/a', detail: res.error };
  }
  return { status: 'error', detail: res.error };
}

export async function checkHealth(url, reference, timeoutMs = 5000) {
  const processed = [{ commitment: 'processed' }];

  // Ask the endpoint and the reference at the same moment so block heights
  // are comparable.
  const [health, version, height, refHeight] = await Promise.all([
    rpcCall(url, 'getHealth', [], timeoutMs),
    rpcCall(url, 'getVersion', [], timeoutMs),
    rpcCall(url, 'getBlockHeight', processed, timeoutMs),
    rpcCall(reference, 'getBlockHeight', processed, timeoutMs),
  ]);

  const blockHeight = height.ok ? height.result : null;
  const referenceHeight = refHeight.ok ? refHeight.result : null;

  return {
    health: classifyHealth(health),
    version: version.ok ? (version.result?.['solana-core'] ?? null) : null,
    blockHeight,
    heightLag:
      blockHeight !== null && referenceHeight !== null
        ? referenceHeight - blockHeight
        : null,
  };
}

export async function checkAll(
  urls,
  reference,
  { timeoutMs = 5000, onStart } = {}
) {
  const labels = makeLabels(urls);
  const rows = [];

  for (let i = 0; i < urls.length; i++) {
    if (onStart) onStart(labels[i], i + 1, urls.length);
    const result = await checkHealth(urls[i], reference, timeoutMs);
    rows.push({ label: labels[i], ...result });
  }

  return rows;
}

// Used for the exit code: behind or broken endpoints should fail a script.
// "n/a" (provider blocks getHealth) does not.
export function needsAttention(rows) {
  return rows.some(
    (row) => row.health.status === 'behind' || row.health.status === 'error'
  );
}

const cell = (value) =>
  value === null || value === undefined ? '-' : String(value);

export function renderHealthTable(rows) {
  const header = ['Endpoint', 'Health', 'Version', 'Block height', 'Height lag'];

  const body = rows.map((row) => [
    row.label,
    row.health.status,
    cell(row.version),
    cell(row.blockHeight),
    cell(row.heightLag),
  ]);

  const widths = header.map((h, c) =>
    Math.max(h.length, ...body.map((r) => r[c].length))
  );

  const line = (cells) =>
    cells.map((text, c) => text.padEnd(widths[c])).join('  ').trimEnd();

  const out = [
    line(header),
    line(widths.map((w) => '-'.repeat(w))),
    ...body.map(line),
  ];

  const notes = rows
    .filter((row) => row.health.detail)
    .map((row) => `  ${row.label}: ${row.health.detail}`);

  if (notes.length > 0) out.push('', 'Notes', ...notes);

  return out.join('\n');
}
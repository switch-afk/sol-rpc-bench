import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareEndpoints,
  hostLabel,
  makeLabels,
  rankRows,
  renderTable,
} from '../src/compare.js';
import { startMockRpc } from './helpers/mock-rpc.js';

function makeRow(label, { success = 5, median = 50, lagAvg = 0 } = {}) {
  return {
    label,
    latency: {
      total: 5,
      success,
      median: success ? median : null,
      p95: success ? median + 10 : null,
    },
    lag: { avg: success ? lagAvg : null },
  };
}

test('hostLabel keeps only the host and drops paths and API keys', () => {
  const label = hostLabel('https://rpc.example.com/v2/SECRETKEY?api-key=SECRET');

  assert.equal(label, 'rpc.example.com');
  assert.ok(!label.includes('SECRET'));
});

test('makeLabels numbers duplicate hosts', () => {
  const labels = makeLabels([
    'https://a.example.com',
    'https://b.example.com',
    'https://a.example.com/other',
  ]);

  assert.deepEqual(labels, ['a.example.com', 'b.example.com', 'a.example.com (2)']);
});

test('rankRows puts the fastest first and dead endpoints last', () => {
  const ranked = rankRows([
    makeRow('slow', { median: 90 }),
    makeRow('dead', { success: 0 }),
    makeRow('fast', { median: 30 }),
  ]);

  assert.deepEqual(
    ranked.map((row) => row.label),
    ['fast', 'slow', 'dead']
  );
});

test('renderTable prints a header, ranks and a dash for dead endpoints', () => {
  const lines = renderTable([
    makeRow('slow.example', { median: 90 }),
    makeRow('dead.example', { success: 0 }),
    makeRow('fast.example', { median: 30 }),
  ]).split('\n');

  assert.equal(lines.length, 5);
  assert.ok(lines[0].startsWith('Rank'));
  assert.ok(lines[2].startsWith('1'));
  assert.ok(lines[2].includes('fast.example'));
  assert.ok(lines[3].startsWith('2'));
  assert.ok(lines[4].startsWith('-'));
  assert.ok(lines[4].includes('dead.example'));
  assert.ok(lines[4].includes('0/5'));
});

test('compareEndpoints benchmarks every endpoint', async () => {
  const a = await startMockRpc(() => ({ result: 500 }));
  const b = await startMockRpc(() => ({ result: 500 }));
  const reference = await startMockRpc(() => ({ result: 500 }));

  try {
    const started = [];
    const rows = await compareEndpoints([a.url, b.url], reference.url, {
      count: 2,
      onStart: (label, n, total) => started.push([label, n, total]),
    });

    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.latency.success, 2);
      assert.equal(row.lag.success, 3);
      assert.equal(row.lag.avg, 0);
    }
    assert.equal(started.length, 2);
    assert.equal(started[0][1], 1);
    assert.equal(started[1][2], 2);
  } finally {
    await a.close();
    await b.close();
    await reference.close();
  }
});
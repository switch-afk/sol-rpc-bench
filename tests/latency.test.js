import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rpcCall, summarize, runLatency } from '../src/latency.js';
import { startMockRpc } from './helpers/mock-rpc.js';

test('summarize computes stats and ignores failed samples', () => {
  const samples = [
    { ok: true, ms: 10 },
    { ok: true, ms: 20 },
    { ok: true, ms: 30 },
    { ok: true, ms: 40 },
    { ok: false, ms: 5000, error: 'timeout' },
  ];

  const s = summarize(samples);

  assert.equal(s.total, 5);
  assert.equal(s.success, 4);
  assert.equal(s.failed, 1);
  assert.equal(s.min, 10);
  assert.equal(s.max, 40);
  assert.equal(s.avg, 25);
  assert.equal(s.median, 20);
  assert.equal(s.p95, 40);
});

test('summarize returns nulls when every sample failed', () => {
  const s = summarize([
    { ok: false, ms: 1, error: 'timeout' },
    { ok: false, ms: 1, error: 'timeout' },
  ]);

  assert.equal(s.success, 0);
  assert.equal(s.failed, 2);
  assert.equal(s.min, null);
  assert.equal(s.avg, null);
  assert.equal(s.median, null);
  assert.equal(s.p95, null);
  assert.equal(s.max, null);
});

test('rpcCall returns the result of a successful call', async () => {
  const server = await startMockRpc(() => ({ result: 123 }));
  try {
    const res = await rpcCall(server.url, 'getSlot');
    assert.equal(res.ok, true);
    assert.equal(res.result, 123);
    assert.ok(res.ms >= 0);
  } finally {
    await server.close();
  }
});

test('rpcCall reports a JSON-RPC error message', async () => {
  const server = await startMockRpc((payload) => ({
    body: {
      jsonrpc: '2.0',
      id: payload.id,
      error: { code: -32005, message: 'Node is behind' },
    },
  }));
  try {
    const res = await rpcCall(server.url, 'getSlot');
    assert.equal(res.ok, false);
    assert.equal(res.error, 'Node is behind');
  } finally {
    await server.close();
  }
});

test('rpcCall reports HTTP errors', async () => {
  const server = await startMockRpc(() => ({ status: 429, body: {} }));
  try {
    const res = await rpcCall(server.url, 'getSlot');
    assert.equal(res.ok, false);
    assert.equal(res.error, 'HTTP 429');
  } finally {
    await server.close();
  }
});

test('rpcCall times out on a slow endpoint', async () => {
  const server = await startMockRpc(() => ({ result: 1, delayMs: 300 }));
  try {
    const res = await rpcCall(server.url, 'getSlot', [], 50);
    assert.equal(res.ok, false);
    assert.equal(res.error, 'timeout');
  } finally {
    await server.close();
  }
});

test('rpcCall fails cleanly when nothing is listening', async () => {
  const res = await rpcCall('http://127.0.0.1:1', 'getSlot', [], 2000);
  assert.equal(res.ok, false);
  assert.ok(res.error);
});

test('runLatency sends a warm-up request that is not counted', async () => {
  let calls = 0;
  const server = await startMockRpc(() => {
    calls += 1;
    return { result: 42 };
  });

  try {
    const seen = [];
    const summary = await runLatency(server.url, {
      count: 3,
      onSample: (_sample, n) => seen.push(n),
    });

    assert.equal(calls, 4);
    assert.equal(summary.total, 3);
    assert.equal(summary.success, 3);
    assert.deepEqual(seen, [1, 2, 3]);
  } finally {
    await server.close();
  }
});
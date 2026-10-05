import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureLag, summarizeLag } from '../src/lag.js';
import { startMockRpc } from './helpers/mock-rpc.js';

test('summarizeLag skips failed rounds', () => {
  const s = summarizeLag([{ lag: 1 }, { lag: -1 }, { lag: null }, { lag: 3 }]);

  assert.equal(s.total, 4);
  assert.equal(s.success, 3);
  assert.equal(s.failed, 1);
  assert.equal(s.avg, 1);
  assert.equal(s.best, -1);
  assert.equal(s.worst, 3);
});

test('summarizeLag returns nulls when every round failed', () => {
  const s = summarizeLag([{ lag: null }, { lag: null }]);

  assert.equal(s.success, 0);
  assert.equal(s.avg, null);
  assert.equal(s.best, null);
  assert.equal(s.worst, null);
});

test('measureLag reports an endpoint that is behind the reference', async () => {
  const asked = [];
  const endpoint = await startMockRpc((payload) => {
    asked.push([payload.method, payload.params[0].commitment]);
    return { result: 100 };
  });
  const reference = await startMockRpc(() => ({ result: 103 }));

  try {
    const summary = await measureLag(endpoint.url, reference.url, {
      rounds: 2,
      delayMs: 0,
    });

    assert.equal(summary.success, 2);
    assert.equal(summary.avg, 3);
    assert.equal(summary.best, 3);
    assert.equal(summary.worst, 3);
    assert.deepEqual(asked[0], ['getSlot', 'processed']);
  } finally {
    await endpoint.close();
    await reference.close();
  }
});

test('measureLag reports a negative lag when the endpoint is ahead', async () => {
  const endpoint = await startMockRpc(() => ({ result: 105 }));
  const reference = await startMockRpc(() => ({ result: 103 }));

  try {
    const summary = await measureLag(endpoint.url, reference.url, {
      rounds: 1,
      delayMs: 0,
    });

    assert.equal(summary.avg, -2);
  } finally {
    await endpoint.close();
    await reference.close();
  }
});

test('measureLag counts a round as failed when the reference errors', async () => {
  const endpoint = await startMockRpc(() => ({ result: 100 }));
  const reference = await startMockRpc((payload) => ({
    body: {
      jsonrpc: '2.0',
      id: payload.id,
      error: { code: -32000, message: 'reference down' },
    },
  }));

  try {
    const rounds = [];
    const summary = await measureLag(endpoint.url, reference.url, {
      rounds: 2,
      delayMs: 0,
      onRound: (round) => rounds.push(round),
    });

    assert.equal(summary.success, 0);
    assert.equal(summary.failed, 2);
    assert.equal(summary.avg, null);
    assert.equal(rounds[0].ref.error, 'reference down');
  } finally {
    await endpoint.close();
    await reference.close();
  }
});
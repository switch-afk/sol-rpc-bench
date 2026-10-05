import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyHealth,
  checkHealth,
  checkAll,
  needsAttention,
  renderHealthTable,
} from '../src/health.js';
import { startMockRpc } from './helpers/mock-rpc.js';

function rpcError(payload, message) {
  return {
    body: {
      jsonrpc: '2.0',
      id: payload.id,
      error: { code: -32005, message },
    },
  };
}

function healthyHandler(height) {
  return (payload) => {
    if (payload.method === 'getHealth') return { result: 'ok' };
    if (payload.method === 'getVersion') {
      return { result: { 'solana-core': '2.1.0', 'feature-set': 1 } };
    }
    if (payload.method === 'getBlockHeight') return { result: height };
    return rpcError(payload, 'Method not found');
  };
}

test('classifyHealth marks an "ok" response as ok', () => {
  const result = classifyHealth({ ok: true, ms: 5, result: 'ok' });

  assert.equal(result.status, 'ok');
  assert.equal(result.detail, null);
});

test('classifyHealth marks a lagging node as behind', () => {
  const result = classifyHealth({
    ok: false,
    ms: 5,
    error: 'Node is behind by 42 slots',
  });

  assert.equal(result.status, 'behind');
  assert.ok(result.detail.includes('42'));
});

test('classifyHealth treats blocked getHealth as n/a, not broken', () => {
  assert.equal(
    classifyHealth({ ok: false, ms: 5, error: 'Method not found' }).status,
    'n/a'
  );
  assert.equal(
    classifyHealth({ ok: false, ms: 5, error: 'HTTP 403' }).status,
    'n/a'
  );
});

test('classifyHealth marks other failures as error', () => {
  assert.equal(
    classifyHealth({ ok: false, ms: 5, error: 'fetch failed' }).status,
    'error'
  );
  assert.equal(
    classifyHealth({ ok: true, ms: 5, result: 'weird' }).status,
    'error'
  );
});

test('checkHealth reports version and block height lag for a healthy node', async () => {
  const endpoint = await startMockRpc(healthyHandler(1000));
  const reference = await startMockRpc(healthyHandler(1003));

  try {
    const result = await checkHealth(endpoint.url, reference.url);

    assert.equal(result.health.status, 'ok');
    assert.equal(result.version, '2.1.0');
    assert.equal(result.blockHeight, 1000);
    assert.equal(result.heightLag, 3);
  } finally {
    await endpoint.close();
    await reference.close();
  }
});

test('checkHealth flags a node that reports it is behind', async () => {
  const behind = healthyHandler(900);
  const endpoint = await startMockRpc((payload) =>
    payload.method === 'getHealth'
      ? rpcError(payload, 'Node is behind by 42 slots')
      : behind(payload)
  );
  const reference = await startMockRpc(healthyHandler(1000));

  try {
    const result = await checkHealth(endpoint.url, reference.url);

    assert.equal(result.health.status, 'behind');
    assert.equal(result.blockHeight, 900);
    assert.equal(result.heightLag, 100);
  } finally {
    await endpoint.close();
    await reference.close();
  }
});

test('checkAll reports an unreachable endpoint as error and needsAttention is true', async () => {
  const endpoint = await startMockRpc(healthyHandler(1000));
  const reference = await startMockRpc(healthyHandler(1000));

  try {
    const rows = await checkAll([endpoint.url, 'http://127.0.0.1:1'], reference.url, {
      timeoutMs: 2000,
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0].health.status, 'ok');
    assert.equal(rows[1].health.status, 'error');
    assert.equal(rows[1].blockHeight, null);
    assert.equal(rows[1].heightLag, null);
    assert.equal(needsAttention(rows), true);
  } finally {
    await endpoint.close();
    await reference.close();
  }
});

test('needsAttention ignores n/a but catches behind and error', () => {
  assert.equal(
    needsAttention([{ health: { status: 'ok' } }, { health: { status: 'n/a' } }]),
    false
  );
  assert.equal(needsAttention([{ health: { status: 'behind' } }]), true);
  assert.equal(needsAttention([{ health: { status: 'error' } }]), true);
});

test('renderHealthTable prints a header, rows and notes', () => {
  const output = renderHealthTable([
    {
      label: 'a.example',
      health: { status: 'ok', detail: null },
      version: '2.1.0',
      blockHeight: 1000,
      heightLag: 0,
    },
    {
      label: 'b.example',
      health: { status: 'behind', detail: 'Node is behind by 42 slots' },
      version: null,
      blockHeight: 900,
      heightLag: 100,
    },
  ]);

  const lines = output.split('\n');

  assert.ok(lines[0].startsWith('Endpoint'));
  assert.ok(lines[0].includes('Height lag'));
  assert.ok(lines[2].includes('a.example'));
  assert.ok(lines[3].includes('b.example'));
  assert.ok(output.includes('Notes'));
  assert.ok(output.includes('b.example: Node is behind by 42 slots'));
});
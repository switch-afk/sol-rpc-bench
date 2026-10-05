#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runLatency } from '../src/latency.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

const DEFAULT_URL = 'https://api.mainnet-beta.solana.com';

const HELP = `
sol-rpc-bench v${pkg.version}
Benchmark Solana RPC endpoints for latency, slot lag and reliability.

Usage:
  sol-rpc-bench latency [rpc-url] [options]

Commands:
  latency          Measure getSlot round-trip time

Options:
  -c, --count <n>      Number of requests (default 10, max 100)
  -t, --timeout <ms>   Timeout per request in ms (default 5000)
  -h, --help           Show this help
  -v, --version        Show the version

Examples:
  sol-rpc-bench latency
  sol-rpc-bench latency https://api.mainnet-beta.solana.com -c 20
`;

function fail(message) {
  console.error(message);
  console.error('Run with --help to see what is available.');
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { count: 10, timeout: 5000, help: false, version: false };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '-v' || arg === '--version') opts.version = true;
    else if (arg === '-c' || arg === '--count') opts.count = Number(argv[++i]);
    else if (arg === '-t' || arg === '--timeout') opts.timeout = Number(argv[++i]);
    else if (arg.startsWith('-')) fail(`Unknown option: ${arg}`);
    else positional.push(arg);
  }

  return { opts, positional };
}

function fmt(ms) {
  return ms === null ? '-' : `${ms.toFixed(0)} ms`;
}

async function latencyCommand(url, opts) {
  console.log(`Testing ${url}`);
  console.log(`${opts.count} requests, ${opts.timeout} ms timeout\n`);

  const summary = await runLatency(url, {
    count: opts.count,
    timeoutMs: opts.timeout,
    onSample: (sample, n) => {
      const label = String(n).padStart(3, ' ');
      if (sample.ok) console.log(`  #${label}  ${fmt(sample.ms)}`);
      else console.log(`  #${label}  failed (${sample.error})`);
    },
  });

  console.log('\nResults');
  console.log(`  Success   ${summary.success}/${summary.total}`);
  console.log(`  Min       ${fmt(summary.min)}`);
  console.log(`  Avg       ${fmt(summary.avg)}`);
  console.log(`  Median    ${fmt(summary.median)}`);
  console.log(`  P95       ${fmt(summary.p95)}`);
  console.log(`  Max       ${fmt(summary.max)}`);

  if (summary.success === 0) process.exit(1);
}

const { opts, positional } = parseArgs(process.argv.slice(2));

if (opts.version) {
  console.log(pkg.version);
  process.exit(0);
}

if (opts.help || positional.length === 0) {
  console.log(HELP.trim());
  process.exit(0);
}

if (!Number.isInteger(opts.count) || opts.count < 1 || opts.count > 100) {
  fail('--count must be a whole number between 1 and 100');
}
if (!Number.isFinite(opts.timeout) || opts.timeout <= 0) {
  fail('--timeout must be a positive number of milliseconds');
}

const [command, url = DEFAULT_URL] = positional;

if (command !== 'latency') fail(`Unknown command: ${command}`);

try {
  new URL(url);
} catch {
  fail(`Invalid RPC URL: ${url}`);
}

await latencyCommand(url, opts);
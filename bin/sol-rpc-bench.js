#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runLatency } from '../src/latency.js';
import { measureLag, DEFAULT_REFERENCE } from '../src/lag.js';
import { compareEndpoints, renderTable, hostLabel } from '../src/compare.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

const DEFAULT_URL = 'https://api.mainnet-beta.solana.com';
const MAX_COMPARE = 10;

const HELP = `
sol-rpc-bench v${pkg.version}
Benchmark Solana RPC endpoints for latency, slot lag and reliability.

Usage:
  sol-rpc-bench latency [rpc-url] [options]
  sol-rpc-bench lag <rpc-url> [options]
  sol-rpc-bench compare <rpc-url> <rpc-url> [more urls] [options]

Commands:
  latency          Measure getSlot round-trip time
  lag              Compare an endpoint's slot against a reference RPC
  compare          Benchmark 2 to ${MAX_COMPARE} endpoints and print a ranked table

Options:
  -c, --count <n>        Number of requests or rounds (1 to 100)
                         Defaults: latency 10, lag 5, compare 5
  -t, --timeout <ms>     Timeout per request in ms (default 5000)
  -r, --reference <url>  Reference RPC for lag checks
                         (default ${DEFAULT_REFERENCE})
  -h, --help             Show this help
  -v, --version          Show the version

Examples:
  sol-rpc-bench latency
  sol-rpc-bench latency https://api.mainnet-beta.solana.com -c 20
  sol-rpc-bench lag https://your-rpc-url
  sol-rpc-bench compare https://rpc-one.example https://rpc-two.example -c 10
`;

function fail(message) {
  console.error(message);
  console.error('Run with --help to see what is available.');
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    count: null,
    timeout: 5000,
    reference: DEFAULT_REFERENCE,
    help: false,
    version: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '-v' || arg === '--version') opts.version = true;
    else if (arg === '-c' || arg === '--count') opts.count = Number(argv[++i]);
    else if (arg === '-t' || arg === '--timeout') opts.timeout = Number(argv[++i]);
    else if (arg === '-r' || arg === '--reference') opts.reference = argv[++i];
    else if (arg.startsWith('-')) fail(`Unknown option: ${arg}`);
    else positional.push(arg);
  }

  return { opts, positional };
}

function validUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function fmtMs(ms) {
  return ms === null ? '-' : `${ms.toFixed(0)} ms`;
}

function fmtSlots(value) {
  return value === null ? '-' : `${value.toFixed(1)} slots`;
}

function describeLag(lag) {
  if (lag === 0) return 'in sync';
  if (lag > 0) return `${lag} slots behind`;
  return `${-lag} slots ahead`;
}

async function latencyCommand(url, opts) {
  console.log(`Testing ${url}`);
  console.log(`${opts.count} requests, ${opts.timeout} ms timeout\n`);

  const summary = await runLatency(url, {
    count: opts.count,
    timeoutMs: opts.timeout,
    onSample: (sample, n) => {
      const label = String(n).padStart(3, ' ');
      if (sample.ok) console.log(`  #${label}  ${fmtMs(sample.ms)}`);
      else console.log(`  #${label}  failed (${sample.error})`);
    },
  });

  console.log('\nResults');
  console.log(`  Success   ${summary.success}/${summary.total}`);
  console.log(`  Min       ${fmtMs(summary.min)}`);
  console.log(`  Avg       ${fmtMs(summary.avg)}`);
  console.log(`  Median    ${fmtMs(summary.median)}`);
  console.log(`  P95       ${fmtMs(summary.p95)}`);
  console.log(`  Max       ${fmtMs(summary.max)}`);

  if (summary.success === 0) process.exit(1);
}

async function lagCommand(url, opts) {
  console.log(`Endpoint   ${url}`);
  console.log(`Reference  ${opts.reference}`);
  console.log(`${opts.count} rounds, 1 second apart\n`);

  const summary = await measureLag(url, opts.reference, {
    rounds: opts.count,
    timeoutMs: opts.timeout,
    onRound: (round, n) => {
      const label = String(n).padStart(3, ' ');
      if (round.lag === null) {
        const reason = !round.target.ok
          ? `endpoint: ${round.target.error}`
          : `reference: ${round.ref.error}`;
        console.log(`  #${label}  failed (${reason})`);
      } else {
        console.log(
          `  #${label}  endpoint ${round.target.result}  reference ${round.ref.result}  ${describeLag(round.lag)}`
        );
      }
    },
  });

  console.log('\nResults');
  console.log(`  Success   ${summary.success}/${summary.total}`);
  console.log(`  Avg lag   ${fmtSlots(summary.avg)}`);
  console.log(`  Worst     ${fmtSlots(summary.worst)}`);
  console.log(`  Best      ${fmtSlots(summary.best)}`);
  console.log('\nPositive = behind the reference, negative = ahead of it.');

  if (summary.success === 0) process.exit(1);
}

async function compareCommand(urls, opts) {
  console.log(`Comparing ${urls.length} endpoints`);
  console.log(`Reference  ${hostLabel(opts.reference)}`);
  console.log(`${opts.count} latency requests + 3 lag rounds each\n`);

  const rows = await compareEndpoints(urls, opts.reference, {
    count: opts.count,
    timeoutMs: opts.timeout,
    onStart: (label, n, total) => console.log(`  [${n}/${total}] ${label}`),
  });

  console.log(`\n${renderTable(rows)}`);
  console.log(
    '\nRanked by median latency. Lag is slots behind the reference (negative = ahead).'
  );

  if (rows.every((row) => row.latency.success === 0)) process.exit(1);
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

const [command, ...urlArgs] = positional;

if (!['latency', 'lag', 'compare'].includes(command)) {
  fail(`Unknown command: ${command}`);
}

if (opts.count === null) opts.count = command === 'latency' ? 10 : 5;

if (!Number.isInteger(opts.count) || opts.count < 1 || opts.count > 100) {
  fail('--count must be a whole number between 1 and 100');
}
if (!Number.isFinite(opts.timeout) || opts.timeout <= 0) {
  fail('--timeout must be a positive number of milliseconds');
}

if (command === 'latency') {
  const url = urlArgs[0] ?? DEFAULT_URL;
  if (!validUrl(url)) fail(`Invalid RPC URL: ${url}`);
  await latencyCommand(url, opts);
}

if (command === 'lag') {
  const url = urlArgs[0];
  if (!url) fail('The lag command needs an RPC URL to check.');
  if (!validUrl(url)) fail(`Invalid RPC URL: ${url}`);
  if (!opts.reference || !validUrl(opts.reference)) {
    fail(`Invalid reference URL: ${opts.reference}`);
  }
  await lagCommand(url, opts);
}

if (command === 'compare') {
  if (urlArgs.length < 2) fail('The compare command needs at least 2 RPC URLs.');
  if (urlArgs.length > MAX_COMPARE) {
    fail(`The compare command accepts at most ${MAX_COMPARE} RPC URLs.`);
  }
  for (const url of urlArgs) {
    if (!validUrl(url)) fail(`Invalid RPC URL: ${url}`);
  }
  if (!opts.reference || !validUrl(opts.reference)) {
    fail(`Invalid reference URL: ${opts.reference}`);
  }
  await compareCommand(urlArgs, opts);
}
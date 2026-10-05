#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runLatency } from '../src/latency.js';
import { measureLag, DEFAULT_REFERENCE } from '../src/lag.js';
import {
  compareEndpoints,
  renderTable,
  rankRows,
  hostLabel,
} from '../src/compare.js';
import { checkAll, renderHealthTable, needsAttention } from '../src/health.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

const DEFAULT_URL = 'https://api.mainnet-beta.solana.com';
const MAX_ENDPOINTS = 10;
const COMMANDS = ['latency', 'lag', 'compare', 'health'];

const HELP = `
sol-rpc-bench v${pkg.version}
Benchmark Solana RPC endpoints for latency, slot lag and reliability.

Usage:
  sol-rpc-bench latency [rpc-url] [options]
  sol-rpc-bench lag <rpc-url> [options]
  sol-rpc-bench compare <rpc-url> <rpc-url> [more urls] [options]
  sol-rpc-bench health <rpc-url> [more urls] [options]

Commands:
  latency          Measure getSlot round-trip time
  lag              Compare an endpoint's slot against a reference RPC
  compare          Benchmark 2 to ${MAX_ENDPOINTS} endpoints and print a ranked table
  health           Check getHealth, version and block height of 1 to ${MAX_ENDPOINTS} endpoints

Options:
  -c, --count <n>        Number of requests or rounds (1 to 100)
                         Defaults: latency 10, lag 5, compare 5 (not used by health)
  -t, --timeout <ms>     Timeout per request in ms (default 5000)
  -r, --reference <url>  Reference RPC for lag and block height checks
                         (default ${DEFAULT_REFERENCE})
      --json             Print results as JSON only (no progress output)
  -h, --help             Show this help
  -v, --version          Show the version

Only hostnames are printed, never full URLs, so API keys stay private.

Examples:
  sol-rpc-bench latency
  sol-rpc-bench latency https://api.mainnet-beta.solana.com -c 20
  sol-rpc-bench lag https://your-rpc-url --json
  sol-rpc-bench compare https://rpc-one.example https://rpc-two.example -c 10
  sol-rpc-bench health https://rpc-one.example https://rpc-two.example
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
    json: false,
    help: false,
    version: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '-v' || arg === '--version') opts.version = true;
    else if (arg === '--json') opts.json = true;
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

function roundValues(obj) {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key,
      typeof value === 'number' ? Math.round(value * 100) / 100 : value,
    ])
  );
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

async function latencyCommand(url, opts) {
  const log = opts.json ? () => {} : console.log;
  const host = hostLabel(url);

  log(`Testing ${host}`);
  log(`${opts.count} requests, ${opts.timeout} ms timeout\n`);

  const summary = await runLatency(url, {
    count: opts.count,
    timeoutMs: opts.timeout,
    onSample: (sample, n) => {
      const label = String(n).padStart(3, ' ');
      if (sample.ok) log(`  #${label}  ${fmtMs(sample.ms)}`);
      else log(`  #${label}  failed (${sample.error})`);
    },
  });

  if (opts.json) {
    printJson({
      command: 'latency',
      endpoint: host,
      requests: opts.count,
      timeoutMs: opts.timeout,
      results: roundValues(summary),
    });
  } else {
    console.log('\nResults');
    console.log(`  Success   ${summary.success}/${summary.total}`);
    console.log(`  Min       ${fmtMs(summary.min)}`);
    console.log(`  Avg       ${fmtMs(summary.avg)}`);
    console.log(`  Median    ${fmtMs(summary.median)}`);
    console.log(`  P95       ${fmtMs(summary.p95)}`);
    console.log(`  Max       ${fmtMs(summary.max)}`);
  }

  if (summary.success === 0) process.exitCode = 1;
}

async function lagCommand(url, opts) {
  const log = opts.json ? () => {} : console.log;
  const host = hostLabel(url);
  const referenceHost = hostLabel(opts.reference);

  log(`Endpoint   ${host}`);
  log(`Reference  ${referenceHost}`);
  log(`${opts.count} rounds, 1 second apart\n`);

  const summary = await measureLag(url, opts.reference, {
    rounds: opts.count,
    timeoutMs: opts.timeout,
    onRound: (round, n) => {
      const label = String(n).padStart(3, ' ');
      if (round.lag === null) {
        const reason = !round.target.ok
          ? `endpoint: ${round.target.error}`
          : `reference: ${round.ref.error}`;
        log(`  #${label}  failed (${reason})`);
      } else {
        log(
          `  #${label}  endpoint ${round.target.result}  reference ${round.ref.result}  ${describeLag(round.lag)}`
        );
      }
    },
  });

  if (opts.json) {
    printJson({
      command: 'lag',
      endpoint: host,
      reference: referenceHost,
      rounds: opts.count,
      timeoutMs: opts.timeout,
      results: roundValues(summary),
    });
  } else {
    console.log('\nResults');
    console.log(`  Success   ${summary.success}/${summary.total}`);
    console.log(`  Avg lag   ${fmtSlots(summary.avg)}`);
    console.log(`  Worst     ${fmtSlots(summary.worst)}`);
    console.log(`  Best      ${fmtSlots(summary.best)}`);
    console.log('\nPositive = behind the reference, negative = ahead of it.');
  }

  if (summary.success === 0) process.exitCode = 1;
}

async function compareCommand(urls, opts) {
  const log = opts.json ? () => {} : console.log;
  const referenceHost = hostLabel(opts.reference);

  log(`Comparing ${urls.length} endpoints`);
  log(`Reference  ${referenceHost}`);
  log(`${opts.count} latency requests + 3 lag rounds each\n`);

  const rows = await compareEndpoints(urls, opts.reference, {
    count: opts.count,
    timeoutMs: opts.timeout,
    onStart: (label, n, total) => log(`  [${n}/${total}] ${label}`),
  });

  if (opts.json) {
    const ranked = rankRows(rows);
    printJson({
      command: 'compare',
      reference: referenceHost,
      requestsPerEndpoint: opts.count,
      timeoutMs: opts.timeout,
      endpoints: ranked.map((row, i) => ({
        rank: row.latency.success > 0 ? i + 1 : null,
        endpoint: row.label,
        latency: roundValues(row.latency),
        lag: roundValues(row.lag),
      })),
    });
  } else {
    console.log(`\n${renderTable(rows)}`);
    console.log(
      '\nRanked by median latency. Lag is slots behind the reference (negative = ahead).'
    );
  }

  if (rows.every((row) => row.latency.success === 0)) process.exitCode = 1;
}

async function healthCommand(urls, opts) {
  const log = opts.json ? () => {} : console.log;
  const referenceHost = hostLabel(opts.reference);

  log(`Checking ${urls.length} endpoint${urls.length === 1 ? '' : 's'}`);
  log(`Reference  ${referenceHost}\n`);

  const rows = await checkAll(urls, opts.reference, {
    timeoutMs: opts.timeout,
    onStart: (label, n, total) => log(`  [${n}/${total}] ${label}`),
  });

  if (opts.json) {
    printJson({
      command: 'health',
      reference: referenceHost,
      timeoutMs: opts.timeout,
      endpoints: rows.map((row) => ({
        endpoint: row.label,
        health: row.health.status,
        detail: row.health.detail,
        version: row.version,
        blockHeight: row.blockHeight,
        heightLag: row.heightLag,
      })),
    });
  } else {
    console.log(`\n${renderHealthTable(rows)}`);
    console.log(
      '\nHeight lag is blocks behind the reference (negative = ahead).'
    );
  }

  if (needsAttention(rows)) process.exitCode = 1;
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

if (!COMMANDS.includes(command)) {
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
  if (!validUrl(url)) fail('Invalid RPC URL.');
  await latencyCommand(url, opts);
}

if (command === 'lag') {
  const url = urlArgs[0];
  if (!url) fail('The lag command needs an RPC URL to check.');
  if (!validUrl(url)) fail('Invalid RPC URL.');
  if (!opts.reference || !validUrl(opts.reference)) {
    fail('Invalid reference URL.');
  }
  await lagCommand(url, opts);
}

if (command === 'compare') {
  if (urlArgs.length < 2) fail('The compare command needs at least 2 RPC URLs.');
  if (urlArgs.length > MAX_ENDPOINTS) {
    fail(`The compare command accepts at most ${MAX_ENDPOINTS} RPC URLs.`);
  }
  for (const url of urlArgs) {
    if (!validUrl(url)) fail('Invalid RPC URL.');
  }
  if (!opts.reference || !validUrl(opts.reference)) {
    fail('Invalid reference URL.');
  }
  await compareCommand(urlArgs, opts);
}

if (command === 'health') {
  if (urlArgs.length < 1) fail('The health command needs at least 1 RPC URL.');
  if (urlArgs.length > MAX_ENDPOINTS) {
    fail(`The health command accepts at most ${MAX_ENDPOINTS} RPC URLs.`);
  }
  for (const url of urlArgs) {
    if (!validUrl(url)) fail('Invalid RPC URL.');
  }
  if (!opts.reference || !validUrl(opts.reference)) {
    fail('Invalid reference URL.');
  }
  await healthCommand(urlArgs, opts);
}
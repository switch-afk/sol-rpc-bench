#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

const HELP = `
sol-rpc-bench v${pkg.version}
Benchmark Solana RPC endpoints for latency, slot lag and reliability.

Usage:
  sol-rpc-bench [options]

Options:
  -h, --help       Show this help
  -v, --version    Show the version

Commands are coming soon. Follow the repo for updates.
`;

const args = process.argv.slice(2);

if (args.includes('-v') || args.includes('--version')) {
  console.log(pkg.version);
  process.exit(0);
}

if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  console.log(HELP.trim());
  process.exit(0);
}

console.error(`Unknown option: ${args[0]}`);
console.error('Run with --help to see what is available.');
process.exit(1);
# Changelog

## 0.2.0 - 2026-10-06

- Package is now installable and runnable with `npx github:switch-afk/sol-rpc-bench`
- Added package metadata and a `files` list so only the CLI and source are shipped
- Added `CONTRIBUTING.md` and a list of contribution ideas

## 0.1.0

- `latency` command: `getSlot` round-trip benchmark with min, avg, median, p95 and max
- `lag` command: slot lag against a reference RPC
- `compare` command: rank 2 to 10 endpoints in one table
- `--json` output for scripting
- Only hostnames are printed, so API keys in RPC URLs never leak into output
- Offline test suite and GitHub Actions CI
# Contributing

Thanks for helping out. This project is small on purpose, and every contribution is welcome, even a typo fix.

## Setup

```bash
git clone https://github.com/switch-afk/sol-rpc-bench.git
cd sol-rpc-bench
npm test
```

Requires Node.js 18 or newer. There are no dependencies to install.

## Workflow

1. Fork the repo and create a branch from `main`.
2. Make your change. Add or update tests in `tests/` when behavior changes.
3. Run `npm test`. Tests use local fake RPC servers, so no network is needed.
4. Open a pull request with a short description of what and why.

## Ideas

- A `health` command that calls `getHealth` on each endpoint
- Block height comparison alongside slot lag
- CSV output (`--csv`) for spreadsheets
- Read endpoints from a config file (`--config endpoints.json`)
- Devnet and testnet reference defaults
- A `--watch` mode that repeats the benchmark on an interval

Open an issue first if you want to discuss a bigger change.

## Style

- Plain modern JavaScript (ES modules), no build step.
- Never print full RPC URLs. They often contain API keys, so print the hostname only.
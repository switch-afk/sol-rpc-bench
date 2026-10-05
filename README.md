# sol-rpc-bench

Benchmark Solana RPC endpoints for latency, slot lag and reliability, so you can pick the right RPC for your bot or app.

> Status: early development. The scaffold is in place, benchmarks are landing one PR at a time.

## Planned features

- [ ] Latency test (`getSlot` round trips)
- [ ] Slot lag check against the fastest endpoint
- [ ] Compare multiple endpoints side by side
- [ ] JSON output for scripting

## Requirements

- Node.js 18 or newer

## Usage

```bash
git clone https://github.com/switch-afk/sol-rpc-bench.git
cd sol-rpc-bench
node bin/sol-rpc-bench.js --help
```

## License

MIT
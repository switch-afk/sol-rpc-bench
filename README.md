# sol-rpc-bench

Benchmark Solana RPC endpoints for latency, slot lag and reliability, so you can pick the right RPC for your bot or app.

> Status: early development. Benchmarks are landing one PR at a time.

## Features

- [x] Latency test (`getSlot` round trips)
- [x] Slot lag check against a reference endpoint
- [ ] Compare multiple endpoints side by side
- [ ] JSON output for scripting

## Requirements

- Node.js 18 or newer

## Install

```bash
git clone https://github.com/switch-afk/sol-rpc-bench.git
cd sol-rpc-bench
```

## Usage

### Latency

Measure latency of the public mainnet RPC:

```bash
node bin/sol-rpc-bench.js latency
```

Test your own endpoint with 20 requests:

```bash
node bin/sol-rpc-bench.js latency https://your-rpc-url -c 20
```

One warm-up request is sent first and not counted, so connection setup does not skew the numbers.

### Slot lag

Check how far behind an endpoint is compared to a reference RPC (public mainnet by default):

```bash
node bin/sol-rpc-bench.js lag https://your-rpc-url
```

Use a different reference and more rounds:

```bash
node bin/sol-rpc-bench.js lag https://your-rpc-url -r https://another-rpc-url -c 10
```

Each round asks both endpoints for their latest slot at the same moment, then waits one second. A slot is roughly 400 ms, so a lag of 0 to 2 slots is normal noise. Consistently higher numbers mean the endpoint is falling behind the chain.

### Options

| Option | Description | Default |
| --- | --- | --- |
| `-c, --count <n>` | Requests or rounds (1 to 100) | latency 10, lag 5 |
| `-t, --timeout <ms>` | Timeout per request | 5000 |
| `-r, --reference <url>` | Reference RPC for `lag` | public mainnet |
| `-h, --help` | Show help | |
| `-v, --version` | Show version | |

### Example output

```
Endpoint   https://your-rpc-url
Reference  https://api.mainnet-beta.solana.com
5 rounds, 1 second apart

  #  1  endpoint 312045678  reference 312045679  1 slots behind
  #  2  endpoint 312045681  reference 312045681  in sync
  ...

Results
  Success   5/5
  Avg lag   0.8 slots
  Worst     2.0 slots
  Best      0.0 slots
```

## License

MIT
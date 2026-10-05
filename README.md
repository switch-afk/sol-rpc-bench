# sol-rpc-bench

Benchmark Solana RPC endpoints for latency, slot lag and reliability, so you can pick the right RPC for your bot or app.

> Status: early development. Benchmarks are landing one PR at a time.

## Features

- [x] Latency test (`getSlot` round trips)
- [ ] Slot lag check against the fastest endpoint
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

Measure latency of the public mainnet RPC:

```bash
node bin/sol-rpc-bench.js latency
```

Test your own endpoint with 20 requests:

```bash
node bin/sol-rpc-bench.js latency https://your-rpc-url -c 20
```

### Options

| Option | Description | Default |
| --- | --- | --- |
| `-c, --count <n>` | Number of requests (1 to 100) | 10 |
| `-t, --timeout <ms>` | Timeout per request | 5000 |
| `-h, --help` | Show help | |
| `-v, --version` | Show version | |

### Example output

```
Testing https://api.mainnet-beta.solana.com
10 requests, 5000 ms timeout

  #  1  64 ms
  #  2  58 ms
  ...

Results
  Success   10/10
  Min       55 ms
  Avg       63 ms
  Median    61 ms
  P95       78 ms
  Max       78 ms
```

One warm-up request is sent first and not counted, so connection setup does not skew the numbers.

## License

MIT
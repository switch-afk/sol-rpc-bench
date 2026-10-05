# sol-rpc-bench

Benchmark Solana RPC endpoints for latency, slot lag and reliability, so you can pick the right RPC for your bot or app.

> Status: early development. Benchmarks are landing one PR at a time.

## Features

- [x] Latency test (`getSlot` round trips)
- [x] Slot lag check against a reference endpoint
- [x] Compare multiple endpoints side by side
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

### Compare

Benchmark 2 to 10 endpoints in one go and get a ranked table:

```bash
node bin/sol-rpc-bench.js compare https://rpc-one.example https://rpc-two.example -c 10
```

Each endpoint gets the latency test plus 3 slot-lag rounds. Endpoints are ranked by median latency, and dead endpoints sink to the bottom. The table shows hostnames only, so API keys inside your RPC URLs never end up in the output.

### Options

| Option | Description | Default |
| --- | --- | --- |
| `-c, --count <n>` | Requests or rounds (1 to 100) | latency 10, lag 5, compare 5 |
| `-t, --timeout <ms>` | Timeout per request | 5000 |
| `-r, --reference <url>` | Reference RPC for lag checks | public mainnet |
| `-h, --help` | Show help | |
| `-v, --version` | Show version | |

### Example output

```
Comparing 2 endpoints
Reference  api.mainnet-beta.solana.com
5 latency requests + 3 lag rounds each

  [1/2] rpc-one.example
  [2/2] rpc-two.example

Rank  Endpoint         OK   Median  P95    Lag (slots)
----  ---------------  ---  ------  -----  -----------
1     rpc-one.example  5/5  48 ms   61 ms  0.3
2     rpc-two.example  5/5  95 ms   120 ms 1.0
```

## License

MIT
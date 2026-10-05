import http from 'node:http';

// Starts a tiny fake JSON-RPC server on a random local port.
// The handler gets the parsed request and returns one of:
//   { result }              -> normal JSON-RPC success
//   { body }                -> send this exact JSON body
//   { status, body }        -> send a custom HTTP status
//   { delayMs, ... }        -> wait before answering
export async function startMockRpc(handler) {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', async () => {
      const payload = JSON.parse(raw);
      const reply = await handler(payload);

      if (reply.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
      }

      res.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          reply.body ?? { jsonrpc: '2.0', id: payload.id, result: reply.result }
        )
      );
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
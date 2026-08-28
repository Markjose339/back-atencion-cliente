const WebSocket = require('ws');
const tests = [
  { url: 'ws://localhost:8182', origin: 'http://172.65.10.55:8106' },
  { url: 'ws://localhost.qz.io:8182', origin: 'http://172.65.10.55:8106' },
  { url: 'ws://localhost:8182', origin: 'http://localhost:3000' },
  { url: 'ws://localhost.qz.io:8182', origin: 'http://localhost:3000' },
];
(async () => {
  for (const test of tests) {
    await new Promise((resolve) => {
      const ws = new WebSocket(test.url, { origin: test.origin, rejectUnauthorized: false });
      const done = (status, detail='') => {
        console.log(JSON.stringify({ ...test, status, detail }));
        try { ws.close(); } catch {}
        resolve();
      };
      const timer = setTimeout(() => done('timeout'), 5000);
      ws.on('open', () => { clearTimeout(timer); done('open'); });
      ws.on('error', (err) => { clearTimeout(timer); done('error', err.message); });
      ws.on('unexpected-response', (_req, res) => { clearTimeout(timer); done('unexpected-response', String(res.statusCode)); });
    });
  }
})();

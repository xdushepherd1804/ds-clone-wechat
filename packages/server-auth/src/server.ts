/**
 * Docker entry point for the auth service.
 * Starts a minimal HTTP server with health check and placeholder routes.
 */
import { createServer } from 'node:http';
import { loadConfig } from '@wechat-clone/shared';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.services.auth.port;

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'auth', timestamp: Date.now() }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ service: 'auth', message: 'Auth service running' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[auth] listening on 0.0.0.0:${PORT}`);
});

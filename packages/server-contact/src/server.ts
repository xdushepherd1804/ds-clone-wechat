/**
 * Docker entry point for the contact service.
 */
import { createServer } from 'node:http';
import { loadConfig } from '@wechat-clone/shared/config';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.services.contact.port;

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
    res.end(JSON.stringify({ status: 'ok', service: 'contact', timestamp: Date.now() }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ service: 'contact', message: 'Contact service running' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[contact] listening on 0.0.0.0:${PORT}`);
});

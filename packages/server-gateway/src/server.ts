/**
 * Docker entry point for the API + WebSocket gateway.
 *
 * Features:
 * - Health check endpoint
 * - WebSocket upgrade handling
 * - Service registry discovery
 * - Reverse proxy to backend services
 */
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { createHash } from 'node:crypto';
import { loadConfig, loadServiceRegistry } from '@wechat-clone/shared';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.gateway.port;

interface ServiceTarget {
  host: string;
  port: number;
}

const services: Record<string, ServiceTarget> = {
  auth: { host: process.env.AUTH_HOST || 'auth', port: config.services.auth.port },
  message: { host: process.env.MESSAGE_HOST || 'message', port: config.services.message.port },
  contact: { host: process.env.CONTACT_HOST || 'contact', port: config.services.contact.port },
  group: { host: process.env.GROUP_HOST || 'group', port: config.services.group.port },
  file: { host: process.env.FILE_HOST || 'file', port: config.services.file.port },
  moments: { host: process.env.MOMENTS_HOST || 'moments', port: config.services.moments.port },
};

/** Forward an HTTP request to a backend service via http.request */
function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  target: ServiceTarget,
  path: string,
): void {
  const options = {
    hostname: target.host,
    port: target.port,
    path,
    method: req.method,
    headers: { ...req.headers, host: undefined },
  };

  const proxy = request(options, (proxyRes: IncomingMessage) => {
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service unavailable' }));
  });

  req.pipe(proxy);
}

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url ?? '/';

  // Health check
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'gateway',
      timestamp: Date.now(),
      services: Object.keys(services),
    }));
    return;
  }

  // API routing: /api/{service}/{path} → service
  const apiMatch = url.match(/^\/api\/(auth|message|contact|group|file|moments)(\/.*)?$/);
  if (apiMatch) {
    const serviceName = apiMatch[1];
    const servicePath = apiMatch[2] ?? '/';
    const target = services[serviceName];
    if (target) {
      proxyRequest(req, res, target, servicePath);
      return;
    }
  }

  // WS info endpoint
  if (url === '/ws/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ wsEndpoint: '/ws', protocol: 'wechat-clone-v1' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ service: 'gateway', message: 'Gateway running' }));
});

// WebSocket upgrade handling
server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
  const url = req.url ?? '/';

  if (url.startsWith('/ws')) {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' +
        createHash('sha1')
          .update((req.headers['sec-websocket-key'] ?? '') + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64') +
        '\r\n\r\n',
    );

    const ping = setInterval(() => {
      try {
        socket.write(Buffer.from([0x89, 0x00])); // WebSocket ping frame
      } catch {
        clearInterval(ping);
      }
    }, 30000);

    socket.on('close', () => clearInterval(ping));
    socket.on('error', () => clearInterval(ping));

    // Echo handler for testing
    socket.on('data', (data: Buffer) => {
      try {
        const opcode = data[0] & 0x0f;
        if (opcode === 0x8) return; // close frame
        if (opcode === 0x9) {
          // pong
          socket.write(Buffer.from([0x8a, data[1] & 0x7f, ...data.slice(2, 2 + (data[1] & 0x7f))]));
          return;
        }
        // Echo text frames
        if (opcode === 0x1) {
          socket.write(data);
        }
      } catch {
        // ignore malformed frames
      }
    });

    console.log(`[gateway] WebSocket connection upgraded: ${url}`);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  // Load service registry for validation
  try {
    const registry = loadServiceRegistry(CONFIG_DIR);
    const serviceNames = Object.keys(registry.services);
    console.log(`[gateway] service registry loaded: ${serviceNames.join(', ')}`);
  } catch {
    console.log('[gateway] service registry not loaded (services.json missing or invalid)');
  }
  console.log(`[gateway] listening on 0.0.0.0:${PORT}`);
  console.log('[gateway] WebSocket endpoint: /ws');
});

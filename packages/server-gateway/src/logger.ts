import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Logger {
  log(req: IncomingMessage, res: ServerResponse, startTime: number, clientIp: string): void;
}

export function createLogger(): Logger {
  return {
    log(req, res, startTime, clientIp) {
      const latency = Date.now() - startTime;
      const method = req.method ?? 'UNKNOWN';
      const url = req.url ?? '/';
      const statusCode = (res as Record<string, unknown>)._statusCode as number ?? 0;

      console.log(
        `[gateway] ${method} ${url} → ${statusCode} (${latency}ms) [${clientIp}]`,
      );
    },
  };
}

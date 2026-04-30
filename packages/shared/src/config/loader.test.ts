import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, loadServiceRegistry, sanitizeConfig, ConfigError } from './loader';
import type { AppConfig } from './types';

let tempDir: string;

beforeEach(() => {
  tempDir = join(tmpdir(), `config-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeConfig(name: string, content: string): void {
  writeFileSync(join(tempDir, name), content, 'utf-8');
}

function makeDefaultYaml(overrides = ''): string {
  return `app:
  name: TestApp
  env: development
  log_level: debug
gateway:
  host: 0.0.0.0
  port: 3000
services:
  auth:    { host: auth-svc,    port: 4001 }
  message: { host: message-svc, port: 4002 }
  contact: { host: contact-svc, port: 4003 }
  group:   { host: group-svc,   port: 4004 }
  file:    { host: file-svc,    port: 4005 }
  moments: { host: moments-svc, port: 4006 }
database:
  postgres: { host: pg, port: 5432, database: wechat, user: dev }
  redis:    { host: redis, port: 6379 }
  mongodb:  { uri: mongodb://mongo:27017/wechat }
jwt:
  secret: dev-secret
  access_expire: 15m
  refresh_expire: 7d
${overrides}`;
}

describe('loadConfig', () => {
  it('loads a valid default.yaml configuration', () => {
    writeConfig('default.yaml', makeDefaultYaml());
    const config = loadConfig(tempDir, 'development');
    expect(config.app.name).toBe('TestApp');
    expect(config.gateway.port).toBe(3000);
    expect(config.services.auth.host).toBe('auth-svc');
    expect(config.jwt.secret).toBe('dev-secret');
  });

  it('returns a frozen (immutable) config', () => {
    writeConfig('default.yaml', makeDefaultYaml());
    const config = loadConfig(tempDir, 'development');
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('throws when default.yaml is missing', () => {
    expect(() => loadConfig(tempDir, 'development')).toThrow(ConfigError);
  });

  it('throws when default.yaml is empty', () => {
    writeConfig('default.yaml', '');
    expect(() => loadConfig(tempDir, 'development')).toThrow(ConfigError);
  });

  it('throws on invalid YAML syntax', () => {
    writeConfig('default.yaml', '{{invalid: yaml: :}');
    expect(() => loadConfig(tempDir, 'development')).toThrow(ConfigError);
  });

  it('defaults env to "development" when not specified and NODE_ENV is unset', () => {
    writeConfig('default.yaml', makeDefaultYaml());
    const prev = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      const config = loadConfig(tempDir);
      expect(config.app.env).toBe('development');
    } finally {
      if (prev !== undefined) process.env.NODE_ENV = prev;
    }
  });

  it('respects NODE_ENV when env is not passed', () => {
    writeConfig('default.yaml', makeDefaultYaml());
    writeConfig('staging.yaml', makeDefaultYaml().replace('dev-secret', 'staging-secret'));
    process.env.NODE_ENV = 'staging';
    try {
      const config = loadConfig(tempDir);
      expect(config.jwt.secret).toBe('staging-secret');
    } finally {
      delete process.env.NODE_ENV;
    }
  });

  it('throws for invalid NODE_ENV value', () => {
    writeConfig('default.yaml', makeDefaultYaml());
    process.env.NODE_ENV = 'invalid-env';
    try {
      expect(() => loadConfig(tempDir)).toThrow(ConfigError);
    } finally {
      delete process.env.NODE_ENV;
    }
  });

  describe('environment override merging', () => {
    it('overrides nested values from environment-specific file', () => {
      writeConfig('default.yaml', makeDefaultYaml());
      writeConfig(
        'production.yaml',
        `gateway:
  port: 8080
jwt:
  secret: prod-secret
`,
      );
      const config = loadConfig(tempDir, 'production');
      expect(config.gateway.port).toBe(8080);
      expect(config.jwt.secret).toBe('prod-secret');
      // unchanged values remain
      expect(config.gateway.host).toBe('0.0.0.0');
    });

    it('absence of environment file is not an error', () => {
      writeConfig('default.yaml', makeDefaultYaml());
      const config = loadConfig(tempDir, 'development');
      expect(config.jwt.secret).toBe('dev-secret');
    });
  });
});

describe('environment variable resolution', () => {
  it('resolves ${VAR} placeholders from process.env', () => {
    writeConfig(
      'default.yaml',
      makeDefaultYaml().replace('dev-secret', '${JWT_SECRET}'),
    );
    process.env.JWT_SECRET = 'env-secret';
    try {
      const config = loadConfig(tempDir, 'development');
      expect(config.jwt.secret).toBe('env-secret');
    } finally {
      delete process.env.JWT_SECRET;
    }
  });

  it('throws when referenced env var is not set', () => {
    writeConfig(
      'default.yaml',
      makeDefaultYaml().replace('dev-secret', '${MISSING_VAR}'),
    );
    expect(() => loadConfig(tempDir, 'development')).toThrow(ConfigError);
  });

  it('resolves env vars inside longer strings', () => {
    writeConfig(
      'default.yaml',
      makeDefaultYaml().replace(
        'mongodb://mongo:27017/wechat',
        '"mongodb://${MONGO_HOST}:27017/wechat"',
      ),
    );
    process.env.MONGO_HOST = 'custom-mongo';
    try {
      const config = loadConfig(tempDir, 'development');
      expect(config.database.mongodb.uri).toBe('mongodb://custom-mongo:27017/wechat');
    } finally {
      delete process.env.MONGO_HOST;
    }
  });
});

describe('config validation', () => {
  function remove(key: string, yaml: string): string {
    const lines = yaml.split('\n');
    const idx = lines.findIndex((l) => l.startsWith(key));
    if (idx >= 0) lines.splice(idx, 1);
    return lines.join('\n');
  }

  it('throws when required top-level section is missing', () => {
    const yaml = remove('gateway:', makeDefaultYaml());
    writeConfig('default.yaml', yaml);
    expect(() => loadConfig(tempDir, 'development')).toThrow(ConfigError);
  });

  it('throws when JWT secret is empty', () => {
    const yaml = makeDefaultYaml().replace('dev-secret', "''");
    writeConfig('default.yaml', yaml);
    expect(() => loadConfig(tempDir, 'development')).toThrow(ConfigError);
  });

  it('throws when required nested field value is absent', () => {
    // replace postgres block entirely with an empty object
    const yaml = makeDefaultYaml().replace(
      /postgres: \{ host: pg, port: 5432, database: wechat, user: dev \}/,
      'postgres: {}',
    );
    writeConfig('default.yaml', yaml);
    expect(() => loadConfig(tempDir, 'development')).toThrow(ConfigError);
  });

  it('error message includes the environment name', () => {
    writeConfig('default.yaml', 'app:\n  name: Test\n');
    try {
      loadConfig(tempDir, 'staging');
    } catch (e) {
      expect((e as ConfigError).message).toContain('staging');
    }
  });
});

describe('loadServiceRegistry', () => {
  it('loads a valid services.json', () => {
    const registry = {
      services: {
        auth: { host: 'auth-svc', port: 4001, healthCheck: '/health' },
        message: { host: 'message-svc', port: 4002, healthCheck: '/health' },
      },
    };
    writeFileSync(join(tempDir, 'services.json'), JSON.stringify(registry), 'utf-8');
    const result = loadServiceRegistry(tempDir);
    expect(result.services.auth.host).toBe('auth-svc');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('throws when services.json is missing', () => {
    expect(() => loadServiceRegistry(tempDir)).toThrow(ConfigError);
  });

  it('throws on invalid JSON', () => {
    writeFileSync(join(tempDir, 'services.json'), '{invalid json', 'utf-8');
    expect(() => loadServiceRegistry(tempDir)).toThrow(ConfigError);
  });

  it('throws when "services" key is missing', () => {
    writeFileSync(join(tempDir, 'services.json'), JSON.stringify({}), 'utf-8');
    expect(() => loadServiceRegistry(tempDir)).toThrow(ConfigError);
  });
});

describe('sanitizeConfig', () => {
  it('masks sensitive string values', () => {
    writeConfig('default.yaml', makeDefaultYaml());
    const config = loadConfig(tempDir, 'development');
    const sanitized = sanitizeConfig(config);
    expect(sanitized.jwt.secret).toBe('***');
    expect(sanitized.database.mongodb.uri).toBe('***');
  });

  it('preserves non-sensitive values', () => {
    writeConfig('default.yaml', makeDefaultYaml());
    const config = loadConfig(tempDir, 'development');
    const sanitized = sanitizeConfig(config);
    expect(sanitized.app.name).toBe('TestApp');
    expect(sanitized.gateway.port).toBe(3000);
    expect(sanitized.services.auth.host).toBe('auth-svc');
    expect(sanitized.database.redis.host).toBe('redis');
  });

  it('does not mutate the original config', () => {
    writeConfig('default.yaml', makeDefaultYaml());
    const config = loadConfig(tempDir, 'development');
    const originalSecret = config.jwt.secret;
    sanitizeConfig(config);
    expect(config.jwt.secret).toBe(originalSecret);
  });

  it('does not mask empty strings', () => {
    const config: AppConfig = {
      app: { name: 'Test', env: 'development', log_level: 'debug' },
      gateway: { host: '0.0.0.0', port: 3000 },
      services: {} as AppConfig['services'],
      database: {
        postgres: { host: 'pg', port: 5432, database: 'db', user: 'u' },
        redis: { host: 'redis', port: 6379 },
        mongodb: { uri: '' },
      },
      jwt: { secret: '', access_expire: '15m', refresh_expire: '7d' },
    };
    const sanitized = sanitizeConfig(config);
    expect(sanitized.database.mongodb.uri).toBe('');
  });
});

describe('ConfigError', () => {
  it('has name "ConfigError"', () => {
    const err = new ConfigError('test error');
    expect(err.name).toBe('ConfigError');
  });

  it('chains cause when it is an Error', () => {
    const cause = new Error('original');
    const err = new ConfigError('wrapper', cause);
    expect(err.cause).toBe(cause);
  });

  it('ignores cause when it is not an Error', () => {
    const err = new ConfigError('test', 'string cause');
    expect(err.cause).toBeUndefined();
  });
});

/**
 * @wechat-clone/shared — configuration loader
 *
 * Loads YAML config files (default + environment-specific), merges them,
 * resolves environment variable placeholders, and validates the result.
 */

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { parse as parseYaml } from 'yaml';

import type { AppConfig, ServiceRegistry, EnvName } from './types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and merge configuration for the given environment.
 *
 * @param configDir  Absolute or relative path to the directory containing
 *                   default.yaml and {env}.yaml files.
 * @param env        Environment name. Defaults to NODE_ENV or 'development'.
 * @returns A frozen, validated AppConfig object.
 */
export function loadConfig(configDir: string, env?: string): AppConfig {
  const resolvedEnv = resolveEnv(env);
  const dir = resolvePath(configDir);

  const defaults = readYaml(dir, 'default.yaml');
  if (!defaults) {
    throw new ConfigError(
      `Missing default configuration file: ${dir}/default.yaml`,
    );
  }

  const overrides = readYaml(dir, `${resolvedEnv}.yaml`);
  const merged = deepMerge(defaults, overrides ?? {}) as Record<string, unknown>;

  const resolved = resolveEnvVars(merged);
  const config = resolved as AppConfig;

  validate(config, resolvedEnv);

  return Object.freeze(config);
}

/**
 * Load the service registry from a JSON file.
 */
export function loadServiceRegistry(configDir: string): ServiceRegistry {
  const dir = resolvePath(configDir);
  const path = resolvePath(dir, 'services.json');

  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    throw new ConfigError(`Service registry not found: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new ConfigError(`Invalid JSON in service registry: ${path}`, cause);
  }

  if (!parsed || typeof parsed !== 'object' || !('services' in parsed)) {
    throw new ConfigError(
      `Service registry must have a top-level "services" key: ${path}`,
    );
  }

  return Object.freeze(parsed) as ServiceRegistry;
}

/**
 * Return a sanitized copy of the config safe for logging.
 * Masks secrets, passwords, tokens, and connection strings.
 */
export function sanitizeConfig(config: AppConfig): AppConfig {
  return deepSanitize(structuredClone(config)) as AppConfig;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  'secret',
  'password',
  'pass',
  'token',
  'key',
  'uri',
  'url',
]);

const MASK = '***';

function resolveEnv(env?: string): string {
  if (env) return env;
  if (process.env.NODE_ENV) {
    const valid = ['development', 'staging', 'production'];
    if (!valid.includes(process.env.NODE_ENV)) {
      throw new ConfigError(
        `Invalid NODE_ENV "${process.env.NODE_ENV}". Expected one of: ${valid.join(', ')}`,
      );
    }
    return process.env.NODE_ENV;
  }
  return 'development';
}

function readYaml(dir: string, filename: string): Record<string, unknown> | null {
  const path = resolvePath(dir, filename);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
  try {
    const parsed = parseYaml(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new ConfigError(`Config file is empty or not an object: ${path}`);
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(`Invalid YAML in config file: ${path}`, err);
  }
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, val] of Object.entries(override)) {
    if (isPlainObject(val) && isPlainObject(result[key])) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        val as Record<string, unknown>,
      );
    } else {
      result[key] = val;
    }
  }
  return result;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Resolve ${VAR_NAME} placeholders using process.env.
// Supports nesting inside strings and also replacing whole values.
function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return resolveString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars);
  }
  if (isPlainObject(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = resolveEnvVars(val);
    }
    return result;
  }
  return obj;
}

const ENV_VAR_RE = /\$\{([^}]+)\}/;

function resolveString(value: string): string {
  const match = value.match(ENV_VAR_RE);
  if (!match) return value;

  const varName = match[1];
  const envVal = process.env[varName];
  if (envVal === undefined) {
    throw new ConfigError(
      `Environment variable "${varName}" is required but not set (referenced as "\${${varName}}")`,
    );
  }
  // If the entire value is just the placeholder, replace it with the env value
  // (preserving type if the env value is not a string representation).
  // Otherwise substitute inline.
  if (value === `\${${varName}}`) {
    return envVal;
  }
  return value.replace(ENV_VAR_RE, envVal);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(config: AppConfig, env: string): void {
  const errors: string[] = [];

  checkRequired('app', config.app, errors, [
    'name',
    'env',
    'log_level',
  ]);
  checkRequired('gateway', config.gateway, errors, ['host', 'port']);
  checkRequired('services', config.services, errors, [
    'auth',
    'message',
    'contact',
    'group',
    'file',
    'moments',
  ]);
  checkRequired('database', config.database, errors, ['postgres', 'redis', 'mongodb']);
  checkRequired('database.postgres', config.database?.postgres, errors, [
    'host',
    'port',
    'database',
    'user',
  ]);
  checkRequired('database.redis', config.database?.redis, errors, ['host', 'port']);
  checkRequired('database.mongodb', config.database?.mongodb, errors, ['uri']);
  checkRequired('jwt', config.jwt, errors, ['secret', 'access_expire', 'refresh_expire']);

  if (config.jwt?.secret === '') {
    errors.push('jwt.secret: must not be empty (set JWT_SECRET in environment)');
  }

  if (errors.length > 0) {
    const list = errors.map((e) => `  - ${e}`).join('\n');
    throw new ConfigError(
      `Configuration validation failed for environment "${env}":\n${list}`,
    );
  }
}

function checkRequired(
  path: string,
  obj: Record<string, unknown> | undefined,
  errors: string[],
  keys: string[],
): void {
  if (!obj) {
    errors.push(`${path}: section is missing`);
    return;
  }
  for (const key of keys) {
    if (!(key in obj)) {
      errors.push(`${path}.${key}: is required but missing`);
    }
  }
}

// ---------------------------------------------------------------------------
// Sanitization (deep)
// ---------------------------------------------------------------------------

function deepSanitize(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(deepSanitize);
  }
  if (isPlainObject(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(key) && typeof val === 'string' && val.length > 0) {
        result[key] = MASK;
      } else {
        result[key] = deepSanitize(val);
      }
    }
    return result;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ConfigError extends Error {
  override name = 'ConfigError';

  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

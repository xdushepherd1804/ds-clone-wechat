/**
 * T006 verification script — tests config loading, error handling, and sanitization.
 *
 * Usage: npx tsx packages/shared/src/config/__tests__/verify.ts
 */

import { loadConfig, loadServiceRegistry, sanitizeConfig, ConfigError } from '../loader';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Config files are at <repo_root>/config/
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = resolve(__dirname, '..', '..', '..', '..', '..', 'config');

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test 1: Load development config (defaults to 'development' when NODE_ENV unset)
// ---------------------------------------------------------------------------
console.log('\n── Test 1: Development config loading ──');

const dev = loadConfig(CONFIG_DIR); // defaults to development
assert(dev.app.name === 'wechat-clone', 'app.name is "wechat-clone"');
assert(dev.app.env === 'development', 'app.env is "development"');
assert(dev.app.log_level === 'debug', 'development overrides log_level to "debug"');
assert(dev.gateway.port === 3000, 'gateway.port is 3000');
assert(typeof dev.jwt.secret === 'string', 'jwt.secret is a string');
assert(dev.database.postgres.user === 'wechat_dev', 'dev overrides postgres.user to "wechat_dev"');

// Test 2: Load config with explicit env argument
console.log('\n── Test 2: Explicit env argument ──');

const dev2 = loadConfig(CONFIG_DIR, 'development');
assert(dev2.app.env === 'development', 'explicit "development" works');

// Test 3: Missing config file gives clear error
console.log('\n── Test 3: Missing config file error ──');

try {
  loadConfig('/nonexistent/path');
  assert(false, 'should have thrown');
} catch (err) {
  const isConfigError = err instanceof ConfigError;
  const hasFilePath = err instanceof Error && err.message.includes('default.yaml');
  assert(isConfigError, 'throws ConfigError for missing default.yaml');
  assert(hasFilePath, 'error message includes the file path');
}

// Test 4: Missing env var placeholder gives clear error
console.log('\n── Test 4: Missing env var error ──');

try {
  // staging.yaml references ${PG_HOST} — unset it first
  delete process.env.PG_HOST;
  loadConfig(CONFIG_DIR, 'staging');
  assert(false, 'should have thrown for missing PG_HOST');
} catch (err) {
  const msg = err instanceof Error ? err.message : '';
  assert(err instanceof ConfigError, 'throws ConfigError for unresolved env var');
  assert(msg.includes('PG_HOST'), 'error message names the missing variable');
}

// Test 5: Sanitize masks sensitive fields
console.log('\n── Test 5: Sensitive info sanitization ──');

process.env.JWT_SECRET = 'test-secret-value';
const cfg = loadConfig(CONFIG_DIR, 'development');
const safe = sanitizeConfig(structuredClone(cfg) as typeof cfg);

// jwt.secret should be masked
assert(safe.jwt.secret === '***', 'jwt.secret is masked (***)');

// mongodb uri should be masked
assert(safe.database.mongodb.uri === '***', 'mongodb.uri is masked (***)');

// Non-sensitive fields should be unchanged
assert(safe.app.name === cfg.app.name, 'app.name is unchanged');
assert(safe.gateway.port === cfg.gateway.port, 'gateway.port is unchanged');

// Original config must NOT be mutated
assert(cfg.jwt.secret === 'test-secret-value', 'original config is not mutated');
assert(cfg.database.mongodb.uri !== '***', 'original mongodb.uri is unchanged');

// Test 6: Verify sanitized config can be safely logged (no raw secrets)
console.log('\n── Test 6: Log-safe output ──');

const logOutput = JSON.stringify(safe);
assert(!logOutput.includes('test-secret-value'), 'sanitized JSON does not contain JWT secret');
assert(!logOutput.includes('wechat_dev@'), 'sanitized JSON does not contain MongoDB credentials');

// Test 7: Service registry
console.log('\n── Test 7: Service registry ──');

const registry = loadServiceRegistry(CONFIG_DIR);
assert('services' in registry, 'registry has "services" key');
assert('auth' in registry.services, 'auth service is registered');
assert('message' in registry.services, 'message service is registered');
assert(registry.services.auth.port === 3001, 'auth port is 3001');
assert(registry.services.auth.healthCheck === '/health', 'auth has healthCheck endpoint');
assert(registry.services.gateway.port === 3000, 'gateway port is 3000');

// Test 8: Staging config loads when env vars are set
console.log('\n── Test 8: Staging config with env vars ──');

process.env.PG_HOST = 'staging-db.example.com';
process.env.PG_USER = 'staging_user';
process.env.REDIS_HOST = 'staging-redis.example.com';
process.env.MONGODB_URI = 'mongodb://staging-mongo:27017/wechat_staging';
process.env.JWT_SECRET = 'staging-secret';

const staging = loadConfig(CONFIG_DIR, 'staging');
assert(staging.app.env === 'staging', 'staging app.env is "staging"');
assert(staging.app.log_level === 'info', 'staging log_level is "info"');
assert(staging.database.postgres.host === 'staging-db.example.com', 'resolves PG_HOST');
assert(staging.database.postgres.user === 'staging_user', 'resolves PG_USER');
assert(staging.database.redis.host === 'staging-redis.example.com', 'resolves REDIS_HOST');
assert(staging.database.mongodb.uri === 'mongodb://staging-mongo:27017/wechat_staging', 'resolves MONGODB_URI');
assert(staging.jwt.access_expire === '10m', 'staging overrides access_expire');
assert(staging.jwt.refresh_expire === '3d', 'staging overrides refresh_expire');

// Test 9: Production config with env vars
console.log('\n── Test 9: Production config with env vars ──');

process.env.PG_HOST = 'prod-db.example.com';
process.env.PG_USER = 'prod_user';
process.env.REDIS_HOST = 'prod-redis.example.com';
process.env.MONGODB_URI = 'mongodb://prod-mongo:27017/wechat_production';

const prod = loadConfig(CONFIG_DIR, 'production');
assert(prod.app.env === 'production', 'production app.env is "production"');
assert(prod.app.log_level === 'warn', 'production log_level is "warn"');
assert(prod.jwt.access_expire === '5m', 'production shortens access_expire');
assert(prod.jwt.refresh_expire === '1d', 'production shortens refresh_expire');

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
console.log(`${'═'.repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}

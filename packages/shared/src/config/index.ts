/**
 * @wechat-clone/shared — configuration module
 */

export { loadConfig, loadServiceRegistry, sanitizeConfig, ConfigError } from './loader';
export type {
  AppConfig,
  AppSettings,
  GatewaySettings,
  ServiceEndpoint,
  ServicesConfig,
  DatabaseConfig,
  PostgresConfig,
  RedisConfig,
  MongoConfig,
  JwtConfig,
  ServiceRegistryEntry,
  ServiceRegistry,
  EnvName,
} from './types';

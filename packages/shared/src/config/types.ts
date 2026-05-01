/**
 * @wechat-clone/shared — configuration type definitions
 */

export interface AppConfig {
  app: AppSettings;
  gateway: GatewaySettings;
  services: ServicesConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
}

export interface AppSettings {
  name: string;
  env: 'development' | 'staging' | 'production';
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

export interface GatewaySettings {
  host: string;
  port: number;
}

export interface ServiceEndpoint {
  host: string;
  port: number;
}

export interface ServicesConfig {
  auth: ServiceEndpoint;
  message: ServiceEndpoint;
  contact: ServiceEndpoint;
  group: ServiceEndpoint;
  file: ServiceEndpoint;
  moments: ServiceEndpoint;
  push: ServiceEndpoint;
  search: ServiceEndpoint;
  redpacket: ServiceEndpoint;
  qrcode: ServiceEndpoint;
}

export interface DatabaseConfig {
  postgres: PostgresConfig;
  redis: RedisConfig;
  mongodb: MongoConfig;
}

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
}

export interface RedisConfig {
  host: string;
  port: number;
}

export interface MongoConfig {
  uri: string;
}

export interface JwtConfig {
  secret: string;
  access_expire: string;
  refresh_expire: string;
}

/** Service registry entry for service discovery */
export interface ServiceRegistryEntry {
  host: string;
  port: number;
  healthCheck: string;
}

export interface ServiceRegistry {
  services: Record<string, ServiceRegistryEntry>;
}

export type EnvName = 'development' | 'staging' | 'production';

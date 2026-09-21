import { readFileSync } from 'fs';

export interface JwtConfig {
  privateKey: string;
  publicKey: string;
  algorithm: 'RS256';
  accessTokenTtl: number; // 秒
  refreshTokenTtl: number; // 秒
  issuer: string;
}

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface AppConfig {
  jwt: JwtConfig;
  db: DbConfig;
}

function readKey(envVar: string, fileVar: string): string {
  if (process.env[envVar]) return process.env[envVar]!;
  if (process.env[fileVar]) return readFileSync(process.env[fileVar]!, 'utf8');
  return '';
}

/**
 * 从环境变量装配配置。RSA 私钥/公钥走环境变量或文件，
 * 永不硬编码（生产通过 k8s secret 注入多行 PEM）。
 */
export function loadConfig(): AppConfig {
  return {
    jwt: {
      privateKey: readKey('JWT_PRIVATE_KEY', 'JWT_PRIVATE_KEY_FILE'),
      publicKey: readKey('JWT_PUBLIC_KEY', 'JWT_PUBLIC_KEY_FILE'),
      algorithm: 'RS256',
      accessTokenTtl: parseInt(process.env.ACCESS_TOKEN_TTL ?? '900', 10),
      refreshTokenTtl: parseInt(process.env.REFRESH_TOKEN_TTL ?? '2592000', 10),
      issuer: process.env.JWT_ISSUER ?? 'gri-auth-center',
    },
    db: {
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5434', 10),
      database: process.env.DB_NAME ?? 'gri_auth',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    },
  };
}
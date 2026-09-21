#!/usr/bin/env node
/**
 * ensure-keys.mjs —— 为 auth-center 生成/复用持久 RSA-2048 密钥对（JWKS 供业务后端离线校验）。
 *
 * 背景：auth-center 在未注入 JWT 密钥时每次启动生成「临时」RSA，导致容器/进程重启后
 * 已签发 token 全部失效（签名密钥变了），全系统被迫重新登录。本脚本把开发密钥对固化到
 * 持久卷（AUTH_KEYS_DIR，默认 /run/keys）：
 *   - 不存在 → 生成一次并落盘（私钥 0600、公钥 0644）；
 *   - 已存在 → 复用，保证跨重启签名密钥不变、已发 token 持续有效。
 *
 * 生产路径不受影响：若环境已注入 JWT_PRIVATE_KEY（env 值优先级最高，见 config.ts readKey），
 * entrypoint.sh 会跳过本脚本、直接用注入密钥。
 */
import { generateKeyPairSync } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const dir = process.env.AUTH_KEYS_DIR || '/run/keys';
const privPath = resolve(dir, 'jwt-private.pem');
const pubPath = resolve(dir, 'jwt-public.pem');

mkdirSync(dir, { recursive: true });

if (!existsSync(privPath) || !existsSync(pubPath)) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  writeFileSync(privPath, privateKey, { mode: 0o600 });
  writeFileSync(pubPath, publicKey, { mode: 0o644 });
  // eslint-disable-next-line no-console
  console.log(`[auth-center] 已生成持久 RSA-2048 密钥对 -> ${dir}`);
} else {
  // eslint-disable-next-line no-console
  console.log(`[auth-center] 复用持久密钥对 -> ${dir}`);
}
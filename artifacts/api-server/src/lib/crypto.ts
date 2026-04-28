import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const SALT = "iis-integration-config-v1";

function deriveKey(): Buffer {
  const secret = process.env["SESSION_SECRET"] ?? "dev-fallback-secret-do-not-use-in-prod";
  return scryptSync(secret, SALT, 32) as Buffer;
}

export function encryptConfig(data: Record<string, unknown>): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString("base64");
}

export function decryptConfig(encoded: string): Record<string, unknown> {
  const key = deriveKey();
  const combined = Buffer.from(encoded, "base64");
  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(12, 28);
  const encrypted = combined.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

const SECRET_FIELD_PATTERNS = [
  "password", "apikey", "api_key", "secretaccesskey", "secret_access_key",
  "hectoken", "hec_token", "apitoken", "api_token",
];

export function maskSecrets(fields: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, val] of Object.entries(fields)) {
    const lower = key.toLowerCase();
    const isSecret = SECRET_FIELD_PATTERNS.some((p) => lower.includes(p));
    if (isSecret && val) {
      masked[key] = val.length <= 4 ? "••••" : "••••••••" + val.slice(-4);
    } else {
      masked[key] = val;
    }
  }
  return masked;
}

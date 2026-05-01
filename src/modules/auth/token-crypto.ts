import * as crypto from 'crypto';

export function generateRawToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

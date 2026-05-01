import { Request } from 'express';
import { DeviceType } from './entities/refresh-token.entity';

export interface RequestContext {
  ip: string;
  userAgent: string | null;
  deviceType: DeviceType;
  deviceName: string | null;
}

export function buildRequestContext(req: Request): RequestContext {
  const userAgent = headerValue(req, 'user-agent');
  return {
    ip: extractIp(req),
    userAgent,
    deviceType: detectDeviceType(userAgent),
    deviceName: null,
  };
}

function extractIp(req: Request): string {
  const forwarded = headerValue(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const raw = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  return raw.replace(/^::ffff:/, '');
}

function headerValue(req: Request, name: string): string | null {
  const v = req.headers[name];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length) return v[0];
  return null;
}

function detectDeviceType(ua: string | null): DeviceType {
  if (!ua) return 'web';
  if (/iPhone|iPad/.test(ua)) return 'mobile_ios';
  if (/Android/.test(ua)) return 'mobile_android';
  if (/Electron/.test(ua)) return 'desktop';
  return 'web';
}

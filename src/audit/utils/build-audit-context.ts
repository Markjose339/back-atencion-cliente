import type { Request } from 'express';
import type { AuditContext } from '@/audit/interfaces/audit-log.interface';

export function buildAuditContext(
  req: Request,
  userId?: string | null,
): AuditContext {
  const forwardedFor = req.headers['x-forwarded-for'];

  const ipAddress =
    typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0]?.trim() ?? null
      : req.ip ?? req.socket.remoteAddress ?? null;

  const userAgent = req.get('user-agent') ?? null;

  return {
    userId: userId ?? null,
    ipAddress,
    userAgent,
  };
}

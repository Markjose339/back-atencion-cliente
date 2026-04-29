export interface AuditContext {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditLogInput {
  action: string;
  auditableType: string;
  auditableId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  description?: string | null;
}

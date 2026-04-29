import { users } from '@/users/entities/user.entity';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),

    userId: varchar('user_id', { length: 24 }).references(() => users.id, {
      onDelete: 'set null',
    }),

    action: varchar('action', { length: 150 }).notNull(),
    auditableType: varchar('auditable_type', { length: 50 }).notNull(),
    auditableId: varchar('auditable_id', { length: 24 }),
    oldValues: jsonb('old_values').$type<Record<string, unknown> | null>(),
    newValues: jsonb('new_values').$type<Record<string, unknown> | null>(),
    description: text('description'),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 255 }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('audit_logs_user_id_idx').on(t.userId),
    index('audit_logs_action_idx').on(t.action),
    index('audit_logs_auditable_idx').on(t.auditableType, t.auditableId),
    index('audit_logs_created_at_idx').on(t.createdAt),
  ],
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

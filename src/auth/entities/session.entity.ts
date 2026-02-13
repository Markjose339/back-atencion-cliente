import { users } from '@/users/entities/user.entity';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  text,
  pgEnum,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const sessionStatusEnum = pgEnum('session_status', [
  'active',
  'expired',
  'revoked',
]);

export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: varchar('user_id', { length: 24 })
      .notNull()
      .references(() => users.id),
    refreshToken: text('refresh_token').unique(),

    status: sessionStatusEnum('status').default('active').notNull(),
    lastActivity: timestamp('last_activity', { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('session_user_id_idx').on(t.userId),
    index('refresh_token_idx').on(t.refreshToken),
    index('session_status_idx').on(t.status),
    index('session_expires_at_idx').on(t.expiresAt),
  ],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

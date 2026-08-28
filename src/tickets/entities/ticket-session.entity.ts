import { branches } from '@/branches/entities/branch.entity';
import { users } from '@/users/entities/user.entity';
import { createId } from '@paralleldrive/cuid2';
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const ticketSessions = pgTable(
  'ticket_sessions',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    branchId: varchar('branch_id', { length: 24 })
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    businessDate: date('business_date').notNull(),
    sessionNumber: integer('session_number').notNull(),
    regularCounter: integer('regular_counter').notNull().default(0),
    preferentialCounter: integer('preferential_counter').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedByUserId: varchar('closed_by_user_id', { length: 24 }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    closeReason: varchar('close_reason', { length: 100 }),
  },
  (t) => [
    index('ticket_sessions_branch_active_idx').on(t.branchId, t.isActive),
    index('ticket_sessions_branch_date_idx').on(
      t.branchId,
      t.businessDate,
    ),
  ],
);

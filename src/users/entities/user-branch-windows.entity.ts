import { createId } from '@paralleldrive/cuid2';
import {
  pgTable,
  boolean,
  timestamp,
  varchar,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './user.entity';
import { branchWindows } from '@/branches/entities/branch-windows.entity';
import { relations } from 'drizzle-orm';
import { branches } from '@/branches/entities/branch.entity';

export const userBranchWindows = pgTable(
  'user_branch_windows',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: varchar('user_id', { length: 24 })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    branchWindowId: varchar('branch_window_id', { length: 24 })
      .references(() => branchWindows.id, { onDelete: 'cascade' })
      .notNull(),
    branchId: varchar('branch_id', { length: 24 })
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('ubw_user_branchWindow_uq').on(t.userId, t.branchWindowId),
    uniqueIndex('ubw_user_branch_uq').on(t.userId, t.branchId),
    index('ubw_user_branch_active_idx').on(t.userId, t.branchId, t.isActive),
  ],
);

export const userBranchWindowsRelations = relations(
  userBranchWindows,
  ({ one }) => ({
    user: one(users, {
      fields: [userBranchWindows.userId],
      references: [users.id],
    }),
    branchWindow: one(branchWindows, {
      fields: [userBranchWindows.branchWindowId],
      references: [branchWindows.id],
    }),
    branch: one(branches, {
      fields: [userBranchWindows.branchId],
      references: [branches.id],
    }),
  }),
);

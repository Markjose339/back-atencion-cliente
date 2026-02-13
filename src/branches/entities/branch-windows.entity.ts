import { createId } from '@paralleldrive/cuid2';
import {
  pgTable,
  boolean,
  varchar,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { branches } from './branch.entity';
import { windows } from '@/windows/entities/window.entity';
import { relations } from 'drizzle-orm';
import { branchWindowServices } from './branch_window_service.entity';
import { userBranchWindows } from '@/users/entities/user-branch-windows.entity';

export const branchWindows = pgTable(
  'branch_windows',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    branchId: varchar('branch_id', { length: 24 })
      .notNull()
      .references(() => branches.id),
    windowId: varchar('window_id', { length: 24 })
      .notNull()
      .references(() => windows.id),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('branch_windows_branch_window_uq').on(t.branchId, t.windowId),
  ],
);

export const branchWindowsRelations = relations(
  branchWindows,
  ({ one, many }) => ({
    branch: one(branches, {
      fields: [branchWindows.branchId],
      references: [branches.id],
    }),
    window: one(windows, {
      fields: [branchWindows.windowId],
      references: [windows.id],
    }),
    services: many(branchWindowServices),
    users: many(userBranchWindows),
  }),
);

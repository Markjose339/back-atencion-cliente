import { createId } from '@paralleldrive/cuid2';
import { pgTable, varchar, timestamp, index } from 'drizzle-orm/pg-core';

export const branchWindowService = pgTable(
  'branch_window_service',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    branchId: varchar('branch_id', { length: 24 }).notNull(),
    windowId: varchar('window_id', { length: 24 }).notNull(),
    serviceId: varchar('service_id', { length: 24 }).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('branch_window_service_branch_id_idx').on(t.branchId),
    index('branch_window_service_window_id_idx').on(t.windowId),
    index('branch_window_service_service_id_idx').on(t.serviceId),
  ],
);

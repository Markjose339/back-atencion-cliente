import { branches } from '@/branches/entities/branch.entity';
import { windows } from '@/windows/entities/window.entity';
import { pgTable, varchar, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { services } from './service.entity';
import { users } from '@/users/entities/user.entity';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

export const branchWindowServices = pgTable(
  'branch_window_services',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    branchId: varchar('branch_id', { length: 24 })
      .references(() => branches.id)
      .notNull(),
    windowId: varchar('window_id', { length: 24 })
      .references(() => windows.id)
      .notNull(),
    serviceId: varchar('service_id', { length: 24 })
      .references(() => services.id)
      .notNull(),
    userId: varchar('user_id', { length: 24 })
      .references(() => users.id)
      .notNull(),
  },
  (t) => [
    uniqueIndex('branch_window_services_unique_combo').on(
      t.branchId,
      t.windowId,
      t.serviceId,
      t.userId,
    ),
    index('branch_window_services_id_idx').on(t.id),
    index('branch_window_services_branch_idx').on(t.branchId),
    index('branch_window_services_window_idx').on(t.windowId),
    index('branch_window_services_service_idx').on(t.serviceId),
    index('branch_window_services_user_idx').on(t.userId),
  ],
);

export const branchWindowServicesRelations = relations(
  branchWindowServices,
  ({ one }) => ({
    branch: one(branches, {
      fields: [branchWindowServices.branchId],
      references: [branches.id],
    }),
    window: one(windows, {
      fields: [branchWindowServices.windowId],
      references: [windows.id],
    }),
    service: one(services, {
      fields: [branchWindowServices.serviceId],
      references: [services.id],
    }),
    user: one(users, {
      fields: [branchWindowServices.userId],
      references: [users.id],
    }),
  }),
);

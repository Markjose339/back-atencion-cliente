import {
  pgTable,
  varchar,
  uniqueIndex,
  boolean,
  timestamp,
  index,
  integer,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { branchWindows } from './branch-windows.entity';
import { services } from '@/services/entities/service.entity';
import { relations } from 'drizzle-orm';

export const branchWindowServices = pgTable(
  'branch_window_services',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),

    branchWindowId: varchar('branch_window_id', { length: 24 })
      .references(() => branchWindows.id, { onDelete: 'cascade' })
      .notNull(),

    serviceId: varchar('service_id', { length: 24 })
      .references(() => services.id, { onDelete: 'restrict' })
      .notNull(),

    priority: integer('priority').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('bws_branchwindow_service_uq').on(
      t.branchWindowId,
      t.serviceId,
    ),
    index('bws_branchwindow_idx').on(t.branchWindowId),
    index('bws_service_idx').on(t.serviceId),
    index('bws_active_idx').on(t.isActive),
  ],
);

export const branchWindowServicesRelations = relations(
  branchWindowServices,
  ({ one }) => ({
    branchWindow: one(branchWindows, {
      fields: [branchWindowServices.branchWindowId],
      references: [branchWindows.id],
    }),
    service: one(services, {
      fields: [branchWindowServices.serviceId],
      references: [services.id],
    }),
  }),
);

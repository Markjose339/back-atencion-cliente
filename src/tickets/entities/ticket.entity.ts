import { branches } from '@/branches/entities/branch.entity';
import { services } from '@/services/entities/service.entity';
import { users } from '@/users/entities/user.entity';
import { windows } from '@/windows/entities/window.entity';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const TicketTypeEnum = pgEnum('ticket_type', [
  'REGULAR',
  'PREFERENCIAL',
]);

export const tickets = pgTable(
  'tickets',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    code: varchar('code', { length: 15 }).notNull(),
    packageCode: varchar('package_code', { length: 25 }),
    type: TicketTypeEnum('type').default('REGULAR').notNull(),

    attentionStartedAt: timestamp('attention_started_at'),
    attentionFinishedAt: timestamp('attention_finished_at'),
    userId: varchar('user_id', { length: 24 }).references(() => users.id),
    windowId: varchar('window_id', { length: 24 }).references(() => windows.id),
    serviceId: varchar('service_id', { length: 24 })
      .references(() => services.id)
      .notNull(),
    branchId: varchar('branch_id', { length: 24 })
      .references(() => branches.id)
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('tickets_code_idx').on(t.code),
    index('tickets_package_code_idx').on(t.packageCode),
    index('tickets_attention_started_idx').on(t.attentionStartedAt),
    index('tickets_attention_finished_idx').on(t.attentionFinishedAt),
    index('tickets_user_id_idx').on(t.userId),
    index('tickets_window_id_idx').on(t.windowId),
    index('tickets_service_id_idx').on(t.serviceId),
    index('tickets_branch_id_idx').on(t.branchId),
    index('tickets_queue_waiting_idx').on(
      t.branchId,
      t.windowId,
      t.serviceId,
      t.attentionStartedAt,
      t.userId,
      t.createdAt,
    ),
  ],
);

export const ticketsRelations = relations(tickets, ({ one }) => ({
  user: one(users, {
    fields: [tickets.userId],
    references: [users.id],
  }),
  window: one(windows, {
    fields: [tickets.windowId],
    references: [windows.id],
  }),
  service: one(services, {
    fields: [tickets.serviceId],
    references: [services.id],
  }),
  branch: one(branches, {
    fields: [tickets.branchId],
    references: [branches.id],
  }),
}));

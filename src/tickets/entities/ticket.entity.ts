import { serviceWindows } from '@/service_windows/entities/service_window.entity';
import { users } from '@/users/entities/user.entity';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const ticketTypeEnum = pgEnum('ticket_type', [
  'REGULAR',
  'PREFERENTIAL',
]);

export const tickets = pgTable(
  'tickets',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    code: varchar('code', { length: 15 }).notNull(),
    packageCode: varchar('package_code ', { length: 25 }).notNull(),
    type: ticketTypeEnum('type').default('REGULAR').notNull(),
    serviceWindowId: varchar('service_windows_id', { length: 24 }).references(
      () => serviceWindows.id,
    ),
    attentionStartedAt: timestamp('attention_started_at'),
    attentionFinishedAt: timestamp('attention_finished_at'),
    operatorId: varchar('operator_id', { length: 24 }).references(
      () => users.id,
    ),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('tickets_code_idx').on(t.code),
    index('tickets_attention_started_idx').on(t.attentionStartedAt),
    index('tickets_attention_finished_idx').on(t.attentionFinishedAt),
    index('tickets_service_window_idx').on(t.serviceWindowId),
  ],
);

export const ticketsRelations = relations(tickets, ({ one }) => ({
  operator: one(users, {
    fields: [tickets.operatorId],
    references: [users.id],
  }),
  serviceWindow: one(serviceWindows, {
    fields: [tickets.serviceWindowId],
    references: [serviceWindows.id],
  }),
}));

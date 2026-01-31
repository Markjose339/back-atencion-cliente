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
    packageCode: varchar('package_code', { length: 25 }).notNull(),
    type: TicketTypeEnum('type').default('REGULAR').notNull(),

    attentionStartedAt: timestamp('attention_started_at'),
    attentionFinishedAt: timestamp('attention_finished_at'),
    serviceWindowId: varchar('service_window_id', { length: 24 }).references(
      () => serviceWindows.id,
    ),
    userId: varchar('user_id', { length: 24 }).references(() => users.id),

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
    index('tickets_service_window_id_idx').on(t.serviceWindowId),
  ],
);

export const ticketsRelations = relations(tickets, ({ one }) => ({
  user: one(users, {
    fields: [tickets.userId],
    references: [users.id],
  }),
  serviceWindow: one(serviceWindows, {
    fields: [tickets.serviceWindowId],
    references: [serviceWindows.id],
  }),
}));

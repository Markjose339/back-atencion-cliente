import { branches } from '@/branches/entities/branch.entity';
import { services } from '@/services/entities/service.entity';
import { users } from '@/users/entities/user.entity';
import { branchWindowServices } from '@/branches/entities/branch_window_service.entity';
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

export const TicketStatusEnum = pgEnum('ticket_status', [
  'PENDIENTE',
  'LLAMADO',
  'ATENDIENDO',
  'ESPERA',
  'FINALIZADO',
  'CANCELADO',
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
    status: TicketStatusEnum('status').default('PENDIENTE').notNull(),

    branchId: varchar('branch_id', { length: 24 })
      .references(() => branches.id, { onDelete: 'restrict' })
      .notNull(),

    serviceId: varchar('service_id', { length: 24 })
      .references(() => services.id, { onDelete: 'restrict' })
      .notNull(),

    branchWindowServiceId: varchar('branch_window_service_id', {
      length: 24,
    }).references(() => branchWindowServices.id, { onDelete: 'set null' }),

    userId: varchar('user_id', { length: 24 }).references(() => users.id, {
      onDelete: 'set null',
    }),

    calledAt: timestamp('called_at', { withTimezone: true }),
    attentionStartedAt: timestamp('attention_started_at', {
      withTimezone: true,
    }),
    attentionFinishedAt: timestamp('attention_finished_at', {
      withTimezone: true,
    }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('tickets_code_idx').on(t.code),
    index('tickets_package_code_idx').on(t.packageCode),

    index('tickets_next_idx').on(
      t.branchId,
      t.serviceId,
      t.status,
      t.createdAt,
    ),

    index('tickets_branch_status_created_idx').on(
      t.branchId,
      t.status,
      t.createdAt,
    ),

    index('tickets_user_status_idx').on(t.userId, t.status),
    index('tickets_user_status_called_idx').on(t.userId, t.status, t.calledAt),

    index('tickets_status_called_idx').on(t.status, t.calledAt),
    index('tickets_status_started_idx').on(t.status, t.attentionStartedAt),
    index('tickets_status_finished_idx').on(t.status, t.attentionFinishedAt),

    index('tickets_bws_idx').on(t.branchWindowServiceId),
    index('tickets_bws_status_idx').on(t.branchWindowServiceId, t.status),
  ],
);

export const ticketsRelations = relations(tickets, ({ one }) => ({
  branch: one(branches, {
    fields: [tickets.branchId],
    references: [branches.id],
  }),
  service: one(services, {
    fields: [tickets.serviceId],
    references: [services.id],
  }),
  user: one(users, { fields: [tickets.userId], references: [users.id] }),
  branchWindowService: one(branchWindowServices, {
    fields: [tickets.branchWindowServiceId],
    references: [branchWindowServices.id],
  }),
}));

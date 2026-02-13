import { tickets } from '@/tickets/entities/ticket.entity';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  index,
  pgEnum,
  boolean,
} from 'drizzle-orm/pg-core';
import { branchWindows } from './branch-windows.entity';

export const boliviaDepartments = pgEnum('bolivia_departments', [
  'La Paz',
  'Cochabamba',
  'Santa Cruz',
  'Oruro',
  'Potosí',
  'Chuquisaca',
  'Tarija',
  'Beni',
  'Pando',
]);

export const branches = pgTable(
  'branches',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),

    name: varchar('name', { length: 50 }).unique().notNull(),
    address: varchar('address', { length: 255 }).notNull(),
    departmentName: boliviaDepartments('department_name').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('branches_name_idx').on(t.name),
    index('branches_department_name_idx').on(t.departmentName),
  ],
);

export const branchesRelations = relations(branches, ({ many }) => ({
  tickets: many(tickets),
  branchWindows: many(branchWindows),
}));

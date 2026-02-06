import { createId } from '@paralleldrive/cuid2';
import {
  pgTable,
  varchar,
  timestamp,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

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

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('branches_name_idx').on(t.name),
    index('branches_department_name_idx').on(t.departmentName),
  ],
);

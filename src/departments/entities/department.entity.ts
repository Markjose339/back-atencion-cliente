import { branches } from '@/branches/entities/branch.entity';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { pgTable, varchar, timestamp, index } from 'drizzle-orm/pg-core';

export const departments = pgTable(
  'departments',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),

    name: varchar('name', { length: 25 }).unique().notNull(),
    code: varchar('code', { length: 10 }).unique().notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('departments_name_idx').on(t.name),
    index('departments_code_idx').on(t.code),
  ],
);

export const departmentsRelations = relations(departments, ({ many }) => ({
  branches: many(branches),
}));

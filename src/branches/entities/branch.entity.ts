import { departments } from '@/departments/entities/department.entity';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { pgTable, varchar, timestamp, index } from 'drizzle-orm/pg-core';

export const branches = pgTable(
  'branches',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),

    name: varchar('name', { length: 50 }).unique().notNull(),
    address: varchar('address', { length: 255 }).notNull(),
    departmentId: varchar('department_id', { length: 24 })
      .notNull()
      .references(() => departments.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('branches_name_idx').on(t.name),
    index('branches_department_id_idx').on(t.departmentId),
  ],
);

export const branchRelations = relations(branches, ({ one }) => ({
  department: one(departments, {
    fields: [branches.departmentId],
    references: [departments.id],
  }),
}));

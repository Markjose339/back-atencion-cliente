import { rolePermissions } from '@/roles/entities/role-permissions.entity';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { pgTable, varchar, timestamp, index } from 'drizzle-orm/pg-core';

export const permissions = pgTable(
  'permissions',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    name: varchar('name', { length: 25 }).unique().notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('permissions_name_idx').on(t.name)],
);

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolesPermissions: many(rolePermissions),
}));

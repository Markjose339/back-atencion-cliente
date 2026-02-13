export class Role {}
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { pgTable, varchar, timestamp, index } from 'drizzle-orm/pg-core';
import { rolePermissions } from './role-permissions.entity';
import { userRoles } from '@/users/entities/user-roles.entity';

export const roles = pgTable(
  'roles',
  {
    id: varchar('id', { length: 24 })
      .primaryKey()
      .$defaultFn(() => createId()),
    name: varchar('name', { length: 25 }).unique().notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('roles_name_idx').on(t.name)],
);

export const roleRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

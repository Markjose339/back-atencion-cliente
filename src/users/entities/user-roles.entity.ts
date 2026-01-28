import { relations } from 'drizzle-orm';
import { pgTable, varchar, primaryKey, index } from 'drizzle-orm/pg-core';
import { users } from './user.entity';
import { roles } from 'src/roles/entities/role.entity';

export const userRoles = pgTable(
  'user_roles',
  {
    userId: varchar('user_id', { length: 24 })
      .notNull()
      .references(() => users.id),
    roleId: varchar('role_id', { length: 24 })
      .notNull()
      .references(() => roles.id),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roleId] }),
    index('user_roles_idx').on(t.userId),
    index('role_users_idx').on(t.roleId),
  ],
);

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

import { pgTable, varchar, primaryKey, index } from 'drizzle-orm/pg-core';
import { permissions } from 'src/permissions/entities/permission.entity';
import { roles } from './role.entity';
import { relations } from 'drizzle-orm';
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: varchar('role_id', { length: 24 })
      .notNull()
      .references(() => roles.id),
    permissionId: varchar('permission_id', { length: 24 })
      .notNull()
      .references(() => permissions.id),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionId] }),
    index('role_idx').on(t.roleId),
    index('permission_idx').on(t.permissionId),
  ],
);

export const rolePermissionsRelations = relations(
  rolePermissions,
  ({ one }) => ({
    role: one(roles, {
      fields: [rolePermissions.roleId],
      references: [roles.id],
    }),
    permission: one(permissions, {
      fields: [rolePermissions.permissionId],
      references: [permissions.id],
    }),
  }),
);

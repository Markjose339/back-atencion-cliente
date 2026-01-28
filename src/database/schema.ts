import * as userSchema from '@/users/entities/user.entity';
import * as permissionSchema from '@/permissions/entities/permission.entity';
import * as roleSchema from '@/roles/entities/role.entity';
import * as rolePermissionsSchema from '@/roles/entities/role-permissions.entity';
import * as userRolesSchema from '@/users/entities/user-roles.entity';
import * as sessionsSchema from '@/auth/entities/session.entity';

export const schema = {
  ...permissionSchema,
  ...rolePermissionsSchema,
  ...roleSchema,
  ...userRolesSchema,
  ...userSchema,
  ...sessionsSchema,
};

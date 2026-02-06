import * as userSchema from '@/users/entities/user.entity';
import * as permissionSchema from '@/permissions/entities/permission.entity';
import * as roleSchema from '@/roles/entities/role.entity';
import * as rolePermissionsSchema from '@/roles/entities/role-permissions.entity';
import * as userRolesSchema from '@/users/entities/user-roles.entity';
import * as sessionsSchema from '@/auth/entities/session.entity';
import * as ticketsSchema from '@/tickets/entities/ticket.entity';
import * as departmentsSchema from '@/departments/entities/department.entity';
import * as branchesSchema from '@/branches/entities/branch.entity';
import * as servicesSchema from '@/services/entities/service.entity';
import * as windowsSchema from '@/windows/entities/window.entity';

export const schema = {
  ...permissionSchema,
  ...rolePermissionsSchema,
  ...roleSchema,
  ...userRolesSchema,
  ...userSchema,
  ...sessionsSchema,
  ...ticketsSchema,
  ...departmentsSchema,
  ...branchesSchema,
  ...servicesSchema,
  ...windowsSchema,
};

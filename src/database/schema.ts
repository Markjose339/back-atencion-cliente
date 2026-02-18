import * as userSchema from '@/users/entities/user.entity';
import * as permissionSchema from '@/permissions/entities/permission.entity';
import * as roleSchema from '@/roles/entities/role.entity';
import * as rolePermissionsSchema from '@/roles/entities/role-permissions.entity';
import * as userRolesSchema from '@/users/entities/user-roles.entity';
import * as sessionsSchema from '@/auth/entities/session.entity';
import * as ticketsSchema from '@/tickets/entities/ticket.entity';
import * as branchesSchema from '@/branches/entities/branch.entity';
import * as servicesSchema from '@/services/entities/service.entity';
import * as windowsSchema from '@/windows/entities/window.entity';
import * as branchWindowsSchema from '@/branches/entities/branch-windows.entity';
import * as branchWindowServicesSchema from '@/branches/entities/branch_window_service.entity';
import * as userBranchWindowsSchema from '@/users/entities/user-branch-windows.entity';
import * as advertisementsSchema from '@/advertisements/entities/advertisement.entity';

export const schema = {
  ...permissionSchema,
  ...rolePermissionsSchema,
  ...roleSchema,
  ...userRolesSchema,
  ...userSchema,
  ...sessionsSchema,
  ...ticketsSchema,
  ...branchesSchema,
  ...servicesSchema,
  ...windowsSchema,
  ...branchWindowsSchema,
  ...branchWindowServicesSchema,
  ...userBranchWindowsSchema,
  ...advertisementsSchema,
};

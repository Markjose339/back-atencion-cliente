import { User } from '@/users/interfaces/user.interface';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface FindUserOptions {
  includePassword?: boolean;
  includeIsActive?: boolean;
}

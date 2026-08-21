import { SetMetadata } from '@nestjs/common';
import { HrOfficerRole } from '../../../generated/prisma/enums';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: HrOfficerRole[]) =>
  SetMetadata(ROLES_KEY, roles);

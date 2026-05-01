import { SetMetadata } from '@nestjs/common';

export const MIN_ROLE_LEVEL_KEY = 'minRoleLevel';
export const MinRoleLevel = (level: number) =>
  SetMetadata(MIN_ROLE_LEVEL_KEY, level);

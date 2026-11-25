import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { UserRole } from '../generated/prisma/client.js';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Endpoint tanpa login (mis. /auth/login, /health) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Batasi endpoint ke role tertentu. Admin selalu diizinkan.
 * Tanpa @Roles, endpoint bisa diakses semua user yang sudah login.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** User yang sedang login (diisi JwtAuthGuard) */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);

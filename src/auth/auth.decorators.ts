import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { UserRole } from '../generated/prisma/client.js';
import type { AuthenticatedRequest, AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/**
 * Role dengan akses penuh: lolos semua pembatasan @Roles(), termasuk
 * User Management & Master Data. Tambahkan role di sini bila perlu.
 */
export const FULL_ACCESS_ROLES: readonly UserRole[] = ['admin', 'direktur'];

export const hasFullAccess = (role: UserRole) =>
  FULL_ACCESS_ROLES.includes(role);

/** Endpoint tanpa login (mis. /auth/login, /health) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Batasi endpoint ke role tertentu. Role FULL_ACCESS_ROLES selalu diizinkan.
 * Tanpa @Roles, endpoint bisa diakses semua user yang sudah login.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** User yang sedang login (diisi JwtAuthGuard) */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

/** ID sesi login yang sedang dipakai (diisi JwtAuthGuard) */
export const CurrentSessionId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().sessionId,
);

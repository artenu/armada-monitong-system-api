import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../generated/prisma/client.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators.js';
import type { AuthUser } from './auth-user.js';

/** RBAC: cocokkan role user dengan @Roles(). Admin selalu diizinkan. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const roles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      targets,
    );
    if (!roles || roles.length === 0) {
      return true;
    }
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (user && (user.role === 'admin' || roles.includes(user.role))) {
      return true;
    }
    throw new ForbiddenException();
  }
}

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../generated/prisma/client.js';
import { ROLES_KEY } from './auth.decorators.js';
import { RolesGuard } from './roles.guard.js';

const contextFor = (role: UserRole): ExecutionContext =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const requireRoles = (...roles: UserRole[]) =>
    vi
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key) => (key === ROLES_KEY ? roles : undefined));

  afterEach(() => vi.restoreAllMocks());

  it.each<UserRole>(['admin', 'direktur'])(
    '%s punya akses penuh ke endpoint role lain',
    (role) => {
      requireRoles('finance');
      expect(guard.canActivate(contextFor(role))).toBe(true);
    },
  );

  it('sales_ops boleh akses endpoint Operasional', () => {
    requireRoles('operasional', 'sales_ops');
    expect(guard.canActivate(contextFor('sales_ops'))).toBe(true);
  });

  it('role yang tidak terdaftar ditolak 403', () => {
    requireRoles('finance');
    expect(() => guard.canActivate(contextFor('sales'))).toThrow(
      ForbiddenException,
    );
  });

  it('endpoint tanpa @Roles terbuka untuk semua user login', () => {
    requireRoles();
    expect(guard.canActivate(contextFor('operasional'))).toBe(true);
  });
});

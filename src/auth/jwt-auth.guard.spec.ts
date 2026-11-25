import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard, SESSION_ENDED_MESSAGE } from './jwt-auth.guard.js';
import type { RefreshTokenService } from './refresh-token.service.js';

const jwt = new JwtService({ secret: 'test-secret-yang-cukup-panjang-32b!!' });
const USER = {
  id: 'u1',
  name: 'Sales',
  email: 'sales@armada.local',
  role: 'sales',
  department: 'Sales',
  status: 'Aktif',
};

describe('JwtAuthGuard', () => {
  const findUnique = vi.fn();
  const isActive = vi.fn();
  const guard = new JwtAuthGuard(
    new Reflector(),
    jwt,
    { user: { findUnique } } as unknown as PrismaService,
    { isActive } as unknown as RefreshTokenService,
  );

  const run = (authorization?: string) => {
    const req: Record<string, unknown> = { headers: { authorization } };
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { req, result: guard.canActivate(ctx) };
  };

  beforeEach(() => {
    findUnique.mockResolvedValue(USER);
    isActive.mockResolvedValue(true);
  });
  afterEach(() => vi.resetAllMocks());

  it('menolak request tanpa token', async () => {
    await expect(run().result).rejects.toThrow(UnauthorizedException);
  });

  it('menolak token tanpa sid (token lama sebelum sesi diterapkan)', async () => {
    const token = await jwt.signAsync({ sub: 'u1' });
    await expect(run(`Bearer ${token}`).result).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('menolak token yang sesinya sudah diakhiri (logout / ganti password)', async () => {
    isActive.mockResolvedValue(false);
    const token = await jwt.signAsync({ sub: 'u1', sid: 's1' });
    await expect(run(`Bearer ${token}`).result).rejects.toThrow(
      SESSION_ENDED_MESSAGE,
    );
    expect(isActive).toHaveBeenCalledWith('u1', 's1');
  });

  it('menolak akun nonaktif', async () => {
    findUnique.mockResolvedValue({ ...USER, status: 'Nonaktif' });
    const token = await jwt.signAsync({ sub: 'u1', sid: 's1' });
    await expect(run(`Bearer ${token}`).result).rejects.toThrow(
      'Akun tidak aktif',
    );
  });

  it('meloloskan sesi aktif dan mengisi user + sessionId', async () => {
    const token = await jwt.signAsync({ sub: 'u1', sid: 's1' });
    const { req, result } = run(`Bearer ${token}`);
    await expect(result).resolves.toBe(true);
    const { status: _status, ...authUser } = USER;
    expect(req.user).toEqual(authUser);
    expect(req.sessionId).toBe('s1');
  });
});

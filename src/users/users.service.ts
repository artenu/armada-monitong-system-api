import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth-user.js';
import { PasswordService } from '../auth/password.service.js';
import { RefreshTokenService } from '../auth/refresh-token.service.js';
import { toBusinessDate, toDisplayDateTime } from '../common/dates.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDto, UpdateUserDto } from './dto/user.dto.js';

/** Bentuk ManagedUser di frontend (tanpa hash password) */
export interface ManagedUserResponse {
  id: string;
  name: string;
  email: string;
  role: User['role'];
  department: string;
  phone: string;
  status: User['status'];
  createdAt: string;
  lastLogin?: string;
}

const DEFAULT_DEPARTMENT: Record<User['role'], string> = {
  admin: 'Divisi IT & Manajemen Sistem',
  sales: 'Divisi Komersial & Sales',
  operasional: 'Divisi Operasional Lapangan',
  finance: 'Divisi Keuangan & Billing',
  sales_ops: 'Divisi Sales & Operasional Lapangan',
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private get timeZone() {
    return this.config.getOrThrow<string>('APP_TIMEZONE');
  }

  toResponse(user: User): ManagedUserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      phone: user.phone,
      status: user.status,
      createdAt: toBusinessDate(user.createdAt, this.timeZone),
      lastLogin: user.lastLoginAt
        ? toDisplayDateTime(user.lastLoginAt, this.timeZone)
        : undefined,
    };
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.toResponse(u));
  }

  async findOne(id: string) {
    return this.toResponse(await this.getOrThrow(id));
  }

  async create(dto: CreateUserDto, actor: AuthUser) {
    await this.assertEmailAvailable(dto.email);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role,
        department: dto.department?.trim() || DEFAULT_DEPARTMENT[dto.role],
        phone: dto.phone?.trim() ?? '',
        status: dto.status ?? 'Aktif',
        passwordHash: await this.passwords.hash(dto.password),
      },
    });
    await this.audit.record(actor, 'user.create', 'user', user.id, {
      email: user.email,
      role: user.role,
    });
    return this.toResponse(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    const target = await this.getOrThrow(id);
    const role = dto.role ?? target.role;
    const status = dto.status ?? target.status;

    if (target.id === actor.id && (role !== 'admin' || status !== 'Aktif')) {
      throw new ConflictException(
        'Anda tidak dapat menurunkan role atau menonaktifkan akun sendiri.',
      );
    }
    if (dto.email && dto.email !== target.email) {
      await this.assertEmailAvailable(dto.email, target.id);
    }
    await this.assertKeepsActiveAdmin(target, role, status);

    const passwordChanged = Boolean(dto.password);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        role,
        status,
        department: dto.department?.trim(),
        phone: dto.phone?.trim(),
        ...(passwordChanged
          ? { passwordHash: await this.passwords.hash(dto.password as string) }
          : {}),
      },
    });

    // Sesi lama dicabut bila password diganti atau akun dinonaktifkan
    if (passwordChanged || status !== 'Aktif') {
      await this.refreshTokens.revokeAllForUser(id);
    }
    await this.audit.record(actor, 'user.update', 'user', id, {
      role,
      status,
      passwordChanged,
    });
    return this.toResponse(user);
  }

  async toggleStatus(id: string, actor: AuthUser) {
    const target = await this.getOrThrow(id);
    if (target.id === actor.id) {
      throw new ConflictException(
        'Anda tidak dapat menonaktifkan akun sendiri.',
      );
    }
    const status = target.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
    await this.assertKeepsActiveAdmin(target, target.role, status);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
    });
    if (status !== 'Aktif') {
      await this.refreshTokens.revokeAllForUser(id);
    }
    await this.audit.record(actor, 'user.status', 'user', id, { status });
    return this.toResponse(user);
  }

  async remove(id: string, actor: AuthUser) {
    const target = await this.getOrThrow(id);
    if (target.id === actor.id) {
      throw new ConflictException('Anda tidak dapat menghapus akun sendiri.');
    }
    await this.assertKeepsActiveAdmin(target, null, null);
    await this.prisma.user.delete({ where: { id } });
    await this.audit.record(actor, 'user.delete', 'user', id, {
      email: target.email,
    });
    return null;
  }

  private async getOrThrow(id: string) {
    const user = await this.prisma.user
      .findUnique({ where: { id } })
      .catch(() => null);
    if (!user) {
      throw new NotFoundException(`User dengan ID ${id} tidak ditemukan.`);
    }
    return user;
  }

  private async assertEmailAvailable(email: string, exceptId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException({
        message: `Email ${email} sudah terdaftar di sistem.`,
        errors: [
          { field: 'email', message: 'Email sudah terdaftar di sistem' },
        ],
      });
    }
  }

  /** Sistem tidak boleh kehilangan admin aktif terakhir */
  private async assertKeepsActiveAdmin(
    target: User,
    nextRole: User['role'] | null,
    nextStatus: User['status'] | null,
  ) {
    const wasActiveAdmin = target.role === 'admin' && target.status === 'Aktif';
    const staysActiveAdmin = nextRole === 'admin' && nextStatus === 'Aktif';
    if (!wasActiveAdmin || staysActiveAdmin) {
      return;
    }
    const activeAdmins = await this.prisma.user.count({
      where: { role: 'admin', status: 'Aktif' },
    });
    if (activeAdmins <= 1) {
      throw new ConflictException(
        'Tidak dapat mengubah atau menghapus admin aktif terakhir.',
      );
    }
  }
}

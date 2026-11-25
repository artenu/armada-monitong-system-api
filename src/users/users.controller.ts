import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentSessionId,
  CurrentUser,
  Roles,
} from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth-user.js';
import { ResponseMessage } from '../common/response.interceptor.js';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @ResponseMessage('User berhasil ditambahkan')
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor);
  }

  @Put(':id')
  @ResponseMessage('User berhasil diperbarui')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
    @CurrentSessionId() sessionId: string,
  ) {
    return this.users.update(id, dto, actor, sessionId);
  }

  @Patch(':id/status')
  @ResponseMessage('Status user diperbarui')
  toggleStatus(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.users.toggleStatus(id, actor);
  }

  @Delete(':id')
  @ResponseMessage('User berhasil dihapus')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.users.remove(id, actor);
  }
}

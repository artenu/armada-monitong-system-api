import {
  Controller,
  Post,
  UnprocessableEntityException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth-user.js';
import { ResponseMessage } from '../common/response.interceptor.js';
import { FilesService } from './files.service.js';

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Unggah satu berkas (field "file"). Respons: { url: "/uploads/<uuid>.pdf" } */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ResponseMessage('Berkas berhasil diunggah')
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) {
      throw new UnprocessableEntityException({
        message: 'Berkas wajib dipilih',
        errors: [{ field: 'file', message: 'Berkas wajib dipilih' }],
      });
    }
    return this.files.register(file, user);
  }
}

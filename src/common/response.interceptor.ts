import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';

const RESPONSE_MESSAGE_KEY = 'responseMessage';

/** Pesan sukses untuk response, mis. @ResponseMessage('Order berhasil dibuat') */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);

/**
 * Bungkus semua response sukses ke format kontrak:
 * { success: true, message, data }
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'OK';
    return next.handle().pipe(
      map((data: unknown) => ({
        success: true,
        message,
        data: data ?? null,
      })),
    );
  }
}

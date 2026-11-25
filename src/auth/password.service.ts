import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

/** Hash password dengan argon2id (Standar v2.3 bagian 10.3) */
@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  /**
   * Verifikasi yang waktunya sama untuk email terdaftar maupun tidak:
   * bila hash tidak ada, tetap memverifikasi terhadap hash dummy,
   * sehingga respons tidak membocorkan email mana yang terdaftar.
   */
  async verify(
    password: string,
    hash: string | null | undefined,
  ): Promise<boolean> {
    this.dummyHash ??= this.hash(randomBytes(32).toString('hex'));
    const target = hash ?? (await this.dummyHash);
    try {
      const ok = await argon2.verify(target, password);
      return Boolean(hash) && ok;
    } catch {
      return false;
    }
  }
}

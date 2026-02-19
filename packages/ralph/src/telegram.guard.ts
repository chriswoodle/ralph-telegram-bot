import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from './config';

@Injectable()
export class TelegramAuthGuard {
  constructor(private readonly configService: ConfigService<AppConfig>) {}

  isAuthorized(userId: number | undefined): boolean {
    const allowed = this.configService.get('ALLOWED_USERS', '');
    if (!allowed) return true;
    return allowed
      .split(',')
      .map((s: string) => s.trim())
      .includes(String(userId));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { RoleSlug } from '../roles/role.entity';

export interface NotificationPayload {
  type: string;
  [key: string]: unknown;
}

export interface NotificationService {
  notifyRole(
    schoolId: number,
    roleSlug: RoleSlug,
    payload: NotificationPayload,
  ): Promise<void>;
}

export const NOTIFICATION_SERVICE = Symbol('NotificationService');

@Injectable()
export class LoggerNotificationService implements NotificationService {
  private readonly logger = new Logger(LoggerNotificationService.name);

  async notifyRole(
    schoolId: number,
    roleSlug: RoleSlug,
    payload: NotificationPayload,
  ): Promise<void> {
    this.logger.log(
      `[stub] notify role=${roleSlug} school=${schoolId} ${JSON.stringify(payload)}`,
    );
  }
}

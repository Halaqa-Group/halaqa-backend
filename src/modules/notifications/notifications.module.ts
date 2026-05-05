import { Global, Module } from '@nestjs/common';
import {
  LoggerNotificationService,
  NOTIFICATION_SERVICE,
} from './notification.service';

@Global()
@Module({
  providers: [
    LoggerNotificationService,
    { provide: NOTIFICATION_SERVICE, useExisting: LoggerNotificationService },
  ],
  exports: [NOTIFICATION_SERVICE],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { WebPushService } from './web-push.service';

@Module({
  controllers: [NotificationsController],
  providers: [WebPushService, ReminderSchedulerService],
  exports: [WebPushService],
})
export class NotificationsModule {}

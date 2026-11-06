import { Global, Module } from '@nestjs/common';
import { BookingLinkService } from './booking-link.service';
import { NotificationsController } from './notifications.controller';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { WebPushService } from './web-push.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [WebPushService, ReminderSchedulerService, BookingLinkService],
  exports: [WebPushService, BookingLinkService],
})
export class NotificationsModule {}

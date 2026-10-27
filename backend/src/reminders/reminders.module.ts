import { Module } from '@nestjs/common';
import { MockDeepSeekReminderService } from './mock-deepseek-reminder.service';
import { REMINDER_PROVIDER } from './reminder.interface';

@Module({
  providers: [
    MockDeepSeekReminderService,
    {
      provide: REMINDER_PROVIDER,
      useExisting: MockDeepSeekReminderService,
    },
  ],
  exports: [REMINDER_PROVIDER, MockDeepSeekReminderService],
})
export class RemindersModule {}

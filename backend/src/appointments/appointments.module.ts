import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { AppointmentsCleanupCron } from './appointments-cleanup.cron';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsCleanupCron],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}

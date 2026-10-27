import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppointmentsService } from './appointments.service';

@Injectable()
export class AppointmentsCleanupCron {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /**
   * Regla booking-engine: Cron Job que corre cada 1 minuto y libera a AVAILABLE
   * cualquier turno en PENDING_PAYMENT cuyo locked_until (10 min) haya vencido.
   */
  @Cron('*/1 * * * *')
  async handleExpiredSlotLocks() {
    await this.appointmentsService.releaseExpiredLocks();
  }
}

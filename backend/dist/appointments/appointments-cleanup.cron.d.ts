import { AppointmentsService } from './appointments.service';
export declare class AppointmentsCleanupCron {
    private readonly appointmentsService;
    constructor(appointmentsService: AppointmentsService);
    handleExpiredSlotLocks(): Promise<void>;
}

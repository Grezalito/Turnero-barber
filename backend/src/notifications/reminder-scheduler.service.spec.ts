import { SlotStatus } from '@prisma/client';
import { computeReminderWindows } from './reminder-windows.util';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { instantToNominal } from './slot-time.util';

/**
 * Prisma en memoria que aplica los mismos filtros que usa el scheduler
 * (status, rango de start_time, columna de tracking nula, add-on activo).
 */
function createPrismaFake(slots: any[]) {
  const matches = (slot: any, where: any) => {
    if (where.id && slot.id !== where.id) return false;
    if (where.status && slot.status !== where.status) return false;
    if (where.start_time) {
      if (slot.start_time < where.start_time.gte || slot.start_time > where.start_time.lte) return false;
    }
    for (const field of ['reminder_24h_sent_at', 'reminder_2h_sent_at']) {
      if (field in where) {
        const expected = where[field];
        const actual = slot[field];
        if (expected === null ? actual !== null : actual?.getTime() !== expected.getTime()) return false;
      }
    }
    return true;
  };

  return {
    appointmentSlot: {
      findMany: jest.fn(async ({ where }: any) => slots.filter((s) => matches(s, where))),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = slots.filter((s) => matches(s, where));
        hit.forEach((s) => Object.assign(s, data));
        return { count: hit.length };
      }),
    },
  };
}

const NOW = new Date('2026-11-10T15:00:00.000Z'); // 12:00 en Buenos Aires
const HOUR = 3_600_000;
const MIN = 60_000;

/** Crea un turno que empieza `offsetMs` después de NOW (instante real), guardado en hora nominal. */
function slotStartingIn(offsetMs: number, overrides: Record<string, any> = {}) {
  const start = instantToNominal(new Date(NOW.getTime() + offsetMs));
  return {
    id: `slot-${offsetMs}-${Math.random().toString(36).slice(2, 7)}`,
    status: SlotStatus.CONFIRMED,
    start_time: start,
    end_time: new Date(start.getTime() + 30 * MIN),
    reminder_24h_sent_at: null,
    reminder_2h_sent_at: null,
    client: { name: 'Ana', email: 'ana@test.com', phone: '+5491122223333' },
    barber: { reminder_addon_active: true, shop_name: 'Barbería Test', slug: 'test', address: null, user: { name: 'Pepe' } },
    ...overrides,
  };
}

function build(slots: any[], opts: { pushDelivered?: number; mailSent?: boolean } = {}) {
  const prisma = createPrismaFake(slots);
  const mail = {
    sendAppointmentReminderEmail: jest.fn().mockResolvedValue({ sent: opts.mailSent ?? true, mode: 'SMTP' }),
  };
  const push = { sendToSlot: jest.fn().mockResolvedValue(opts.pushDelivered ?? 0) };
  const bookingLinks = {
    path: (slot: any) => `/reserva/${slot.id}?ref=test`,
    url: (slot: any) => `https://turnazo.app/reserva/${slot.id}?ref=test`,
  };
  const service = new ReminderSchedulerService(prisma as any, mail as any, push as any, bookingLinks as any);
  return { service, prisma, mail, push };
}

describe('computeReminderWindows', () => {
  it('convierte las ventanas 23h30–24h30 y 1h45–2h15 a hora nominal (UTC-3)', () => {
    const [w24, w2] = computeReminderWindows(NOW);
    // NOW = 15:00Z real = 12:00 nominal Argentina
    expect(w24.fromNominal.toISOString()).toBe('2026-11-11T11:30:00.000Z');
    expect(w24.toNominal.toISOString()).toBe('2026-11-11T12:30:00.000Z');
    expect(w2.fromNominal.toISOString()).toBe('2026-11-10T13:45:00.000Z');
    expect(w2.toNominal.toISOString()).toBe('2026-11-10T14:15:00.000Z');
  });
});

describe('ReminderSchedulerService', () => {
  it('envía el recordatorio de 24 hs y marca reminder_24h_sent_at', async () => {
    const slot = slotStartingIn(24 * HOUR);
    const { service, mail } = build([slot]);

    const stats = await service.runOnce(NOW);

    expect(stats.sent).toBe(1);
    expect(slot.reminder_24h_sent_at).toEqual(NOW);
    expect(slot.reminder_2h_sent_at).toBeNull();
    expect(mail.sendAppointmentReminderEmail).toHaveBeenCalledWith(expect.objectContaining({ kind: '24h', to: 'ana@test.com' }));
  });

  it('envía el recordatorio de 2 hs y marca reminder_2h_sent_at', async () => {
    const slot = slotStartingIn(2 * HOUR);
    const { service, mail } = build([slot]);

    await service.runOnce(NOW);

    expect(slot.reminder_2h_sent_at).toEqual(NOW);
    expect(mail.sendAppointmentReminderEmail).toHaveBeenCalledWith(expect.objectContaining({ kind: '2h' }));
  });

  it('respeta los bordes de las ventanas (inclusivos) y descarta lo que queda afuera', async () => {
    const inside = [
      slotStartingIn(23 * HOUR + 30 * MIN),
      slotStartingIn(24 * HOUR + 30 * MIN),
      slotStartingIn(HOUR + 45 * MIN),
      slotStartingIn(2 * HOUR + 15 * MIN),
    ];
    const outside = [
      slotStartingIn(23 * HOUR + 29 * MIN),
      slotStartingIn(24 * HOUR + 31 * MIN),
      slotStartingIn(HOUR + 44 * MIN),
      slotStartingIn(2 * HOUR + 16 * MIN),
      slotStartingIn(6 * HOUR),
      slotStartingIn(-HOUR),
    ];
    const { service, mail } = build([...inside, ...outside]);

    const stats = await service.runOnce(NOW);

    expect(stats.sent).toBe(4);
    expect(mail.sendAppointmentReminderEmail).toHaveBeenCalledTimes(4);
    outside.forEach((s) => {
      expect(s.reminder_24h_sent_at).toBeNull();
      expect(s.reminder_2h_sent_at).toBeNull();
    });
  });

  it.each([SlotStatus.CANCELLED, SlotStatus.PENDING_PAYMENT, SlotStatus.AVAILABLE])(
    'no toma turnos en estado %s',
    async (status) => {
      const slot = slotStartingIn(2 * HOUR, { status });
      const { service, mail, push } = build([slot]);

      const stats = await service.runOnce(NOW);

      expect(stats.candidates).toBe(0);
      expect(mail.sendAppointmentReminderEmail).not.toHaveBeenCalled();
      expect(push.sendToSlot).not.toHaveBeenCalled();
    },
  );

  it('no reenvía si el recordatorio ya fue notificado', async () => {
    const slot = slotStartingIn(24 * HOUR, { reminder_24h_sent_at: new Date('2026-11-10T14:50:00.000Z') });
    const { service, mail } = build([slot]);

    const stats = await service.runOnce(NOW);

    expect(stats.candidates).toBe(0);
    expect(mail.sendAppointmentReminderEmail).not.toHaveBeenCalled();
  });

  it('es idempotente entre corridas sucesivas (cron cada 10 min dentro de la misma ventana)', async () => {
    const slot = slotStartingIn(2 * HOUR);
    const { service, mail } = build([slot]);

    await service.runOnce(NOW);
    await service.runOnce(new Date(NOW.getTime() + 10 * MIN));
    await service.runOnce(new Date(NOW.getTime() + 20 * MIN));

    expect(mail.sendAppointmentReminderEmail).toHaveBeenCalledTimes(1);
  });

  it('no envía si otra instancia ya reclamó el turno (claim atómico)', async () => {
    const slot = slotStartingIn(2 * HOUR);
    const { service, prisma, mail } = build([slot]);
    // Simula que otra instancia marcó el envío entre el findMany y el update condicional.
    prisma.appointmentSlot.updateMany.mockImplementationOnce(async () => ({ count: 0 }));

    const stats = await service.runOnce(NOW);

    expect(stats.skippedAlreadyClaimed).toBe(1);
    expect(mail.sendAppointmentReminderEmail).not.toHaveBeenCalled();
  });

  it('si ningún canal entrega, libera el reclamo para reintentar en la próxima corrida', async () => {
    const slot = slotStartingIn(2 * HOUR, { client: { name: 'Ana', email: null } });
    const { service, push } = build([slot], { pushDelivered: 0 });

    const first = await service.runOnce(NOW);
    expect(first.failed).toBe(1);
    expect(slot.reminder_2h_sent_at).toBeNull();

    push.sendToSlot.mockResolvedValue(1);
    const second = await service.runOnce(new Date(NOW.getTime() + 10 * MIN));
    expect(second.sent).toBe(1);
    expect(slot.reminder_2h_sent_at).not.toBeNull();
  });

  it('aplica a todos los turnos confirmados, tengan o no el add-on activo (MVP)', async () => {
    const withAddon = slotStartingIn(2 * HOUR);
    const withoutAddon = slotStartingIn(2 * HOUR + 5 * MIN, {
      barber: { reminder_addon_active: false, shop_name: 'X', slug: 'x', address: null, user: { name: 'Y' } },
    });
    const { service, mail } = build([withAddon, withoutAddon]);

    const stats = await service.runOnce(NOW);

    expect(stats.sent).toBe(2);
    expect(mail.sendAppointmentReminderEmail).toHaveBeenCalledTimes(2);
  });

  it('el push y el email llevan el link a la página pública de la reserva', async () => {
    const slot = slotStartingIn(24 * HOUR);
    const { service, push, mail } = build([slot], { pushDelivered: 1 });

    await service.runOnce(NOW);

    expect(push.sendToSlot).toHaveBeenCalledWith(slot.id, expect.objectContaining({ url: `/reserva/${slot.id}?ref=test` }));
    expect(mail.sendAppointmentReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ bookingUrl: `https://turnazo.app/reserva/${slot.id}?ref=test` }),
    );
  });

  it('el copy del recordatorio usa la hora de Buenos Aires', async () => {
    const slot = slotStartingIn(2 * HOUR); // 14:00 en Argentina
    const { service, push } = build([slot], { pushDelivered: 1, mailSent: false });

    await service.runOnce(NOW);

    expect(push.sendToSlot).toHaveBeenCalledWith(
      slot.id,
      expect.objectContaining({ body: expect.stringContaining('14:00') }),
    );
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ReminderStatus, Role, SlotStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtPayloadUser } from '../auth/decorators/current-user.decorator';
import { MailService } from '../mail/mail.service';
import {
  NON_REFUNDABLE_DEPOSIT_POLICY,
  PaymentsService,
  PLATFORM_DEPOSIT_ARS,
} from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  maskDni,
  maskFullNameForPublicArtifact,
  sanitizeControlChars,
} from '../security/pii-sanitizer.util';
import { LockSlotDto } from './dto/lock-slot.dto';
import { ManageBarberSlotsDto } from './dto/manage-slots.dto';
import {
  calculateWeeklyGoalMetrics,
  getWeekBoundsUtc,
} from './weekly-bonus.util';

export const SLOT_DURATION_MS = 30 * 60 * 1000; // Estrictamente 30 minutos
export const LOCK_DURATION_MS = 10 * 60 * 1000; // Bloqueo temporal de 10 minutos
export const ARGENTINA_UTC_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3 (America/Argentina/Buenos_Aires)

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Permite al barbero logueado:
   * 1) Alternar (activar/borrar) un bloque puntual de 30 min si está en AVAILABLE o reactivar si está en CANCELLED (`slot_start_time`).
   * 2) Generar bloques exactos de 30 minutos a partir de un rango horario (`start_time` y `end_time`).
   */
  async manageBarberSlots(userId: string, dto: ManageBarberSlotsDto) {
    const barber = await this.prisma.barberProfile.findUnique({
      where: { user_id: userId },
    });

    if (!barber) {
      throw new ForbiddenException(
        'El usuario actual no posee un perfil de barbero asociado',
      );
    }

    // Modo 1: Alternar (activar/borrar) un horario puntual de 30 minutos
    if (dto.slot_start_time) {
      const slotStart = this.parseDateTime(dto.slot_start_time, dto.date);
      this.assertAlignedTo30Min(slotStart);
      const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MS);

      const existingSlot = await this.prisma.appointmentSlot.findUnique({
        where: {
          barber_id_start_time: {
            barber_id: barber.id,
            start_time: slotStart,
          },
        },
      });

      if (existingSlot) {
        if (existingSlot.status === SlotStatus.CANCELLED) {
          const reactivatedSlot = await this.prisma.appointmentSlot.update({
            where: { id: existingSlot.id },
            data: {
              status: SlotStatus.AVAILABLE,
              client_id: null,
              locked_until: null,
              mp_payment_id: null,
              mp_preference_id: null,
              deposit_amount: PLATFORM_DEPOSIT_ARS,
            },
          });

          return {
            action: 'CREATED',
            slot: reactivatedSlot,
          };
        }

        if (existingSlot.status !== SlotStatus.AVAILABLE) {
          throw new BadRequestException(
            `No se puede eliminar un turno que está en estado ${existingSlot.status}`,
          );
        }

        await this.prisma.appointmentSlot.delete({
          where: { id: existingSlot.id },
        });

        return {
          action: 'DELETED',
          slot: existingSlot,
        };
      }

      const createdSlot = await this.prisma.appointmentSlot.create({
        data: {
          barber_id: barber.id,
          start_time: slotStart,
          end_time: slotEnd,
          status: SlotStatus.AVAILABLE,
          deposit_amount: PLATFORM_DEPOSIT_ARS,
        },
      });

      return {
        action: 'CREATED',
        slot: createdSlot,
      };
    }

    // Modo 2: Generar bloques exactos de 30 minutos en un rango [start_time, end_time)
    if (dto.start_time && dto.end_time) {
      const targetDates = this.resolveTargetDates(dto.date, dto.end_date);

      const slotsToCreate: Array<{
        barber_id: string;
        start_time: Date;
        end_time: Date;
        status: SlotStatus;
        deposit_amount: number;
      }> = [];
      const generatedStartTimes: Date[] = [];

      for (const currentDate of targetDates) {
        const rangeStart = this.parseDateTime(dto.start_time, currentDate);
        const rangeEnd = this.parseDateTime(dto.end_time, currentDate);

        this.assertAlignedTo30Min(rangeStart);
        this.assertAlignedTo30Min(rangeEnd);

        if (rangeEnd.getTime() <= rangeStart.getTime()) {
          throw new BadRequestException(
            'El horario de fin debe ser posterior al horario de inicio',
          );
        }

        const totalDiffMs = rangeEnd.getTime() - rangeStart.getTime();
        if (totalDiffMs % SLOT_DURATION_MS !== 0) {
          throw new BadRequestException(
            'El rango horario debe ser múltiplo exacto de 30 minutos',
          );
        }

        let breakStartMs: number | null = null;
        let breakEndMs: number | null = null;

        if (dto.break_start_time && dto.break_end_time) {
          const breakStart = this.parseDateTime(
            dto.break_start_time,
            currentDate,
          );
          const breakEnd = this.parseDateTime(dto.break_end_time, currentDate);

          this.assertAlignedTo30Min(breakStart);
          this.assertAlignedTo30Min(breakEnd);

          if (breakEnd.getTime() <= breakStart.getTime()) {
            throw new BadRequestException(
              'El fin del descanso debe ser posterior al inicio del descanso',
            );
          }

          breakStartMs = breakStart.getTime();
          breakEndMs = breakEnd.getTime();
        }

        for (
          let cursor = rangeStart.getTime();
          cursor < rangeEnd.getTime();
          cursor += SLOT_DURATION_MS
        ) {
          if (
            breakStartMs !== null &&
            breakEndMs !== null &&
            cursor >= breakStartMs &&
            cursor < breakEndMs
          ) {
            continue;
          }

          const slotStart = new Date(cursor);
          generatedStartTimes.push(slotStart);
          slotsToCreate.push({
            barber_id: barber.id,
            start_time: slotStart,
            end_time: new Date(cursor + SLOT_DURATION_MS),
            status: SlotStatus.AVAILABLE,
            deposit_amount: PLATFORM_DEPOSIT_ARS,
          });
        }
      }

      // Reactivar horarios que hubieran quedado en CANCELLED dentro del rango solicitado
      const reactivated =
        generatedStartTimes.length > 0
          ? await this.prisma.appointmentSlot.updateMany({
              where: {
                barber_id: barber.id,
                status: SlotStatus.CANCELLED,
                start_time: { in: generatedStartTimes },
              },
              data: {
                status: SlotStatus.AVAILABLE,
                client_id: null,
                locked_until: null,
                mp_payment_id: null,
                mp_preference_id: null,
                deposit_amount: PLATFORM_DEPOSIT_ARS,
              },
            })
          : { count: 0 };

      const created = await this.prisma.appointmentSlot.createMany({
        data: slotsToCreate,
        skipDuplicates: true,
      });

      const slotsInRange =
        generatedStartTimes.length > 0
          ? await this.prisma.appointmentSlot.findMany({
              where: {
                barber_id: barber.id,
                start_time: { in: generatedStartTimes },
              },
              orderBy: { start_time: 'asc' },
            })
          : [];

      return {
        action: 'RANGE_GENERATED',
        days_processed: targetDates.length,
        generated_count: created.count + reactivated.count,
        total_blocks_in_range: slotsInRange.length,
        slots: slotsInRange,
      };
    }

    throw new BadRequestException(
      'Debés enviar un rango (start_time y end_time) o un horario puntual (slot_start_time)',
    );
  }

  /**
   * Lista la agenda completa del barbero autenticado.
   */
  async getBarberSlots(userId: string) {
    const barber = await this.prisma.barberProfile.findUnique({
      where: { user_id: userId },
    });

    if (!barber) {
      throw new ForbiddenException(
        'El usuario actual no posee un perfil de barbero asociado',
      );
    }

    await this.releaseExpiredLocks();

    const slots = await this.prisma.appointmentSlot.findMany({
      where: { barber_id: barber.id },
      include: {
        client: {
          select: { id: true, dni: true, name: true, phone: true, email: true },
        },
      },
      orderBy: { start_time: 'asc' },
    });

    const { weekStart, weekEnd } = getWeekBoundsUtc();
    const weeklyConfirmedCount = slots.filter(
      (s) =>
        s.status === SlotStatus.CONFIRMED &&
        s.start_time >= weekStart &&
        s.start_time <= weekEnd,
    ).length;

    return {
      barber: {
        id: barber.id,
        slug: barber.slug,
        shop_name: barber.shop_name,
        address: barber.address,
        reminder_addon_active: barber.reminder_addon_active,
      },
      weekly_goal: calculateWeeklyGoalMetrics(weeklyConfirmedCount),
      slots,
    };
  }

  /**
   * Lista los turnos del cliente autenticado (CONFIRMED y PENDING_PAYMENT)
   * con detalle de barbería, comprobante de seña ($2.000 ARS) y recordatorios IA.
   */
  async getClientSlots(userId: string) {
    await this.releaseExpiredLocks();

    const slots = await this.prisma.appointmentSlot.findMany({
      where: {
        client_id: userId,
        status: {
          in: [SlotStatus.CONFIRMED, SlotStatus.PENDING_PAYMENT],
        },
      },
      include: {
        barber: {
          select: {
            id: true,
            slug: true,
            shop_name: true,
            address: true,
            reminder_addon_active: true,
            user: {
              select: {
                name: true,
                phone: true,
              },
            },
          },
        },
        reminders: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            scheduled_for: true,
            generated_message: true,
          },
        },
      },
      orderBy: { start_time: 'asc' },
    });

    return {
      slots,
    };
  }

  /**
   * Genera el archivo .ICS para un turno específico (Apple Calendar, Outlook, Google Calendar).
   */
  async generateSlotIcsFile(slotId: string): Promise<{
    filename: string;
    icsContent: string;
  }> {
    const slot = await this.prisma.appointmentSlot.findUnique({
      where: { id: slotId },
      include: {
        barber: {
          include: { user: true },
        },
        client: true,
      },
    });

    if (!slot) {
      throw new NotFoundException(`No se encontró el turno con ID ${slotId}`);
    }

    // En artefactos públicos no autenticados (.ICS), aplicamos minimización y enmascaramiento de PII (ISO/IEC 27701 7.4.5 / ISO 27001 A.8.11)
    const maskedPaymentId = slot.mp_payment_id
      ? `***${String(slot.mp_payment_id).slice(-4)}`
      : 'PENDIENTE';

    const icsContent = this.mailService.buildIcsCalendar({
      slotId: slot.id,
      shopName: slot.barber.shop_name,
      barberName: slot.barber.user.name,
      barberPhone: slot.barber.user.phone,
      address: slot.barber.address,
      clientName: maskFullNameForPublicArtifact(slot.client?.name),
      clientDni: maskDni(slot.client?.dni),
      startTime: slot.start_time,
      endTime: slot.end_time,
      mpPaymentId: maskedPaymentId,
      depositAmountArs: slot.deposit_amount,
    });

    return {
      filename: `turno-${slot.id.slice(0, 8)}.ics`,
      icsContent,
    };
  }

  /**
   * Cancela un turno por parte del cliente o barbero.
   * BLINDAJE DE SEÑA NO REEMBOLSABLE:
   * - JAMÁS ejecuta reembolso (refund) hacia Mercado Pago.
   * - La seña de $2.000 ARS queda 100% retenida en la cuenta central de la plataforma.
   */
  async cancelAppointmentNoRefund(slotId: string, user: JwtPayloadUser) {
    const slot = await this.prisma.appointmentSlot.findUnique({
      where: { id: slotId },
      include: {
        barber: true,
      },
    });

    if (!slot) {
      throw new NotFoundException('El turno indicado no existe');
    }

    const isOwnerClient = Boolean(slot.client_id && slot.client_id === user.sub);
    const isOwnerBarber = slot.barber.user_id === user.sub;
    const isSuperAdmin = user.role === Role.SUPERADMIN;

    if (!isOwnerClient && !isOwnerBarber && !isSuperAdmin) {
      throw new ForbiddenException(
        'No tenés permisos para cancelar este turno',
      );
    }

    if (slot.status === SlotStatus.AVAILABLE) {
      throw new BadRequestException(
        'No se puede cancelar un turno que se encuentra libre y sin reserva activa',
      );
    }

    if (slot.status === SlotStatus.CANCELLED) {
      return {
        cancelled: true,
        slot_id: slot.id,
        status: slot.status,
        refund_executed: false,
        deposit_retained: Boolean(slot.mp_payment_id),
        deposit_amount_retained_ars: slot.mp_payment_id
          ? slot.deposit_amount
          : 0,
        policy: NON_REFUNDABLE_DEPOSIT_POLICY,
      };
    }

    const hadPaidDeposit =
      slot.status === SlotStatus.CONFIRMED || Boolean(slot.mp_payment_id);

    const updatedSlot = await this.prisma.$transaction(async (tx) => {
      await tx.reminderQueue.updateMany({
        where: {
          slot_id: slot.id,
          status: ReminderStatus.PENDING,
        },
        data: {
          status: ReminderStatus.CANCELLED,
        },
      });

      return tx.appointmentSlot.update({
        where: { id: slot.id },
        data: {
          status: SlotStatus.CANCELLED,
          locked_until: null,
        },
      });
    });

    this.logger.log(
      `[SECURITY_AUDIT] event=APPOINTMENT_CANCELLED_NO_REFUND slotId=${slot.id} actorDni=${maskDni(user.dni)} actorRole=${user.role} depositRetainedArs=${hadPaidDeposit ? slot.deposit_amount : 0}`,
    );

    return {
      cancelled: true,
      slot_id: updatedSlot.id,
      status: updatedSlot.status,
      refund_executed: false,
      deposit_retained: hadPaidDeposit,
      deposit_amount_retained_ars: hadPaidDeposit
        ? updatedSlot.deposit_amount
        : 0,
      policy: NON_REFUNDABLE_DEPOSIT_POLICY,
    };
  }

  /**
   * Libera un turno en PENDING_PAYMENT de vuelta a AVAILABLE (ej. pago rechazado o cancelado).
   * Valida que el turno esté en PENDING_PAYMENT y, si se provee clientDni o preferenceId, que coincida con el titular del bloqueo.
   */
  async releaseSingleLock(
    slotId: string,
    clientDni?: string,
    preferenceId?: string,
  ) {
    const slot = await this.prisma.appointmentSlot.findUnique({
      where: { id: slotId },
      include: { client: true },
    });

    if (!slot || slot.status !== SlotStatus.PENDING_PAYMENT) {
      return {
        released: false,
        slot_id: slotId,
      };
    }

    const now = new Date();
    const isExpired = Boolean(slot.locked_until && slot.locked_until <= now);

    if (!isExpired) {
      if (clientDni) {
        const cleanDni = clientDni.replace(/\D/g, '');
        if (slot.client?.dni && slot.client.dni !== cleanDni) {
          throw new ForbiddenException(
            'No tenés permisos para liberar el bloqueo de otro cliente',
          );
        }
      }
      if (
        preferenceId &&
        slot.mp_preference_id &&
        slot.mp_preference_id !== preferenceId
      ) {
        throw new ForbiddenException(
          'La preferencia indicada no coincide con el bloqueo activo',
        );
      }
    }

    const result = await this.prisma.appointmentSlot.updateMany({
      where: {
        id: slotId,
        status: SlotStatus.PENDING_PAYMENT,
      },
      data: {
        status: SlotStatus.AVAILABLE,
        client_id: null,
        locked_until: null,
        mp_preference_id: null,
      },
    });

    return {
      released: result.count > 0,
      slot_id: slotId,
    };
  }

  /**
   * Devuelve los turnos disponibles (`AVAILABLE`) de ese barbero agrupados por fecha (YYYY-MM-DD).
   * Compara el horario nominal del turno contra la hora actual de Argentina (UTC-3).
   */
  async getPublicAvailableSlotsBySlug(slug: string) {
    await this.releaseExpiredLocks();

    const safeSlug = sanitizeControlChars(slug)
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '')
      .slice(0, 64);

    if (!safeSlug) {
      throw new NotFoundException(
        'No se encontró la barbería solicitada',
      );
    }

    const barber = await this.prisma.barberProfile.findUnique({
      where: { slug: safeSlug },
      include: {
        user: {
          select: { name: true, phone: true },
        },
      },
    });

    if (!barber) {
      throw new NotFoundException(
        `No se encontró ninguna barbería con el identificador "${safeSlug}"`,
      );
    }

    const nowArgentinaNominal = new Date(Date.now() - ARGENTINA_UTC_OFFSET_MS);

    const availableSlots = await this.prisma.appointmentSlot.findMany({
      where: {
        barber_id: barber.id,
        status: SlotStatus.AVAILABLE,
        start_time: { gte: nowArgentinaNominal },
      },
      orderBy: { start_time: 'asc' },
      select: {
        id: true,
        start_time: true,
        end_time: true,
        status: true,
        deposit_amount: true,
      },
    });

    const groupedByDate: Record<string, typeof availableSlots> = {};
    for (const slot of availableSlots) {
      const dateKey = slot.start_time.toISOString().slice(0, 10);
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = [];
      }
      groupedByDate[dateKey].push(slot);
    }

    return {
      barber: {
        id: barber.id,
        slug: barber.slug,
        shop_name: barber.shop_name,
        address: barber.address,
        barber_name: barber.user.name,
        barber_phone: barber.user.phone,
      },
      deposit_amount_ars: PLATFORM_DEPOSIT_ARS,
      slot_duration_minutes: 30,
      dates: groupedByDate,
    };
  }

  /**
   * Bloquea atómicamente un turno por 10 minutos (`PENDING_PAYMENT`) para el cliente
   * y genera la preferencia de Mercado Pago por $2.000 ARS.
   * Si falla la creación de la preferencia en Mercado Pago, revierte el bloqueo inmediatamente a AVAILABLE.
   */
  async lockSlot(
    slotId: string,
    authenticatedUserId?: string,
    dto?: LockSlotDto,
  ) {
    const resolvedAuth = await this.resolveClientForLock(
      authenticatedUserId,
      dto,
    );

    const now = new Date();
    const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);

    // Transacción atómica en Prisma para evitar que dos clientes reserven el mismo bloque simultáneamente
    const lockedSlot = await this.prisma.$transaction(async (tx) => {
      const currentSlot = await tx.appointmentSlot.findUnique({
        where: { id: slotId },
        include: { barber: true },
      });

      if (!currentSlot) {
        throw new NotFoundException('El turno solicitado no existe');
      }

      // Garantizar regla de 30 minutos exactos
      const durationMs =
        currentSlot.end_time.getTime() - currentSlot.start_time.getTime();
      if (durationMs !== SLOT_DURATION_MS) {
        throw new BadRequestException(
          'El bloque horario no cumple con la duración estricta de 30 minutos',
        );
      }

      // Actualización atómica condicional (optimistic concurrency control en DB)
      const updateResult = await tx.appointmentSlot.updateMany({
        where: {
          id: slotId,
          OR: [
            { status: SlotStatus.AVAILABLE },
            {
              status: SlotStatus.PENDING_PAYMENT,
              locked_until: { lt: now },
            },
            {
              status: SlotStatus.PENDING_PAYMENT,
              client_id: resolvedAuth.user.id,
            },
          ],
        },
        data: {
          status: SlotStatus.PENDING_PAYMENT,
          client_id: resolvedAuth.user.id,
          locked_until: lockedUntil,
          deposit_amount: PLATFORM_DEPOSIT_ARS,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          'Este turno de 30 minutos ya fue reservado o está en proceso de pago por otro cliente',
        );
      }

      return tx.appointmentSlot.findUniqueOrThrow({
        where: { id: slotId },
        include: { barber: true },
      });
    });

    try {
      // Generar preferencia de Mercado Pago ($2.000 ARS a cuenta central de plataforma) con slotId en external_reference
      const preference = await this.paymentsService.createDepositPreference({
        slotId: lockedSlot.id,
        shopName: lockedSlot.barber.shop_name,
        barberSlug: lockedSlot.barber.slug,
        startTime: lockedSlot.start_time,
        clientDni: resolvedAuth.user.dni,
        clientName: resolvedAuth.user.name,
      });

      const updatedSlot = await this.prisma.appointmentSlot.update({
        where: { id: lockedSlot.id },
        data: {
          mp_preference_id: preference.preference_id,
        },
      });

      return {
        slot: {
          id: updatedSlot.id,
          barber_id: updatedSlot.barber_id,
          client_id: updatedSlot.client_id,
          start_time: updatedSlot.start_time,
          end_time: updatedSlot.end_time,
          status: updatedSlot.status,
          locked_until: updatedSlot.locked_until,
          deposit_amount: updatedSlot.deposit_amount,
          mp_preference_id: updatedSlot.mp_preference_id,
        },
        payment: preference,
        ...(resolvedAuth.access_token && {
          access_token: resolvedAuth.access_token,
          user: resolvedAuth.user,
        }),
      };
    } catch (err) {
      // Rollback inmediato del bloqueo si falla la creación de preferencia en Mercado Pago
      await this.prisma.appointmentSlot
        .updateMany({
          where: {
            id: lockedSlot.id,
            status: SlotStatus.PENDING_PAYMENT,
            client_id: resolvedAuth.user.id,
          },
          data: {
            status: SlotStatus.AVAILABLE,
            client_id: null,
            locked_until: null,
            mp_preference_id: null,
          },
        })
        .catch(() => undefined);

      throw err;
    }
  }

  /**
   * Libera a `AVAILABLE` cualquier turno en `PENDING_PAYMENT` cuyo `locked_until` haya expirado.
   */
  async releaseExpiredLocks(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.appointmentSlot.updateMany({
      where: {
        status: SlotStatus.PENDING_PAYMENT,
        locked_until: {
          lte: now,
        },
      },
      data: {
        status: SlotStatus.AVAILABLE,
        client_id: null,
        locked_until: null,
        mp_preference_id: null,
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `🔓 Cron liberó ${result.count} turno(s) vencido(s) de PENDING_PAYMENT a AVAILABLE`,
      );
    }

    return result.count;
  }

  private async resolveClientForLock(
    authenticatedUserId?: string,
    dto?: LockSlotDto,
  ): Promise<{
    user: { id: string; dni: string; name: string; phone: string; role: Role };
    access_token?: string;
  }> {
    if (authenticatedUserId) {
      const existingUser = await this.prisma.user.findUnique({
        where: { id: authenticatedUserId },
      });
      if (existingUser) {
        return {
          user: {
            id: existingUser.id,
            dni: existingUser.dni,
            name: existingUser.name,
            phone: existingUser.phone,
            role: existingUser.role,
          },
        };
      }
    }

    if (!dto?.dni || !dto?.password) {
      throw new UnauthorizedException(
        'Debés indicar tu DNI para reservar el turno',
      );
    }

    const cleanDni = dto.dni.replace(/\D/g, '');
    let user = await this.prisma.user.findUnique({
      where: { dni: cleanDni },
    });

    if (user) {
      const isPasswordValid = await bcrypt.compare(dto.password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('DNI o contraseña incorrectos');
      }
      if (dto.email && !user.email && user.role === Role.CLIENT) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { email: dto.email },
        });
      }
    } else {
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      user = await this.prisma.user.create({
        data: {
          dni: cleanDni,
          password: hashedPassword,
          name: dto.name || `Cliente ${cleanDni}`,
          phone: dto.phone || '',
          email: dto.email || null,
          role: Role.CLIENT,
        },
      });
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      dni: user.dni,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        dni: user.dni,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
      access_token: token,
    };
  }

  private resolveTargetDates(startDate?: string, endDate?: string): string[] {
    if (!startDate) {
      return [''];
    }
    if (!endDate || endDate === startDate) {
      return [startDate];
    }

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Formato de rango de fechas inválido');
    }

    if (end.getTime() < start.getTime()) {
      throw new BadRequestException(
        'La fecha de fin debe ser igual o posterior a la fecha de inicio',
      );
    }

    const diffDays = Math.round(
      (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays > 30) {
      throw new BadRequestException(
        'El rango de fechas no puede superar los 31 días por operación',
      );
    }

    const dates: string[] = [];
    for (let i = 0; i <= diffDays; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  private parseDateTime(timeOrIso: string, dateStr?: string): Date {
    if (/^\d{2}:\d{2}$/.test(timeOrIso)) {
      if (!dateStr) {
        throw new BadRequestException(
          `Cuando se envía hora en formato HH:mm (${timeOrIso}), se requiere el campo date (YYYY-MM-DD)`,
        );
      }
      const parsed = new Date(`${dateStr}T${timeOrIso}:00.000Z`);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestException(`Fecha u hora inválida: ${dateStr} ${timeOrIso}`);
      }
      return parsed;
    }

    const parsed = new Date(timeOrIso);
    if (isNaN(parsed.getTime())) {
      throw new BadRequestException(`Formato de fecha/hora inválido: ${timeOrIso}`);
    }
    return parsed;
  }

  private assertAlignedTo30Min(date: Date) {
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    const ms = date.getUTCMilliseconds();

    if ((minutes !== 0 && minutes !== 30) || seconds !== 0 || ms !== 0) {
      throw new BadRequestException(
        `Los horarios deben estar alineados a bloques exactos de 30 minutos (:00 o :30). Recibido: ${date.toISOString()}`,
      );
    }
  }
}

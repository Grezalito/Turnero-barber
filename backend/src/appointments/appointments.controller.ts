import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { Response } from 'express';
import {
  CurrentUser,
  JwtPayloadUser,
} from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AppointmentsService } from './appointments.service';
import { LockSlotDto } from './dto/lock-slot.dto';
import { ManageBarberSlotsDto } from './dto/manage-slots.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('barber/slots')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BARBER)
  async manageBarberSlots(
    @CurrentUser() user: JwtPayloadUser,
    @Body() dto: ManageBarberSlotsDto,
  ) {
    return this.appointmentsService.manageBarberSlots(user.sub, dto);
  }

  @Get('barber/slots')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BARBER)
  async getBarberSlots(@CurrentUser() user: JwtPayloadUser) {
    return this.appointmentsService.getBarberSlots(user.sub);
  }

  @Get('client/my-slots')
  @UseGuards(JwtAuthGuard)
  async getClientSlots(@CurrentUser() user: JwtPayloadUser) {
    return this.appointmentsService.getClientSlots(user.sub);
  }

  @Public()
  @Get('public/:slug')
  async getPublicAvailableSlots(@Param('slug') slug: string) {
    return this.appointmentsService.getPublicAvailableSlotsBySlug(slug);
  }

  @Public()
  @Get(':slotId/ics')
  async downloadSlotIcs(
    @Param('slotId') slotId: string,
    @Res() res: Response,
  ) {
    const { filename, icsContent } =
      await this.appointmentsService.generateSlotIcsFile(slotId);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(icsContent);
  }

  @Post(':slotId/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelAppointment(
    @Param('slotId') slotId: string,
    @CurrentUser() user: JwtPayloadUser,
  ) {
    return this.appointmentsService.cancelAppointmentNoRefund(slotId, user);
  }

  @Post(':slotId/release-lock')
  async releaseLock(@Param('slotId') slotId: string) {
    return this.appointmentsService.releaseSingleLock(slotId);
  }

  @Post(':slotId/lock')
  async lockSlot(
    @Param('slotId') slotId: string,
    @Headers('authorization') authHeader?: string,
    @Body() dto?: LockSlotDto,
  ) {
    let authenticatedUserId: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = await this.jwtService.verifyAsync<{ sub: string }>(
          token,
        );
        authenticatedUserId = payload.sub;
      } catch {
        // Si el token expiró o no es válido, se intentará con las credenciales del body si fueron provistas
      }
    }

    return this.appointmentsService.lockSlot(slotId, authenticatedUserId, dto);
  }
}

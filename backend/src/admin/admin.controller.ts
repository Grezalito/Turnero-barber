import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';
import { CreateBarberDto } from './dto/create-barber.dto';
import { ToggleReminderDto } from './dto/toggle-reminder.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('barbers')
  async createBarber(@Body() dto: CreateBarberDto) {
    return this.adminService.createBarber(dto);
  }

  @Patch('barbers/:id/toggle-reminder')
  async toggleReminder(
    @Param('id') barberId: string,
    @Body() dto?: ToggleReminderDto,
  ) {
    return this.adminService.toggleReminderAddon(barberId, dto);
  }

  @Get('barbers')
  async listBarbers() {
    return this.adminService.listBarbers();
  }

  @Get('settlements')
  async listWeeklySettlements() {
    return this.adminService.listWeeklySettlements();
  }

  @Patch('settlements/:barberId/transfer')
  async markWeeklySettlementTransferred(
    @Param('barberId') barberId: string,
    @Body() body?: { week_start?: string; transferred?: boolean },
  ) {
    return this.adminService.markWeeklySettlementTransferred(
      barberId,
      body?.week_start,
      body?.transferred,
    );
  }
}

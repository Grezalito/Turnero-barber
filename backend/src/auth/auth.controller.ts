import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  CurrentUser,
  JwtPayloadUser,
} from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterClientDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('auth/register')
  async register(@Body() dto: RegisterClientDto) {
    return this.authService.registerClient(dto);
  }

  @Get('auth/me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: JwtPayloadUser) {
    return this.authService.getProfile(user.sub);
  }

  @Get('barbers/me')
  @UseGuards(JwtAuthGuard)
  async getBarberMe(@CurrentUser() user: JwtPayloadUser) {
    const profile = await this.authService.getProfile(user.sub);
    return {
      user: profile,
      barber: profile?.barber_profile || null,
      slug: profile?.barber_profile?.slug || null,
    };
  }
}

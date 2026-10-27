import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterClientDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { dni: dto.dni },
      include: { barber_profile: true },
    });

    if (!user) {
      throw new UnauthorizedException('DNI o contraseña incorrectos');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('DNI o contraseña incorrectos');
    }

    const payload = {
      sub: user.id,
      dni: user.dni,
      role: user.role,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        dni: user.dni,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        barber_profile: user.barber_profile,
      },
    };
  }

  async registerClient(dto: RegisterClientDto) {
    const existing = await this.prisma.user.findUnique({
      where: { dni: dto.dni },
    });

    if (existing) {
      throw new ConflictException('Ya existe un usuario registrado con ese DNI');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        dni: dto.dni,
        password: hashedPassword,
        name: dto.name,
        phone: dto.phone,
        email: dto.email || null,
        role: Role.CLIENT,
      },
    });

    const payload = {
      sub: user.id,
      dni: user.dni,
      role: user.role,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        dni: user.dni,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
    };
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        dni: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        barber_profile: true,
        created_at: true,
      },
    });
  }
}

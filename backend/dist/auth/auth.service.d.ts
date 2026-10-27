import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterClientDto } from './dto/register.dto';
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    constructor(prisma: PrismaService, jwtService: JwtService);
    login(dto: LoginDto): Promise<{
        access_token: string;
        user: {
            id: string;
            dni: string;
            name: string;
            phone: string;
            email: string | null;
            role: import(".prisma/client").$Enums.Role;
            barber_profile: {
                slug: string;
                shop_name: string;
                address: string | null;
                reminder_config: import("@prisma/client/runtime/library").JsonValue | null;
                id: string;
                created_at: Date;
                updated_at: Date;
                user_id: string;
                reminder_addon_active: boolean;
            } | null;
        };
    }>;
    registerClient(dto: RegisterClientDto): Promise<{
        access_token: string;
        user: {
            id: string;
            dni: string;
            name: string;
            phone: string;
            email: string | null;
            role: import(".prisma/client").$Enums.Role;
        };
    }>;
    getProfile(userId: string): Promise<{
        dni: string;
        name: string;
        phone: string;
        email: string | null;
        id: string;
        role: import(".prisma/client").$Enums.Role;
        created_at: Date;
        barber_profile: {
            slug: string;
            shop_name: string;
            address: string | null;
            reminder_config: import("@prisma/client/runtime/library").JsonValue | null;
            id: string;
            created_at: Date;
            updated_at: Date;
            user_id: string;
            reminder_addon_active: boolean;
        } | null;
    } | null>;
}

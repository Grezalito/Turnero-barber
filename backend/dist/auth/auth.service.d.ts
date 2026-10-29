import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterClientDto } from './dto/register.dto';
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    constructor(prisma: PrismaService, jwtService: JwtService);
    private ensureUniqueSlug;
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
                shop_name: string;
                slug: string;
                address: string | null;
                reminder_config: import("@prisma/client/runtime/library").JsonValue | null;
                id: string;
                user_id: string;
                reminder_addon_active: boolean;
                created_at: Date;
                updated_at: Date;
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
            barber_profile: {
                shop_name: string;
                slug: string;
                address: string | null;
                reminder_config: import("@prisma/client/runtime/library").JsonValue | null;
                id: string;
                user_id: string;
                reminder_addon_active: boolean;
                created_at: Date;
                updated_at: Date;
            } | null;
        };
    } | {
        access_token: string;
        user: {
            id: string;
            dni: string;
            name: string;
            phone: string;
            email: string | null;
            role: import(".prisma/client").$Enums.Role;
            barber_profile?: undefined;
        };
    }>;
    getProfile(userId: string): Promise<{
        dni: string;
        name: string;
        phone: string;
        email: string | null;
        id: string;
        created_at: Date;
        role: import(".prisma/client").$Enums.Role;
        barber_profile: {
            shop_name: string;
            slug: string;
            address: string | null;
            reminder_config: import("@prisma/client/runtime/library").JsonValue | null;
            id: string;
            user_id: string;
            reminder_addon_active: boolean;
            created_at: Date;
            updated_at: Date;
        } | null;
    } | null>;
}

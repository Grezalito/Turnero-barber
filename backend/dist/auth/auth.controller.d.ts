import { AuthService } from './auth.service';
import { JwtPayloadUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterClientDto } from './dto/register.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
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
    register(dto: RegisterClientDto): Promise<{
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
    getMe(user: JwtPayloadUser): Promise<{
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
    getBarberMe(user: JwtPayloadUser): Promise<{
        user: {
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
        } | null;
        barber: {
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
        slug: string | null;
    }>;
}

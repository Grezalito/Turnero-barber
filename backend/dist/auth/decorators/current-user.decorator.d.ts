export interface JwtPayloadUser {
    sub: string;
    dni: string;
    role: string;
}
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;

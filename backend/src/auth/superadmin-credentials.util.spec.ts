import { resolveSuperAdminCredentials } from './superadmin-credentials.util';

describe('resolveSuperAdminCredentials', () => {
  it.each([
    ['ambas ausentes', {}, /SUPERADMIN_DNI, SUPERADMIN_PASSWORD/],
    ['falta el DNI', { SUPERADMIN_PASSWORD: 'Secreta-123' }, /: SUPERADMIN_DNI\./],
    ['falta la contraseña', { SUPERADMIN_DNI: '12345678' }, /: SUPERADMIN_PASSWORD\./],
    ['valores vacíos o en blanco', { SUPERADMIN_DNI: '  ', SUPERADMIN_PASSWORD: '   ' }, /SUPERADMIN_DNI, SUPERADMIN_PASSWORD/],
  ])('falla si %s', (_label, env, message) => {
    expect(() => resolveSuperAdminCredentials(env as NodeJS.ProcessEnv)).toThrow(message);
  });

  it.each(['development', 'production', 'test', undefined])(
    'no hay contraseña de respaldo con NODE_ENV=%s',
    (nodeEnv) => {
      expect(() => resolveSuperAdminCredentials({ NODE_ENV: nodeEnv })).toThrow(/Faltan variables/);
    },
  );

  it('rechaza el placeholder de .env.example', () => {
    expect(() =>
      resolveSuperAdminCredentials({
        SUPERADMIN_DNI: '00000000',
        SUPERADMIN_PASSWORD: 'CAMBIAR_ESTA_CONTRASENA',
      }),
    ).toThrow(/placeholder/);
  });

  it('devuelve las credenciales definidas (DNI recortado, contraseña intacta)', () => {
    expect(
      resolveSuperAdminCredentials({ SUPERADMIN_DNI: ' 12345678 ', SUPERADMIN_PASSWORD: ' Secreta-123 ' }),
    ).toEqual({ dni: '12345678', password: ' Secreta-123 ' });
  });
});

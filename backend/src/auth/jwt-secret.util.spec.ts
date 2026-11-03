import { MIN_JWT_SECRET_LENGTH, resolveJwtSecret } from './jwt-secret.util';

describe('resolveJwtSecret (fail-fast)', () => {
  it.each([undefined, null, '', '   ', 'a'.repeat(MIN_JWT_SECRET_LENGTH - 1)])(
    'rechaza secret ausente o corto (%p)',
    (value) => {
      expect(() => resolveJwtSecret(value as any)).toThrow(/JWT_SECRET/);
    },
  );

  it('acepta un secret de 32+ caracteres y lo devuelve sin espacios', () => {
    const secret = 'x'.repeat(MIN_JWT_SECRET_LENGTH);
    expect(resolveJwtSecret(`  ${secret}  `)).toBe(secret);
  });
});

import { API_CSP, DOCS_CSP, isDocsEnabled, isDocsPath } from './docs.config';

describe('isDocsEnabled', () => {
  it('sin DOCS_ENABLED: apagado en producción', () => {
    expect(isDocsEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isDocsEnabled({ NODE_ENV: 'Production', DOCS_ENABLED: '  ' })).toBe(false);
  });

  it('sin DOCS_ENABLED: encendido fuera de producción', () => {
    expect(isDocsEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isDocsEnabled({})).toBe(true);
  });

  it('DOCS_ENABLED explícito tiene prioridad sobre NODE_ENV', () => {
    expect(isDocsEnabled({ NODE_ENV: 'production', DOCS_ENABLED: 'true' })).toBe(true);
    expect(isDocsEnabled({ NODE_ENV: 'development', DOCS_ENABLED: 'false' })).toBe(false);
    expect(isDocsEnabled({ DOCS_ENABLED: '0' })).toBe(false);
  });

  it('valor inválido lanza un error claro', () => {
    expect(() => isDocsEnabled({ DOCS_ENABLED: 'tru' })).toThrow(/DOCS_ENABLED inválido/);
  });
});

describe('isDocsPath', () => {
  it.each(['/docs', '/docs/', '/docs/swagger-ui-bundle.js', '/docs-json', '/docs-yaml', '/docs?x=1'])(
    '%s es ruta de docs',
    (p) => expect(isDocsPath(p)).toBe(true),
  );

  it.each(['/', '/docsx', '/documents', '/auth/login', '/health', '/api/docs'])(
    '%s NO es ruta de docs',
    (p) => expect(isDocsPath(p)).toBe(false),
  );
});

describe('CSP', () => {
  it('la CSP de la API sigue siendo estricta', () => {
    expect(API_CSP).toContain("default-src 'none'");
    expect(API_CSP).not.toContain('unsafe');
  });

  it('la CSP de docs no habilita scripts inline ni eval', () => {
    const scriptSrc = DOCS_CSP.split('; ').find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBe("script-src 'self'");
    expect(DOCS_CSP).not.toContain('unsafe-eval');
    expect(DOCS_CSP).toContain("frame-ancestors 'none'");
  });
});

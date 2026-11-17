import { Request, Response } from 'express';
import { API_CSP, DOCS_CSP } from '../docs/docs.config';
import { SecurityHeadersMiddleware } from './security-headers.middleware';

function cspFor(path: string): string | undefined {
  const headers: Record<string, string> = {};
  const req = { headers: {}, originalUrl: path, url: path } as unknown as Request;
  const res = {
    setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = v),
    removeHeader: () => undefined,
  } as unknown as Response;
  new SecurityHeadersMiddleware().use(req, res, () => undefined);
  return headers['content-security-policy'];
}

describe('SecurityHeadersMiddleware CSP', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('API: siempre CSP estricta', () => {
    process.env.DOCS_ENABLED = 'true';
    expect(cspFor('/health')).toBe(API_CSP);
    expect(cspFor('/auth/login')).toBe(API_CSP);
  });

  it('/docs habilitado: CSP relajada solo en rutas de docs', () => {
    process.env.DOCS_ENABLED = 'true';
    expect(cspFor('/docs')).toBe(DOCS_CSP);
    expect(cspFor('/docs/swagger-ui-bundle.js')).toBe(DOCS_CSP);
    expect(cspFor('/docs-json')).toBe(DOCS_CSP);
  });

  it('/docs deshabilitado (producción por defecto): CSP estricta también en /docs', () => {
    delete process.env.DOCS_ENABLED;
    process.env.NODE_ENV = 'production';
    expect(cspFor('/docs')).toBe(API_CSP);
  });
});

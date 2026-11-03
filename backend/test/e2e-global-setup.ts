/**
 * Levanta un PostgreSQL embebido (PGlite) efímero en memoria y aplica el schema de Prisma.
 * La suite e2e NUNCA usa el DATABASE_URL del .env: corre 100% local y descartable.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as net from 'net';
import * as path from 'path';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export default async function globalSetup(): Promise<void> {
  // Imports dinámicos: los paquetes de PGlite son ESM.
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');

  const port = await freePort();
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();

  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable&connection_limit=1&pool_timeout=60&pgbouncer=true`;
  process.env.E2E_DATABASE_URL = url;

  // Asíncrono a propósito: el servidor PGlite vive en este mismo proceso y necesita el event loop libre.
  const backendDir = path.resolve(__dirname, '..');
  await promisify(execFile)(
    process.execPath,
    [require.resolve('prisma/build/index.js', { paths: [backendDir] }), 'db', 'push', '--skip-generate', '--accept-data-loss'],
    { cwd: backendDir, env: { ...process.env, DATABASE_URL: url } },
  );

  (globalThis as any).__E2E_PGLITE__ = { server, db };
}

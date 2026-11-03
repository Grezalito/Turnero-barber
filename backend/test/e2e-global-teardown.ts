export default async function globalTeardown(): Promise<void> {
  const handle = (globalThis as any).__E2E_PGLITE__;
  if (handle) {
    await handle.server.stop().catch(() => undefined);
    await handle.db.close().catch(() => undefined);
  }
}

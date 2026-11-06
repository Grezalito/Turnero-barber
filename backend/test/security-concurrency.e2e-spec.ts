/**
 * Suite e2e de regresión de seguridad y concurrencia (Turnazo).
 *
 * Levanta el AppModule REAL contra un PostgreSQL embebido efímero (ver e2e-global-setup.ts),
 * con requests HTTP reales. Solo se reemplazan los efectos externos:
 *   - MailService → stub (no se envían mails)
 *   - MercadoPagoService.getPayment / createPreference → stubs (no hay llamadas a MP)
 *
 * Limitación conocida: PGlite atiende una conexión a la vez, por lo que las transacciones se
 * serializan. Las carreras entre requests HTTP (check-then-act fuera de transacción) sí se
 * ejercitan; el comportamiento de row-locks de un Postgres real debe validarse en staging.
 *
 * Correr con: npm run test:e2e
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
if (!E2E_DB || !/@127\.0\.0\.1:\d+\//.test(E2E_DB)) {
  throw new Error('E2E_DATABASE_URL local no configurado: la suite solo corre contra el PGlite efímero de globalSetup.');
}
process.env.DATABASE_URL = E2E_DB;
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'e2e-only-jwt-secret-0123456789-abcdefghijklmnop';
process.env.MP_WEBHOOK_SECRET = 'e2e-webhook-secret-123';
process.env.MP_ACCESS_TOKEN = 'TEST-e2e-fake-token-not-real';
process.env.SMTP_HOST = '';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const e2eVapid = require('web-push').generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = e2eVapid.publicKey;
process.env.VAPID_PRIVATE_KEY = e2eVapid.privateKey;

import { spawnSync } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { json } from 'express';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { AppointmentsCleanupCron } from '../src/appointments/appointments-cleanup.cron';
import { hashLockToken } from '../src/appointments/lock-token.util';
import { MailService } from '../src/mail/mail.service';
import { MercadoPagoService } from '../src/payments/mercadopago.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReminderSchedulerService } from '../src/notifications/reminder-scheduler.service';
import { instantToNominal } from '../src/notifications/slot-time.util';
import { WebPushService } from '../src/notifications/web-push.service';

const WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET!;
const JWT_SECRET = process.env.JWT_SECRET!;
/** Secret que antes estaba hardcodeado como fallback en el repo. Debe ser inútil. */
const LEGACY_FALLBACK_JWT = 'turnero-barber-super-secret-jwt-key-2026';

type Status = 'PASS' | 'WARN' | 'FAIL';
const matrix: { area: string; test: string; status: Status; detail: string }[] = [];
/** Registra en la matriz y asserta: un FAIL rompe la suite. */
function check(area: string, test: string, ok: boolean, detail: string) {
  matrix.push({ area, test, status: ok ? 'PASS' : 'FAIL', detail });
  expect({ test, ok, detail }).toEqual({ test, ok: true, detail });
}
/** Riesgo aceptado/documentado: se reporta pero no rompe la suite. */
function warn(area: string, test: string, detail: string) {
  matrix.push({ area, test, status: 'WARN', detail });
}

let app: INestApplication;
let base: string;
let prisma: PrismaService;
let mp: MercadoPagoService;
let jwtService: JwtService;
const mailCalls: string[] = [];
/** Cantidad de mails de confirmación enviados para un turno (efecto secundario que no debe duplicarse). */
const confirmations = (slotId: string) =>
  mailCalls.filter((m) => m === `sendAppointmentConfirmationEmails|${slotId}`).length;
const preferenceCalls: { body: any; idempotencyKey?: string }[] = [];
let ipSeq = 1;
/** Cada request simula un cliente distinto detrás del proxy (trust proxy = 1). */
const freshIp = () => `10.99.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

const sign = (dataId: string, reqId: string, ts: number | string) =>
  crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`id:${dataId.toLowerCase()};request-id:${reqId};ts:${ts};`)
    .digest('hex');
const nowTs = () => Math.floor(Date.now() / 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function http(
  method: string,
  urlPath: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {},
) {
  const res = await fetch(base + urlPath, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': freshIp(),
      ...(opts.headers || {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* sin body */
  }
  return { status: res.status, body };
}

function webhook(
  dataId: string | null,
  o: { ts?: number; sig?: string | null; reqId?: string | null; type?: string } = {},
) {
  const reqId = o.reqId === undefined ? crypto.randomUUID() : o.reqId;
  const ts = o.ts ?? nowTs();
  const sig = o.sig === undefined ? `ts=${ts},v1=${sign(dataId || '', reqId || '', ts)}` : o.sig;
  const type = o.type || 'payment';
  const headers: Record<string, string> = {};
  if (sig !== null) headers['x-signature'] = sig;
  if (reqId !== null) headers['x-request-id'] = reqId;
  const qs = dataId ? `?data.id=${encodeURIComponent(dataId)}&type=${type}` : `?type=${type}`;
  return http('POST', `/payments/webhook${qs}`, {
    headers,
    body: {
      type,
      ...(type === 'payment' ? { action: 'payment.updated' } : {}),
      data: dataId ? { id: dataId } : {},
    },
  });
}

/** Pago aprobado en MP, vinculado (metadata) al cliente titular del bloqueo. */
const approvedPayment =
  (slotId: string, clientId: string | null, amount = 2000) =>
  async (id: any): Promise<any> => ({
    id,
    status: 'approved',
    external_reference: slotId,
    transaction_amount: amount,
    ...(clientId ? { metadata: { slot_id: slotId, client_id: clientId } } : {}),
  });

let barber: any, barberUser: any, clientA: any, clientB: any, superUser: any;
let slotSeq = 0;
async function mkSlot(data: Record<string, any> = {}) {
  const start = new Date(Date.UTC(2030, 0, 1, 10, 0) + slotSeq++ * 30 * 60_000);
  return prisma.appointmentSlot.create({
    data: {
      barber_id: barber.id,
      start_time: start,
      end_time: new Date(start.getTime() + 30 * 60_000),
      ...data,
    },
  });
}
const getSlot = (id: string) => prisma.appointmentSlot.findUniqueOrThrow({ where: { id } });
const PW = 'e2e-pass-123';

beforeAll(async () => {
  // Solo se interceptan los ENVÍOS; los métodos puros (p. ej. buildIcsCalendar) usan el MailService real.
  const realMail = new MailService({ get: () => undefined } as any);
  const PURE_MAIL_METHODS = new Set(['buildIcsCalendar', 'formatArgentinaSlotToUtcIcsDate']);
  const mailStub = new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === 'then'
          ? undefined
          : PURE_MAIL_METHODS.has(String(prop))
            ? (realMail as any)[prop].bind(realMail)
            : async (...args: any[]) => {
              mailCalls.push(`${String(prop)}|${args[0]?.slotId ?? ''}`);
              return { mode: 'CONSOLE_FALLBACK', clientEmailSent: false };
            },
    },
  );
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mailStub)
    .compile();

  const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
  // Misma configuración relevante que main.ts
  nestApp.set('trust proxy', 1);
  nestApp.use(json({ limit: '64kb' }));
  nestApp.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await nestApp.listen(0, '127.0.0.1');
  app = nestApp;
  base = `http://127.0.0.1:${(app.getHttpServer().address() as any).port}`;

  prisma = app.get(PrismaService);
  mp = app.get(MercadoPagoService);
  jwtService = app.get(JwtService);

  jest.spyOn(mp, 'createPreference').mockImplementation(async (body: any, opts?: any) => {
    preferenceCalls.push({ body, idempotencyKey: opts?.idempotencyKey });
    return {
      id: `pref-${preferenceCalls.length}`,
      init_point: 'https://mp.test/init',
      sandbox_init_point: 'https://mp.test/init',
    } as any;
  });
  jest.spyOn(mp, 'getPayment').mockResolvedValue({ status: 'rejected' } as any);

  await prisma.$executeRawUnsafe(
    'TRUNCATE push_subscriptions, orphan_payments, appointment_slots, weekly_settlements, barber_profiles, users CASCADE',
  );
  const bcrypt = await import('bcrypt');
  const pw = await bcrypt.hash(PW, 4);
  const mkUser = (dni: string, name: string, role: any, email?: string) =>
    prisma.user.create({ data: { dni, password: pw, name, phone: `+54911${dni}`, role, email } });
  superUser = await mkUser('90000001', 'E2E Super', 'SUPERADMIN');
  barberUser = await mkUser('90000002', 'E2E Barber', 'BARBER');
  clientA = await mkUser('90000003', 'E2E Client A', 'CLIENT', 'a@e2e.test');
  clientB = await mkUser('90000004', 'E2E Client B', 'CLIENT', 'b@e2e.test');
  barber = await prisma.barberProfile.create({
    data: { user_id: barberUser.id, slug: 'e2e-barber', shop_name: 'E2E Shop', reminder_addon_active: true },
  });
}, 60_000);

afterAll(async () => {
  const counts = matrix.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  // eslint-disable-next-line no-console
  console.log(
    `\nMATRIZ SEGURIDAD/CONCURRENCIA — PASS ${counts.PASS || 0} | WARN ${counts.WARN || 0} | FAIL ${counts.FAIL || 0}\n` +
      matrix.map((r) => `${r.status.padEnd(4)} | ${r.area} | ${r.test} | ${r.detail}`).join('\n'),
  );
  await app?.close();
});

// ───────────────────────── 0. ARRANQUE ─────────────────────────
describe('0. Arranque (fail-fast JWT_SECRET)', () => {
  test('la API no arranca sin JWT_SECRET', () => {
    const backendDir = path.resolve(__dirname, '..');
    const run = (secret: string) =>
      spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', 'src/main.ts'], {
        cwd: backendDir,
        env: { ...process.env, JWT_SECRET: secret, PORT: '0' },
        encoding: 'utf8',
        timeout: 45_000,
      });
    const missing = run('');
    const short = run('demasiado-corto');
    check(
      '0. Arranque',
      'Fail-fast sin JWT_SECRET / secret corto',
      missing.status === 1 && short.status === 1 && /STARTUP_ABORTED/.test(missing.stdout + missing.stderr),
      `exit ${missing.status} / ${short.status}`,
    );
  }, 60_000);
});

// ───────────────────────── 1. WEBHOOKS ─────────────────────────
describe('1. Seguridad de webhooks', () => {
  const A = '1. Webhooks';

  test('firma válida → 200', async () => {
    const r = await webhook('111');
    check(A, 'Firma HMAC válida', r.status === 200 && r.body?.received === true, `HTTP ${r.status}`);
  });
  test('v1 corrupto → 401', async () => {
    const ts = nowTs();
    const good = sign('111', 'rid-corrupt', ts);
    const bad = (good[0] === 'a' ? 'b' : 'a') + good.slice(1);
    const r = await webhook('111', { ts, reqId: 'rid-corrupt', sig: `ts=${ts},v1=${bad}` });
    check(A, 'HMAC corrupto', r.status === 401, `HTTP ${r.status}`);
  });
  test('v1 truncado / no-hex → 401', async () => {
    const r1 = await webhook('111', { sig: `ts=${nowTs()},v1=deadbeef` });
    const r2 = await webhook('111', { sig: `ts=${nowTs()},v1=${'z'.repeat(64)}` });
    check(A, 'HMAC truncado / no-hex', r1.status === 401 && r2.status === 401, `HTTP ${r1.status} / ${r2.status}`);
  });
  test('x-signature incompleto/malformado → 400', async () => {
    const rs = await Promise.all([
      webhook('111', { sig: `v1=${'a'.repeat(64)}` }),
      webhook('111', { sig: `ts=${nowTs()}` }),
      webhook('111', { sig: 'garbage' }),
      webhook('111', { sig: `ts=abc,v1=${'a'.repeat(64)}` }),
    ]);
    check(A, 'x-signature incompleto/malformado', rs.every((r) => r.status === 400), rs.map((r) => r.status).join('/'));
  });
  test('firma válida de otro data.id → 401', async () => {
    const ts = nowTs();
    const r = await webhook('222', { ts, reqId: 'rid-swap', sig: `ts=${ts},v1=${sign('111', 'rid-swap', ts)}` });
    check(A, 'Firma de otro data.id', r.status === 401, `HTTP ${r.status}`);
  });
  test('replay fuera de ventana ±301s → 401', async () => {
    const past = await webhook('111', { ts: nowTs() - 301 });
    const future = await webhook('111', { ts: nowTs() + 301 });
    const edge = await webhook('111', { ts: nowTs() - 299 });
    check(A, 'Replay fuera de ventana (±301s)', past.status === 401 && future.status === 401, `pasado ${past.status}, futuro ${future.status}`);
    check(A, 'Borde de ventana (-299s aceptado)', edge.status === 200, `HTTP ${edge.status}`);
  });
  test('replay idéntico dentro de la ventana', async () => {
    const ts = nowTs();
    const sig = `ts=${ts},v1=${sign('333', 'rid-same', ts)}`;
    const r1 = await webhook('333', { ts, reqId: 'rid-same', sig });
    const r2 = await webhook('333', { ts, reqId: 'rid-same', sig });
    warn(A, 'Replay idéntico dentro de 300s', `1ª ${r1.status}, 2ª ${r2.status} — aceptado por diseño; mitigado por idempotencia + verify-then-fetch`);
  });
  test('headers ausentes → 400', async () => {
    const noSig = await webhook('111', { sig: null });
    const noReq = await webhook('111', { reqId: null, sig: `ts=${nowTs()},v1=${'a'.repeat(64)}` });
    const noId = await webhook(null, { sig: `ts=${nowTs()},v1=${'a'.repeat(64)}` });
    check(A, 'Sin x-signature', noSig.status === 400, `HTTP ${noSig.status}`);
    check(A, 'Sin x-request-id', noReq.status === 400, `HTTP ${noReq.status}`);
    check(A, 'Sin data.id', noId.status === 400, `HTTP ${noId.status}`);
  });
  test('evento no-payment exige firma', async () => {
    const unsigned = await webhook('999', { type: 'merchant_order', sig: null });
    const signed = await webhook('999', { type: 'merchant_order' });
    check(A, 'Evento no-payment exige firma', unsigned.status === 400 && signed.status === 200 && signed.body?.ignored === true, `sin firma ${unsigned.status}, con firma ${signed.status}`);
  });
  test('MP_WEBHOOK_SECRET ausente → 401', async () => {
    process.env.MP_WEBHOOK_SECRET = '';
    const r = await webhook('111');
    process.env.MP_WEBHOOK_SECRET = WEBHOOK_SECRET;
    check(A, 'Secret ausente (fail-closed)', r.status === 401, `HTTP ${r.status}`);
  });
  test('simulate-webhook en producción → 404', async () => {
    process.env.NODE_ENV = 'production';
    const r = await http('POST', '/payments/simulate-webhook', {
      body: { type: 'payment', payment_id: 'mp_pay_x', external_reference: 'x', status: 'approved' },
    });
    process.env.NODE_ENV = 'development';
    check(A, 'simulate-webhook bloqueado en prod', r.status === 404, `HTTP ${r.status}`);
  });
});

// ───────────────────────── 1b. RATE LIMIT ─────────────────────────
describe('1b. Rate limit y spoofing de IP', () => {
  const A = '1. Webhooks';
  test('misma IP real → 429 en el request 61', async () => {
    let first429 = -1;
    for (let i = 0; i < 65; i++) {
      const r = await http('POST', '/payments/confirm-return', {
        headers: { 'x-forwarded-for': '203.0.113.7' },
        body: { slotId: 'nope' },
      });
      if (r.status === 429) {
        first429 = i + 1;
        break;
      }
    }
    check(A, 'Rate limit misma IP (60/min)', first429 === 61, `429 en request #${first429}`);
  });
  test('X-Forwarded-For falsificado por el cliente no evade el límite', async () => {
    // El proxy reverso agrega la IP real al final; el cliente controla solo los valores previos.
    let first429 = -1;
    for (let i = 0; i < 65; i++) {
      const spoofed = `198.51.100.${(i % 250) + 1}`;
      const r = await http('POST', '/payments/confirm-return', {
        headers: { 'x-forwarded-for': `${spoofed}, 203.0.113.50` },
        body: { slotId: 'nope' },
      });
      if (r.status === 429) {
        first429 = i + 1;
        break;
      }
    }
    check(A, 'Rate limit con X-Forwarded-For rotado', first429 === 61, `429 en request #${first429} pese a rotar el primer valor de XFF`);
  });
});

// ───────────────────────── 2. CONCURRENCIA / BLOQUEOS / PAGOS ─────────────────────────
describe('2. Concurrencia, bloqueos y pagos', () => {
  const A = '2. Concurrencia';

  test('race de lock: 10 clientes al mismo slot → 1 gana con lockToken', async () => {
    const slot = await mkSlot();
    const rs = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        http('POST', `/appointments/${slot.id}/lock`, {
          body: { dni: String(91000000 + i), password: PW, name: `Racer ${i}` },
        }),
      ),
    );
    const winners = rs.filter((r) => r.status === 201);
    const conflicts = rs.filter((r) => r.status === 409).length;
    const final = await getSlot(slot.id);
    const token = winners[0]?.body?.lock_token;
    check(
      A,
      'Lock concurrente (10 clientes)',
      winners.length === 1 && conflicts === 9 && final.status === 'PENDING_PAYMENT' && final.lock_token_hash === hashLockToken(token),
      `ganadores=${winners.length}, 409=${conflicts}, estado=${final.status}, hash del token guardado=${final.lock_token_hash === hashLockToken(token)}`,
    );
  });

  test('preferencia vinculada al bloqueo (metadata + idempotencia por bloqueo)', async () => {
    const slot = await mkSlot();
    const before = preferenceCalls.length;
    const lockA = await http('POST', `/appointments/${slot.id}/lock`, { body: { dni: clientA.dni, password: PW } });
    await prisma.appointmentSlot.update({ where: { id: slot.id }, data: { locked_until: new Date(Date.now() - 1000) } });
    const lockB = await http('POST', `/appointments/${slot.id}/lock`, { body: { dni: clientB.dni, password: PW } });
    const [pa, pb] = preferenceCalls.slice(before);
    check(
      A,
      'Preferencia MP vinculada al bloqueo',
      lockA.status === 201 && lockB.status === 201 &&
        pa?.body?.metadata?.client_id === clientA.id && pb?.body?.metadata?.client_id === clientB.id &&
        !!pa?.idempotencyKey && pa.idempotencyKey !== pb?.idempotencyKey,
      `metadata A=${pa?.body?.metadata?.client_id === clientA.id}, B=${pb?.body?.metadata?.client_id === clientB.id}, idempotencyKey distinta=${pa?.idempotencyKey !== pb?.idempotencyKey}`,
    );
  });

  test('idempotencia: 10 webhooks simultáneos mismo mp_payment_id', async () => {
    const slot = await mkSlot({ status: 'PENDING_PAYMENT', client_id: clientA.id, locked_until: new Date(Date.now() + 600_000) });
    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(slot.id, clientA.id));
    const rs = await Promise.all(Array.from({ length: 10 }, () => webhook('7770001')));
    await sleep(2500);
    const final = await getSlot(slot.id);
    const mails = confirmations(slot.id);
    check(
      A,
      'Ráfaga 10 webhooks mismo pago',
      rs.every((r) => r.status === 200) && final.status === 'CONFIRMED' && mails === 1 && final.confirmation_sent_at !== null,
      `HTTP 200=${rs.filter((r) => r.status === 200).length}/10, estado=${final.status}, confirmaciones=${mails}`,
    );
  });

  test('idempotencia mixta: 5 webhooks + 5 confirm-return simultáneos', async () => {
    const slot = await mkSlot({ status: 'PENDING_PAYMENT', client_id: clientB.id, locked_until: new Date(Date.now() + 600_000) });
    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(slot.id, clientB.id));
    const rs = await Promise.all([
      ...Array.from({ length: 5 }, () => webhook('7770002')),
      ...Array.from({ length: 5 }, () =>
        http('POST', '/payments/confirm-return', { body: { slotId: slot.id, paymentId: '7770002', status: 'approved' } }),
      ),
    ]);
    await sleep(2500);
    const final = await getSlot(slot.id);
    const mails = confirmations(slot.id);
    check(
      A,
      'Webhook + confirm-return concurrentes',
      final.status === 'CONFIRMED' && mails === 1 && rs.every((r) => r.status < 500),
      `estado=${final.status}, confirmaciones=${mails}, HTTP=${rs.map((r) => r.status).join(',')}`,
    );
  });

  test('dos pagos aprobados distintos para el mismo slot → el segundo queda REQUIRES_REFUND', async () => {
    const slot = await mkSlot({ status: 'PENDING_PAYMENT', client_id: clientA.id, locked_until: new Date(Date.now() + 600_000) });
    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(slot.id, clientA.id));
    await Promise.all([webhook('7770003'), webhook('7770004')]);
    await sleep(2500);
    const final = await getSlot(slot.id);
    const mails = confirmations(slot.id);
    const orphans = await prisma.orphanPayment.findMany({ where: { slot_id: slot.id } });
    check(
      A,
      'Dos pagos aprobados mismo slot',
      final.status === 'CONFIRMED' && mails === 1 && orphans.length === 1 &&
        orphans[0].status === 'REQUIRES_REFUND' && orphans[0].reason === 'DUPLICATE_PAYMENT' &&
        orphans[0].mp_payment_id !== final.mp_payment_id,
      `estado=${final.status}, confirmaciones=${mails}, orphan=${orphans[0]?.reason}/${orphans[0]?.status}`,
    );
  });

  test('confirm-return con otro paymentId sobre slot confirmado no informa "confirmado"', async () => {
    const slot = await mkSlot({ status: 'CONFIRMED', client_id: clientA.id, mp_payment_id: 'pay-orig-1' });
    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(slot.id, clientB.id));
    const r = await http('POST', '/payments/confirm-return', { body: { slotId: slot.id, paymentId: 'pay-other-2', status: 'approved' } });
    check(
      A,
      'confirm-return de pago ajeno sobre turno confirmado',
      r.status === 200 && r.body?.processed === false && r.body?.status === 'REQUIRES_REFUND',
      `processed=${r.body?.processed}, status=${r.body?.status}, reason=${r.body?.reason}`,
    );
  });

  test('pago con monto insuficiente no confirma', async () => {
    const slot = await mkSlot({ status: 'PENDING_PAYMENT', client_id: clientA.id, locked_until: new Date(Date.now() + 600_000) });
    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(slot.id, clientA.id, 1));
    await webhook('7770005');
    await sleep(1500);
    const final = await getSlot(slot.id);
    check(A, 'Pago con monto < $2000', final.status === 'PENDING_PAYMENT', `estado=${final.status}`);
  });

  test('pago real sin metadata de cliente → REQUIRES_REFUND', async () => {
    const slot = await mkSlot({ status: 'PENDING_PAYMENT', client_id: clientA.id, locked_until: new Date(Date.now() + 600_000) });
    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(slot.id, null));
    await webhook('7770010');
    await sleep(1500);
    const final = await getSlot(slot.id);
    const orphan = await prisma.orphanPayment.findUnique({ where: { mp_payment_id: '7770010' } });
    check(A, 'Pago sin vínculo a bloqueo', final.status === 'PENDING_PAYMENT' && orphan?.reason === 'MISSING_CLIENT_BINDING', `estado=${final.status}, orphan=${orphan?.reason}`);
  });

  test('cron libera locks vencidos y respeta vigentes/confirmados', async () => {
    const expired = await mkSlot({ status: 'PENDING_PAYMENT', client_id: clientA.id, locked_until: new Date(Date.now() - 1000), mp_preference_id: 'p1', lock_token_hash: 'h' });
    const active = await mkSlot({ status: 'PENDING_PAYMENT', client_id: clientB.id, locked_until: new Date(Date.now() + 600_000) });
    const confirmed = await mkSlot({ status: 'CONFIRMED', client_id: clientB.id, mp_payment_id: 'cron-conf-1' });
    await app.get(AppointmentsCleanupCron).handleExpiredSlotLocks();
    const [e, a, c] = await Promise.all([expired, active, confirmed].map((s) => getSlot(s.id)));
    check(
      A,
      'Cron limpieza TTL',
      e.status === 'AVAILABLE' && e.client_id === null && e.lock_token_hash === null && a.status === 'PENDING_PAYMENT' && c.status === 'CONFIRMED',
      `vencido→${e.status}, vigente→${a.status}, confirmado→${c.status}`,
    );
  });

  test('pago tardío de A sobre lock vigente de B → B intacto + REQUIRES_REFUND', async () => {
    const slot = await mkSlot({ status: 'PENDING_PAYMENT', client_id: clientA.id, locked_until: new Date(Date.now() - 1000) });
    await app.get(AppointmentsCleanupCron).handleExpiredSlotLocks();
    const lockB = await http('POST', `/appointments/${slot.id}/lock`, { body: { dni: clientB.dni, password: PW } });
    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(slot.id, clientA.id));
    await webhook('7770006');
    await sleep(2000);
    const final = await getSlot(slot.id);
    const orphan = await prisma.orphanPayment.findUnique({ where: { mp_payment_id: '7770006' } });
    check(
      A,
      'Pago tardío de A sobre lock vigente de B',
      lockB.status === 201 && final.status === 'PENDING_PAYMENT' && final.client_id === clientB.id &&
        final.mp_payment_id === null && orphan?.reason === 'SLOT_TAKEN_BY_OTHER_CLIENT' && orphan?.client_id === clientA.id,
      `lock B ${lockB.status}; slot=${final.status}/${final.client_id === clientB.id ? 'B' : final.client_id}; orphan=${orphan?.reason}`,
    );
  });

  test('pago tardío sobre slot liberado (AVAILABLE) → confirmado para el pagador', async () => {
    const slot = await mkSlot({ status: 'AVAILABLE' });
    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(slot.id, clientA.id));
    await webhook('7770007');
    await sleep(1500);
    const final = await getSlot(slot.id);
    check(
      A,
      'Pago tardío sobre slot AVAILABLE',
      final.status === 'CONFIRMED' && final.client_id === clientA.id && final.mp_payment_id === '7770007',
      `estado=${final.status}, cliente=${final.client_id === clientA.id ? 'A (pagador)' : final.client_id}`,
    );
  });

  test('release-lock exige el lockToken del titular', async () => {
    const slot = await mkSlot();
    const lock = await http('POST', `/appointments/${slot.id}/lock`, { body: { dni: clientA.dni, password: PW } });
    const token: string = lock.body?.lock_token;
    const anon = await http('POST', `/appointments/${slot.id}/release-lock`, { body: {} });
    const forged = await http('POST', `/appointments/${slot.id}/release-lock`, { body: { lock_token: crypto.randomBytes(32).toString('base64url') } });
    const legacy = await http('POST', `/appointments/${slot.id}/release-lock`, { body: { clientDni: clientA.dni } });
    const stillLocked = (await getSlot(slot.id)).status === 'PENDING_PAYMENT';
    const owner = await http('POST', `/appointments/${slot.id}/release-lock`, { body: { lock_token: token } });
    const final = await getSlot(slot.id);
    check(
      A,
      'release-lock sin token / token ajeno',
      anon.status === 400 && forged.status === 403 && legacy.status === 400 && stillLocked,
      `sin token ${anon.status}, token falso ${forged.status}, solo DNI ${legacy.status}, sigue bloqueado=${stillLocked}`,
    );
    check(
      A,
      'release-lock con token del titular',
      owner.status === 201 && owner.body?.released === true && final.status === 'AVAILABLE' && final.lock_token_hash === null,
      `HTTP ${owner.status}, estado=${final.status}`,
    );
  });

  test('confirm-return rejected exige el lockToken', async () => {
    const slot = await mkSlot();
    const lock = await http('POST', `/appointments/${slot.id}/lock`, { body: { dni: clientA.dni, password: PW } });
    const token: string = lock.body?.lock_token;
    const anon = await http('POST', '/payments/confirm-return', { body: { slotId: slot.id, status: 'rejected' } });
    const forged = await http('POST', '/payments/confirm-return', {
      body: { slotId: slot.id, status: 'rejected', lock_token: crypto.randomBytes(32).toString('base64url') },
    });
    const stillLocked = (await getSlot(slot.id)).status === 'PENDING_PAYMENT';
    const owner = await http('POST', '/payments/confirm-return', { body: { slotId: slot.id, status: 'rejected', lock_token: token } });
    const final = await getSlot(slot.id);
    check(
      A,
      'confirm-return rejected sin token / token ajeno',
      anon.body?.released === false && forged.body?.released === false && stillLocked,
      `anónimo released=${anon.body?.released}, falso released=${forged.body?.released}, sigue bloqueado=${stillLocked}`,
    );
    check(
      A,
      'confirm-return rejected con token del titular',
      owner.body?.released === true && final.status === 'AVAILABLE',
      `released=${owner.body?.released}, estado=${final.status}`,
    );
  });

  test('create-preference (guest por DNI) no puede re-bloquear un turno ya bloqueado', async () => {
    const slot = await mkSlot();
    const first = await http('POST', '/payments/create-preference', {
      body: { slotId: slot.id, clientDni: clientA.dni, clientName: 'A', clientPhone: '+5491100000003' },
    });
    const hijack = await http('POST', '/payments/create-preference', {
      body: { slotId: slot.id, clientDni: clientA.dni, clientName: 'A', clientPhone: '+5491100000003' },
    });
    const final = await getSlot(slot.id);
    check(
      A,
      'Re-lock por DNI (obtener lockToken ajeno)',
      first.status === 200 && typeof first.body?.lock_token === 'string' && hijack.status === 409 &&
        final.lock_token_hash === hashLockToken(first.body.lock_token),
      `1º ${first.status}, 2º ${hijack.status}, token original vigente=${final.lock_token_hash === hashLockToken(first.body?.lock_token)}`,
    );
  });
});

// ───────────────────────── 3. AUTH / RBAC ─────────────────────────
describe('3. Autenticación y RBAC', () => {
  const A = '3. RBAC';
  const tok = (u: any, role?: string) => jwtService.sign({ sub: u.id, dni: u.dni, role: role ?? u.role });
  const get = (p: string, token?: string) => http('GET', p, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  test('sin token / basura / firma ajena / expirado / alg none → 401', async () => {
    const wrong = jwt.sign({ sub: superUser.id, dni: superUser.dni, role: 'SUPERADMIN' }, 'otro-secret-cualquiera-de-32-chars!!', { issuer: 'turnero-barber-api' });
    const expired = jwt.sign({ sub: superUser.id, dni: superUser.dni, role: 'SUPERADMIN', exp: nowTs() - 10 }, JWT_SECRET, { issuer: 'turnero-barber-api' });
    const none =
      Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.' +
      Buffer.from(JSON.stringify({ sub: superUser.id, role: 'SUPERADMIN' })).toString('base64url') + '.';
    const rs = await Promise.all([get('/admin/barbers'), get('/admin/barbers', 'garbage'), get('/admin/barbers', wrong), get('/admin/barbers', expired), get('/admin/barbers', none)]);
    check(A, 'Admin: sin token/basura/firma ajena/expirado/alg none', rs.every((r) => r.status === 401), rs.map((r) => r.status).join('/'));
  });
  test('BARBER / CLIENT → 403; SUPERADMIN → 200', async () => {
    const [b, c, s] = await Promise.all([get('/admin/barbers', tok(barberUser)), get('/admin/barbers', tok(clientA)), get('/admin/barbers', tok(superUser))]);
    check(A, 'Admin: BARBER/CLIENT 403, SUPERADMIN 200', b.status === 403 && c.status === 403 && s.status === 200, `${b.status}/${c.status}/${s.status}`);
  });
  test('alias raíz de admin protegidos', async () => {
    const rs = await Promise.all([get('/barbers'), get('/settlements'), get('/barbers', tok(clientA))]);
    check(A, 'Alias raíz de admin protegidos', rs[0].status === 401 && rs[1].status === 401 && rs[2].status === 403, rs.map((r) => r.status).join('/'));
  });
  test('escritura admin con CLIENT → 403', async () => {
    const h = { authorization: `Bearer ${tok(clientA)}` };
    const r1 = await http('POST', '/admin/barbers', { headers: h, body: {} });
    const r2 = await http('PATCH', `/admin/barbers/${barber.id}/toggle-reminder`, { headers: h, body: {} });
    check(A, 'Escritura admin con CLIENT', r1.status === 403 && r2.status === 403, `${r1.status}/${r2.status}`);
  });
  test('gestión de slots del barbero', async () => {
    const [n, c, b] = await Promise.all([get('/appointments/barber/slots'), get('/appointments/barber/slots', tok(clientA)), get('/appointments/barber/slots', tok(barberUser))]);
    check(A, 'Barber slots: anon 401 / CLIENT 403 / BARBER 200', n.status === 401 && c.status === 403 && b.status === 200, `${n.status}/${c.status}/${b.status}`);
  });
  test('token SUPERADMIN forjado con el secret que antes estaba hardcodeado → 401', async () => {
    const forged = jwt.sign({ sub: crypto.randomUUID(), dni: '00000000', role: 'SUPERADMIN' }, LEGACY_FALLBACK_JWT, { issuer: 'turnero-barber-api' });
    const r = await get('/admin/barbers', forged);
    check(A, 'Token SUPERADMIN forjado (secret legacy)', r.status === 401, `HTTP ${r.status}`);
  });
  test('token válido de usuario inexistente con rol SUPERADMIN → 401', async () => {
    const ghost = jwtService.sign({ sub: crypto.randomUUID(), dni: '00000000', role: 'SUPERADMIN' });
    const r = await get('/admin/barbers', ghost);
    check(A, 'SUPERADMIN fantasma (usuario inexistente)', r.status === 401, `HTTP ${r.status}`);
  });
  test('token de SUPERADMIN borrado → 401', async () => {
    const deleted = await prisma.user.create({ data: { dni: '90000099', password: 'x', name: 'Deleted', phone: '1', role: 'SUPERADMIN' } });
    const t = tok(deleted);
    await prisma.user.delete({ where: { id: deleted.id } });
    const r = await get('/admin/barbers', t);
    check(A, 'Token de SUPERADMIN eliminado', r.status === 401, `HTTP ${r.status}`);
  });
  test('rol del token distinto al de la base → 401', async () => {
    const escalated = await get('/admin/barbers', tok(clientA, 'SUPERADMIN'));
    const demoted = await prisma.user.create({ data: { dni: '90000098', password: 'x', name: 'Demoted', phone: '2', role: 'SUPERADMIN' } });
    const t = tok(demoted);
    await prisma.user.update({ where: { id: demoted.id }, data: { role: 'CLIENT' } });
    const afterDemotion = await get('/admin/barbers', t);
    check(A, 'Rol escalado / degradado', escalated.status === 401 && afterDemotion.status === 401, `escalado ${escalated.status}, degradado ${afterDemotion.status}`);
  });
});

// ───────────────────────── 4. NOTIFICACIONES / PWA ─────────────────────────
describe('4. Notificaciones, recordatorios y Web Push', () => {
  const A = '4. Notificaciones';
  const FCM = 'https://fcm.googleapis.com/fcm/send/e2e-device-';
  const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
  const subscribe = (slotId: string, lockToken: string, endpoint = `${FCM}${crypto.randomUUID()}`) =>
    http('POST', '/notifications/subscribe', {
      body: { slot_id: slotId, lock_token: lockToken, subscription: { endpoint, expirationTime: null, keys } },
    });

  test('flujo completo: lock → pago → confirmación → suscripción push del titular', async () => {
    const slot = await mkSlot();
    const lock = await http('POST', `/appointments/${slot.id}/lock`, { body: { dni: clientA.dni, password: PW } });
    const token: string = lock.body.lock_token;
    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(slot.id, clientA.id));
    await webhook('8880001');
    await sleep(2000);
    const confirmed = await getSlot(slot.id);

    const vapid = await http('GET', '/notifications/vapid-public-key');
    const ok = await subscribe(slot.id, token);
    const again = await subscribe(slot.id, token, `${FCM}fixed`);
    const dup = await subscribe(slot.id, token, `${FCM}fixed`);
    const stored = await prisma.pushSubscription.count({ where: { slot_id: slot.id } });

    check(A, 'Confirmación marca confirmation_sent_at', confirmed.status === 'CONFIRMED' && confirmed.confirmation_sent_at !== null, `estado=${confirmed.status}, confirmation_sent_at=${!!confirmed.confirmation_sent_at}`);
    check(A, 'Clave VAPID pública expuesta', vapid.status === 200 && vapid.body.enabled === true && vapid.body.public_key === e2eVapid.publicKey, `HTTP ${vapid.status}`);
    check(A, 'Suscripción push del titular (upsert por dispositivo)', ok.status === 201 && again.status === 201 && dup.status === 201 && stored === 2, `HTTP ${ok.status}/${again.status}/${dup.status}, guardadas=${stored}`);
  });

  test('suscripción push: token ajeno / endpoint no permitido (SSRF) / turno de otro', async () => {
    const slot = await mkSlot();
    const lock = await http('POST', `/appointments/${slot.id}/lock`, { body: { dni: clientB.dni, password: PW } });
    const otherSlot = await mkSlot();
    const otherLock = await http('POST', `/appointments/${otherSlot.id}/lock`, { body: { dni: clientA.dni, password: PW } });

    const forged = await subscribe(slot.id, crypto.randomBytes(32).toString('base64url'));
    const crossSlot = await subscribe(slot.id, otherLock.body.lock_token);
    const ssrf = await subscribe(slot.id, lock.body.lock_token, 'https://169.254.169.254/latest/meta-data');
    const httpEndpoint = await subscribe(slot.id, lock.body.lock_token, 'http://fcm.googleapis.com/fcm/send/x');
    const stored = await prisma.pushSubscription.count({ where: { slot_id: slot.id } });

    check(
      A,
      'Suscripción push rechazada sin titularidad / endpoint inseguro',
      forged.status === 403 && crossSlot.status === 403 && ssrf.status === 400 && httpEndpoint.status === 400 && stored === 0,
      `token falso ${forged.status}, token de otro turno ${crossSlot.status}, SSRF ${ssrf.status}, http ${httpEndpoint.status}, guardadas=${stored}`,
    );
  });

  test('link de WhatsApp al barbero en la confirmación y al cliente en la agenda del barbero', async () => {
    const slot = await mkSlot({ status: 'PENDING_PAYMENT', client_id: clientB.id, locked_until: new Date(Date.now() + 600_000) });
    const sim = await http('POST', '/payments/simulate-webhook', {
      body: { type: 'payment', payment_id: `mp_pay_${Date.now()}`, external_reference: slot.id, status: 'approved' },
    });
    const barberToken = jwtService.sign({ sub: barberUser.id, dni: barberUser.dni, role: 'BARBER' });
    const agenda = await http('GET', '/appointments/barber/slots', { headers: { authorization: `Bearer ${barberToken}` } });
    const row = agenda.body?.slots?.find((x: any) => x.id === slot.id);
    const barberUrl: string = sim.body?.whatsapp_barber_notify_url || '';
    const clientUrl: string = row?.whatsapp_confirmation_url || '';

    check(
      A,
      'Links wa.me (barbero y cliente)',
      barberUrl.startsWith('https://wa.me/5491190000002?text=') &&
        decodeURIComponent(barberUrl).includes('Cliente: E2E Client B') &&
        clientUrl.startsWith('https://wa.me/5491190000004?text=') &&
        decodeURIComponent(clientUrl).includes('¡Hola E2E Client B! Ya tenés confirmada tu seña') &&
        !('lock_token_hash' in (row || {})),
      `barbero=${barberUrl.slice(0, 32)}…, cliente=${clientUrl.slice(0, 32)}…, hash expuesto=${'lock_token_hash' in (row || {})}`,
    );
  });

  test('cron de recordatorios: ventanas, estados e idempotencia con dos instancias concurrentes', async () => {
    await prisma.appointmentSlot.updateMany({ data: { reminder_24h_sent_at: new Date(), reminder_2h_sent_at: new Date() } });
    // MVP: los recordatorios aplican aunque la barbería NO tenga el add-on activo.
    await prisma.barberProfile.update({ where: { id: barber.id }, data: { reminder_addon_active: false } });
    const now = new Date();
    const nominalIn = (ms: number) => instantToNominal(new Date(now.getTime() + ms));
    const mk = async (ms: number, status: any) => {
      const start = nominalIn(ms);
      return prisma.appointmentSlot.create({
        data: { barber_id: barber.id, start_time: start, end_time: new Date(start.getTime() + 30 * 60_000), status, client_id: clientA.id },
      });
    };
    const in24 = await mk(24 * 3_600_000, 'CONFIRMED');
    const in2 = await mk(2 * 3_600_000, 'CONFIRMED');
    const cancelled = await mk(2 * 3_600_000 + 10 * 60_000, 'CANCELLED');
    const pending = await mk(24 * 3_600_000 + 10 * 60_000, 'PENDING_PAYMENT');
    const outside = await mk(5 * 3_600_000, 'CONFIRMED');

    const sends: string[] = [];
    const push = app.get(WebPushService);
    const spy = jest.spyOn(push, 'sendToSlot').mockImplementation(async (slotId: string) => {
      sends.push(slotId);
      await sleep(50);
      return 1;
    });
    const scheduler = app.get(ReminderSchedulerService);

    await Promise.all([scheduler.runOnce(now), scheduler.runOnce(now)]);
    await scheduler.runOnce(new Date(now.getTime() + 10 * 60_000));
    spy.mockRestore();
    await prisma.barberProfile.update({ where: { id: barber.id }, data: { reminder_addon_active: true } });

    const [s24, s2, sc, sp, so] = await Promise.all([in24, in2, cancelled, pending, outside].map((x) => getSlot(x.id)));
    const count = (id: string) => sends.filter((x) => x === id).length;

    check(
      A,
      'Cron: 1 envío por ventana pese a 2 instancias (sin add-on)',
      count(in24.id) === 1 && count(in2.id) === 1 && s24.reminder_24h_sent_at !== null && s24.reminder_2h_sent_at === null && s2.reminder_2h_sent_at !== null,
      `24h=${count(in24.id)} envío(s), 2h=${count(in2.id)} envío(s)`,
    );
    check(
      A,
      'Cron: ignora cancelados, pendientes y fuera de ventana',
      count(cancelled.id) === 0 && count(pending.id) === 0 && count(outside.id) === 0 &&
        sc.reminder_2h_sent_at === null && sp.reminder_24h_sent_at === null && so.reminder_2h_sent_at === null,
      `cancelado=${count(cancelled.id)}, pendiente=${count(pending.id)}, fuera=${count(outside.id)}`,
    );
  });
});

// ───────────────────────── 5. PÁGINA PÚBLICA DE LA RESERVA ─────────────────────────
describe('5. Página pública de la reserva (/reserva/:id)', () => {
  const A = '5. Página reserva';
  const summaryPath = (bookingUrl: string) => {
    const u = new URL(bookingUrl);
    const id = u.pathname.split('/').pop()!;
    return { id, ref: u.searchParams.get('ref')!, path: `/appointments/${id}/summary?ref=${u.searchParams.get('ref')}` };
  };
  const confirmFor = async (clientId: string) => {
    const slot = await mkSlot({ status: 'PENDING_PAYMENT', client_id: clientId, locked_until: new Date(Date.now() + 600_000) });
    const sim = await http('POST', '/payments/simulate-webhook', {
      body: { type: 'payment', payment_id: `mp_pay_${crypto.randomUUID()}`, external_reference: slot.id, status: 'approved' },
    });
    return { slot, sim };
  };

  test('el link de la confirmación abre el resumen del turno sin PII sensible', async () => {
    await prisma.barberProfile.update({ where: { id: barber.id }, data: { address: 'Av. Corrientes 1234, CABA' } });
    const { slot, sim } = await confirmFor(clientB.id);
    const link = summaryPath(sim.body.booking_url);
    const r = await http('GET', link.path);
    const raw = JSON.stringify(r.body);
    const ics = await fetch(base + r.body?.ics_path);

    check(
      A,
      'booking_url en la confirmación → resumen 200',
      sim.body.booking_url?.startsWith('http://localhost:5173/reserva/') && link.id === slot.id && r.status === 200 &&
        r.body.status === 'CONFIRMED' && r.body.barber_name === 'E2E Barber' && r.body.address === 'Av. Corrientes 1234, CABA' &&
        /^\d{2}:\d{2}$/.test(r.body.time_label) && r.body.duration_minutes === 30 && r.body.client_first_name === 'E2E',
      `HTTP ${r.status}, estado=${r.body?.status}, ${r.body?.date_label} ${r.body?.time_label}, ${r.body?.duration_minutes} min`,
    );
    check(
      A,
      'Resumen sin DNI / teléfono / email del cliente',
      !raw.includes(clientB.dni) && !raw.includes(clientB.phone) && !raw.includes('b@e2e.test') && !raw.includes('lock_token'),
      `campos=${Object.keys(r.body || {}).length}`,
    );
    check(
      A,
      'Botones: WhatsApp cancelar/reprogramar al barbero + .ics',
      r.body.whatsapp_cancel_url?.startsWith('https://wa.me/5491190000002?text=') &&
        decodeURIComponent(r.body.whatsapp_cancel_url).includes('Necesito cancelar mi turno') &&
        decodeURIComponent(r.body.whatsapp_reschedule_url).includes('¿Puedo reprogramar mi turno') &&
        ics.status === 200 && (ics.headers.get('content-type') || '').includes('text/calendar') &&
        (await ics.text()).includes('DTSTART:'),
      `ics HTTP ${ics.status}`,
    );
  });

  test('confirm-return solo entrega booking_url a quien trae el payment_id del turno', async () => {
    const slot = await mkSlot({ status: 'PENDING_PAYMENT', client_id: clientA.id, locked_until: new Date(Date.now() + 600_000) });
    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(slot.id, clientA.id));
    await webhook('9990001');
    await sleep(1500);
    const anon = await http('POST', '/payments/confirm-return', { body: { slotId: slot.id, status: 'approved' } });
    const owner = await http('POST', '/payments/confirm-return', { body: { slotId: slot.id, paymentId: '9990001', status: 'approved' } });
    check(
      A,
      'booking_url no se filtra con solo el slotId',
      anon.body?.booking_url === null && typeof owner.body?.booking_url === 'string' && owner.body.booking_url.includes(`/reserva/${slot.id}?ref=`),
      `solo slotId → ${anon.body?.booking_url}, con payment_id → ${owner.body?.booking_url ? 'link' : 'null'}`,
    );
  });

  test('ref ausente, adulterado o id inválido → 404/400 sin filtrar existencia', async () => {
    const { sim } = await confirmFor(clientA.id);
    const link = summaryPath(sim.body.booking_url);
    const tampered = link.ref.slice(0, -1) + (link.ref.endsWith('A') ? 'B' : 'A');
    const [noRef, bad, unknown, notUuid] = await Promise.all([
      http('GET', `/appointments/${link.id}/summary`),
      http('GET', `/appointments/${link.id}/summary?ref=${tampered}`),
      http('GET', `/appointments/${crypto.randomUUID()}/summary?ref=${link.ref}`),
      http('GET', `/appointments/no-es-uuid/summary?ref=${link.ref}`),
    ]);
    check(
      A,
      'Resumen exige ref firmado',
      noRef.status === 404 && bad.status === 404 && unknown.status === 404 && notUuid.status === 400 &&
        bad.body?.message === unknown.body?.message,
      `sin ref ${noRef.status}, adulterado ${bad.status}, inexistente ${unknown.status}, no-uuid ${notUuid.status}`,
    );
  });

  test('.ics exige el ref firmado (mismo 404 que /summary) y no se cachea', async () => {
    const { slot, sim } = await confirmFor(clientA.id);
    const link = summaryPath(sim.body.booking_url);
    const summary = await http('GET', link.path);
    const tampered = link.ref.slice(0, -1) + (link.ref.endsWith('A') ? 'B' : 'A');
    // Cuerpo del 404 sin los campos que cambian en cada request (requestId, timestamp).
    const stable = (text: string) => {
      const { requestId: _r, timestamp: _t, ...rest } = JSON.parse(text);
      return JSON.stringify(rest);
    };
    const get = (p: string) => fetch(base + p).then(async (r) => ({ status: r.status, headers: r.headers, text: await r.text() }));

    const ok = await get(summary.body.ics_path);
    const noRef = await get(`/appointments/${slot.id}/ics`);
    const bad = await get(`/appointments/${slot.id}/ics?ref=${tampered}`);
    const unknown = await get(`/appointments/${crypto.randomUUID()}/ics?ref=${link.ref}`);
    const notUuid = await get(`/appointments/no-es-uuid/ics?ref=${link.ref}`);
    const summary404 = await http('GET', `/appointments/${crypto.randomUUID()}/summary?ref=${link.ref}`);

    check(
      A,
      '.ics con ref válido (ics_path del resumen)',
      summary.body.ics_path === `/appointments/${slot.id}/ics?ref=${link.ref}` && ok.status === 200 &&
        ok.text.includes('BEGIN:VCALENDAR') && (ok.headers.get('cache-control') || '').includes('no-store') &&
        ok.headers.get('referrer-policy') === 'no-referrer',
      `HTTP ${ok.status}, cache-control=${ok.headers.get('cache-control')}, referrer-policy=${ok.headers.get('referrer-policy')}, VCALENDAR=${ok.text.includes('BEGIN:VCALENDAR')}`,
    );
    check(
      A,
      '.ics sin ref / adulterado / inexistente → 404 idéntico',
      noRef.status === 404 && bad.status === 404 && unknown.status === 404 && notUuid.status === 400 &&
        stable(noRef.text) === stable(bad.text) && stable(bad.text) === stable(unknown.text) &&
        JSON.parse(unknown.text).message === summary404.body?.message && !unknown.text.includes(slot.id),
      `sin ref ${noRef.status}, adulterado ${bad.status}, inexistente ${unknown.status}, no-uuid ${notUuid.status}, mismo cuerpo=${stable(noRef.text) === stable(unknown.text)}`,
    );
  });

  test('turno cancelado y re-reservado por otro cliente: el link viejo no muestra la reserva nueva', async () => {
    const { slot, sim } = await confirmFor(clientA.id);
    const oldLink = summaryPath(sim.body.booking_url);
    await prisma.appointmentSlot.update({ where: { id: slot.id }, data: { status: 'CANCELLED' } });
    const cancelled = await http('GET', oldLink.path);

    await prisma.appointmentSlot.update({
      where: { id: slot.id },
      data: { status: 'PENDING_PAYMENT', client_id: clientB.id, mp_payment_id: null, confirmation_sent_at: null, locked_until: new Date(Date.now() + 600_000) },
    });
    const sim2 = await http('POST', '/payments/simulate-webhook', {
      body: { type: 'payment', payment_id: `mp_pay_${crypto.randomUUID()}`, external_reference: slot.id, status: 'approved' },
    });
    const afterRebook = await http('GET', oldLink.path);
    const oldIcs = await fetch(`${base}/appointments/${slot.id}/ics?ref=${oldLink.ref}`);
    const newLink = await http('GET', summaryPath(sim2.body.booking_url).path);
    const newIcs = await fetch(base + newLink.body?.ics_path);

    check(
      A,
      'Cancelado se muestra como tal, sin botones de WhatsApp',
      cancelled.status === 200 && cancelled.body.status === 'CANCELLED' && cancelled.body.whatsapp_cancel_url === null,
      `HTTP ${cancelled.status}, estado=${cancelled.body?.status}`,
    );
    check(
      A,
      'Link viejo inválido tras re-reserva del mismo turno (página y .ics)',
      afterRebook.status === 404 && oldIcs.status === 404 && newLink.status === 200 && newIcs.status === 200 &&
        newLink.body.client_first_name === 'E2E',
      `página vieja ${afterRebook.status}, .ics viejo ${oldIcs.status}, página nueva ${newLink.status}, .ics nuevo ${newIcs.status}`,
    );
  });
});

// ───────────────────────── 6. FLUJO CRÍTICO MVP ─────────────────────────
describe('6. Flujo crítico MVP (seña → webhook → slot)', () => {
  const A = '6. Flujo MVP';

  test('lock → preferencia de $2000 ARS → webhook aprobado ×2 secuencial → slot CONFIRMED y fuera de agenda', async () => {
    const slot = await mkSlot();
    const before = preferenceCalls.length;
    const lock = await http('POST', `/appointments/${slot.id}/lock`, { body: { dni: clientA.dni, password: PW } });
    const pref = preferenceCalls[before]?.body;
    const item = pref?.items?.[0];
    check(
      A,
      'Preferencia por seña exacta',
      lock.status === 201 && preferenceCalls.length === before + 1 &&
        pref.items.length === 1 && item.unit_price === 2000 && item.quantity === 1 && item.currency_id === 'ARS',
      `lock=${lock.status}, items=${pref?.items?.length}, unit_price=${item?.unit_price}, qty=${item?.quantity}, moneda=${item?.currency_id}`,
    );

    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(slot.id, clientA.id));
    const first = await webhook('7780001');
    await sleep(1500);
    const second = await webhook('7780001');
    await sleep(1500);
    const final = await getSlot(slot.id);
    const orphans = await prisma.orphanPayment.count({ where: { mp_payment_id: '7780001' } });
    check(
      A,
      'Mismo pago aprobado enviado 2 veces',
      first.status === 200 && second.status === 200 && final.status === 'CONFIRMED' &&
        final.mp_payment_id === '7780001' && confirmations(slot.id) === 1 && orphans === 0,
      `HTTP=${first.status},${second.status}, estado=${final.status}, confirmaciones=${confirmations(slot.id)}, orphans=${orphans}`,
    );

    const relock = await http('POST', `/appointments/${slot.id}/lock`, { body: { dni: clientB.dni, password: PW } });
    const agenda = await http('GET', `/appointments/public/${barber.slug}`);
    const listed = JSON.stringify(agenda.body ?? {}).includes(slot.id);
    const after = await getSlot(slot.id);
    check(
      A,
      'Slot pagado no vuelve a estar disponible',
      relock.status === 409 && agenda.status === 200 && !listed && after.client_id === clientA.id,
      `re-lock B=${relock.status}, agenda=${agenda.status}, aparece en agenda=${listed}, titular=${after.client_id === clientA.id ? 'A' : after.client_id}`,
    );
  });

  test('pago aprobado sobre slot inexistente → OrphanPayment SLOT_NOT_FOUND', async () => {
    const ghostId = crypto.randomUUID();
    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(ghostId, clientA.id));
    const r = await webhook('7780002');
    await sleep(1500);
    const orphan = await prisma.orphanPayment.findUnique({ where: { mp_payment_id: '7780002' } });
    check(
      A,
      'Pago huérfano (slot inexistente)',
      r.status === 200 && orphan?.reason === 'SLOT_NOT_FOUND' && orphan?.status === 'REQUIRES_REFUND' && orphan?.slot_id === ghostId,
      `HTTP=${r.status}, orphan=${orphan?.reason}/${orphan?.status}`,
    );
  });

  test('pago aprobado sobre slot CANCELLED → OrphanPayment SLOT_CANCELLED y slot intacto', async () => {
    const slot = await mkSlot({ status: 'CANCELLED' });
    jest.spyOn(mp, 'getPayment').mockImplementation(approvedPayment(slot.id, clientA.id));
    const r = await webhook('7780003');
    await sleep(1500);
    const final = await getSlot(slot.id);
    const orphan = await prisma.orphanPayment.findUnique({ where: { mp_payment_id: '7780003' } });
    check(
      A,
      'Pago huérfano (slot cancelado)',
      r.status === 200 && final.status === 'CANCELLED' && final.mp_payment_id === null &&
        orphan?.reason === 'SLOT_CANCELLED' && orphan?.status === 'REQUIRES_REFUND' && orphan?.client_id === clientA.id,
      `HTTP=${r.status}, slot=${final.status}, orphan=${orphan?.reason}/${orphan?.status}`,
    );
  });
});

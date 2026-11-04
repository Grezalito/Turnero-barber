import { formatSlotDateAr, formatSlotTimeAr, slotDurationMinutes } from './slot-time.util';

/**
 * Normaliza un teléfono argentino al formato que espera wa.me: 549 + código de área + número,
 * solo dígitos. Devuelve null si no se puede obtener un número plausible: en ese caso NO se
 * genera link (nunca se usa un número de relleno, que podría ser de un tercero real).
 */
export function normalizeArgentinaWhatsAppNumber(raw?: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) digits = digits.slice(2); // prefijo internacional 00
  if (digits.startsWith('54')) {
    digits = digits.slice(2);
    if (digits.startsWith('9')) digits = digits.slice(1);
  }
  if (digits.startsWith('0')) digits = digits.slice(1); // 011 → 11
  // Formato local con "15" tras un código de área de 2-4 dígitos (ej. 11 15 5566 7788)
  const local15 = digits.match(/^(\d{2,4})15(\d{6,8})$/);
  if (local15 && local15[1].length + local15[2].length === 10) {
    digits = local15[1] + local15[2];
  }

  // Número nacional argentino: 10 dígitos (código de área + abonado)
  if (digits.length !== 10) return null;
  return `549${digits}`;
}

export interface SlotMessageContext {
  clientName: string;
  clientPhone?: string | null;
  barberName: string;
  barberPhone?: string | null;
  shopName: string;
  startTime: Date;
  endTime: Date;
  depositAmountArs: number;
  manageUrl: string;
}

const ars = (amount: number) => `$${amount.toLocaleString('es-AR')}`;

/** Copy de confirmación para el cliente (formato acordado con negocio). */
export function buildClientConfirmationMessage(ctx: SlotMessageContext): string {
  return (
    `¡Hola ${ctx.clientName}! Ya tenés confirmada tu seña para el ${formatSlotDateAr(ctx.startTime)} ` +
    `a las ${formatSlotTimeAr(ctx.startTime)} con ${ctx.barberName} en ${ctx.shopName}. ` +
    `Agendalo o gestioná tu turno acá: ${ctx.manageUrl}`
  );
}

/** Aviso al barbero con el detalle del cliente y la seña abonada. */
export function buildBarberNotificationMessage(ctx: SlotMessageContext): string {
  const minutes = slotDurationMinutes(ctx.startTime, ctx.endTime);
  return [
    `Nuevo turno confirmado en ${ctx.shopName}`,
    `Cliente: ${ctx.clientName}`,
    `Teléfono: ${ctx.clientPhone || 'no informado'}`,
    `Servicio: Corte (${minutes} min)`,
    `Fecha: ${formatSlotDateAr(ctx.startTime)} a las ${formatSlotTimeAr(ctx.startTime)} hs`,
    `Seña abonada: ${ars(ctx.depositAmountArs)} ARS`,
  ].join('\n');
}

function waLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** Link que abre el chat con el CLIENTE con la confirmación prearmada (lo usa el barbero). */
export function buildClientConfirmationWhatsAppUrl(ctx: SlotMessageContext): string | null {
  const phone = normalizeArgentinaWhatsAppNumber(ctx.clientPhone);
  return phone ? waLink(phone, buildClientConfirmationMessage(ctx)) : null;
}

/** Link que abre el chat con el BARBERO con el detalle del turno (lo usa el cliente). */
export function buildBarberNotificationWhatsAppUrl(ctx: SlotMessageContext): string | null {
  const phone = normalizeArgentinaWhatsAppNumber(ctx.barberPhone);
  return phone ? waLink(phone, buildBarberNotificationMessage(ctx)) : null;
}

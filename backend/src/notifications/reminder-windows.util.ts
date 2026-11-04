import { instantToNominal } from './slot-time.util';

export type ReminderKind = '24h' | '2h';

export interface ReminderWindow {
  kind: ReminderKind;
  /** Columna de tracking que se "reclama" al enviar. */
  sentAtField: 'reminder_24h_sent_at' | 'reminder_2h_sent_at';
  /** Límites en hora NOMINAL (comparables directamente contra `start_time`), inclusivos. */
  fromNominal: Date;
  toNominal: Date;
}

const MIN = 60_000;

/**
 * Ventanas de recordatorio relativas al instante actual REAL:
 *  - 24 hs: turnos que empiezan entre 23h30 y 24h30 desde ahora.
 *  - 2 hs:  turnos que empiezan entre 1h45 y 2h15 desde ahora.
 * Con el cron cada 10 min, todo turno atraviesa cada ventana en al menos 3 corridas
 * (24 hs) o 3 corridas (2 hs), lo que tolera una corrida fallida o un reinicio.
 */
export function computeReminderWindows(now: Date): ReminderWindow[] {
  const at = (offsetMinutes: number) =>
    instantToNominal(new Date(now.getTime() + offsetMinutes * MIN));

  return [
    {
      kind: '24h',
      sentAtField: 'reminder_24h_sent_at',
      fromNominal: at(23 * 60 + 30),
      toNominal: at(24 * 60 + 30),
    },
    {
      kind: '2h',
      sentAtField: 'reminder_2h_sent_at',
      fromNominal: at(60 + 45),
      toNominal: at(2 * 60 + 15),
    },
  ];
}

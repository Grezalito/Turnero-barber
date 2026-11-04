import { api, getLockToken } from './api';

export type PushSupport =
  | 'supported'
  /** iOS/iPadOS solo permite Web Push si la PWA está instalada en la pantalla de inicio (iOS 16.4+). */
  | 'ios-needs-install'
  | 'unsupported';

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function getPushSupport(): PushSupport {
  const hasApis =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  return hasApis ? 'supported' : 'unsupported';
}

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export type EnablePushResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'ios-needs-install' | 'denied' | 'disabled' | 'no-token' | 'error'; message?: string };

/**
 * Pide permiso de notificaciones y registra este dispositivo para los recordatorios del turno.
 * DEBE llamarse desde un gesto del usuario (click): Safari y Firefox bloquean el pedido automático.
 */
export async function enablePushReminders(slotId: string): Promise<EnablePushResult> {
  const support = getPushSupport();
  if (support !== 'supported') return { ok: false, reason: support };

  const lockToken = getLockToken(slotId);
  if (!lockToken) return { ok: false, reason: 'no-token' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  try {
    const { enabled, public_key } = await api.getVapidPublicKey();
    if (!enabled || !public_key) return { ok: false, reason: 'disabled' };

    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(public_key),
      }));

    await api.subscribePush({ slotId, lockToken, subscription: subscription.toJSON() });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'error', message: (err as Error).message };
  }
}

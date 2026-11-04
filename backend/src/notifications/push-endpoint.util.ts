/**
 * Hosts de servicios Web Push de los navegadores. El servidor hace POST al endpoint que envía el
 * cliente, así que aceptar cualquier URL sería un vector SSRF (p. ej. http://169.254.169.254/...).
 */
const ALLOWED_PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome, Edge (Chromium), Android
  'updates.push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari / iOS (web.push.apple.com)
  'notify.windows.com', // Edge legacy / Windows (WNS)
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

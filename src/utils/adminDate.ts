/**
 * Date rendering that follows the ADMIN PANEL language, never the device.
 *
 * The panel's chrome comes from its own language toggle, but a bare
 * `toLocaleString()` follows the phone's system language, so an English
 * admin panel on a Russian-system phone showed Russian dates in the middle
 * of English UI. Native `<input type="date">` widgets have the same issue
 * and cannot be forced (browsers render them per device settings), which is
 * why date inputs also get a small echo of the chosen date formatted by
 * these helpers: the panel's own rendering stays authoritative on screen.
 */
import type { AdminLang } from '../i18n/admin';

export const adminLocale = (lang: AdminLang): string => (lang === 'ru' ? 'ru-RU' : 'en-US');

/** "2026-10-07" → "October 7, 2026" / "7 октября 2026 г." per panel language. */
export function fmtAdminDate(iso: string, lang: AdminLang): string {
  // A timestamp column arrives as "2027-11-07T04:00:00.000Z", which is
  // midnight in the studio's time zone. Read the day it is THERE, or the
  // split below finds no day and the raw string reaches the screen.
  if (/^\d{4}-\d{2}-\d{2}T/.test(iso)) {
    const t = new Date(iso);
    if (!Number.isNaN(t.getTime())) iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(t);
  }
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(adminLocale(lang), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Timestamp → "Sep 9, 11:35 AM" / "9 сент., 11:35" per panel language. */
export function fmtAdminDateTime(iso: string, lang: AdminLang): string {
  return new Date(iso).toLocaleString(adminLocale(lang), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

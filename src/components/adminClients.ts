/**
 * The Clients list, as data.
 *
 * Everything on this screen that is arithmetic rather than markup lives here:
 * the booking shape, the two formatters, the balance, the relative event day,
 * the gallery countdown, and the filter / search / sort that the working table
 * runs on.
 *
 * It is a separate module for two reasons.
 *
 * ONE: the balance. Before this file, the figure "what does this client still
 * owe" was derived inline in nine places across the panel, and each one had to
 * remember that charges_total is owed ON TOP of the contract total. Two of them
 * had forgotten. `balanceOf` is now the only place that knows, and the Money
 * cell, the Owes chip, the Overpaid chip, the money sort and the calendar's
 * unpaid dot all read it.
 *
 * TWO: the cycle. AdminDashboard renders AdminCalendarView, so the calendar
 * cannot import a value back out of the dashboard without a circular import at
 * module-init time. Both import from here instead, and neither imports from the
 * other at runtime.
 */

export interface AdminPortalSummary {
  id: string;
  mode: 'simple' | 'full';
  session_type: string | null;
  client_display_name: string | null;
  client_email: string | null;
  event_date: string | null;
  contract_status: 'none' | 'pending' | 'signed' | 'void';
  contract_signed_at: string | null;
  contract_total_amount: number | null;
  paid_to_date: number;
  // Extra time and costs added after the booking. Owed on top of the
  // contract total, so the balance line has to add it in.
  charges_total: number;
  drive_url: string | null;
  gallery_delivered_at: string | null;
  gallery_expires_at: string | null;
  gallery_password: string;
  gallery_enabled: boolean;
  pending_invite: boolean;
  created_at: string;
}

export type ClientFilter = 'all' | 'upcoming' | 'owes' | 'overpaid' | 'unsigned' | 'deliver';
export type ClientSortKey = 'date' | 'name' | 'money';
export type ClientSortDir = 'asc' | 'desc';
export interface ClientSort {
  key: ClientSortKey;
  dir: ClientSortDir;
}

/** The chip counts, in the order the chips render. */
export interface ClientCounts {
  all: number;
  upcoming: number;
  owes: number;
  overpaid: number;
  unsigned: number;
  deliver: number;
}

/** The shape of `t.clients.when`, so relativeDay can stay out of React. */
export interface WhenWords {
  today: string;
  tomorrow: string;
  yesterday: string;
  inDays: (n: number) => string;
  daysAgo: (n: number) => string;
  inWeeks: (n: number) => string;
  weeksAgo: (n: number) => string;
  inMonths: (n: number) => string;
  monthsAgo: (n: number) => string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const formatDate = (iso: string | null): string => {
  // No long dashes, anywhere. An empty cell reads as empty on its own, and this
  // one renders straight onto the Clients list for any booking with no date.
  if (!iso) return '';
  // event_date is a DATE column, so it comes back as 'YYYY-MM-DD' or as a full
  // ISO timestamp at midnight UTC. Parsing with `new Date(...)` then formatting
  // without timeZone='UTC' converts to the viewer's local timezone, which
  // slides date-only values back a day in any negative offset. Force UTC
  // formatting so the date that gets typed is the date that gets shown.
  const at = eventDayUtc(iso);
  if (at === null) return iso;
  return new Date(at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

export const formatMoney = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '';
  // Thousands separator. A four-figure wedding was printing as $3200, which
  // reads as a phone number for the half second before you parse it.
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

/**
 * The event date as the UTC midnight of the calendar day that was typed.
 * Everything that compares dates on this screen goes through this, for the
 * reason formatDate gives: local Date math on a date-only column slides a day
 * in any negative offset, and "in 1 day" versus "Today" is exactly where that
 * shows up.
 */
export const eventDayUtc = (iso: string | null): number | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
};

/** Today's calendar day, as the same UTC midnight value eventDayUtc returns. */
export const todayDayUtc = (): number => {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
};

/**
 * What this client still owes: the contract total, PLUS anything charged after
 * the booking, MINUS what they have paid. Null when there is no contract total,
 * because a gallery-only booking has no balance to report.
 *
 * Negative means they sent more than the booking asks for. That case is the
 * reason this exists: the old balance line collapsed `remaining <= 0` into one
 * branch and printed "Paid $600" for a client who had paid $670.
 *
 * Cents, then back to dollars, so a float sum of 3200 + 150.5 - 3350.5 cannot
 * land on 0.00000001 and report a debt.
 */
export const balanceOf = (p: AdminPortalSummary): number | null => {
  if (p.contract_total_amount === null) return null;
  const owed = Math.round(p.contract_total_amount * 100) + Math.round((p.charges_total ?? 0) * 100);
  return (owed - Math.round(p.paid_to_date * 100)) / 100;
};

/** What the booking asks for in total: contract plus later charges. */
export const bookingTotal = (p: AdminPortalSummary): number | null =>
  p.contract_total_amount === null
    ? null
    : (Math.round(p.contract_total_amount * 100) + Math.round((p.charges_total ?? 0) * 100)) / 100;

/**
 * Days until the delivered gallery's link expires. Negative once it has.
 * Null when the gallery has no expiry set.
 */
export const galleryDaysLeft = (p: AdminPortalSummary): number | null => {
  if (!p.gallery_expires_at) return null;
  const at = new Date(p.gallery_expires_at).getTime();
  if (!Number.isFinite(at)) return null;
  return Math.ceil((at - Date.now()) / DAY_MS);
};

/** "in 13 days" / "7 days ago" / "3 weeks ago" / "2 months ago" / "Today". */
export const relativeDay = (iso: string | null, w: WhenWords): string => {
  const at = eventDayUtc(iso);
  if (at === null) return '';
  const days = Math.round((at - todayDayUtc()) / DAY_MS);
  if (days === 0) return w.today;
  if (days === 1) return w.tomorrow;
  if (days === -1) return w.yesterday;
  const abs = Math.abs(days);
  const future = days > 0;
  if (abs < 14) return future ? w.inDays(abs) : w.daysAgo(abs);
  if (abs < 60) {
    const weeks = Math.round(abs / 7);
    return future ? w.inWeeks(weeks) : w.weeksAgo(weeks);
  }
  const months = Math.max(2, Math.round(abs / 30));
  return future ? w.inMonths(months) : w.monthsAgo(months);
};

/** Has the shoot happened? Undated bookings count as past: nothing is waiting. */
const isPastOrUndated = (p: AdminPortalSummary): boolean => {
  const at = eventDayUtc(p.event_date);
  return at === null || at <= todayDayUtc();
};

/** Does this booking belong under that chip? One predicate, used for the
 *  counts and for the filter, so a chip can never report a number it then
 *  fails to show. */
export const matchesFilter = (p: AdminPortalSummary, f: ClientFilter): boolean => {
  switch (f) {
    case 'all':
      return true;
    case 'upcoming': {
      const at = eventDayUtc(p.event_date);
      return at !== null && at >= todayDayUtc();
    }
    case 'owes': {
      const b = balanceOf(p);
      return b !== null && b > 0;
    }
    case 'overpaid': {
      const b = balanceOf(p);
      return b !== null && b < 0;
    }
    case 'unsigned':
      // Gallery-only bookings have no contract, so they are not unsigned,
      // they are out of scope. A void contract is not waiting on a signature
      // either: it is waiting on a decision, and that is a different chip we
      // do not have yet.
      return p.mode === 'full' && (p.contract_status === 'none' || p.contract_status === 'pending');
    case 'deliver':
      return !p.gallery_delivered_at && isPastOrUndated(p);
    default:
      return true;
  }
};

export const countFilters = (portals: AdminPortalSummary[]): ClientCounts => {
  const counts: ClientCounts = { all: portals.length, upcoming: 0, owes: 0, overpaid: 0, unsigned: 0, deliver: 0 };
  for (const p of portals) {
    if (matchesFilter(p, 'upcoming')) counts.upcoming++;
    if (matchesFilter(p, 'owes')) counts.owes++;
    if (matchesFilter(p, 'overpaid')) counts.overpaid++;
    if (matchesFilter(p, 'unsigned')) counts.unsigned++;
    if (matchesFilter(p, 'deliver')) counts.deliver++;
  }
  return counts;
};

/** Name, email, session type. Nothing else: a search that also matched the
 *  gallery password would hand out passwords to anyone typing near one. */
export const matchesQuery = (p: AdminPortalSummary, q: string): boolean => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [p.client_display_name, p.client_email, p.session_type]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .some((v) => v.toLowerCase().includes(needle));
};

/** The name a row is sorted and searched by. */
const nameOf = (p: AdminPortalSummary): string =>
  (p.client_display_name || p.client_email || '').trim();

/**
 * Sort, filter, search. In that order, and returning a NEW array: the caller
 * hands this straight to the prev/next walker on the client screen, so the
 * order that comes out of here is the order those two buttons follow.
 *
 * Bookings with nothing to sort BY sort last in every mode and in both
 * directions. An undated booking is not "the earliest" and it is not "the
 * latest"; it is unplaced, and flipping the arrow should not march it through
 * the middle of the list.
 */
export const selectVisible = (
  portals: AdminPortalSummary[],
  filter: ClientFilter,
  query: string,
  sort: ClientSort,
  lang: string,
): AdminPortalSummary[] => {
  const rows = portals.filter((p) => matchesFilter(p, filter) && matchesQuery(p, query));

  const placed: AdminPortalSummary[] = [];
  const unplaced: AdminPortalSummary[] = [];
  for (const p of rows) {
    const has =
      sort.key === 'date' ? eventDayUtc(p.event_date) !== null
      : sort.key === 'money' ? balanceOf(p) !== null
      : nameOf(p) !== '';
    (has ? placed : unplaced).push(p);
  }

  const today = todayDayUtc();
  const collator = new Intl.Collator(lang === 'ru' ? 'ru' : 'en', { sensitivity: 'base', numeric: true });

  placed.sort((a, b) => {
    if (sort.key === 'name') return collator.compare(nameOf(a), nameOf(b));
    if (sort.key === 'money') {
      // Ascending means "furthest into credit first", so descending, which is
      // what a click on Money gives you, puts the largest debt at the top.
      return (balanceOf(a) as number) - (balanceOf(b) as number);
    }
    // Date, ascending, is the agenda order: the next shoot first, then the
    // rest of the future in order, then the past with the most recent shoot
    // directly under today's line. Not a plain ascending sort, because a plain
    // one opens the screen on a wedding from two years ago.
    const av = eventDayUtc(a.event_date) as number;
    const bv = eventDayUtc(b.event_date) as number;
    const aFuture = av >= today;
    const bFuture = bv >= today;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    return aFuture ? av - bv : bv - av;
  });

  if (sort.dir === 'desc') placed.reverse();
  return [...placed, ...unplaced];
};

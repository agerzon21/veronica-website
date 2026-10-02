/**
 * The tax dates Vero Photography files on, with what to do for each: the
 * Taxes page (src/components/AdminTax.tsx) lists them, and the daily reminder
 * job (api/cron/_tax-reminders.ts) emails Alex before each one.
 *
 * ONLY WHAT HAS TO BE FILED. The quarterly PA sales tax return is required
 * (late fees otherwise), and the yearly returns are due in April. Quarterly
 * income tax prepayments (federal 1040-ES, local DQ-1) are deliberately NOT
 * listed: Alex pays income tax once a year with the returns (decided
 * 2026-10-02), and the guide (tax-guide.ts) says what that costs. Don't add
 * them back, or a 1099 or gear reminder, without asking him.
 *
 * DATED, NOT DERIVED. Due dates move for weekends and holidays and some only
 * apply in some cases, so each is written out with its source checked
 * (2026-10-01), rather than computed by a rule that would be right most years.
 * Add the next year's dates each autumn; the page says when the list is
 * running out.
 *
 * Imports nothing: api/ reaches this file (scripts/check-api-imports.mjs).
 */

export type L = { en: string; ru: string };
export type TaxKind = 'sales' | 'federal' | 'pa' | 'local';

export interface TaxDeadline {
  /** Stable: the done marks and the reminders are kept against it. */
  key: string;
  /** YYYY-MM-DD, already moved off weekends and holidays. */
  due: string;
  kind: TaxKind;
  title: L;
  /** What to file or pay, and how, in a sentence or two. */
  detail: L;
  link?: { label: L; href: string };
  /** Sales tax only: the quarter this return covers, read against "Mark filed". */
  salesPeriod?: string;
  /** When it applies only in some cases, the case. */
  onlyIf?: L;
}

const MYPATH = { label: { en: 'myPATH', ru: 'myPATH' }, href: 'https://mypath.pa.gov' };

const salesReturn = (period: string, due: string, months: L): TaxDeadline => ({
  key: `pa-sales-${period}`,
  due,
  kind: 'sales',
  salesPeriod: period,
  title: {
    en: `PA sales tax return, ${period.replace('-', ' ')}`,
    ru: `Декларация по налогу с продаж PA, ${period.replace('-', ' ')}`,
  },
  detail: {
    en: `File and pay in myPATH for ${months.en}. The three numbers are on this page under Sales tax by quarter. On time, PA takes 1% off as a vendor discount.`,
    ru: `Подать и оплатить в myPATH за ${months.ru}. Три цифры на этой странице в разделе «Налог с продаж по кварталам». Если вовремя, PA даёт скидку продавца 1%.`,
  },
  link: MYPATH,
});

const BERKHEIMER = { label: { en: 'Berkheimer', ru: 'Berkheimer' }, href: 'https://www.hab-inc.com' };
// Home and work are both Clifton Township (North Pocono School District):
// 1% earned income tax, paid once a year with the F-1 (Alex's choice,
// 2026-10-02, over quarterly DQ-1 prepayments), and no Local Services or
// business tax of its own (DCED register and the township code, checked
// 2026-10-02). Scranton's own taxes reach only work done inside the city, so
// they are not listed here; the guide (tax-guide.ts) says what to ask if she
// photographs clients there.

export const TAX_DEADLINES: TaxDeadline[] = [
  // ── Pennsylvania sales tax ──
  // Q3 2026 was filed on 2026-10-01; listed so that, until it is marked filed
  // on the licence card, the reminders say so. Q2 2026 (due Jul 20, filed the
  // same day) is left off: listing a past, filed return would only send an
  // "overdue" email on the first run.
  salesReturn('2026-Q3', '2026-10-20', { en: 'July to September 2026', ru: 'июль, август и сентябрь 2026' }),
  salesReturn('2026-Q4', '2027-01-20', { en: 'October to December 2026', ru: 'октябрь, ноябрь и декабрь 2026' }),
  salesReturn('2027-Q1', '2027-04-20', { en: 'January to March 2027', ru: 'январь, февраль и март 2027' }),
  salesReturn('2027-Q2', '2027-07-20', { en: 'April to June 2027', ru: 'апрель, май и июнь 2027' }),
  salesReturn('2027-Q3', '2027-10-20', { en: 'July to September 2027', ru: 'июль, август и сентябрь 2027' }),

  // ── The yearly returns, April 15 ──
  {
    key: 'fed-return-2026',
    due: '2027-04-15',
    kind: 'federal',
    title: { en: '2026 federal return, or an extension', ru: 'Федеральная декларация за 2026 или продление' },
    detail: {
      en: 'Form 1040 with Schedule C and Schedule SE (self-employment tax is due once profit reaches $400), and Form 8995 for the QBI deduction. Form 4868 extends filing to Oct 15, not paying. Also the last day for a SEP contribution without an extension.',
      ru: 'Форма 1040 со Schedule C и Schedule SE (налог на самозанятость при прибыли от $400) и форма 8995 для вычета QBI. Форма 4868 продлевает подачу до 15 октября, но не оплату. Также последний день для взноса SEP без продления.',
    },
    link: { label: { en: 'IRS: Schedule C', ru: 'IRS: Schedule C' }, href: 'https://www.irs.gov/forms-pubs/about-schedule-c-form-1040' },
  },
  {
    key: 'pa-return-2026',
    due: '2027-04-15',
    kind: 'pa',
    title: { en: '2026 PA income tax return (PA-40)', ru: 'Декларация по налогу на доход PA за 2026 (PA-40)' },
    detail: {
      en: '3.07% of the PA Schedule C profit, which differs from the federal one (no bonus depreciation, no simplified home office, no self-employment tax deduction). At a low income, Tax Forgiveness (Schedule SP) can wipe it out.',
      ru: '3.07% от прибыли по PA Schedule C, которая отличается от федеральной (нет бонусной амортизации, нет упрощённого домашнего офиса, нет вычета налога на самозанятость). При низком доходе Tax Forgiveness (Schedule SP) может обнулить налог.',
    },
    link: MYPATH,
  },
  {
    key: 'local-eit-return-2026',
    due: '2027-04-15',
    kind: 'local',
    title: { en: '2026 Clifton Township earned income tax return (Berkheimer F-1)', ru: 'Годовая декларация по налогу на заработок Clifton Township за 2026 (Berkheimer F-1)' },
    detail: {
      en: 'The whole year\'s local tax in one go: 1% of her PA profit (Clifton Township 0.5% plus North Pocono School District 0.5%), PSD code 350601. Due even if nothing is owed. Attach the PA Schedule C, since local tax is figured on the PA profit, not the federal one. It can be filed jointly with yours, but the two incomes are not combined.',
      ru: 'Местный налог за весь год сразу: 1% от прибыли по правилам PA (Clifton Township 0.5% и North Pocono School District 0.5%), код PSD 350601. Подаётся, даже если налог не причитается. Приложить PA Schedule C: местный налог считается от прибыли по правилам PA, а не федеральной. Можно подать вместе с твоей, но доходы не складываются.',
    },
    link: BERKHEIMER,
  },
];

/** Today in Eastern time, YYYY-MM-DD: a UTC date is tomorrow from 8 PM Eastern. */
export function easternToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Whole days from one YYYY-MM-DD to another; negative once it has passed. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * Done when it was marked done or, for a sales tax return, when the licence
 * card's "Mark filed" has reached its quarter ("2026-Q4" sorts after "2026-Q3", so a plain
 * comparison is right).
 */
export function deadlineIsDone(
  d: TaxDeadline,
  done: Record<string, unknown>,
  lastFiledPeriod: string | null,
): boolean {
  if (d.salesPeriod) return Boolean(lastFiledPeriod && lastFiledPeriod >= d.salesPeriod);
  return Boolean(done[d.key]);
}

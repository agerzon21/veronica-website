/**
 * Every tax deadline that applies to Vero Photography, with what to do for
 * each: the Taxes page (src/components/AdminTax.tsx) lists them, and the daily
 * reminder job (api/cron/_tax-reminders.ts) emails Alex before each one.
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
export type TaxKind = 'sales' | 'federal' | 'pa' | 'local' | 'records';

/**
 * A recurring tax that applies only in some cases. "Doesn't apply" on the
 * Taxes page switches off every date in the series at once, including the
 * ones added next autumn, so a tax that is not hers stops emailing Alex.
 */
export type TaxSeries = 'lst' | 'ppt' | 'estimates';

export const TAX_SERIES: Record<TaxSeries, L> = {
  lst: { en: 'Scranton Local Services Tax', ru: 'Местный налог Скрантона (LST)' },
  ppt: { en: 'Scranton Payroll Preparation Tax', ru: 'Налог Скрантона PPT' },
  estimates: { en: 'Federal estimated tax', ru: 'Федеральный авансовый налог' },
};

/** How a switched-off series is kept among the done marks. */
export const seriesKey = (s: TaxSeries): string => `series:${s}`;

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
  /** Part of a recurring tax that can be switched off as a whole. */
  series?: TaxSeries;
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

const IRS_PAY = { label: { en: 'IRS Direct Pay', ru: 'IRS Direct Pay' }, href: 'https://www.irs.gov/payments/direct-pay' };
const BERKHEIMER = { label: { en: 'Berkheimer', ru: 'Berkheimer' }, href: 'https://www.hab-inc.com' };
const SCRANTON_TAX_OFFICE = { label: { en: 'Scranton Single Tax Office', ru: 'Налоговый офис Скрантона' }, href: 'https://scrantontaxoffice.org' };
const PPT_FORMS = { label: { en: 'PPT forms (Berkheimer)', ru: 'Формы PPT (Berkheimer)' }, href: 'https://www.hab-inc.com/pptforms/' };

// She lives and works from home in Clifton Township (North Pocono School
// District): 1% earned income tax, and no LST or business tax of its own
// (DCED register and the township code, checked 2026-10-02). Scranton's two
// taxes reach only the sessions she does inside the city.
const WORKS_IN_SCRANTON_LST: L = {
  en: 'she works inside Scranton city. Clifton Township has no LST, and whether Scranton collects for occasional sessions is unconfirmed: ask the Single Tax Office, (570) 963-6756 ext. 3112. With Scranton earnings under $15,600 a year, the exemption certificate leaves only the school district\'s $5.',
  ru: 'она работает в черте Скрантона. В Clifton Township налога LST нет, а берёт ли его Скрантон за отдельные съёмки, не подтверждено: спроси в Single Tax Office, (570) 963-6756 доб. 3112. Если заработок в Скрантоне меньше $15,600 за год, заявление об освобождении оставляет только $5 школьного округа.',
};
const SHOOTS_IN_SCRANTON: L = {
  en: 'she photographs clients inside Scranton city limits. The city counts even one day of work there, and the tax is only on the profit from that work. Ask Berkheimer, (610) 599-3140, how to split it out and whether a quarter with no Scranton work needs a zero return.',
  ru: 'она снимает клиентов в черте Скрантона. Город считает даже один день работы, а налог берётся только с прибыли от этой работы. Спроси в Berkheimer, (610) 599-3140, как её выделять и нужна ли нулевая декларация за квартал без работы в Скрантоне.',
};
const OWES_1000: L = {
  en: 'your joint federal tax, less withholding, will reach $1,000 or more. Either way there is no penalty if withholding from your pay this year covers your total tax for last year (110% of it if last year\'s income passed $150,000).',
  ru: 'ваш совместный федеральный налог за вычетом удержаний составит $1,000 или больше. В любом случае штрафа нет, если удержания из твоей зарплаты в этом году покрывают весь налог за прошлый год (110%, если доход за прошлый год больше $150,000).',
};

const lstQuarter = (key: string, due: string, quarter: L): TaxDeadline => ({
  key,
  due,
  kind: 'local',
  title: { en: `Scranton Local Services Tax, ${quarter.en}`, ru: `Местный налог Скрантона (LST), ${quarter.ru}` },
  detail: {
    en: '$39 for the quarter ($156 a year), mailed with the self-employed quarterly form to Collector of Taxes, PO Box 20111, Scranton PA 18502.',
    ru: '$39 за квартал ($156 в год), по почте с квартальной формой для самозанятых: Collector of Taxes, PO Box 20111, Scranton PA 18502.',
  },
  link: SCRANTON_TAX_OFFICE,
  onlyIf: WORKS_IN_SCRANTON_LST,
  series: 'lst',
});

const eitEstimate = (key: string, due: string, quarter: L): TaxDeadline => ({
  key,
  due,
  kind: 'local',
  title: { en: `Local earned income tax estimate, ${quarter.en}`, ru: `Местный налог на доход, авансовый платёж, ${quarter.ru}` },
  detail: {
    en: 'Berkheimer form DQ-1 on her net profit, at 1% (Clifton Township 0.5% plus North Pocono School District 0.5%), with PSD code 350601 for both home and work. Sessions in Scranton don\'t change it. There is no income threshold, and a $0 estimate avoids interest. Berkheimer\'s form says the end of the month, the statute says the 15th: paying by the 15th satisfies both.',
    ru: 'Форма Berkheimer DQ-1 на чистую прибыль по ставке 1% (Clifton Township 0.5% и North Pocono School District 0.5%), код PSD 350601 и для дома, и для работы. Съёмки в Скрантоне ставку не меняют. Порога дохода нет, а нулевая декларация избавляет от процентов. Berkheimer пишет «конец месяца», закон пишет «15 число»: заплатить до 15-го подходит для обоих.',
  },
  link: BERKHEIMER,
});

const pptQuarter = (key: string, due: string, quarter: L): TaxDeadline => ({
  key,
  due,
  kind: 'local',
  title: { en: `Scranton Payroll Preparation Tax, ${quarter.en}`, ru: `Налог Скрантона PPT, ${quarter.ru}` },
  detail: {
    en: '1.034% (city 0.2787% plus school district 0.7553%) of the profit from work done inside Scranton, or of her draws if those are less. It replaced the city\'s Business Privilege and Mercantile taxes in 2022 and covers a sole proprietor working alone. Register once with Berkheimer, then file each quarter.',
    ru: '1.034% (город 0.2787% и школьный округ 0.7553%) от прибыли с работы в черте Скрантона или от изъятий, если они меньше. Заменил городские налоги на деловые привилегии и торговлю в 2022 и касается ИП, работающего в одиночку. Один раз зарегистрироваться в Berkheimer, затем подавать каждый квартал.',
  },
  link: PPT_FORMS,
  onlyIf: SHOOTS_IN_SCRANTON,
  series: 'ppt',
});

const estimates = (key: string, due: string, quarter: L, withPA: boolean): TaxDeadline => ({
  key,
  due,
  kind: 'federal',
  title: {
    en: `Estimated income tax, ${quarter.en}${withPA ? ': federal, and PA if required' : ''}`,
    ru: `Авансовый налог на доход, ${quarter.ru}${withPA ? ': федеральный, и PA если требуется' : ''}`,
  },
  detail: {
    en: `Federal Form 1040-ES, paid through IRS Direct Pay.${withPA ? ' PA (PA-40 ES) only if her PA income not withheld is $17,000 or more for 2027.' : ''}`,
    ru: `Федеральная форма 1040-ES, оплата через IRS Direct Pay.${withPA ? ' PA (PA-40 ES) только если её доход без удержаний в PA за 2027 будет $17,000 или больше.' : ''}`,
  },
  link: IRS_PAY,
  onlyIf: OWES_1000,
  series: 'estimates',
});

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

  // ── Scranton and local ──
  eitEstimate('local-eit-2026-q3', '2026-10-15', { en: 'Q3 2026', ru: '3 квартал 2026' }),
  lstQuarter('local-lst-2026-q3', '2026-10-30', { en: 'Q3 2026', ru: '3 квартал 2026' }),
  pptQuarter('local-ppt-2026-q3', '2026-11-30', { en: 'Q3 2026', ru: '3 квартал 2026' }),
  eitEstimate('local-eit-2026-q4', '2027-01-15', { en: 'Q4 2026', ru: '4 квартал 2026' }),
  lstQuarter('local-lst-2026-q4', '2027-01-29', { en: 'Q4 2026', ru: '4 квартал 2026' }),
  pptQuarter('local-ppt-2026-q4', '2027-02-26', { en: 'Q4 2026', ru: '4 квартал 2026' }),
  {
    key: 'local-eit-return-2026',
    due: '2027-04-15',
    kind: 'local',
    title: { en: '2026 local earned income tax return (Berkheimer F-1)', ru: 'Годовая декларация по местному налогу на доход за 2026 (Berkheimer F-1)' },
    detail: {
      en: 'Due even if no tax is owed. Attach the PA Schedule C: local tax is figured on the PA profit, not the federal one. It can be filed jointly with yours, but the two incomes are not combined.',
      ru: 'Подаётся, даже если налог не причитается. Приложить PA Schedule C: местный налог считается от прибыли по правилам PA, а не федеральной. Можно подать вместе с твоей, но доходы не складываются.',
    },
    link: BERKHEIMER,
  },
  eitEstimate('local-eit-2027-q1', '2027-04-15', { en: 'Q1 2027', ru: '1 квартал 2027' }),
  lstQuarter('local-lst-2027-q1', '2027-04-30', { en: 'Q1 2027', ru: '1 квартал 2027' }),
  pptQuarter('local-ppt-2027-q1', '2027-05-28', { en: 'Q1 2027', ru: '1 квартал 2027' }),
  eitEstimate('local-eit-2027-q2', '2027-07-15', { en: 'Q2 2027', ru: '2 квартал 2027' }),
  lstQuarter('local-lst-2027-q2', '2027-07-30', { en: 'Q2 2027', ru: '2 квартал 2027' }),
  pptQuarter('local-ppt-2027-q2', '2027-08-31', { en: 'Q2 2027', ru: '2 квартал 2027' }),
  eitEstimate('local-eit-2027-q3', '2027-10-15', { en: 'Q3 2027', ru: '3 квартал 2027' }),
  lstQuarter('local-lst-2027-q3', '2027-10-29', { en: 'Q3 2027', ru: '3 квартал 2027' }),
  pptQuarter('local-ppt-2027-q3', '2027-11-30', { en: 'Q3 2027', ru: '3 квартал 2027' }),

  // ── Federal and Pennsylvania income tax ──
  {
    key: 'records-gear-2026',
    due: '2026-12-31',
    kind: 'records',
    title: { en: 'Gear for 2026 in use by Dec 31', ru: 'Оборудование для 2026 в работе до 31 декабря' },
    detail: {
      en: 'Equipment counts for the 2026 return only if it is bought AND in use by the end of the year. Keep each invoice with the date it went into use.',
      ru: 'Оборудование учитывается в декларации за 2026, только если куплено И начало использоваться до конца года. Храни каждый счёт с датой начала использования.',
    },
  },
  {
    key: 'fed-est-2026-q4',
    due: '2027-01-15',
    kind: 'federal',
    title: { en: 'Federal estimated tax, Q4 2026', ru: 'Федеральный авансовый налог, 4 квартал 2026' },
    detail: {
      en: 'Form 1040-ES through IRS Direct Pay. It can be skipped by filing the 2026 return and paying in full by Feb 1, 2027.',
      ru: 'Форма 1040-ES через IRS Direct Pay. Можно пропустить, если подать декларацию за 2026 и заплатить всё до 1 февраля 2027.',
    },
    link: IRS_PAY,
    onlyIf: OWES_1000,
    series: 'estimates',
  },
  {
    key: 'fed-1099nec-2026',
    due: '2027-01-29',
    kind: 'federal',
    title: { en: '1099-NEC for second shooters, 2026', ru: '1099-NEC для вторых фотографов за 2026' },
    detail: {
      en: 'To each person paid $2,000 or more in 2026 by Zelle, cash or check, and to the IRS, by Feb 1 (filed through IRIS); a copy to PA through myPATH by Jan 29. Card and Venmo business payments are reported by the platform instead. Get a W-9 before paying anyone.',
      ru: 'Каждому, кому заплатили $2,000 или больше за 2026 через Zelle, наличными или чеком, и в IRS до 1 февраля (через IRIS); копия в PA через myPATH до 29 января. Платежи картой и деловым Venmo отчитывает сама платформа. Перед оплатой бери у человека W-9.',
    },
    onlyIf: { en: 'she paid one person $2,000 or more that way in 2026.', ru: 'она заплатила одному человеку $2,000 или больше таким способом за 2026.' },
  },
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
  estimates('est-2027-q1', '2027-04-15', { en: 'Q1 2027', ru: '1 квартал 2027' }, true),
  estimates('est-2027-q2', '2027-06-15', { en: 'Q2 2027', ru: '2 квартал 2027' }, true),
  estimates('est-2027-q3', '2027-09-15', { en: 'Q3 2027', ru: '3 квартал 2027' }, true),
  estimates('est-2027-q4', '2028-01-18', { en: 'Q4 2027', ru: '4 квартал 2027' }, true),
];

/** Today in Scranton, YYYY-MM-DD: a UTC date is tomorrow from 8 PM Eastern. */
export function easternToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Whole days from one YYYY-MM-DD to another; negative once it has passed. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * Done when it was marked done, or its whole series was marked as not
 * applying, or, for a sales tax return, when the licence card's "Mark filed"
 * has reached its quarter ("2026-Q4" sorts after "2026-Q3", so a plain
 * comparison is right).
 */
export function deadlineIsDone(
  d: TaxDeadline,
  done: Record<string, unknown>,
  lastFiledPeriod: string | null,
): boolean {
  if (d.salesPeriod) return Boolean(lastFiledPeriod && lastFiledPeriod >= d.salesPeriod);
  if (d.series && done[seriesKey(d.series)]) return true;
  return Boolean(done[d.key]);
}

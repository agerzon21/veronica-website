/**
 * The 2026 return, as a checklist on the Taxes page (src/components/AdminTax.tsx).
 *
 * SOURCED, AND DATED. Checked on 2026-10-01 against the IRS (Rev. Proc. 2025-32,
 * the 2026 Form 1040-ES, Notice 2026-10, the Schedule C and 2210 instructions),
 * PA Revenue (REV-413(I) 2026, PA-40 Schedule C, REV-717, the PIT Guide), the
 * City of Scranton and Berkheimer (PPT FAQ, EIT forms) and DCED's 2026 local
 * tax register. Anything the research could not confirm is left out or says
 * "ask the preparer". Refresh it each autumn with the deadlines in
 * tax-calendar.ts.
 *
 * English points only: the page is super admin only, read by Alex, and the
 * headings carry both languages. `ru` is optional and falls back to English.
 */

export type L = { en: string; ru?: string };

export interface TaxGuideSection {
  title: L;
  points: L[];
  links?: Array<{ label: L; href: string }>;
}

export const TAX_GUIDE: { title: L; intro: L; sections: TaxGuideSection[]; disclaimer: L } = {
  title: { en: 'The 2026 return, filed in spring 2027', ru: 'Декларация за 2026, подаётся весной 2027' },
  intro: {
    en: 'Vero files as a sole proprietor: one federal return, one Pennsylvania return and local returns, all built on the business profit. Three facts change several answers below: whether she is married (and files jointly), where she lives, and whether anyone she pays is an employee.',
    ru: 'Вера подаёт как ИП: федеральная декларация, декларация PA и местные, все от прибыли бизнеса. Три вещи меняют ответы ниже: замужем ли она (и подаёт ли совместно), где она живёт, и есть ли у неё сотрудники.',
  },
  sections: [
    {
      title: { en: 'Possibly missed earlier in 2026', ru: 'Что могли пропустить ранее в 2026' },
      points: [
        { en: 'Scranton Payroll Preparation Tax for Q2 2026 (Apr to Jun, due Aug 31), and Q1 if she earned anything before April. Zero returns are required too, and she needs to be registered with Berkheimer first.' },
        { en: 'Local earned income tax estimates (Berkheimer DQ-1) for Q1 and Q2 2026, and the Scranton Local Services Tax for Q1 and Q2 if it applies. Collectors must send a 30-day notice before any penalty, and no penalty applies for a missed estimate when the annual return shows nothing owed.' },
        { en: 'Federal estimated tax for 2026 (Apr 15, Jun 15, Sep 15) only matter if her 2026 federal tax after withholding will reach $1,000, and not at all if she owed no federal tax for 2025. If they do matter, the penalty grows daily, so paying now keeps it small.' },
        { en: 'A small bill for the late Q2 2026 sales tax return may still come by mail: about 15% of the $45 plus interest.' },
      ],
      links: [
        { label: { en: 'Scranton PPT FAQ', ru: 'Вопросы о PPT Скрантона' }, href: 'https://scrantonpa.gov/wp-content/uploads/2022/05/SCRANTONPPTFAQ.pdf' },
        { label: { en: 'Berkheimer', ru: 'Berkheimer' }, href: 'https://www.hab-inc.com' },
      ],
    },
    {
      title: { en: 'Federal', ru: 'Федеральный налог' },
      points: [
        { en: 'Forms: 1040 with Schedule C (the business), Schedule SE (self-employment tax), Schedule 1, and Form 8995 for the QBI deduction. Form 4562 if gear is depreciated.' },
        { en: 'Self-employment tax: 15.3% of 92.35% of the profit, once the profit reaches $400. Half of it is deducted from income.' },
        { en: 'QBI deduction: 20% of the business profit, now permanent, with a $400 minimum when the profit is at least $1,000.' },
        { en: 'Standard deduction for 2026: $16,100 single, $32,200 married filing jointly. 10% bracket up to $12,400 single, $24,800 joint.' },
        { en: 'Tips: Treasury\'s list for the new tips deduction (2025 to 2028, up to $25,000) includes private event and portrait photographers. How a self-employed photographer documents tips is not settled: ask the preparer. Married people must file jointly to use it, and PA taxes tips in full.' },
        { en: 'Due Thursday April 15, 2027. Form 4868 extends filing to Oct 15, not paying.' },
      ],
      links: [
        { label: { en: 'Schedule C instructions', ru: 'Инструкция к Schedule C' }, href: 'https://www.irs.gov/instructions/i1040sc' },
        { label: { en: 'Form 1040-ES (2026)', ru: 'Форма 1040-ES (2026)' }, href: 'https://www.irs.gov/pub/irs-pdf/f1040es.pdf' },
      ],
    },
    {
      title: { en: 'Pennsylvania', ru: 'Пенсильвания' },
      points: [
        { en: '3.07% of the PA Schedule C profit, filed on the PA-40 by April 15, 2027. The PA Schedule C is required even when the numbers match the federal one.' },
        { en: 'PA profit is NOT the federal profit: no QBI, no bonus depreciation (Section 179 is allowed), no simplified home office (actual costs only), no deduction for self-employment tax, her own health insurance or her own retirement contributions. Meals count at 100%, not 50%.' },
        { en: 'A business loss cannot offset wages and cannot be carried forward in PA.' },
        { en: 'PA estimated payments are only needed for 2026 if her PA income without withholding reaches $14,000 ($17,000 for 2027).' },
        { en: 'At a low income, Tax Forgiveness (Schedule SP) can erase the PA tax: 100% under $6,500 eligibility income single, $13,000 married. The new Working Pennsylvanians credit pays 10% of any federal earned income credit.' },
      ],
      links: [{ label: { en: 'PA Schedule C instructions', ru: 'Инструкция к PA Schedule C' }, href: 'https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/pa-40c.pdf' }],
    },
    {
      title: { en: 'Scranton and local', ru: 'Скрантон и местные налоги' },
      points: [
        { en: 'Earned income tax on the PA profit, collected by Berkheimer: 3.4% if she lives in Scranton city, 1% in Dunmore or Clarks Summit. Quarterly estimates on form DQ-1, then the annual F-1 by April 15, 2027.' },
        { en: 'Payroll Preparation Tax: Scranton\'s replacement (since 2022) for the Business Privilege and Mercantile taxes. 1.034% of draws or net income, whichever is less, for anyone doing business in the city, sole proprietors included. Quarterly, with zero returns required.' },
        { en: 'Local Services Tax: $156 a year in Scranton ($39 a quarter) if her work is based there and she earns $15,600 or more there; otherwise an exemption certificate, and the school district\'s $5.' },
        { en: 'Lackawanna County itself has no income or business tax.' },
        { en: 'Living outside Scranton changes the rates: EIT 1%, LST $52 or less, and Dunmore lists a $100 flat business tax. The PPT still applies to business done inside Scranton.' },
      ],
      links: [
        { label: { en: 'Scranton Single Tax Office', ru: 'Налоговый офис Скрантона' }, href: 'https://scrantontaxoffice.org' },
        { label: { en: 'Find your municipality\'s taxes', ru: 'Налоги по адресу' }, href: 'https://apps.dced.pa.gov/Munstats-Public/FindLocalTax.aspx' },
      ],
    },
    {
      title: { en: 'Sales tax next year', ru: 'Налог с продаж в следующем году' },
      points: [
        { en: 'She stays quarterly for 2027: monthly filing starts only when a third quarter\'s tax reaches $600, and Q3 2026 was $165.30. Q3 2027 decides 2028.' },
        { en: 'On time, the vendor discount is 1% of the tax, up to $75 a quarter. Late: 5% a month up to 25% (at least $2) plus 7% interest, and no discount.' },
        { en: 'A return is due every quarter even with no sales. Payments of $1,000 or more must be electronic.' },
        { en: 'Use tax: gear bought online without PA tax owes 6% on the same return.' },
      ],
    },
    {
      title: { en: 'Deductions to keep records for', ru: 'Вычеты, для которых нужны записи' },
      points: [
        { en: 'Mileage: 72.5 cents a mile Jan 1 to Jun 30, 2026, and 76 cents Jul 1 to Dec 31, plus parking and tolls. A log of date, destination, purpose and miles for each trip, made as she goes.' },
        { en: 'Gear: up to $2,500 per item can be expensed outright (de minimis election); larger items through Section 179 (PA allows it) or 100% bonus depreciation (federal only). A camera also used personally needs more than 50% business use for either.' },
        { en: 'Google Ads, software, gallery hosting and subscriptions: deductible when paid.' },
        { en: 'Home office: $5 a square foot up to 300 (max $1,500) federally, for space used only for the business. PA uses actual costs, so keep the home\'s bills too.' },
        { en: 'Health insurance she pays for herself: deductible federally, not in PA, and not for months she could join a spouse\'s employer plan.' },
        { en: 'Retirement: a SEP (about 20% of profit) or a Solo 401(k) ($24,500 plus about 20% of profit) can still be opened for 2026 by April 15, 2027.' },
        { en: 'Meals with a business purpose: 50% federally, 100% in PA. Travel away overnight: fully deductible. Phone and internet: the business share.' },
        { en: 'Keep everything at least 3 years (6 if income was underreported by over 25%), and gear records until 3 years after the gear is sold.' },
      ],
      links: [
        { label: { en: 'IRS: mileage rates', ru: 'IRS: ставки за пробег' }, href: 'https://www.irs.gov/tax-professionals/standard-mileage-rates' },
        { label: { en: 'IRS: home office', ru: 'IRS: домашний офис' }, href: 'https://www.irs.gov/businesses/small-businesses-self-employed/simplified-option-for-home-office-deduction' },
      ],
    },
    {
      title: { en: '1099 forms', ru: 'Формы 1099' },
      points: [
        { en: 'Stripe sends a 1099-K only above $20,000 AND 200 transactions a year, so almost certainly not for 2026. Zelle never reports. All of it is income whether or not a form arrives.' },
        { en: 'Sales tax collected from clients is not income and not an expense. Refunds reduce income; Stripe fees are an expense.' },
        { en: 'Second shooters: a W-9 before paying, and a 1099-NEC if paid $2,000 or more in a year by Zelle, cash or check (due Feb 1, 2027 for 2026, with a copy to PA). Without a W-9, 24% has to be withheld.' },
      ],
    },
    {
      title: { en: 'Gather for the preparer', ru: 'Что собрать для бухгалтера' },
      points: [
        { en: 'Her 2025 federal, PA and local returns, Social Security numbers, filing status, and every 2026 address.' },
        { en: 'The 2026 ledger from this admin (payments by date and method, tax and tips listed separately, retainers for 2027 shoots), the Stripe annual summary, Venmo business statements, and bank statements for Zelle deposits.' },
        { en: 'Google Ads invoices, software receipts, gear invoices with the date each went into use, the mileage log, travel and meal receipts with the purpose, home office square footage and home bills, phone and internet bills.' },
        { en: 'For anyone she paid: totals, how they were paid, W-9s.' },
        { en: 'Payments already made: sales tax returns, any estimates, Berkheimer, LST and PPT, and any notices from PA Revenue.' },
        { en: 'Logins for myPATH, Berkheimer and the Scranton tax office.' },
      ],
    },
  ],
  disclaimer: {
    en: 'A checklist from the IRS, PA Revenue and the City of Scranton\'s own pages, checked October 1, 2026. It is not tax advice: a preparer who knows her filing status and address should confirm the numbers.',
    ru: 'Список по материалам IRS, налоговой Пенсильвании и города Скрантон, проверено 1 октября 2026. Это не налоговая консультация: цифры должен подтвердить бухгалтер, который знает её семейное положение и адрес.',
  },
};

/**
 * The 2026 return, as a checklist on the Taxes page (src/components/AdminTax.tsx).
 *
 * SOURCED, AND DATED. Checked on 2026-10-01 against the IRS (Rev. Proc. 2025-32,
 * the 2026 Form 1040-ES, Notice 2026-10, the Schedule C and 2210 instructions),
 * PA Revenue (REV-413(I) 2026, PA-40 Schedule C, REV-717, the PIT Guide),
 * Berkheimer (EIT forms and FAQs), Clifton Township's code, the City of
 * Scranton's PPT FAQ and DCED's 2026 local tax register (rechecked for
 * Clifton Township on 2026-10-02). Anything the research could not confirm is left out or says
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
    en: 'Vero files jointly with you as a sole proprietor: one federal return, one Pennsylvania return and a local one, each built on the business profit. She lives in Clifton Township (North Pocono School District), had no income in 2025, and pays no one else yet. Those facts set the answers below.',
    ru: 'Вера подаёт совместно с тобой как ИП: одна федеральная декларация, одна декларация PA и местная, все от прибыли бизнеса. Она живёт в Clifton Township (школьный округ North Pocono), в 2025 дохода не было, и она пока никому не платит. Ответы ниже исходят из этого.',
  },
  sections: [
    {
      title: { en: 'Paying once a year instead of quarterly', ru: 'Платить раз в год, а не поквартально' },
      points: [
        { en: 'Income tax can legally be prepaid quarterly while the year runs; you pay it once a year with the April returns instead. Here is what that costs.' },
        { en: 'Local (Clifton Township): nothing for 2026. Her 2025 local tax was $0, and the statute\'s safe harbor (100% of last year\'s tax) rules out a penalty. From 2027, at most a little interest, and Berkheimer has to warn by letter, with 30 days to fix it, before any penalty.' },
        { en: 'Federal: nothing, as long as the tax withheld from your pay this year covers your total 2025 tax (line 24 of your 2025 Form 1040; 110% of it if your 2025 income passed $150,000). Filing jointly, your withholding counts for both of you. If it falls short, raising your W-4 withholding before December fixes it, because withholding counts as paid evenly through the year.' },
      ],
      links: [{ label: { en: 'Berkheimer', ru: 'Berkheimer' }, href: 'https://www.hab-inc.com' }],
    },
    {
      title: { en: 'Federal', ru: 'Федеральный налог' },
      points: [
        { en: 'Forms: 1040 with Schedule C (her business), Schedule SE (self-employment tax), Schedule 1, and Form 8995 for the QBI deduction. Form 4562 if gear is depreciated.' },
        { en: 'Self-employment tax: 15.3% of 92.35% of her profit, once it reaches $400. Half of it is deducted from income.' },
        { en: 'QBI deduction: 20% of the business profit, now permanent, with a $400 minimum when the profit is at least $1,000.' },
        { en: 'Your joint return for 2026: standard deduction $32,200, and the 10% bracket runs to $24,800.' },
        { en: 'Tips: Treasury\'s list for the new tips deduction (2025 to 2028, up to $25,000) includes private event and portrait photographers, and filing jointly meets its rule for married couples. How a self-employed photographer documents tips is not settled: ask the preparer. PA taxes tips in full.' },
        { en: 'Due Thursday April 15, 2027. Form 4868 extends filing to Oct 15, not paying.' },
      ],
      links: [
        { label: { en: 'Schedule C instructions', ru: 'Инструкция к Schedule C' }, href: 'https://www.irs.gov/instructions/i1040sc' },
      ],
    },
    {
      title: { en: 'Pennsylvania', ru: 'Пенсильвания' },
      points: [
        { en: '3.07% of the PA Schedule C profit, filed on the PA-40 by April 15, 2027. The PA Schedule C is required even when the numbers match the federal one.' },
        { en: 'PA profit is NOT the federal profit: no QBI, no bonus depreciation (Section 179 is allowed), no simplified home office (actual costs only), no deduction for self-employment tax, her own health insurance or her own retirement contributions. Meals count at 100%, not 50%.' },
        { en: 'A business loss cannot offset wages and cannot be carried forward in PA.' },
        { en: 'PA estimated payments are only needed for 2026 if her PA income without withholding reaches $14,000 ($17,000 for 2027).' },
        { en: 'Tax Forgiveness (Schedule SP) counts both your incomes: 100% only under $13,000 of eligibility income for a married couple, plus $9,500 per dependent. The new Working Pennsylvanians credit pays 10% of any federal earned income credit.' },
      ],
      links: [{ label: { en: 'PA Schedule C instructions', ru: 'Инструкция к PA Schedule C' }, href: 'https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/pa-40c.pdf' }],
    },
    {
      title: { en: 'Local: Clifton Township', ru: 'Местные налоги: Clifton Township' },
      points: [
        { en: 'Earned income tax: 1% of her PA profit (Clifton Township 0.5% plus North Pocono School District 0.5%), collected by Berkheimer, PSD code 350601 for both home and work.' },
        { en: 'Paid once a year, with Berkheimer\'s F-1 by April 15, even if nothing is owed. It can be filed jointly with yours, but the two incomes are not combined.' },
        { en: 'That is the whole local list: Clifton Township and North Pocono levy no Local Services Tax, business privilege, mercantile, per capita or occupation tax, and Lackawanna County has no income or business tax.' },
        { en: 'One exception to keep in mind: a city can tax work done inside it. If she photographs clients inside Scranton city limits, Scranton\'s Payroll Preparation Tax (1.034% of the profit from that work) probably applies, and its Local Services Tax may. Ask Berkheimer, (610) 599-3140.' },
      ],
      links: [
        { label: { en: 'Berkheimer EIT questions', ru: 'Berkheimer: вопросы об EIT' }, href: 'https://www.hab-inc.com/eitfaq/' },
        { label: { en: 'Find your municipality\'s taxes', ru: 'Налоги по адресу' }, href: 'https://apps.dced.pa.gov/Munstats-Public/FindLocalTax.aspx' },
      ],
    },
    {
      title: { en: 'Sales tax next year', ru: 'Налог с продаж в следующем году' },
      points: [
        { en: 'She stays quarterly for 2027: monthly filing starts only when a third quarter\'s tax reaches $600, and Q3 2026 was $165.30. Q3 2027 decides 2028.' },
        { en: 'On time, the vendor discount is 1% of the tax, up to $75 a quarter. Late: 5% a month up to 25% (at least $2) plus 7% interest, and no discount.' },
        { en: 'A return is due every quarter even with no sales. Payments of $1,000 or more must be electronic.' },
        { en: 'A small bill for the late Q2 2026 return may still come by mail: about 15% of the $45 plus interest.' },
        { en: 'Use tax: gear bought online without PA tax owes 6% on the same return.' },
      ],
    },
    {
      title: { en: 'Deductions to keep records for', ru: 'Вычеты, для которых нужны записи' },
      points: [
        { en: 'Mileage: 72.5 cents a mile Jan 1 to Jun 30, 2026, and 76 cents Jul 1 to Dec 31, plus parking and tolls. A log of date, destination, purpose and miles for each trip, made as she goes.' },
        { en: 'Gear counts for the year only if it is bought and in use by Dec 31; keep each invoice with that date. Up to $2,500 per item can be expensed outright (de minimis election); larger items through Section 179 (PA allows it) or 100% bonus depreciation (federal only). A camera also used personally needs more than 50% business use for either.' },
        { en: 'Google Ads, software, gallery hosting and subscriptions: deductible when paid.' },
        { en: 'Home office: $5 a square foot up to 300 (max $1,500) federally, for space used only for the business. PA uses actual costs, so keep the home\'s bills too.' },
        { en: 'Health insurance she pays for herself: deductible federally, not in PA, and not for months she could join a plan through your job.' },
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
        { en: 'Second shooters: nobody was paid in 2026, so no 1099-NEC this year. Before paying the first one, get a W-9 (without it, 24% has to be withheld), and file a 1099-NEC for anyone paid $2,000 or more in a year by Zelle, cash or check, by the end of January.' },
      ],
    },
    {
      title: { en: 'Gather for the preparer', ru: 'Что собрать для бухгалтера' },
      points: [
        { en: 'Your 2025 joint federal and PA returns, both Social Security numbers, and any W-2s for 2026.' },
        { en: 'The 2026 ledger from this admin (payments by date and method, tax and tips listed separately, retainers for 2027 shoots), the Stripe annual summary, Venmo business statements, and bank statements for Zelle deposits.' },
        { en: 'Google Ads invoices, software receipts, gear invoices with the date each went into use, the mileage log, travel and meal receipts with the purpose, home office square footage and home bills, phone and internet bills.' },
        { en: 'For anyone she paid: totals, how they were paid, W-9s.' },
        { en: 'Payments already made: the sales tax returns, and any notices from PA Revenue (for example about the late Q2 return).' },
        { en: 'Logins for myPATH and Berkheimer.' },
      ],
    },
  ],
  disclaimer: {
    en: 'A checklist from the IRS, PA Revenue, Berkheimer, Clifton Township\'s code and the state\'s local tax register, checked October 2, 2026. It is not tax advice: a preparer should confirm the numbers.',
    ru: 'Список по материалам IRS, налоговой Пенсильвании, Berkheimer, кодекса Clifton Township и реестра местных налогов штата, проверено 2 октября 2026. Это не налоговая консультация: цифры должен подтвердить бухгалтер.',
  },
};

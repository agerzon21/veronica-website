/**
 * Wedding photography contract template.
 *
 * The template is structured (array of sections) rather than a single
 * markdown blob so we can render it consistently in both the React UI and
 * the React-PDF document without writing a markdown parser. Each section
 * is a heading + paragraphs; paragraphs can be plain text, bullet lists,
 * or signature blocks.
 *
 * Variable substitution: any `{{variable_name}}` token is replaced with
 * the corresponding value from the portal's `contract_variables` JSON at
 * render time. Unfilled variables render as `[variable_name]` so it's
 * visible that something's missing rather than silently failing.
 *
 * Per-client editability: the *rendered* template body is frozen into the
 * `client_portals.contract_body` column at signing time. That snapshot
 * is what the PDF generates from — never the live template. Updating
 * this file only affects future contracts, never previously signed ones.
 * Legal best practice.
 */

export type ContractParagraph =
  | { kind: 'text'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'signature_block' };

export interface ContractSection {
  number?: string; // e.g. 'I', 'II' — optional so headings without roman nums work
  title: string;
  paragraphs: ContractParagraph[];
}

export interface ContractTemplate {
  title: string;
  sections: ContractSection[];
}

// Variables accepted by the wedding template. Used for type-safety on the
// admin side (Phase 4) and for sensible defaults in PDF generation.
export interface WeddingContractVariables {
  effective_date: string;          // e.g. "June 24, 2026"
  photographer_name: string;       // e.g. "Veronika Polbina"
  client_names: string;            // e.g. "Chrisann Bryan & Rajiv Thomas"
  event_title: string;             // e.g. "Chrisann & Rajiv's Wedding"
  event_location: string;          // e.g. "Malcolm Gross Rose Gardens, ..."
  event_date: string;              // e.g. "August 9, 2026"
  event_time: string;              // e.g. "5:00 PM to 6:00 PM (approximately 1 hour)"
  delivery_timeframe: string;      // e.g. "Within 5 weeks after event"
  total_amount: string;            // formatted "$230"
  retainer_amount: string;         // formatted "$50"
  remaining_balance: string;       // formatted "$180"
  balance_due_window: string;      // e.g. "TEN (10) Days"
  payment_methods: string;         // e.g. "Cash, Venmo, CashApp or Zelle"
  retention_months: string;        // e.g. "3" — how long the gallery stays online
}

export const WEDDING_CONTRACT_TEMPLATE: ContractTemplate = {
  title: 'WEDDING PHOTOGRAPHY CONTRACT',
  sections: [
    {
      number: 'I',
      title: 'PARTIES',
      paragraphs: [
        { kind: 'text', text: 'This agreement is entered into on {{effective_date}} ("Effective Date") between:' },
        { kind: 'text', text: 'Photographer: {{photographer_name}} ("Photographer"), and' },
        { kind: 'text', text: 'Client: {{client_names}} ("Client(s)")' },
      ],
    },
    {
      number: 'II',
      title: 'EVENT DETAILS',
      paragraphs: [
        { kind: 'text', text: 'Title: {{event_title}}' },
        { kind: 'text', text: 'Location: {{event_location}}' },
        { kind: 'text', text: 'Date: {{event_date}}' },
        { kind: 'text', text: 'Time: {{event_time}}' },
      ],
    },
    {
      number: 'III',
      title: 'SERVICES',
      paragraphs: [
        { kind: 'text', text: 'The Photographer agrees to provide wedding photography services for the duration listed above.' },
        { kind: 'text', text: 'Deliverables: Edited digital images with color correction' },
        { kind: 'text', text: 'Delivery Timeframe: {{delivery_timeframe}} (AFTER full payment is received)' },
        { kind: 'text', text: 'Images will be delivered via online gallery (Website Portal + Google Drive).' },
        { kind: 'text', text: 'Photographer retains full creative control over shooting and editing style.' },
        { kind: 'text', text: 'RAW/unedited images are not included.' },
        { kind: 'text', text: 'This is an all-inclusive package; travel to event location included at no additional charge.' },
        { kind: 'text', text: 'Online gallery will remain hosted for {{retention_months}} months after delivery. After that, retention is at Photographer’s discretion — Client is responsible for downloading and backing up images during the hosting window.' },
      ],
    },
    {
      number: 'IV',
      title: 'PAYMENT',
      paragraphs: [
        { kind: 'text', text: 'Total Payment: {{total_amount}}' },
        { kind: 'text', text: 'Retainer (Non-Refundable): {{retainer_amount}} (due at signing)' },
        { kind: 'text', text: 'The event date is not reserved until this contract is signed and retainer is paid.' },
        { kind: 'text', text: 'Remaining Balance: {{remaining_balance}} (due within {{balance_due_window}} after the event date)' },
        { kind: 'text', text: 'Full payment must be received BEFORE delivery of any images.' },
      ],
    },
    {
      number: 'V',
      title: 'PAYMENT METHODS',
      paragraphs: [
        { kind: 'text', text: 'Accepted Payment Methods:' },
        { kind: 'bullets', items: ['{{payment_methods}}'] },
      ],
    },
    {
      number: 'VI',
      title: 'CANCELLATION / RESCHEDULING',
      paragraphs: [
        { kind: 'text', text: 'Retainer is non-refundable.' },
        { kind: 'text', text: 'If Client cancels, all payments made are non-refundable.' },
        { kind: 'text', text: 'Rescheduling is allowed at Photographer’s discretion based on availability.' },
      ],
    },
    {
      number: 'VII',
      title: 'FORCE MAJEURE',
      paragraphs: [
        { kind: 'text', text: 'If Photographer is unable to perform due to illness, emergency, or circumstances beyond control, Photographer will:' },
        {
          kind: 'bullets',
          items: ['attempt to find a replacement photographer, OR', 'refund all payments received'],
        },
      ],
    },
    {
      number: 'VIII',
      title: 'LIABILITY',
      paragraphs: [
        { kind: 'text', text: 'Photographer is not liable for:' },
        {
          kind: 'bullets',
          items: [
            'missed moments due to lack of cooperation or schedule delays',
            'venue restrictions',
            'weather conditions',
            'equipment failure (reasonable backup efforts will be made)',
          ],
        },
        { kind: 'text', text: 'Total liability is limited to the amount paid under this agreement.' },
      ],
    },
    {
      number: 'IX',
      title: 'CLIENT RESPONSIBILITIES',
      paragraphs: [
        { kind: 'text', text: 'Client agrees to:' },
        {
          kind: 'bullets',
          items: [
            'provide a timeline',
            'designate someone for important shots',
            'ensure Photographer has safe working conditions',
          ],
        },
      ],
    },
    {
      number: 'X',
      title: 'COPYRIGHT & USAGE',
      paragraphs: [
        { kind: 'text', text: 'Photographer retains full copyright of all images.' },
        { kind: 'text', text: 'Client receives a personal-use license to:' },
        { kind: 'bullets', items: ['Download, print and/or share.'] },
      ],
    },
    {
      number: 'XI',
      title: 'MODEL RELEASE',
      paragraphs: [
        { kind: 'text', text: 'Client grants Photographer permission to use images for:' },
        { kind: 'bullets', items: ['Portfolio, website, social media and/or marketing.'] },
        { kind: 'text', text: 'Client may request privacy in writing.' },
      ],
    },
    {
      number: 'XII',
      title: 'ENTIRE AGREEMENT',
      paragraphs: [
        { kind: 'text', text: 'This Agreement represents the entire understanding between parties.' },
      ],
    },
    {
      number: 'XIII',
      title: 'SIGNATURES',
      paragraphs: [{ kind: 'signature_block' }],
    },
  ],
};

/**
 * Apply variables to the template, returning a new template with all
 * `{{variable_name}}` tokens replaced. Unknown variables are left as
 * `[variable_name]` placeholders so missing data is obvious.
 */
export function fillTemplate<V extends Record<string, string>>(
  template: ContractTemplate,
  vars: V,
): ContractTemplate {
  const substitute = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? vars[key] : `[${key}]`));

  return {
    title: substitute(template.title),
    sections: template.sections.map((section) => ({
      ...section,
      title: substitute(section.title),
      paragraphs: section.paragraphs.map((p) => {
        if (p.kind === 'text') return { kind: 'text', text: substitute(p.text) };
        if (p.kind === 'bullets') return { kind: 'bullets', items: p.items.map(substitute) };
        return p;
      }),
    })),
  };
}

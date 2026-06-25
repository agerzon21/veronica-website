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
  | { kind: 'text'; text: string; emphasis?: 'italic' | 'bold' }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'fields'; items: Array<{ label: string; value: string }> }
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
        { kind: 'text', text: 'This agreement is entered into on the Effective Date between the parties below.' },
        {
          kind: 'fields',
          items: [
            { label: 'Effective Date', value: '{{effective_date}}' },
            { label: 'Photographer', value: '{{photographer_name}}' },
            { label: 'Client', value: '{{client_names}}' },
          ],
        },
      ],
    },
    {
      number: 'II',
      title: 'EVENT DETAILS',
      paragraphs: [
        {
          kind: 'fields',
          items: [
            { label: 'Title', value: '{{event_title}}' },
            { label: 'Location', value: '{{event_location}}' },
            { label: 'Date', value: '{{event_date}}' },
            { label: 'Time', value: '{{event_time}}' },
          ],
        },
      ],
    },
    {
      number: 'III',
      title: 'SERVICES',
      paragraphs: [
        { kind: 'text', text: 'The Photographer agrees to provide wedding photography services for the duration listed above.' },
        {
          kind: 'fields',
          items: [
            { label: 'Deliverables', value: 'Edited digital images with color correction' },
            { label: 'Delivery Timeframe', value: '{{delivery_timeframe}} (after full payment is received)' },
            { label: 'Delivery Method', value: 'Online gallery (Website Portal + Google Drive)' },
          ],
        },
        {
          kind: 'bullets',
          items: [
            'Photographer retains full creative control over shooting and editing style.',
            'RAW/unedited images are not included.',
            'Travel to event location is included at no additional charge.',
          ],
        },
        { kind: 'text', text: 'The online gallery will remain hosted for {{retention_months}} months after delivery. After that, retention is at the Photographer’s discretion — the Client is responsible for downloading and backing up images during the hosting window.' },
      ],
    },
    {
      number: 'IV',
      title: 'PAYMENT',
      paragraphs: [
        {
          kind: 'fields',
          items: [
            { label: 'Total Payment', value: '{{total_amount}}' },
            { label: 'Retainer (Non-Refundable)', value: '{{retainer_amount}} (due at signing)' },
            { label: 'Remaining Balance', value: '{{remaining_balance}} (due within {{balance_due_window}} after the event date)' },
          ],
        },
        { kind: 'text', emphasis: 'italic', text: 'The event date is not reserved until this contract is signed and the retainer is paid.' },
        { kind: 'text', emphasis: 'italic', text: 'Full payment must be received before delivery of any images.' },
      ],
    },
    {
      number: 'V',
      title: 'PAYMENT METHODS',
      paragraphs: [
        { kind: 'text', text: 'Accepted payment methods:' },
        { kind: 'bullets', items: ['{{payment_methods}}'] },
      ],
    },
    {
      number: 'VI',
      title: 'CANCELLATION / RESCHEDULING',
      paragraphs: [
        {
          kind: 'bullets',
          items: [
            'The retainer is non-refundable.',
            'If the Client cancels, all payments made are non-refundable.',
            'Rescheduling is allowed at the Photographer’s discretion based on availability.',
          ],
        },
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
        { kind: 'text', emphasis: 'italic', text: 'Total liability is limited to the amount paid under this agreement.' },
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
        if (p.kind === 'text') {
          return { kind: 'text', text: substitute(p.text), emphasis: p.emphasis };
        }
        if (p.kind === 'bullets') return { kind: 'bullets', items: p.items.map(substitute) };
        if (p.kind === 'fields') {
          return {
            kind: 'fields',
            items: p.items.map((f) => ({
              label: substitute(f.label),
              value: substitute(f.value),
            })),
          };
        }
        return p;
      }),
    })),
  };
}

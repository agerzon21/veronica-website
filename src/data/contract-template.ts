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
  // If true, the section is dropped post-fill when its content is
  // effectively empty — either all paragraphs render empty (the
  // ADDITIONAL NOTES case) or, if `requireVariables` is set, when any
  // of those variables is blank.
  optional?: boolean;
  // For optional sections that contain boilerplate text alongside
  // variable-driven content, listing the variables here lets the
  // pruner drop the section when those variables come through empty.
  // Without this, a section like RESPONSIBLE PARTY would always
  // render because its instructional copy is always non-empty.
  requireVariables?: string[];
  paragraphs: ContractParagraph[];
}

export interface ContractTemplate {
  title: string;
  sections: ContractSection[];
}

// Variables accepted by the wedding template. Used for type-safety on the
// admin side and for sensible defaults in PDF generation.
export interface WeddingContractVariables {
  effective_date: string;          // e.g. "June 24, 2026"
  photographer_name: string;       // e.g. "Veronika Polbina"
  client_names: string;            // e.g. "Chrisann Bryan & Rajiv Thomas"
  event_title: string;             // e.g. "Chrisann & Rajiv's Wedding"
  event_location: string;          // e.g. "Malcolm Gross Rose Gardens, ..."
  event_date: string;              // e.g. "August 9, 2026"
  event_time: string;              // e.g. "5:00 PM to 6:00 PM (approximately 1 hour)"
  deliverables: string;            // e.g. "Edited digital images with color correction" or "30 edited photos"
  delivery_timeframe: string;      // e.g. "Within 5 weeks after event"
  total_amount: string;            // formatted "$230"
  retainer_amount: string;         // formatted "$50"
  remaining_balance: string;       // formatted "$180"
  balance_due_window: string;      // e.g. "TEN (10) Days"
  payment_methods: string;         // e.g. "Cash, Venmo, CashApp or Zelle"
  retention_months: string;        // e.g. "3" — how long the gallery stays online
  additional_notes: string;        // free-text addendum; section is hidden if empty
  // Optional — if a third party is paying and signing on behalf of the
  // clients (e.g. mother of the bride), name + relationship go here.
  // The RESPONSIBLE PARTY section in the template is marked optional
  // and gets pruned when either of these is blank.
  responsible_party_name: string;
  responsible_party_relationship: string;
  // Toggle flags for optional service-clause sections. Set to 'yes' to
  // include the corresponding section in the rendered contract, empty
  // string to omit. The clause boilerplate itself is hardcoded in the
  // template; these are just include/exclude signals checked by
  // pruneEmptyOptionalSections via requireVariables.
  two_camera_enabled: string;
  additional_retouching_enabled: string;
}

export const WEDDING_CONTRACT_TEMPLATE: ContractTemplate = {
  title: 'WEDDING PHOTOGRAPHY CONTRACT',
  sections: [
    {
      number: 'I',
      title: 'PARTIES',
      paragraphs: [
        { kind: 'text', text: 'This agreement is entered into on {{effective_date}} ("Effective Date") between:' },
        {
          kind: 'fields',
          items: [
            { label: 'Photographer', value: '{{photographer_name}} ("Photographer")' },
            { label: 'Client', value: '{{client_names}} ("Client(s)")' },
          ],
        },
      ],
    },
    // Optional, unnumbered. Only renders when responsible_party_name +
    // responsible_party_relationship are both set — otherwise pruned
    // server-side by pruneEmptyOptionalSections() before the contract
    // body is frozen.
    {
      title: 'RESPONSIBLE PARTY',
      optional: true,
      requireVariables: ['responsible_party_name', 'responsible_party_relationship'],
      paragraphs: [
        { kind: 'text', text: 'The party signing this agreement and accepting financial responsibility on behalf of the Client(s) is:' },
        {
          kind: 'fields',
          items: [
            { label: 'Name', value: '{{responsible_party_name}} ("Responsible Party")' },
            { label: 'Relationship to Client(s)', value: '{{responsible_party_relationship}}' },
          ],
        },
        { kind: 'text', emphasis: 'italic', text: 'The Responsible Party accepts all financial obligations described in this agreement and signs on behalf of the Client(s).' },
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
            { label: 'Deliverables', value: '{{deliverables}}' },
            { label: 'Delivery Timeframe', value: '{{delivery_timeframe}} (after full payment is received)' },
            { label: 'Delivery Method', value: 'Online gallery (Website Portal + Google Drive)' },
          ],
        },
        {
          kind: 'bullets',
          items: [
            'Photographer retains full creative control over shooting and editing style.',
            'RAW/unedited images are not included.',
            'Travel to the event location is included in the Total Payment above. Additional travel may be billed separately if discussed in advance.',
          ],
        },
        { kind: 'text', text: 'The online gallery will remain hosted for {{retention_months}} months after delivery. After that, retention is at the Photographer’s discretion — the Client is responsible for downloading and backing up images during the hosting window.' },
      ],
    },
    // Optional, unnumbered. Included when two_camera_enabled is 'yes'.
    // The clause clarifies that the second camera is an assistant
    // capacity, not an independent professional photographer — protects
    // the Photographer from being held to "two pros" expectations.
    {
      title: 'TWO-CAMERA COVERAGE',
      optional: true,
      requireVariables: ['two_camera_enabled'],
      paragraphs: [
        {
          kind: 'text',
          text: 'This booking includes two-camera coverage for key moments of the event. The Photographer will operate as Lead Photographer; a Second Camera Operator (acting in an assistant capacity) will provide supplemental angles and supporting coverage during designated portions of the event.',
        },
        {
          kind: 'text',
          emphasis: 'italic',
          text: 'The Second Camera Operator is not engaged as an independent professional photographer. Final editing, image selection, and creative direction across both camera sources remain solely with the Photographer.',
        },
      ],
    },
    // Optional, unnumbered. Included when additional_retouching_enabled
    // is 'yes'. Makes clear that advanced retouching is an add-on, not
    // part of the base package — and that scope/price is negotiated
    // case-by-case.
    {
      title: 'OPTION FOR ADDITIONAL RETOUCHING',
      optional: true,
      requireVariables: ['additional_retouching_enabled'],
      paragraphs: [
        {
          kind: 'text',
          text: 'Following delivery of the initial gallery, the Client may select images from the gallery for advanced retouching beyond the standard color correction included in this package. Examples include, but are not limited to, skin smoothing, blemish removal, advanced color grading, and object removal.',
        },
        {
          kind: 'text',
          emphasis: 'italic',
          text: 'The number of images, turnaround time, and any associated additional fees will be agreed upon separately between the Client and Photographer prior to the additional work being performed.',
        },
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
    // Unnumbered addendum — only included in the rendered contract when
    // additional_notes is non-empty (stripped in admin when blank).
    {
      title: 'ADDITIONAL NOTES',
      optional: true,
      paragraphs: [{ kind: 'text', text: '{{additional_notes}}' }],
    },
    {
      number: 'XIII',
      title: 'SIGNATURES',
      paragraphs: [{ kind: 'signature_block' }],
    },
  ],
};

/**
 * Field metadata for the admin's "new client" form. Drives label, input
 * type, placeholder, and default. Keep ordered the way the form should
 * read top to bottom — the admin renders fields in this order.
 */
export interface ContractTemplateField {
  key: string;
  label: string;
  // 'text' is the default. 'date' renders a date picker (we format to
  // human-readable on save). 'currency' is a number input rendered with
  // a $ prefix; the variable is stored as "$230". 'number' is a plain
  // number input.
  type?: 'text' | 'date' | 'currency' | 'number' | 'textarea';
  placeholder?: string;
  defaultValue?: string;
  helpText?: string;
  // Surfaces a red dot in the admin form. Use for fields with no
  // sensible default that Vero must fill in (e.g. event_location).
  required?: boolean;
}

export interface ContractTemplateSpec {
  key: string;
  name: string;          // shown in the admin dropdown
  template: ContractTemplate;
  fields: ContractTemplateField[];
}

// Fields that show up in the admin's "Contract Variables" section.
// Excludes anything the form handles explicitly with its own widget
// (partner names, event date/time, total, retainer, gallery password,
// event title, client display name, additional notes — those have
// custom inputs above this section).
export const WEDDING_TEMPLATE_FIELDS: ContractTemplateField[] = [
  {
    key: 'photographer_name',
    label: 'Photographer Name',
    defaultValue: 'Veronika Polbina',
    helpText: 'Shows on the contract as the Photographer party.',
  },
  {
    key: 'event_location',
    label: 'Event Location',
    placeholder: 'Venue name and full address',
    helpText: 'Where the shoot happens. Include the full address.',
    required: true,
  },
  {
    key: 'effective_date',
    label: 'Effective Date',
    type: 'date',
    helpText: 'The date the contract is meant to take effect. Usually today.',
  },
  {
    key: 'deliverables',
    label: 'Deliverables',
    defaultValue: 'Edited digital images with color correction',
    helpText: 'What the client receives. e.g. "30 edited photos" or "All edited images".',
  },
  {
    key: 'delivery_timeframe',
    label: 'Delivery Timeframe',
    defaultValue: 'Within 5 weeks after event',
    helpText: 'How long after the event the photos will be delivered.',
  },
  {
    key: 'balance_due_window',
    label: 'Balance Due Window',
    defaultValue: 'TEN (10) Days',
    helpText: 'How long after the event date the remaining balance is due.',
  },
  {
    key: 'payment_methods',
    label: 'Payment Methods',
    defaultValue: 'Cash, Venmo, CashApp or Zelle',
    helpText: 'Comma-separated payment methods the client can use.',
  },
  {
    key: 'retention_months',
    label: 'Gallery Retention (months)',
    type: 'number',
    defaultValue: '3',
    helpText: 'How long the photo gallery stays online after delivery. Default is 3.',
  },
];

export const CONTRACT_TEMPLATES: Record<string, ContractTemplateSpec> = {
  wedding: {
    key: 'wedding',
    name: 'Wedding',
    template: WEDDING_CONTRACT_TEMPLATE,
    fields: WEDDING_TEMPLATE_FIELDS,
  },
};

/**
 * Apply variables to the template, returning a new template with all
 * `{{variable_name}}` tokens replaced. Unknown variables are left as
 * `[variable_name]` placeholders so missing data is obvious.
 */
/**
 * After fillTemplate, drop any section marked `optional: true` whose
 * content is effectively empty.
 *
 * - If the section declares `requireVariables`, the section is dropped
 *   when any of those variables is missing or blank in `vars`.
 * - Otherwise, the section is dropped when every paragraph is empty
 *   (the ADDITIONAL NOTES case — a single `{{variable}}` paragraph
 *   that substitutes to '').
 *
 * Used by the admin endpoints so the saved contract_body never shows
 * an orphan heading with no content under it.
 */
export function pruneEmptyOptionalSections(
  template: ContractTemplate,
  vars?: Record<string, string>,
): ContractTemplate {
  return {
    ...template,
    sections: template.sections.filter((s) => {
      if (!s.optional) return true;
      if (s.requireVariables && s.requireVariables.length > 0) {
        return s.requireVariables.every((k) => {
          const v = vars?.[k];
          return typeof v === 'string' && v.trim().length > 0;
        });
      }
      return s.paragraphs.some((p) => {
        if (p.kind === 'text') return p.text.trim().length > 0;
        if (p.kind === 'bullets') return p.items.some((i) => i.trim().length > 0);
        if (p.kind === 'fields') return p.items.some((f) => f.value.trim().length > 0);
        return false;
      });
    }),
  };
}

/**
 * Walks every string in the template and pulls out the set of
 * `{{variable_name}}` keys referenced. Used by the admin "Edit fields"
 * form so a customer whose portal was created before a new variable
 * existed still gets the new field surfaced (otherwise the form would
 * silently omit anything not already in their saved variables map).
 */
export function extractVariableKeys(template: ContractTemplate): string[] {
  const keys = new Set<string>();
  const scan = (s: string) => {
    const re = /\{\{(\w+)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) {
      keys.add(m[1]);
    }
  };
  scan(template.title);
  for (const section of template.sections) {
    scan(section.title);
    for (const p of section.paragraphs) {
      if (p.kind === 'text') scan(p.text);
      else if (p.kind === 'bullets') p.items.forEach(scan);
      else if (p.kind === 'fields') {
        p.items.forEach((f) => {
          scan(f.label);
          scan(f.value);
        });
      }
    }
  }
  return Array.from(keys).sort();
}

export function fillTemplate<V extends Record<string, string>>(
  template: ContractTemplate,
  vars: V,
): ContractTemplate {
  const substitute = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? vars[key] : `[${key}]`));

  return {
    title: substitute(template.title),
    sections: template.sections.map((section) => ({
      number: section.number,
      title: substitute(section.title),
      optional: section.optional,
      requireVariables: section.requireVariables,
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

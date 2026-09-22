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
/**
 * The one way money is written into a contract.
 *
 * Whole dollars with thousands separators: "$1,200". That is how every
 * contract already rendered, because the new-client form formatted the
 * figures this way before storing them, so matching it exactly is the point.
 * A second formatter that rounded or grouped differently would make an edited
 * contract disagree with the one created beside it.
 *
 * Shared rather than duplicated because two places now write these figures:
 * the new-client form at creation, and api/admin/_portal-update.ts when Vero
 * corrects a price before the client signs. Those must agree forever, and the
 * failure if they drift is a signed contract whose Payment Terms table does
 * not match what the client is being asked to pay.
 *
 * Deliberately NOT toLocaleString. This runs in a serverless function as well
 * as the browser, and a Node build without full ICU silently drops the
 * thousands separator instead of throwing, which would put "$1200" in one
 * contract and "$1,200" in the next.
 */
export function formatContractMoney(amount: number): string {
  const whole = Math.round(Number.isFinite(amount) ? amount : 0);
  return `$${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

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
  /**
   * The travel allowance, formatted ("$50"), and the distance it was worked
   * out from ("106.4"). Both blank on every booking inside the included
   * radius, which prunes the TRAVEL section away entirely.
   *
   * They are written together or not at all. See src/data/travel-fee.ts, which
   * owns the policy, and the TRAVEL section below, which is gated on both so a
   * half filled pair can never print a clause with a hole in it.
   */
  travel_fee_amount: string;
  travel_round_trip_miles: string;
  /**
   * The same allowance when Veronika typed the figure instead of taking the
   * computed one. MUTUALLY EXCLUSIVE with travel_fee_amount: exactly one of the
   * two is ever non-blank, which is what picks one of the two TRAVEL sections
   * below and makes it impossible for both to print.
   *
   * It is a separate key rather than a flag beside the amount because the
   * pruner can only ask whether a variable is filled in. Two keys turn "which
   * clause" into the same blank-or-not question every other optional section
   * already answers, with no change to pruneEmptyOptionalSections.
   *
   * The custom clause shows no rate and no multiplication. See the WHY THERE IS
   * A MANUAL OVERRIDE block at the top of src/data/travel-fee.ts.
   */
  travel_custom_amount: string;
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
    // Gated on the RATE itself rather than on a yes/no flag, so there is exactly
    // one thing to fill in and no way to switch the clause on without saying
    // what the rate is. Session types set it by default; wedding offers it as a
    // blank field, so an existing wedding contract renders byte for byte as
    // before until somebody deliberately types a rate.
    //
    // Covers two different things on purpose. Overtime protects Vero's time when
    // a session runs long because the Client asked it to. Out-of-pocket costs
    // cover the parking and entry fees she currently absorbs. Both are billed
    // through the portal as itemised charges, so the Client can see exactly what
    // was added and why, and both are explicitly hers to waive.
    {
      title: 'ADDITIONAL TIME AND EXPENSES',
      optional: true,
      requireVariables: ['overtime_rate'],
      paragraphs: [
        {
          kind: 'text',
          text: 'The session covers the time listed above. If it runs beyond that at the Client\u2019s request, or because of a delay on the Client\u2019s side, the additional time is billed at {{overtime_rate}}, charged in half hour increments.',
        },
        {
          kind: 'text',
          text: 'Costs the Photographer pays on the day in order to carry out the session, such as parking or an entry fee, are added to the balance at cost.',
        },
        {
          kind: 'bullets',
          items: [
            'Any such charge is itemised in the Client portal, with the reason shown, before it is due.',
            'Charges are added to the remaining balance, which is payable before images are delivered.',
            'The Photographer may waive any of these at her sole discretion, and frequently will.',
          ],
        },
        {
          kind: 'text',
          emphasis: 'italic',
          text: 'This does not apply where the session runs long for reasons within the Photographer\u2019s control.',
        },
      ],
    },
    // Optional, unnumbered, and gated on BOTH travel variables, so a booking
    // inside the included radius prunes it away and every wedding contract
    // already signed re-renders byte for byte as it always has. That is the
    // same mechanism ADDITIONAL TIME AND EXPENSES uses, and it is the only
    // safe way to add wording to this template: _portal-update.ts re-renders
    // contract_body from the LIVE template whenever variables are edited.
    //
    // Gated on both keys rather than on the amount alone because the clause
    // prints the distance. Half a pair would render "Round Trip Distance:
    // miles", which is worse than no clause at all. The admin form writes the
    // two together or writes neither.
    //
    // This is deliberately the SAME IDEA as ADDITIONAL TIME AND EXPENSES above
    // and not a second, unrelated concept. SERVICES already says travel is
    // included and that additional travel may be billed when discussed in
    // advance. This is that conversation, settled before anybody signs, which
    // is the whole point: a client who signs for $300 and is charged $50 later
    // has a reasonable complaint, and one who signs for $350 does not.
    {
      title: 'TRAVEL',
      optional: true,
      requireVariables: ['travel_fee_amount', 'travel_round_trip_miles'],
      paragraphs: [
        {
          kind: 'text',
          text: 'Travel within 60 miles of the Photographer’s base, meaning 120 miles of driving in total, is included in the Total Payment at no charge. This booking is further out than that, so a travel allowance has been agreed in advance and is already part of the Total Payment shown below.',
        },
        {
          kind: 'fields',
          items: [
            { label: 'Round Trip Distance', value: '{{travel_round_trip_miles}} miles' },
            { label: 'Included At No Charge', value: '120 miles round trip' },
            { label: 'Rate Beyond That', value: '$0.70 per mile of round trip distance' },
            { label: 'Travel Allowance', value: '{{travel_fee_amount}}, rounded up to the nearest $5' },
          ],
        },
        {
          kind: 'text',
          text: 'The allowance covers fuel, vehicle costs and the Photographer’s time on the road together. Driving time is never billed separately, at any rate, however long the journey takes on the day.',
        },
        {
          kind: 'text',
          emphasis: 'italic',
          text: 'This figure is fixed by this agreement. It is not a charge that appears afterwards, and no further travel cost will be added for the journey to and from this booking.',
        },
      ],
    },
    // The SAME clause for the case where Veronika typed the figure instead of
    // taking the one the miles produced. Gated on travel_custom_amount, which
    // applyTravelDecision writes only on that path and blanks on the other, so
    // exactly one of the two TRAVEL sections can ever print. A booking that
    // never had a travel question carries neither key and prunes both, which is
    // what leaves every wedding contract already signed byte for byte as it was.
    //
    // NO RATE AND NO MULTIPLICATION ANYWHERE IN IT, on purpose and not by
    // accident. The version above shows its working because its working is what
    // produced the number; this one did not come from a multiplication, and
    // printing one beside it would invite a client to argue with arithmetic that
    // was never applied, or to read the figure as a discount off a list price
    // and ask why it is not a larger one. The round trip distance appears once,
    // in prose, as the REASON for the allowance, and never in a table beside the
    // amount, because two numbers in a table are an implied rate.
    {
      title: 'TRAVEL',
      optional: true,
      requireVariables: ['travel_custom_amount', 'travel_round_trip_miles'],
      paragraphs: [
        {
          kind: 'text',
          text: 'The journey to the event location and back is {{travel_round_trip_miles}} miles, which is further than the travel included in the Total Payment at no charge. The Client therefore agrees to a travel allowance of {{travel_custom_amount}} for the Photographer’s travel to and from the event, settled in advance and already included in the Total Payment shown below.',
        },
        {
          kind: 'fields',
          items: [{ label: 'Travel Allowance', value: '{{travel_custom_amount}}' }],
        },
        {
          kind: 'text',
          text: 'The allowance covers fuel, vehicle costs and the Photographer’s time on the road together. It is a single sum agreed for this booking, and driving time is never billed separately, however long the journey takes on the day.',
        },
        {
          kind: 'text',
          emphasis: 'italic',
          text: 'This figure is fixed by this agreement. It is not a charge that appears afterwards, and no further travel cost will be added for the journey to and from this booking.',
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
  /**
   * Russian label, used by the admin's missing-field message.
   *
   * Vero's panel defaults to Russian, and the per-type required-field check
   * names the offending field by this label, so without it she gets one
   * sentence in Russian naming an English field. Not a flat per-key map,
   * because the same key reads "Event Location" on a wedding and "Session
   * Location" on everything else.
   */
  labelRu?: string;
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
  /**
   * The booking names two people, so the form shows a second name input and
   * the derived display name reads "A & B". Wedding and engagement only; for
   * every other type the partner_2 columns simply stay NULL.
   */
  couple?: boolean;
  /**
   * Clause flags forced on for this type, merged UNDER any explicit choice so
   * they cannot be cleared by accident. This is how family always carries the
   * minor and illness clauses without relying on anyone ticking a box.
   */
  defaultVariables?: Record<string, string>;
  /** Clause flags offered as checkboxes. Keys index OPTIONAL_CLAUSES. */
  optionalClauses?: string[];
  /** Offers the half-day / full-day coverage presets. Wedding only. */
  coveragePresets?: boolean;
  /** Offers a free-text session label alongside the type. 'other' only. */
  allowsCustomLabel?: boolean;
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
    // Deliberately guidance, not validation. Address autocomplete was
    // considered and rejected — a Google Cloud project and an API key for ~10
    // addresses a month — and hard-validating would block the real case where
    // all we have is a venue name. So the check is Vero's, and this tells her
    // exactly what to check.
    //
    // NOT updated to name the Look it up button, although the button now sits
    // directly under this field on every type including wedding. The wedding
    // spec's fields are pinned by scratchpad/test-contract-types.mjs, which
    // compares each one against git HEAD whole. That check is stricter than the
    // rule it protects (only defaultValue can reach a rendered contract, via
    // withFieldDefaults on a type change), but wedding is the template where
    // stricter than necessary is the right setting, so the wording stays. The
    // session copy below says it instead.
    helpText:
      'Full address, not just the venue name. Look it up in Google Maps or Waze first — confirm the street, city and state are right, and check the drive time so there are no surprises on the day.',
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
    key: 'overtime_rate',
    label: 'Overtime Rate',
    placeholder: 'e.g. $150 per hour',
    /**
     * ON BY DEFAULT, and it used to be off.
     *
     * The clause is gated on this field, so a blank one prunes it away. It was
     * left blank so that Vero opted a booking in by typing a rate, out of
     * caution about the frozen wedding template. That caution was misplaced:
     * a contract's body is SERIALISED INTO client_portals.contract_body when
     * it is created and read back from there to display and to sign
     * (api/portal/_sign-contract.ts reads the stored body and parses it), so a
     * default added here cannot reach anything already created. Checked
     * against the real database: all six signed wedding contracts have a
     * stored body and no overtime_rate variable, and they keep rendering
     * exactly as they were signed.
     *
     * Which left the default deciding one thing only: whether a NEW booking is
     * protected unless Vero remembers to type a number. It is her protection,
     * for time she works because the day ran long on the client's side, so the
     * safe direction is on. Of the wedding contracts on file, exactly one has
     * a rate on it.
     *
     * $150 per hour because that is the rate the weddings page already
     * publishes to the client: "Any package extends at $150 per hour" in
     * src/data/wedding-page.json. A contract quoting a different number than
     * the page they booked from is the one version of this worth avoiding.
     *
     * Clearing it still removes the whole clause, which is how she turns it
     * off for a booking where she does not want it. A value she has typed
     * survives a contract-type change; only an untouched field takes a
     * default (AdminNewClient.tsx, the prevDefaults comparison).
     */
    defaultValue: '$150 per hour',
    helpText:
      'Covers extra time the client causes, plus out-of-pocket costs such as parking. Clear it to drop the clause entirely.',
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

// ────────────────────────────────────────────────────────────────────
// SESSION CONTRACTS
//
// Portrait, family, engagement, maternity and "other" share one body.
// They are still six separate choices in the admin, because the choice is
// what picks the title, the fields and which clauses appear, and because a
// family client must never read portrait wording (or, worse, wedding wording).
//
// The wedding template above is NOT refactored into shared constants, even
// where a section is identical. Every signed and every pending contract points
// at it, and _portal-update.ts re-renders contract_body from the live template
// whenever variables are edited, so a change here can rewrite a document
// somebody has already read and signed. The duplication below is deliberate
// and is the cheaper mistake. If a clause that appears in both ever changes,
// it has to be changed in both places on purpose.
//
// Section numbering runs I to XIII exactly as the wedding contract does, and
// every per-type clause is UNNUMBERED, the same way TWO-CAMERA COVERAGE and
// RESPONSIBLE PARTY already are. So switching a clause on or off never
// renumbers anything, and the PDF's signature heading stays "XIII. SIGNATURES".
//
// Variable names are reused from the wedding set wherever the meaning matches
// ({{event_date}}, {{event_location}}, {{balance_due_window}} and so on). The
// client only ever sees the LABEL, which says "Session", and reusing the keys
// means the admin form, the variable editor and _portal-update.ts need no
// special cases. Only genuinely new ideas get new keys.

/** Variables the session templates accept, on top of the shared wedding set. */
export interface SessionContractVariables {
  /** How long a rescheduled session stays claimable. e.g. "three (3) months". */
  reschedule_window: string;
  /** 'other' only: free text describing what is being shot. Required there. */
  session_scope: string;
  /** Maternity only, always 'yes': switches on MATERNITY SESSION GUIDELINES. */
  maternity_clauses_enabled: string;
  /** Maternity only: the estimated due date, printed in the clause. */
  due_date: string;
  /** 'yes' switches on PHOTOGRAPHING A MINOR. Automatic for family. */
  minors_clause_enabled: string;
  /** 'yes' switches on ILLNESS. Automatic for family. */
  illness_clause_enabled: string;
  /** 'yes' switches on PERMITS AND LOCATION ACCESS. Automatic for engagement. */
  permits_clause_enabled: string;
  /** Engagement only: the wedding this session leads up to, if it is booked. */
  wedding_date: string;
}

const SESSION_CONTRACT_SECTIONS: ContractSection[] = [
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
  // Same clause the wedding contract carries, for the case where someone else
  // is paying and signing (a parent booking a session, most often).
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
    title: 'SESSION DETAILS',
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
  // 'other' only. The whole point of the Other type is that it describes
  // itself rather than inheriting another type's assumptions, so this is the
  // one section that is required there and absent everywhere else.
  {
    title: 'SCOPE OF SESSION',
    optional: true,
    requireVariables: ['session_scope'],
    paragraphs: [
      { kind: 'text', text: 'This agreement covers the following session:' },
      { kind: 'text', text: '{{session_scope}}' },
    ],
  },
  {
    number: 'III',
    title: 'SERVICES',
    paragraphs: [
      { kind: 'text', text: 'The Photographer agrees to provide photography services for the session described above, for the duration listed.' },
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
          'Travel to the session location is included in the Total Payment above. Additional travel may be billed separately if discussed in advance.',
        ],
      },
      { kind: 'text', text: 'The online gallery will remain hosted for {{retention_months}} months after delivery. After that, retention is at the Photographer’s discretion. The Client is responsible for downloading and backing up images during the hosting window.' },
    ],
  },
  // Maternity only, and always on for that type rather than a checkbox Vero
  // could forget. A maternity session has a hard biological deadline, which is
  // the one thing the generic rescheduling clause cannot describe.
  {
    title: 'MATERNITY SESSION GUIDELINES',
    optional: true,
    requireVariables: ['maternity_clauses_enabled'],
    paragraphs: [
      {
        kind: 'fields',
        items: [{ label: 'Estimated Due Date', value: '{{due_date}}' }],
      },
      {
        kind: 'text',
        text: 'Maternity sessions are best photographed between roughly 28 and 36 weeks, and the session date above has been chosen with the estimated due date in mind. The Client agrees to tell the Photographer promptly if that estimate changes.',
      },
      {
        kind: 'text',
        text: 'If the Client gives birth, is placed on bed rest, or is otherwise medically unable to attend before the session takes place, the session may be rescheduled or converted to a newborn or family session by agreement, and the retainer will be carried over rather than forfeited.',
      },
      {
        kind: 'text',
        emphasis: 'italic',
        text: 'Because the window for this session closes on its own, the rescheduling window described below is understood to end at the birth.',
      },
    ],
  },
  // Family automatically; portrait and other can switch it on.
  //
  // Two separate ideas live here. A minor cannot be bound by a contract, so a
  // parent or guardian has to sign. And images of children are handled the
  // OTHER WAY AROUND from adults: nothing is published unless permission is
  // given, rather than published unless permission is withdrawn.
  {
    title: 'PHOTOGRAPHING A MINOR',
    optional: true,
    requireVariables: ['minors_clause_enabled'],
    paragraphs: [
      {
        kind: 'text',
        text: 'Where any subject of this session is under 18, this agreement is signed by that subject’s parent or legal guardian, who confirms they have the authority to agree to it on the minor’s behalf.',
      },
      {
        kind: 'text',
        text: 'A parent or guardian is expected to be present for the duration of the session and remains responsible for the supervision and safety of any minor present.',
      },
      {
        kind: 'text',
        emphasis: 'italic',
        text: 'The Photographer will not publish, display or otherwise use images of a minor for portfolio, website, social media or marketing purposes without the separate written permission of the parent or guardian. This applies whatever the MODEL RELEASE section below allows for adult subjects.',
      },
    ],
  },
  // Family automatically; portrait and maternity can switch it on.
  {
    title: 'ILLNESS',
    optional: true,
    requireVariables: ['illness_clause_enabled'],
    paragraphs: [
      {
        kind: 'text',
        text: 'Everyone appearing in the session should be fever-free for at least 24 hours beforehand, without medication, and free of any contagious illness.',
      },
      {
        kind: 'text',
        text: 'If the Client tells the Photographer in advance that someone is unwell, the session will be rescheduled under the terms below and no fee is lost. If anyone arrives visibly unwell, the Photographer may end or reschedule the session, and in that case the session is treated as a Client cancellation.',
      },
    ],
  },
  // Engagement automatically; every other session type can switch it on.
  {
    title: 'PERMITS AND LOCATION ACCESS',
    optional: true,
    requireVariables: ['permits_clause_enabled'],
    paragraphs: [
      {
        kind: 'text',
        text: 'Where the session takes place on private property, or somewhere that charges an entry fee or requires a photography permit, obtaining that permission and paying any fee is the Client’s responsibility unless agreed otherwise in writing.',
      },
      {
        kind: 'text',
        emphasis: 'italic',
        text: 'If access is refused on the day, the Photographer will move to the nearest suitable alternative location. Time lost to securing access counts toward the session time booked.',
      },
    ],
  },
  // Engagement only, and only once a wedding date actually exists. The date
  // itself is the gate, so nothing appears for a couple with no date yet.
  {
    title: 'RELATED WEDDING BOOKING',
    optional: true,
    requireVariables: ['wedding_date'],
    paragraphs: [
      {
        kind: 'text',
        text: 'The Client’s wedding is scheduled for {{wedding_date}}, and this session is to be completed before that date.',
      },
      {
        kind: 'text',
        emphasis: 'italic',
        text: 'This agreement covers this session only. Wedding coverage is booked under its own separate agreement, and nothing here reserves a wedding date.',
      },
    ],
  },
  // Offered on every type, wedding included.
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
  // Gated on the RATE itself rather than on a yes/no flag, so there is exactly
  // one thing to fill in and no way to switch the clause on without saying
  // what the rate is. Session types set it by default; wedding offers it as a
  // blank field, so an existing wedding contract renders byte for byte as
  // before until somebody deliberately types a rate.
  //
  // Covers two different things on purpose. Overtime protects Vero's time when
  // a session runs long because the Client asked it to. Out-of-pocket costs
  // cover the parking and entry fees she currently absorbs. Both are billed
  // through the portal as itemised charges, so the Client can see exactly what
  // was added and why, and both are explicitly hers to waive.
  {
    title: 'ADDITIONAL TIME AND EXPENSES',
    optional: true,
    requireVariables: ['overtime_rate'],
    paragraphs: [
      {
        kind: 'text',
        text: 'The session covers the time listed above. If it runs beyond that at the Client\u2019s request, or because of a delay on the Client\u2019s side, the additional time is billed at {{overtime_rate}}, charged in half hour increments.',
      },
      {
        kind: 'text',
        text: 'Costs the Photographer pays on the day in order to carry out the session, such as parking or an entry fee, are added to the balance at cost.',
      },
      {
        kind: 'bullets',
        items: [
          'Any such charge is itemised in the Client portal, with the reason shown, before it is due.',
          'Charges are added to the remaining balance, which is payable before images are delivered.',
          'The Photographer may waive any of these at her sole discretion, and frequently will.',
        ],
      },
      {
        kind: 'text',
        emphasis: 'italic',
        text: 'This does not apply where the session runs long for reasons within the Photographer\u2019s control.',
      },
    ],
  },
  // Optional, unnumbered, gated on BOTH travel variables. A booking inside the
  // included radius prunes it away, so every session contract already out
  // there re-renders exactly as it did. The wedding copy of this section
  // carries the full reasoning; the duplication is deliberate, for the reason
  // set out at the top of this block: the five session types and the wedding
  // point at different arrays, and a clause that appears in both has to be
  // changed in both on purpose.
  {
    title: 'TRAVEL',
    optional: true,
    requireVariables: ['travel_fee_amount', 'travel_round_trip_miles'],
    paragraphs: [
      {
        kind: 'text',
        text: 'Travel within 60 miles of the Photographer’s base, meaning 120 miles of driving in total, is included in the Total Payment at no charge. This session is further out than that, so a travel allowance has been agreed in advance and is already part of the Total Payment shown below.',
      },
      {
        kind: 'fields',
        items: [
          { label: 'Round Trip Distance', value: '{{travel_round_trip_miles}} miles' },
          { label: 'Included At No Charge', value: '120 miles round trip' },
          { label: 'Rate Beyond That', value: '$0.70 per mile of round trip distance' },
          { label: 'Travel Allowance', value: '{{travel_fee_amount}}, rounded up to the nearest $5' },
        ],
      },
      {
        kind: 'text',
        text: 'The allowance covers fuel, vehicle costs and the Photographer’s time on the road together. Driving time is never billed separately, at any rate, however long the journey takes on the day.',
      },
      {
        kind: 'text',
        emphasis: 'italic',
        text: 'This figure is fixed by this agreement. It is not a charge that appears afterwards, and no further travel cost will be added for the journey to and from this session.',
      },
    ],
  },
  // The custom form of the clause, for the case where Veronika typed the figure
  // instead of taking the one the miles produced. The wedding copy of this
  // section carries the full reasoning, and the duplication is deliberate for
  // the reason set out at the top of this block. In short: no rate and no
  // multiplication appear anywhere in it, because neither produced the number,
  // and the round trip distance appears once in prose as the REASON rather than
  // in a table beside the amount, where two numbers would imply a rate.
  //
  // Gated on travel_custom_amount, which applyTravelDecision writes only on the
  // custom path and blanks on the computed one, so exactly one of the two
  // TRAVEL sections can ever print and a booking with neither key prunes both.
  {
    title: 'TRAVEL',
    optional: true,
    requireVariables: ['travel_custom_amount', 'travel_round_trip_miles'],
    paragraphs: [
      {
        kind: 'text',
        text: 'The journey to the session location and back is {{travel_round_trip_miles}} miles, which is further than the travel included in the Total Payment at no charge. The Client therefore agrees to a travel allowance of {{travel_custom_amount}} for the Photographer’s travel to and from the session, settled in advance and already included in the Total Payment shown below.',
      },
      {
        kind: 'fields',
        items: [{ label: 'Travel Allowance', value: '{{travel_custom_amount}}' }],
      },
      {
        kind: 'text',
        text: 'The allowance covers fuel, vehicle costs and the Photographer’s time on the road together. It is a single sum agreed for this booking, and driving time is never billed separately, however long the journey takes on the day.',
      },
      {
        kind: 'text',
        emphasis: 'italic',
        text: 'This figure is fixed by this agreement. It is not a charge that appears afterwards, and no further travel cost will be added for the journey to and from this session.',
      },
    ],
  },
  // Same payment model as the wedding contract, on purpose: the balance falls
  // due after the session, and nothing is delivered until it is paid. The
  // gallery is the leverage, so there is no reason to demand money up front.
  {
    number: 'IV',
    title: 'PAYMENT',
    paragraphs: [
      {
        kind: 'fields',
        items: [
          { label: 'Total Payment', value: '{{total_amount}}' },
          { label: 'Retainer (Non-Refundable)', value: '{{retainer_amount}} (due at signing)' },
          { label: 'Remaining Balance', value: '{{remaining_balance}} (due within {{balance_due_window}} after the session date)' },
        ],
      },
      { kind: 'text', emphasis: 'italic', text: 'The session date is not reserved until this contract is signed and the retainer is paid.' },
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
  // Softer than the wedding clause, deliberately. A session client has often
  // paid in full weeks ahead, and forfeiting everything over a cancellation
  // made in good time is the kind of term that gets argued rather than
  // enforced. The retainer still does its job.
  {
    number: 'VI',
    title: 'CANCELLATION / RESCHEDULING',
    paragraphs: [
      {
        kind: 'bullets',
        items: [
          'The retainer is non-refundable.',
          'If the Client cancels, the retainer is forfeited. Any amount already paid above the retainer is returned.',
          'A session may be rescheduled once, subject to the Photographer’s availability. The retainer carries over to the new date.',
          'A rescheduled session must take place within {{reschedule_window}} of the original date, after which the retainer is forfeited.',
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
        items: [
          'reschedule the session to a mutually agreed date, OR',
          'attempt to find a replacement photographer, OR',
          'refund all payments received',
        ],
      },
    ],
  },
  // The wedding list's first two bullets are about running an event (cooperation
  // during a schedule, venue restrictions) and have no meaning for a session.
  {
    number: 'VIII',
    title: 'LIABILITY',
    paragraphs: [
      { kind: 'text', text: 'Photographer is not liable for:' },
      {
        kind: 'bullets',
        items: [
          'weather conditions',
          'equipment failure (reasonable backup efforts will be made)',
          'the natural behaviour of children, infants or animals during the session',
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
          'arrive at the agreed start time, understanding that lateness comes out of the session time booked',
          'bring everyone who is meant to appear in the photographs',
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
  // Unchanged from the wedding contract: permission is granted, and a client
  // who would rather not appear says so in writing. The one carve-out is
  // minors, handled the other way around in PHOTOGRAPHING A MINOR above.
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
    title: 'ADDITIONAL NOTES',
    optional: true,
    paragraphs: [{ kind: 'text', text: '{{additional_notes}}' }],
  },
  {
    number: 'XIII',
    title: 'SIGNATURES',
    paragraphs: [{ kind: 'signature_block' }],
  },
];

/** One body, five titles. The title is what the client reads at the top. */
function sessionTemplate(title: string): ContractTemplate {
  return { title, sections: SESSION_CONTRACT_SECTIONS };
}

/**
 * The variable fields every session type shows in the admin, in form order.
 *
 * Mirrors WEDDING_TEMPLATE_FIELDS, with session wording and two changed
 * defaults Alex chose: two weeks rather than five, and a rescheduling window.
 */
const SESSION_BASE_FIELDS: ContractTemplateField[] = [
  {
    key: 'photographer_name',
    label: 'Photographer Name',
    labelRu: 'Имя фотографа',
    defaultValue: 'Veronika Polbina',
    helpText: 'Shows on the contract as the Photographer party.',
  },
  {
    key: 'event_location',
    label: 'Session Location',
    labelRu: 'Место съёмки',
    placeholder: 'Place name, street, city, state, ZIP',
    helpText:
      'A full street address, not just the place name. A name that resolves on one map app often resolves nowhere else. Use Look it up below to check it, and to read off the distance and drive time.',
    required: true,
  },
  {
    key: 'effective_date',
    label: 'Effective Date',
    labelRu: 'Дата вступления в силу',
    type: 'date',
    helpText: 'The date the contract is meant to take effect. Usually today.',
  },
  {
    key: 'deliverables',
    label: 'Deliverables',
    labelRu: 'Что получает клиент',
    defaultValue: 'Edited digital images with color correction',
    // Deliberately no image count in the default. Any number promised reads as
    // too small next to what actually gets delivered, so the promise stays
    // qualitative unless Vero types a number for a specific booking.
    helpText: 'What the client receives. Leaving it as the default avoids promising a count.',
  },
  {
    key: 'delivery_timeframe',
    label: 'Delivery Timeframe',
    labelRu: 'Срок сдачи',
    defaultValue: 'Within 2 weeks after the session',
    helpText: 'How long after the session the photos will be delivered.',
  },
  {
    key: 'balance_due_window',
    label: 'Balance Due Window',
    labelRu: 'Срок оплаты остатка',
    defaultValue: 'TEN (10) Days',
    helpText: 'How long after the session date the remaining balance is due. Nothing is delivered until it is paid.',
  },
  {
    key: 'reschedule_window',
    label: 'Rescheduling Window',
    labelRu: 'Срок переноса',
    defaultValue: 'three (3) months',
    helpText: 'How long a rescheduled session stays claimable before the retainer is forfeited.',
  },
  {
    key: 'overtime_rate',
    label: 'Overtime Rate',
    labelRu: 'Ставка за переработку',
    defaultValue: '$150 per hour',
    helpText:
      'Billed only if the session runs long at the client\u2019s request. Clearing this removes the whole clause, including the one covering parking and entry fees.',
  },
  {
    key: 'payment_methods',
    label: 'Payment Methods',
    labelRu: 'Способы оплаты',
    defaultValue: 'Cash, Venmo, CashApp or Zelle',
    helpText: 'Comma-separated payment methods the client can use.',
  },
  {
    key: 'retention_months',
    label: 'Gallery Retention (months)',
    labelRu: 'Хранение галереи (месяцы)',
    type: 'number',
    defaultValue: '3',
    helpText: 'How long the photo gallery stays online after delivery. Default is 3.',
  },
];

/** Every optional clause a type can offer, so the form can render checkboxes. */
export const OPTIONAL_CLAUSES: Record<string, { label: string; helpText: string }> = {
  two_camera_enabled: {
    label: 'Two-camera coverage',
    helpText:
      'Wedding only. Adds a clause saying the second camera is an assistant, not a second professional photographer.',
  },
  additional_retouching_enabled: {
    label: 'Option for additional retouching',
    helpText: 'Adds a clause saying advanced retouching can be bought separately after delivery.',
  },
  minors_clause_enabled: {
    label: 'Photographing a minor',
    helpText:
      'A parent or guardian signs on the child’s behalf, and images of children are not published without their separate written permission.',
  },
  illness_clause_enabled: {
    label: 'Illness',
    helpText: 'Fever-free for 24 hours, and what happens when somebody turns up unwell.',
  },
  permits_clause_enabled: {
    label: 'Permits and location access',
    helpText: 'Entry fees and photography permits are the client’s to arrange. Useful for parks and private property.',
  },
};

export const CONTRACT_TEMPLATES: Record<string, ContractTemplateSpec> = {
  wedding: {
    key: 'wedding',
    name: 'Wedding',
    template: WEDDING_CONTRACT_TEMPLATE,
    fields: WEDDING_TEMPLATE_FIELDS,
    couple: true,
    coveragePresets: true,
    optionalClauses: ['two_camera_enabled', 'additional_retouching_enabled'],
  },
  portrait: {
    key: 'portrait',
    name: 'Portrait',
    template: sessionTemplate('PORTRAIT PHOTOGRAPHY CONTRACT'),
    fields: SESSION_BASE_FIELDS,
    optionalClauses: [
      'additional_retouching_enabled',
      'minors_clause_enabled',
      'illness_clause_enabled',
      'permits_clause_enabled',
    ],
  },
  family: {
    key: 'family',
    name: 'Family',
    template: sessionTemplate('FAMILY PHOTOGRAPHY CONTRACT'),
    fields: SESSION_BASE_FIELDS,
    // On automatically, not offered as a checkbox: a family session almost
    // always includes a child, and these are the two clauses that would be
    // missed exactly when they matter.
    defaultVariables: { minors_clause_enabled: 'yes', illness_clause_enabled: 'yes' },
    optionalClauses: ['additional_retouching_enabled', 'permits_clause_enabled'],
  },
  engagement: {
    key: 'engagement',
    name: 'Engagement',
    template: sessionTemplate('ENGAGEMENT SESSION CONTRACT'),
    fields: [
      ...SESSION_BASE_FIELDS,
      {
        key: 'wedding_date',
        label: 'Wedding Date (optional)',
        labelRu: 'Дата свадьбы (необязательно)',
        type: 'date',
        helpText:
          'If their wedding is already booked, this adds a clause noting the session comes first. Leave blank and the clause does not appear.',
      },
    ],
    couple: true,
    defaultVariables: { permits_clause_enabled: 'yes' },
    optionalClauses: [
      'additional_retouching_enabled',
      'illness_clause_enabled',
      'minors_clause_enabled',
    ],
  },
  maternity: {
    key: 'maternity',
    name: 'Maternity',
    template: sessionTemplate('MATERNITY PHOTOGRAPHY CONTRACT'),
    fields: [
      ...SESSION_BASE_FIELDS,
      {
        key: 'due_date',
        label: 'Estimated Due Date',
        labelRu: 'Предполагаемая дата родов',
        type: 'date',
        required: true,
        helpText: 'Printed in the contract, and what the timing and reschedule wording hang on.',
      },
    ],
    defaultVariables: { maternity_clauses_enabled: 'yes' },
    optionalClauses: ['additional_retouching_enabled', 'illness_clause_enabled'],
  },
  other: {
    key: 'other',
    name: 'Other / Custom',
    template: sessionTemplate('PHOTOGRAPHY SESSION CONTRACT'),
    fields: [
      ...SESSION_BASE_FIELDS,
      {
        key: 'session_scope',
        label: 'What is being photographed',
        labelRu: 'Что снимаем',
        type: 'textarea',
        required: true,
        placeholder: 'e.g. A branding session for a small business, headshots plus workspace photographs.',
        helpText:
          'Printed in the contract as the scope. This is what makes an Other contract specific, since it inherits no wording from the named types.',
      },
    ],
    allowsCustomLabel: true,
    optionalClauses: [
      'additional_retouching_enabled',
      'minors_clause_enabled',
      'illness_clause_enabled',
      'permits_clause_enabled',
    ],
  },
};

/**
 * Variables that belong to ONE type and gate that type's own clause.
 *
 * The five session types share a single sections array, so the template alone
 * cannot say which clauses a type is allowed to print. Without this list two
 * things went wrong. Switching a maternity portal to portrait left
 * maternity_clauses_enabled set, and the portrait contract carried on printing
 * MATERNITY SESSION GUIDELINES with the due date still in it. And the admin's
 * variable editor, which derives its rows from the template, offered every
 * session type a session_scope box, so typing into it printed a SCOPE OF
 * SESSION section on a booking whose type never offers one.
 *
 * A type owns one of these only if it declares it as a field, offers it as a
 * checkbox, or forces it on. Everything else gets stripped before the body is
 * rendered.
 */
export const TYPE_GATED_VARIABLES = [
  'two_camera_enabled',
  'maternity_clauses_enabled',
  'due_date',
  'minors_clause_enabled',
  'illness_clause_enabled',
  'permits_clause_enabled',
  'wedding_date',
  'session_scope',
] as const;

/** The subset of TYPE_GATED_VARIABLES this type is allowed to carry. */
export function ownedGatedVariables(key: string): Set<string> {
  const spec = CONTRACT_TEMPLATES[key];
  const owned = new Set<string>();
  if (!spec) return owned;
  for (const f of spec.fields) owned.add(f.key);
  for (const c of spec.optionalClauses ?? []) owned.add(c);
  for (const k of Object.keys(spec.defaultVariables ?? {})) owned.add(k);
  return new Set(TYPE_GATED_VARIABLES.filter((v) => owned.has(v)));
}

/**
 * Drop any type-gated variable this type does not own.
 *
 * Call this on the way IN to rendering, wherever contract_variables are saved.
 * It is what stops a clause following a booking across a type change, which is
 * the cross-type leak with no warning sign: the contract simply carries a
 * paragraph about somebody else's session and nothing looks wrong.
 */
export function stripForeignTypeVariables(
  key: string,
  vars: Record<string, string>,
): Record<string, string> {
  const owned = ownedGatedVariables(key);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if ((TYPE_GATED_VARIABLES as readonly string[]).includes(k) && !owned.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Registry order for the admin dropdown. Wedding first, Other last. */
export const CONTRACT_TYPE_ORDER = [
  'wedding',
  'portrait',
  'family',
  'engagement',
  'maternity',
  'other',
] as const;

/** True when the key names a real template. Used to validate server-side. */
export function isContractTemplateKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONTRACT_TEMPLATES, key);
}

/**
 * The variables a type requires before a contract can be created.
 *
 * Derived from the spec's own field list rather than hardcoded, so adding a
 * required field to a type automatically starts being enforced in the admin
 * form AND at the API, which is the half that matters: the form can be
 * bypassed, and a maternity contract with no due date prints "[due_date]" to
 * the client.
 */
export function requiredVariablesFor(key: string): string[] {
  const spec = CONTRACT_TEMPLATES[key];
  if (!spec) return [];
  return spec.fields.filter((f) => f.required).map((f) => f.key);
}


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

/**
 * The customer-facing reply engine's core rules, declared in ONE place.
 *
 * WHY THIS EXISTS
 * These rules used to live only as prose inside the system prompt in
 * api/_ai-reply.ts. That had two consequences, both of which bit:
 *
 *  1. Nothing else knew they existed. Vero told the in-panel assistant three
 *     times to stop replying as "Vero's Assistant". Each time it agreed, and
 *     each time it wrote a `tone` entry — because its instructions funnel all
 *     behavioural feedback into `tone`, and `tone` is injected under a heading
 *     that reads "KNOWN FACTS (only cite these)", below a block marked "never
 *     violate". Her instruction could not win, and nothing told her that.
 *
 *  2. Some of these rules SHOULD be adjustable and some must not be. Pricing
 *     ranges and never-confirming-a-date are safety rails protecting real
 *     bookings. The persona is a preference. Hard-coding them identically made
 *     the preference as immovable as the safety rail.
 *
 * So: the assistant reads this list, can tell Vero exactly which rule her
 * request collides with, and — for `adjustable` ones — knows the supported way
 * to change it. Non-adjustable ones it explains and refuses, pointing at Alex.
 */

export interface CoreRule {
  id: string;
  /** One line, in Vero's terms — this is what the assistant quotes back. */
  summary: string;
  /** Why it exists, so the assistant can explain rather than just refuse. */
  rationale: string;
  /**
   * Adjustable rules have a supported mechanism. Safety rails do not — those
   * protect money and commitments, and a wrong one costs a real booking.
   */
  adjustable: boolean;
  /** How to change it, when adjustable. Shown to the assistant verbatim. */
  mechanism?: string;
}

export const CORE_RULES: CoreRule[] = [
  {
    id: 'persona',
    summary:
      'Replies are written as Vero\'s assistant, referring to Vero in the third person — unless the reply persona is set to first person.',
    rationale:
      'Whether a draft reads as Vero herself or as an assistant speaking for her is a preference, not a safety matter. Every draft is reviewed before it goes out.',
    adjustable: true,
    mechanism:
      'Set the ai_context row category="identity", label="Reply persona" to "vero" (write as Vero, first person) or "assistant" (default). If switching to "vero", also rewrite category="identity", label="First-message intro" so it no longer introduces an assistant.',
  },
  {
    id: 'never-confirm-dates',
    summary: 'Never confirm availability on a specific date. Only Vero does that.',
    rationale:
      'A draft that says "that date works" reads as a held date to the customer. Vero is the only one who knows her real calendar, and a wrongly implied hold costs a booking.',
    adjustable: false,
  },
  {
    id: 'pricing-ranges',
    summary: 'Give pricing as ranges or starting points, never a firm quote.',
    rationale:
      'A firm number the customer treats as binding, on a shoot whose real price depends on hours, travel and guest count.',
    adjustable: false,
  },
  {
    id: 'no-invented-facts',
    summary: 'Only state facts that are in the knowledge base. Never invent details.',
    rationale: 'An invented deliverable or turnaround becomes a promise Vero has to keep.',
    adjustable: false,
  },
];

/** Rendered into the in-panel assistant's prompt so it can push back accurately. */
export function coreRulesForAssistant(): string {
  return CORE_RULES.map((r) => {
    const head = `- **${r.id}** — ${r.summary}\n  Why: ${r.rationale}`;
    return r.adjustable
      ? `${head}\n  ADJUSTABLE. To change it: ${r.mechanism}`
      : `${head}\n  NOT ADJUSTABLE by you or by Vero through this chat — it protects a real booking. Explain it and suggest she message Alex if she genuinely wants it changed.`;
  }).join('\n');
}

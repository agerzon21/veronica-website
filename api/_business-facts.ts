/**
 * The authoritative business facts the customer-facing reply engine is
 * allowed to state, generated from the same file the weddings page renders.
 *
 * WHY THIS EXISTS
 * The reply engine's system prompt has always said "KNOWN FACTS (only cite
 * these, never invent details)" and "NEVER commit to deliverables or timing".
 * Those rules were correct and the assistant broke them anyway: asked what a
 * package included, it wrote "500-700 professionally edited photos" to a real
 * prospective client. That number appears nowhere on the site and nowhere in
 * the contracts. src/data/contract-template.ts says the opposite, that "the
 * number of images, turnaround time, and any associated additional fees will
 * be agreed upon separately".
 *
 * The rule did not fail because it was missing. It failed because KNOWN FACTS
 * was a hand-maintained ai_context table that had drifted away from the site,
 * and a model with a gap in front of it fills the gap from everything else it
 * has ever read. Every wedding photographer on the internet quotes 500-700.
 * Telling a model "do not invent" does not help when it does not know it is
 * inventing.
 *
 * So this file does two things the prose rules could not:
 *
 *  1. Renders the REAL numbers out of src/data/wedding-page.json, the file the
 *     public weddings page renders from. Prices, hours, retainer, balance due,
 *     delivery window and travel policy therefore cannot drift from what the
 *     customer can read for themselves. Same principle as api/_packages.ts,
 *     which resolves package prices server-side so a forged query parameter
 *     cannot get quoted back at someone as though we had agreed to it.
 *
 *  2. Declares the facts we deliberately DO NOT have. A gap the model can see
 *     labelled is a gap it stops filling. This is the part that actually stops
 *     the 500-700 failure, and the reason this file is not just a data dump.
 *
 * Vero's ai_context rows still load and still win on anything they cover. This
 * is the floor, not the ceiling: the things that must be true whatever else
 * the knowledge base says.
 */

import weddingData from '../src/data/wedding-page.json' with { type: 'json' };

interface WeddingPackage {
  name: string;
  price: string;
  coverage: string;
  tagline?: string;
  buildsOn?: string;
  includes?: string[];
}

interface AddOn {
  name: string;
  detail: string;
}

interface FaqEntry {
  q: string;
  a: string;
}

interface WeddingPageData {
  packages?: WeddingPackage[];
  addOns?: AddOn[];
  travel?: string;
  booking?: string;
  faq?: FaqEntry[];
}

const data = weddingData as WeddingPageData;

/** Strip a trailing period so bullets join cleanly. */
const trim = (s: string): string => s.trim().replace(/\s+/g, ' ');

/**
 * Pull one FAQ answer by matching its question. Returns null when the entry
 * has been renamed or removed, so a reworded FAQ degrades to silence rather
 * than to a stale answer quoted with confidence.
 */
function faqAnswer(needle: string): string | null {
  const hit = (data.faq ?? []).find((f) =>
    f.q.toLowerCase().includes(needle.toLowerCase()),
  );
  return hit ? trim(hit.a) : null;
}

function packageLines(): string[] {
  return (data.packages ?? []).map((p) => {
    const head = [p.name, p.price, p.coverage].filter(Boolean).join(', ');
    const includes = (p.includes ?? []).map(trim).join('; ');
    const builds = p.buildsOn ? `${trim(p.buildsOn)}: ` : 'Includes: ';
    return includes ? `- ${head}. ${builds}${includes}.` : `- ${head}.`;
  });
}

/**
 * The customer-facing facts block. Rendered into the reply engine's system
 * prompt above Vero's own ai_context rows.
 */
export function businessFactsForCustomerReplies(): string {
  const sections: string[] = [];

  const packages = packageLines();
  if (packages.length) {
    sections.push(`WEDDING PACKAGES (these are the real prices, as shown on the website)\n${packages.join('\n')}`);
  }

  const addOns = (data.addOns ?? []).map((a) => `- ${trim(a.name)}: ${trim(a.detail)}`);
  if (addOns.length) {
    sections.push(`ADD-ONS\n${addOns.join('\n')}`);
  }

  if (data.booking) {
    sections.push(`BOOKING\n- ${trim(data.booking)}`);
  }

  const deposit = faqAnswer('deposit');
  if (deposit) {
    sections.push(`RETAINER AND BALANCE\n- ${deposit}`);
  }

  // "What exactly do we receive" is the entry carrying the print release and
  // the RAW exclusion, so it matters more than its bland title suggests.
  const deliveryBullets = [
    faqAnswer('what exactly do we receive'),
    faqAnswer('when and how do we get our photos'),
    faqAnswer('difference between color correction and retouching'),
  ]
    .filter(Boolean)
    .map((a) => `- ${a}`);
  if (deliveryBullets.length) {
    sections.push(`DELIVERY AND EDITING\n${deliveryBullets.join('\n')}`);
  }

  if (data.travel) {
    sections.push(`TRAVEL\n- ${trim(data.travel)}`);
  }

  const drone = faqAnswer('drone');
  if (drone) {
    sections.push(`DRONE\n- ${drone}`);
  }

  // What Vero needs before a wedding, in her own published words. This is the
  // list the reply should be working through when it asks its one follow-up
  // question, rather than a list the model improvises.
  const needed = faqAnswer('what information do you need before the wedding');
  const secondShooter = faqAnswer('do we need a second photographer');
  const gatherBullets = [needed, secondShooter].filter(Boolean).map((a) => `- ${a}`);
  if (gatherBullets.length) {
    sections.push(`WHAT TO GATHER FROM A LEAD\n${gatherBullets.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * The facts we deliberately do not have, stated as facts.
 *
 * Every line here is something a customer plausibly asks and a model
 * plausibly answers from its training data rather than from us. Naming the
 * gap is what stops it being filled: "never invent" is advice, "we do not
 * publish an image count and here is what to say instead" is an instruction
 * with somewhere to go.
 *
 * Each entry gives the model a TRUE thing to say, because a rule that only
 * forbids leaves the model choosing between inventing and stonewalling, and
 * it will invent. Stonewalling a question we can half-answer is its own
 * failure: see rule 5 in the system prompt.
 */
export function unknownsForCustomerReplies(): string {
  return [
    'These are things we do NOT publish. Stating one invents a promise Vero then has to keep. Each line says what to say instead.',
    '',
    '- NUMBER OF PHOTOS DELIVERED. We publish no count and no range, for any package. src/data/contract-template.ts states that the number of images is agreed separately between client and photographer. Do not say "around 400", "500 to 700", "hundreds", or any other figure, even loosely, even if the customer offers a number first and asks you to confirm it. Say instead: it depends on how long the day runs and the guest count, and the exact number is confirmed in the contract.',
    '- A FIRM TOTAL PRICE. Packages are starting points ("from $900"), and the real number depends on hours, travel and guest count. Give the starting figure and say the final quote is confirmed before booking.',
    '- AVAILABILITY ON A DATE. Never say or imply a date is open or held. Only Vero confirms dates.',
    '- TURNAROUND FASTER THAN THE PUBLISHED WINDOW. Five weeks is the published figure and it is typical, not a floor. Never promise sooner, and never promise a specific calendar date for a gallery.',
    '- RAW FILES. They are not included, in any package. This is not negotiable by you.',
    '- DRONE COVERAGE AS A GUARANTEE. It depends on flight rules, airspace and weather, so it is a bonus and never a promise, including on full-day packages where it is normally included.',
    '- SECOND SHOOTER OR VIDEOGRAPHER AVAILABILITY. We do not currently offer videography. Do not imply video is available.',
    '- ANYTHING ABOUT INSURANCE, CONTRACTS, CANCELLATION TERMS OR REFUNDS beyond what is written in the facts above. These are money and legal commitments. Say Vero will follow up personally.',
  ].join('\n');
}

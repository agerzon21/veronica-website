/**
 * Follow-ups (2026-10-26): the chasing Vero does every day, by hand, for
 * contracts not signed, retainers not in and balances not paid, turned into
 * one button. The button asks the conversation's Assistant for a draft; the
 * draft lands in the Reply tab and Vero sends it. A follow-up counts as done
 * when a message to that client actually goes out (api/admin/_portals.ts,
 * last_contact_at), so "done for the day" is never a box someone forgot.
 */

export type FollowUpReason = 'deposit' | 'unsigned' | 'balance';

/** Days a client is left alone after a message before they are due again. */
export const FOLLOW_UP_GAP_DAYS = 3;

/** The calendar day in Vero's time zone, which is the day "today" means to her. */
const studioDay = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);

/**
 * today: something went out to them today, so this one is done.
 * recent: within the last few days; leave them be.
 * due: nothing yet, or it has been a while.
 */
export function followUpState(lastContactIso: string | null | undefined, now = new Date()): 'today' | 'recent' | 'due' {
  if (!lastContactIso) return 'due';
  const last = new Date(lastContactIso);
  if (Number.isNaN(last.getTime())) return 'due';
  if (studioDay(last) === studioDay(now)) return 'today';
  const days = (now.getTime() - last.getTime()) / 86_400_000;
  return days < FOLLOW_UP_GAP_DAYS ? 'recent' : 'due';
}

/**
 * What the Assistant is asked for. English, because it is an instruction to
 * the Assistant, which writes to the client in the client's own language.
 * Every request ends "Do not send it yet": the send gate
 * (api/_house-style.ts, looksLikeSendApproval) reads that and refuses to send
 * on it, so the only thing that can send the follow-up is Vero saying so.
 */
export function followUpPrompt(args: {
  name: string;
  reason: FollowUpReason;
  amount: string | null;
  eventDate: string | null;
  invitePending?: boolean;
  /** Which booking this is about, e.g. "wedding", when the client has more than one. */
  session?: string | null;
  /**
   * The client's OTHER bookings and where each stands. On 2026-10-26 a
   * follow-up asked a couple to sign and pay for an engagement they had
   * already signed and paid for, because the request said nothing about it.
   */
  others?: Array<{ session: string; date: string | null; status: string }>;
}): string {
  const when = args.eventDate ? ` The session is on ${args.eventDate}.` : '';
  const portal = 'their client portal at vero.photography/portal';
  const body =
    args.reason === 'deposit'
      ? `Their contract is signed, but the ${args.amount ?? ''} retainer has not arrived yet.${when} Gently remind them the date is only reserved once the retainer is in, and that they can pay it from ${portal} (by card) or by Zelle, Venmo, Cash App or cash.`
      : args.reason === 'unsigned'
        ? args.invitePending
          ? `They have not set up their client portal yet, so their contract is not signed.${when} Remind them to open the invite email from Vero Photography to set up their portal, then sign the contract and send the ${args.amount ?? ''} retainer, since the date is only reserved once both are done. If they cannot find the invite, they can just reply and we will resend it.`
          : `Their contract is not signed yet.${when} Remind them to sign it in ${portal} and send the ${args.amount ?? ''} retainer, since the date is only reserved once both are done.`
        : `Their session${args.eventDate ? ` on ${args.eventDate}` : ''} is done and a balance of ${args.amount ?? ''} is still due. Thank them warmly, and remind them they can pay it from ${portal} or by Zelle, Venmo, Cash App or cash.`;
  const about = args.session && (args.others?.length ?? 0) > 0 ? ` This is about their ${args.session} only.` : '';
  const others = (args.others ?? []).length
    ? ` Their other booking${args.others!.length > 1 ? 's' : ''}: ${args.others!
        .map((o) => `${o.session}${o.date ? ` on ${o.date}` : ''}: ${o.status}`)
        .join('; ')}. Do not ask about anything already done there.`
    : '';
  return `Draft a short, warm follow-up email to ${args.name}.${about} ${body.replace(/\s+/g, ' ').trim()}${others} Keep it brief and friendly, not pushy, and do not open the way the last email in this thread opened. Save it as the draft in the Reply tab. Do not send it yet.`;
}

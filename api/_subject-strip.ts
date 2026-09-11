/**
 * Remove a leading subject header from reply text.
 *
 * Replies in this system ALWAYS continue an existing thread: email delivery
 * derives "Re: <thread subject>" itself, and Instagram has no subjects. A
 * "Subject:" line in a reply body is therefore never correct — it arrives as
 * literal text in the middle of an email chain.
 *
 * This exists because asking the model to stop doing it did not work. Vero
 * told the assistant four separate times; the note even landed in the
 * knowledge base on the fourth, and one line in a large prompt still loses
 * to email-format gravity often enough to keep burning her. Binary rules
 * get enforced in code.
 *
 * Conservative on purpose: only the FIRST substantive lines are examined,
 * so a body that merely mentions the word "subject" is untouched, and text
 * with no subject header passes through byte-identical.
 */
const DIVIDER = /^[\s\-–—_*]{1,10}$/;
const SUBJECT = /^(\*\*)?\s*(subject|тема)\s*:/i;

export function stripSubjectHeader(text: string): string {
  const lines = text.split(/\r?\n/);
  let subjectIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '' || DIVIDER.test(t)) continue;
    if (SUBJECT.test(t)) subjectIdx = i;
    break; // the first substantive line decides either way
  }
  if (subjectIdx === -1) return text;
  let j = subjectIdx + 1;
  while (j < lines.length && (lines[j].trim() === '' || DIVIDER.test(lines[j].trim()))) j++;
  return lines.slice(j).join('\n').trimStart();
}

/**
 * Remove header-formatted subject lines from ASSISTANT CHAT PROSE.
 *
 * stripSubjectHeader above guards what reaches the customer (drafts, sends).
 * This one guards what Vero SEES: the assistant presents drafts inside its
 * chat bubbles as plain prose — "Here's a follow-up for Nicole: Subject: …" —
 * which goes through no tool and so passed no guard. Vero was then staring
 * at a subject line in the chat while the actual draft underneath was clean,
 * which is indistinguishable from the rule not working at all.
 *
 * Line-level and format-anchored on purpose: only lines SHAPED like an email
 * header die ("Subject: X" / "**Тема: X**" alone on a line). Prose that
 * mentions the word — "the subject of her email was…" — is untouched.
 */
export function scrubSubjectLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((l) => !/^(\*{0,2}|_{0,2})\s*(subject|тема)\s*:/i.test(l.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

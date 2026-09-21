/**
 * Is there a real keyboard attached?
 *
 * Asked so a composer can send on plain Enter where that is the expected
 * thing, and stay out of the way where it is not. On a touch keyboard Enter
 * is the ONLY way to get a line break, so sending on it would make a
 * multi-line reply impossible to type and would fire the message off
 * mid-sentence.
 *
 * `(hover: hover) and (pointer: fine)` is the closest the platform gets to
 * the question. It is about input hardware, not screen size, so a width
 * breakpoint is no use here: a 1024px tablet with no keyboard must answer
 * false and a 1024px laptop must answer true.
 *
 * Called at press time rather than cached, so a tablet that gains or loses a
 * keyboard mid-session answers correctly from the next keystroke on.
 *
 * Lives here rather than in either composer because both need it and they
 * import in one direction: AdminMessages renders AdminAssistantChat, so the
 * chat cannot import back out of it without a cycle.
 */
export function hasHardwareKeyboard(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * How a part number is spoken.
 *
 * Shared rather than duplicated because two surfaces render it: the
 * public post, where it sits beside the date as "PART TWO OF TWO", and
 * the admin editor, which previews that exact string before saving. A
 * preview that says "Part 2" while the site says "Part Two" is worse
 * than no preview, because it teaches you to distrust it.
 *
 * Words run out at six on purpose. Past that a numeral is clearer than
 * "Part Fourteen", and no story here is going to need it.
 */
export function partWord(n: number): string {
  return ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][n] ?? String(n);
}

/**
 * The header's brand mark (spec §3.1).
 *
 * The square carries the organizer's logo image, or the FIRST LETTER of the
 * brand or event name — a letter, never a drawn glyph, so an organizer with no
 * artwork still gets an identity rather than a placeholder.
 */
export function seatLayerHeaderInitial(...names: readonly (string | undefined)[]): string {
  for (const name of names) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    // Graphemes, not UTF-16 units: an emoji brand still yields one mark.
    if (trimmed) return [...trimmed][0]!.toUpperCase();
  }
  return '';
}

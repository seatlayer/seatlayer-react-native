/** What one picture is of. Read once from the page's address. */
const query = new URLSearchParams(
  typeof window === 'undefined' ? '' : window.location.search,
);

function inset(name: string): number {
  return Number(query.get(name) ?? 0);
}

export const picturesSetup = Object.freeze({
  scenario: query.get('scenario') ?? 'overview',
  mode: query.get('mode') === 'dark' ? ('dark' as const) : ('light' as const),
  rtl: query.get('rtl') === '1',
  fontScale: Number(query.get('text') ?? 1),
  fontFamily: 'Roboto, "Noto Sans Arabic"',
  insets: Object.freeze({
    top: inset('top'),
    right: inset('right'),
    bottom: inset('bottom'),
    left: inset('left'),
  }),
});

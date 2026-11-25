import { normalizeSeatLayerPickerRowLabel } from './format';

export interface SeatLayerCartSeatsLineItem {
  readonly label?: string | null;
  readonly displayLabel?: string | null;
  readonly sectionLabel?: string | null;
  readonly rowLabel?: string | null;
  readonly seatNumber?: string | null;
}

const trimmed = (value: string | null | undefined): string => (value ?? '').trim();

/**
 * The seats under the count, as the hosted map writes them: the section once
 * when every ticket shares it, then each seat as row-seat ("Dress Circle · C-6,
 * C-7"). A table booked as one, a booth or a standing area is its own name, and
 * the same place stands once.
 */
export function seatLayerCartSeatsLine(lines: readonly SeatLayerCartSeatsLineItem[]): string {
  const sections = new Set(lines.map((line) => trimmed(line.sectionLabel)));
  const one = sections.size === 1 ? trimmed(lines[0]?.sectionLabel) : '';
  const places = lines.map((line) => {
    const section = trimmed(line.sectionLabel);
    const seat = [trimmed(normalizeSeatLayerPickerRowLabel(line.rowLabel ?? '', line.sectionLabel ?? '')), trimmed(line.seatNumber)]
      .filter(Boolean).join('-');
    const place = seat || trimmed(line.displayLabel) || trimmed(line.label);
    return `${one || !section ? '' : `${section} `}${place}`.trim();
  }).filter(Boolean);
  return `${one && places.length > 0 ? `${one} · ` : ''}${[...new Set(places)].join(', ')}`;
}

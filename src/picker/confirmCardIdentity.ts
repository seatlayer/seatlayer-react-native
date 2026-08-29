import type { SelectedSeat } from "../types";
import { normalizeSeatLayerPickerRowLabel } from "./format";

type Translator = (key: string, options?: { values?: Record<string, string> }) => string;

/** Builds the visible card identity through locale templates, never by joining English fragments. */
export function seatLayerPickerConfirmIdentity(
  seat: SelectedSeat,
  sectionId: string | undefined,
  translate: Translator,
): string {
  const section = clean(seat.sectionLabel);
  const row = normalizeSeatLayerPickerRowLabel(clean(seat.rowLabel), section, sectionId);
  const parts = [
    section,
    row ? translate("rowIdentity", { values: { row } }) : "",
    clean(seat.seatNumber ?? seat.displayLabel ?? seat.label)
      ? translate("seatNumberIdentity", {
        values: { seat: clean(seat.seatNumber ?? seat.displayLabel ?? seat.label) },
      })
      : "",
  ].filter(Boolean).join(" · ");
  return translate("seatIdentity", { values: { parts } });
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

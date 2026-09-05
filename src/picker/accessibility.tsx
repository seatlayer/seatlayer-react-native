import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  Pressable, StyleSheet, Text, type StyleProp, useWindowDimensions, View, type ViewStyle,
} from "react-native";

import { seatLayerAccessNeedsCapability } from "./availability";
import {
  seatLayerPickerAccessibleTourStore,
  seatLayerSectionAccessCountsCapability,
} from "./accessibilityFocus";
import {
  SeatLayerPickerAccessibilitySheet,
  type SeatLayerPickerAccessSheetRow,
} from "./accessibilitySheet";
import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import { SeatLayerPickerAccessIcon } from "./accessibilityIcon";
import {
  resolveSeatLayerPickerStyles, sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
} from "./styles";
import { supportsSeatLayerPickerSurface } from "./surfaces";
import type { SeatLayerPickerSnapshot } from "./models";
import { seatLayerPickerTokens } from "./tokens.g";
import { normalizeSeatLayerPickerSafeAreaInsets, type SeatLayerPickerSafeAreaInsetInput } from "./safeAreaInsets";

type AccessibilitySlots = Pick<
  SeatLayerPickerStyles,
  | "accessibilityControlsContainer"
  | "accessibilityControlButton"
  | "accessibilityControlLabel"
  | "accessibilityModalContainer"
  | "accessibilityNeedButton"
  | "accessibilityNeedText"
  | "accessibilityAction"
  | "accessibilityActionText"
>;
type AccessNeed = Readonly<{ key: string; count?: number }>;
type Draft = Readonly<
  { keys: ReadonlySet<string>; limited: boolean; colorblind: boolean }
>;

const nativeChromeCapability = "native-chrome-contract-v1";
const size = seatLayerPickerTokens.size;

function supportsSnapshotAccessibilityOperation(
  controller: ReturnType<typeof useSeatLayerPickerScope>["controller"],
  snapshot: SeatLayerPickerSnapshot | undefined,
  feature: string,
  command: string,
): boolean {
  return snapshot?.capabilities.includes(feature) === true &&
    supportsSeatLayerPickerSurface(controller, [nativeChromeCapability], [command]);
}

function supportsHelloAccessibilityOperation(
  controller: ReturnType<typeof useSeatLayerPickerScope>["controller"], command: string,
): boolean {
  return supportsSeatLayerPickerSurface(
    controller, [nativeChromeCapability, "colorblind-safe"], [command],
  );
}

export function canRenderSeatLayerPickerAccessibilityFilters(
  controller: ReturnType<typeof useSeatLayerPickerScope>["controller"],
  snapshot: SeatLayerPickerSnapshot | undefined,
): boolean {
  const inventoryOffersAccessNeeds = controller.mapController
    .supportsPickerCapability(seatLayerAccessNeedsCapability) &&
    (snapshot?.map.accessNeeds?.length ?? 0) > 0;
  return (inventoryOffersAccessNeeds && supportsSnapshotAccessibilityOperation(
    controller, snapshot, "accessibilityFilter", "picker.setAccessibilityFilter",
  )) || supportsSnapshotAccessibilityOperation(
    controller, snapshot, "limitedViewFilter", "picker.setLimitedViewFilter",
  ) || supportsHelloAccessibilityOperation(controller, "picker.setColorblindSafe");
}

/** Seat-type choices are inventory truth; never invent absent event options. */
export function resolveSeatLayerPickerAccessNeeds(
  reported: readonly Readonly<{ key: string; count?: number }>[],
  hasRuntimeTaxonomy: boolean,
): readonly Readonly<{ key: string; count?: number }>[] {
  return hasRuntimeTaxonomy ? reported : Object.freeze([]);
}

export type SeatLayerPickerAccessibilityMutation = Readonly<
  | { readonly kind: "accessibility"; readonly keys: readonly string[] }
  | { readonly kind: "limited"; readonly on: boolean }
  | { readonly kind: "colorblind"; readonly on: boolean }
>;

/** Produces exactly one mutation per changed, independently-supported setting. */
export function planSeatLayerPickerAccessibilityMutations(
  draft: Draft,
  initial: Draft,
  available: Readonly<{ accessibility: boolean; limited: boolean; colorblind: boolean }>,
): readonly SeatLayerPickerAccessibilityMutation[] {
  const plan: SeatLayerPickerAccessibilityMutation[] = [];
  if (available.accessibility && !sameKeys(draft.keys, initial.keys)) {
    plan.push({ kind: "accessibility", keys: [...draft.keys] });
  }
  if (available.limited && draft.limited !== initial.limited) {
    plan.push({ kind: "limited", on: draft.limited });
  }
  if (available.colorblind && draft.colorblind !== initial.colorblind) {
    plan.push({ kind: "colorblind", on: draft.colorblind });
  }
  return Object.freeze(plan);
}

/**
 * Retained for hosts and tests that reason about a staged plan. The sheet no
 * longer stages anything: since runtime 0.77.1 the filter command takes the
 * web menu's own focus path and the camera is the runtime's, so native calls
 * nothing after the command (§3.13).
 */
export function shouldFocusSeatLayerAccessibilityResults(
  plan: readonly SeatLayerPickerAccessibilityMutation[],
): boolean {
  return plan.some((mutation) =>
    (mutation.kind === "accessibility" && mutation.keys.length > 0) ||
    (mutation.kind === "limited" && mutation.on));
}

/** The union sent on every flip; turning a key on or off never stages. */
export function nextSeatLayerPickerAccessibilityUnion(
  active: readonly string[],
  key: string,
  on: boolean,
): readonly string[] {
  const union = new Set(active.map((value) => String(value)));
  if (on) union.add(key);
  else union.delete(key);
  return Object.freeze([...union]);
}

export interface SeatLayerPickerAccessibilityFiltersProps {
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly slots?: AccessibilitySlots;
  readonly safeAreaInsets?: SeatLayerPickerSafeAreaInsetInput;
  readonly modalTopInset?: number;
  readonly modalBottomInset?: number;
  readonly modalHorizontalInset?: number;
  readonly activeLabel?: (count: number, label: string) => string;
}

function sameKeys(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  return left.size === right.size && [...left].every((key) => right.has(key));
}

export function SeatLayerPickerAccessibilityFilters(
  props: SeatLayerPickerAccessibilityFiltersProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
  const viewport = useWindowDimensions();
  const promptRef = useRef<ReturnType<typeof scope.claimPrompt>>(undefined);
  const promptContextRef = useRef(Object.freeze({ owner: "accessibility" }));
  useLayoutEffect(() => {
    return () => {
      // Closing a mounted surface must release its exact owner; otherwise an
      // unmounted accessibility sheet could block every later prompt.
      const claim = promptRef.current;
      promptRef.current = undefined;
      claim?.dismiss();
    };
  }, [scope.sessionId]);
  const dismissPrompt = useCallback(() => {
    const claim = promptRef.current;
    promptRef.current = undefined;
    claim?.dismiss();
  }, []);
  const openPrompt = useCallback(() => {
    // Only one decision surface may hold the screen: an unanswered confirm
    // card is cancelled first, so the sheet never comes up over a dimmed
    // question the buyer can neither read nor answer.
    void Promise.resolve()
      .then(() => scope.cancelPending())
      .catch(() => undefined);
    let claim = promptRef.current;
    if (claim?.open() === true) return;
    promptRef.current = undefined;
    claim = scope.claimPrompt("accessibility", "accessibility", promptContextRef.current);
    if (claim === undefined) return;
    promptRef.current = claim;
    if (claim.open() !== true) {
      promptRef.current = undefined;
    }
  }, [scope]);
  const open = scope.presentation.prompt?.kind === "accessibility" &&
    promptRef.current?.lease.context === scope.presentation.prompt.context;
  const session = useRef(scope.sessionId);
  const reportedActiveLabelFailure = useRef<unknown>(undefined);
  useLayoutEffect(() => {
    session.current = scope.sessionId;
    reportedActiveLabelFailure.current = undefined;
  }, [scope.sessionId]);
  let activeLabelFailure: unknown;
  const captureActiveLabelFailure = (error: unknown): void => {
    activeLabelFailure ??= error;
  };
  useEffect(() => {
    const error = activeLabelFailure;
    if (
      session.current === scope.sessionId &&
      error !== undefined &&
      reportedActiveLabelFailure.current === undefined
    ) {
      reportedActiveLabelFailure.current = error;
      try {
        scope.reportError(error);
      } catch { /* Reporting cannot create another failure. */ }
    }
  }, [activeLabelFailure, scope]);
  const accessibilityFilterAvailable = supportsSnapshotAccessibilityOperation(
    scope.controller, scope.snapshot, "accessibilityFilter", "picker.setAccessibilityFilter",
  );
  const limitedAvailable = supportsSnapshotAccessibilityOperation(
    scope.controller, scope.snapshot, "limitedViewFilter", "picker.setLimitedViewFilter",
  );
  const colorblindAvailable = supportsHelloAccessibilityOperation(
    scope.controller, "picker.setColorblindSafe",
  );
  const accessNeedsAvailable = scope.controller.mapController
    .supportsPickerCapability(seatLayerAccessNeedsCapability);
  const reported = scope.snapshot?.map.accessNeeds ?? [];
  const usesReportedNeeds = accessNeedsAvailable && reported.length > 0;
  const needs: readonly AccessNeed[] = resolveSeatLayerPickerAccessNeeds(reported, accessNeedsAvailable);
  const accessibilityAvailable = accessibilityFilterAvailable && needs.length > 0;
  const active = scope.snapshot?.map.accessibilityFilter ?? [];
  const supportsJump = scope.controller.supportsAccessibleSectionTour;
  const disabled = scope.isBusy || scope.readOnly;

  const commit = useCallback((operation: () => Promise<unknown>): void => {
    const activeSession = scope.sessionId;
    void Promise.resolve().then(operation).catch((error: unknown) => {
      if (session.current === activeSession) {
        try { scope.reportError(error); } catch { /* Observers cannot escape. */ }
      }
    });
  }, [scope]);

  const onToggle = useCallback((row: SeatLayerPickerAccessSheetRow): void => {
    if (row.key === "limited") {
      commit(() => scope.controller.setLimitedViewFilter(!row.on));
      return;
    }
    if (row.key === "colorblind") {
      commit(() => scope.controller.setColorblindSafe(!row.on));
      return;
    }
    const union = nextSeatLayerPickerAccessibilityUnion(active, row.key, !row.on);
    commit(() => scope.controller.setAccessibilityFilter([...union]));
  }, [active, commit, scope]);

  const onJump = useCallback((row: SeatLayerPickerAccessSheetRow): void => {
    const union = nextSeatLayerPickerAccessibilityUnion(active, row.key, true);
    dismissPrompt();
    const tour = seatLayerPickerAccessibleTourStore(scope.controller);
    commit(async () => {
      if (!row.on) await scope.controller.setAccessibilityFilter([...union]);
      tour.observe(union);
      tour.accept(union, await scope.controller.focusNextAccessibleSection([...union]));
    });
  }, [active, commit, dismissPrompt, scope]);

  const ready = accessibilityAvailable || limitedAvailable || colorblindAvailable;
  if (!ready) return null;

  const countsReported = scope.snapshot?.capabilities
    .includes(seatLayerSectionAccessCountsCapability) === true;
  const needRows: readonly SeatLayerPickerAccessSheetRow[] = accessibilityAvailable
    ? needs.map((need) => {
      const on = active.includes(need.key);
      const counted = usesReportedNeeds && typeof need.count === "number";
      const countLabel = counted
        ? (need.count === 0
          ? scope.strings.translate("accessNoneLeft")
          : scope.strings.translate("accessFreeCount", { count: need.count }))
        : undefined;
      return Object.freeze({
        key: need.key,
        label: scope.strings.accessNeed(need.key),
        note: need.key === "wheelchair"
          ? scope.strings.translate("companionSeatsNote")
          : undefined,
        count: need.count,
        on,
        // A count that is NOT counted shows no number and is never disabled.
        disabled: disabled || (counted && need.count === 0 && !on),
        countLabel,
        jumpable: supportsJump && counted && (need.count ?? 0) > 0,
        jumpLabel: scope.strings.translate("accessJumpFirstSection"),
        glyph: "access" as const,
      });
    })
    : [];
  const switchRows: SeatLayerPickerAccessSheetRow[] = [];
  if (limitedAvailable) {
    switchRows.push(Object.freeze({
      key: "limited",
      label: scope.strings.translate("hideLimitedView"),
      on: scope.snapshot?.map.hideLimitedView ?? false,
      disabled,
      jumpable: false,
    }));
  }
  if (colorblindAvailable) {
    switchRows.push(Object.freeze({
      key: "colorblind",
      label: scope.strings.translate("colorblindSafe"),
      on: scope.snapshot?.map.colorblindSafe ?? false,
      disabled,
      jumpable: false,
    }));
  }

  const activeCount = active.length +
    (scope.snapshot?.map.hideLimitedView ? 1 : 0) +
    (scope.snapshot?.map.colorblindSafe ? 1 : 0);
  const baseLabel = scope.strings.translate(
    needs.length > 0 ? "accessibility" : "displayOptions",
  );
  let label = activeCount ? `${baseLabel} (${activeCount})` : baseLabel;
  if (props.activeLabel) {
    try {
      const candidate = props.activeLabel(activeCount, baseLabel);
      if (typeof candidate === "string" && candidate.trim()) {
        label = candidate;
      } else {
        captureActiveLabelFailure(new TypeError(
          "Picker accessibility label formatter must return a non-empty string",
        ));
      }
    } catch (error) {
      captureActiveLabelFailure(error);
    }
  }
  const slots = resolveSeatLayerPickerStyles(scope.styles, props.slots);
  const theme = scope.resolvedTheme;
  const safeInsets = normalizeSeatLayerPickerSafeAreaInsets(
    props.safeAreaInsets === undefined
      ? {
        top: props.modalTopInset,
        right: props.modalHorizontalInset,
        bottom: props.modalBottomInset,
        left: props.modalHorizontalInset,
      }
      : props.safeAreaInsets,
    viewport,
  );
  return (
    <View
      style={[
        props.compact ? styles.root : styles.wideRoot,
        slots.accessibilityControlsContainer,
        sanitizeSeatLayerPickerStyle(props.style),
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: scope.isBusy }}
        disabled={scope.isBusy}
        onPress={openPrompt}
        style={({ pressed }) => [
          props.compact ? styles.control : styles.wideControl,
          {
            borderColor: theme.colors.divider,
            backgroundColor: pressed ? theme.colors.background : theme.colors.surface,
            borderRadius: seatLayerPickerTokens.radius.pill,
          },
          slots.accessibilityControlButton,
        ]}
      >
        <SeatLayerPickerAccessIcon
          color={activeCount ? theme.colors.accent : theme.colors.text}
        />
        {!props.compact
          ? (
            <Text
              style={[styles.wideLabel, {
                color: theme.colors.text,
                fontFamily: theme.fontFamily,
              }, slots.accessibilityControlLabel]}
            >
              {label}
            </Text>
          )
          : null}
        {activeCount
          ? (
            <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
              <Text style={[styles.badgeText, { color: theme.colors.onAccent }]}>
                {activeCount}
              </Text>
            </View>
          )
          : null}
      </Pressable>
      <SeatLayerPickerAccessibilitySheet
        visible={open}
        title={scope.strings.translate("accessibilityTitle")}
        closeLabel={scope.strings.translate("close")}
        theme={theme}
        slots={slots}
        safeAreaInsets={safeInsets}
        needRows={needRows}
        switchRows={switchRows}
        onToggle={onToggle}
        onJump={onJump}
        onDismiss={dismissPrompt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: size.accessibilityControlSize, height: size.accessibilityControlSize },
  wideRoot: { alignSelf: "flex-start" },
  control: {
    width: size.accessibilityControlSize,
    height: size.accessibilityControlSize,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  wideControl: {
    minHeight: size.minimumHitTarget,
    flexDirection: "row",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  wideLabel: { fontSize: 14, fontWeight: "700" },
  badge: {
    position: "absolute",
    right: -4,
    top: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 10, fontWeight: "800" },
});

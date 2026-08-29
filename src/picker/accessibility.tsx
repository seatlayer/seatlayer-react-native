import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type GestureResponderEvent,
  I18nManager,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";

import { seatLayerPickerEnglishAccessNeeds } from "./locale";
import { useSeatLayerPickerScope } from "./SeatLayerPickerScope";
import { SeatLayerPickerPromptModal } from "./promptModal";
import { SeatLayerPickerAccessIcon } from "./accessibilityIcon";
import { seatLayerPickerColorAlpha } from "./colors";
import {
  resolveSeatLayerPickerStyles,
  sanitizeSeatLayerPickerStyle,
  type SeatLayerPickerStyles,
  type SeatLayerPickerThemeStyles,
} from "./styles";
import { supportsSeatLayerPickerSurface } from "./surfaces";
import type { SeatLayerPickerSnapshot } from "./models";
import { seatLayerPickerTokens } from "./tokens.g";
import {
  normalizeSeatLayerPickerSafeAreaInsets,
  type SeatLayerPickerSafeAreaInsetInput,
} from "./safeAreaInsets";

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
  return supportsSnapshotAccessibilityOperation(
    controller, snapshot, "accessibilityFilter", "picker.setAccessibilityFilter",
  ) || supportsSnapshotAccessibilityOperation(
    controller, snapshot, "limitedViewFilter", "picker.setLimitedViewFilter",
  ) || supportsHelloAccessibilityOperation(controller, "picker.setColorblindSafe");
}

/** Runtime taxonomy wins only when it actually supplies buyer choices. */
export function resolveSeatLayerPickerAccessNeeds(
  reported: readonly Readonly<{ key: string; count?: number }>[],
  hasRuntimeTaxonomy: boolean,
): readonly Readonly<{ key: string; count?: number }>[] {
  return hasRuntimeTaxonomy && reported.length > 0
    ? reported
    : Object.freeze(Object.keys(seatLayerPickerEnglishAccessNeeds).map((key) => Object.freeze({ key })));
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

interface AccessibilityViewProps
  extends SeatLayerPickerAccessibilityFiltersProps {
  readonly busy: boolean;
  readonly controlLabel: string;
  readonly title: string;
  readonly closeLabel: string;
  readonly cancelLabel: string;
  readonly applyLabel: string;
  readonly limitedLabel: string;
  readonly colorblindLabel: string;
  readonly needs: readonly AccessNeed[];
  readonly active: readonly string[];
  readonly activeCount: number;
  readonly limited: boolean;
  readonly colorblind: boolean;
  readonly accessibilityAvailable: boolean;
  readonly limitedAvailable: boolean;
  readonly colorblindAvailable: boolean;
  readonly sessionId: number;
  readonly needLabel: (need: AccessNeed) => string;
  readonly theme: ReturnType<typeof useSeatLayerPickerScope>["resolvedTheme"];
  readonly themeStyles?: SeatLayerPickerThemeStyles;
  readonly apply: (
    draft: Draft,
    initial: Draft,
    isCurrent: () => boolean,
  ) => Promise<boolean>;
  readonly open: boolean;
  readonly openPrompt: () => void;
  readonly dismissPrompt: () => void;
}

function initialDraft(props: AccessibilityViewProps): Draft {
  return {
    keys: new Set(props.active),
    limited: props.limited,
    colorblind: props.colorblind,
  };
}

function sameKeys(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  return left.size === right.size && [...left].every((key) => right.has(key));
}

/** Context-free filter control and modal. Its draft changes only on explicit open. */
function SeatLayerPickerAccessibilityFiltersView(
  props: AccessibilityViewProps,
): React.ReactElement {
  const viewport = useWindowDimensions();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(props));
  const [initial, setInitial] = useState<Draft>(() => initialDraft(props));
  const [applying, setApplying] = useState(false);
  const intent = useRef(0);
  const slots = resolveSeatLayerPickerStyles(props.themeStyles, props.slots);
  const disabled = props.busy || applying;
  const openModal = useCallback(() => {
    if (props.busy) return;
    const next = initialDraft(props);
    intent.current += 1;
    setInitial(next);
    setDraft(next);
    props.openPrompt();
  }, [props]);
  const dismiss = useCallback(() => {
    intent.current += 1;
    props.dismissPrompt();
  }, [props]);
  useEffect(() => {
    intent.current += 1;
    setApplying(false);
  }, [props.sessionId]);
  const toggle = useCallback((key: string) => {
    setDraft((current) => {
      const keys = new Set(current.keys);
      if (keys.has(key)) keys.delete(key);
      else keys.add(key);
      return { ...current, keys };
    });
  }, []);
  const apply = useCallback(() => {
    if (disabled) return;
    const currentIntent = intent.current;
    setApplying(true);
    void props.apply(draft, initial, () => intent.current === currentIntent)
      .then(
        (finished) => {
          if (finished && intent.current === currentIntent) props.dismissPrompt();
        },
        () => undefined,
      ).finally(() => {
        if (intent.current === currentIntent) setApplying(false);
      });
  }, [disabled, draft, initial, props]);
  const safeInsets = normalizeSeatLayerPickerSafeAreaInsets(
    props.safeAreaInsets === undefined ? {
      top: props.modalTopInset,
      right: props.modalHorizontalInset,
      bottom: props.modalBottomInset,
      left: props.modalHorizontalInset,
    } : props.safeAreaInsets,
    viewport,
  );

  const switchRow = (
    label: string,
    selected: boolean,
    onPress: () => void,
  ): React.ReactElement => (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.option, { borderColor: props.theme.colors.divider }]}
    >
      <Text
        style={[styles.optionText, {
          color: props.theme.colors.text,
          fontFamily: props.theme.fontFamily,
        }]}
      >
        {label}
      </Text>
      <View
        style={[styles.switchTrack, {
          backgroundColor: selected
            ? props.theme.colors.accent
              : props.theme.colors.background,
          flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
        }]}
      >
        <View
          style={[styles.switchThumb, {
            backgroundColor: selected
              ? props.theme.colors.onAccent
              : props.theme.colors.mutedText,
            transform: [{ translateX: selected ? (I18nManager.isRTL ? -16 : 16) : 0 }],
          }]}
        />
      </View>
    </Pressable>
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
      accessibilityLabel={props.controlLabel}
        accessibilityState={{ disabled: props.busy || applying }}
        disabled={props.busy || applying}
        onPress={openModal}
        style={({ pressed }) => [
          props.compact ? styles.control : styles.wideControl,
          {
            borderColor: props.theme.colors.divider,
            backgroundColor: pressed
              ? props.theme.colors.background
              : props.theme.colors.surface,
          },
          slots.accessibilityControlButton,
          { borderRadius: seatLayerPickerTokens.radius.button },
        ]}
      >
        <SeatLayerPickerAccessIcon
          color={props.activeCount
            ? props.theme.colors.accent
            : props.theme.colors.text}
        />
        {!props.compact
          ? (
            <Text
              style={[styles.wideLabel, {
                color: props.theme.colors.text,
                fontFamily: props.theme.fontFamily,
              }, slots.accessibilityControlLabel]}
            >
              {props.controlLabel}
            </Text>
          )
          : null}
        {props.activeCount
          ? (
            <View
              style={[styles.badge, {
                backgroundColor: props.theme.colors.accent,
              }]}
            >
              <Text
                style={[styles.badgeText, {
                  color: props.theme.colors.onAccent,
                }]}
              >
                {props.activeCount}
              </Text>
            </View>
          )
          : null}
      </Pressable>
      <SeatLayerPickerPromptModal
        visible={props.open}
      >
          <View
            style={[styles.scrim, {
              backgroundColor: seatLayerPickerColorAlpha(props.theme.colors.text, .45),
            }]}
          >
          <Pressable
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onPress={dismiss}
            style={styles.backdrop}
          >
          </Pressable>
          <View pointerEvents="box-none" style={[styles.modalBounds, {
            paddingTop: safeInsets.top + 16,
            paddingRight: safeInsets.right + 16,
            paddingBottom: safeInsets.bottom + 16,
            paddingLeft: safeInsets.left + 16,
          }]}>
            <Pressable
              accessible={false}
              onPress={(event: GestureResponderEvent) =>
                event.stopPropagation()}
              style={[
                styles.modal,
                {
                  backgroundColor: props.theme.colors.surface,
                  borderColor: props.theme.colors.divider,
                },
                slots.accessibilityModalContainer,
              ]}
            >
              <View
                accessible={false}
                style={[styles.dragHandle, {
                  backgroundColor: props.theme.colors.divider,
                }]}
              />
              <View style={styles.heading}>
                <Text
                  accessibilityRole="header"
                  style={[styles.headingText, {
                    color: props.theme.colors.text,
                    fontFamily: props.theme.fontFamily,
                  }, slots.accessibilityControlLabel]}
                >
                  {props.title}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={props.closeLabel}
                  accessibilityState={{ disabled: applying }}
                  disabled={applying}
                  onPress={dismiss}
                  style={[
                    styles.dismiss,
                    { borderColor: props.theme.colors.divider },
                    { borderRadius: seatLayerPickerTokens.radius.button },
                  ]}
                >
                  <View accessible={false} style={styles.closeIcon}>
                    <View
                      style={[styles.closeStroke, {
                        backgroundColor: props.theme.colors.text,
                        transform: [{ rotate: "45deg" }],
                      }]}
                    />
                    <View
                      style={[styles.closeStroke, {
                        backgroundColor: props.theme.colors.text,
                        transform: [{ rotate: "-45deg" }],
                      }]}
                    />
                  </View>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.list}>
                {props.accessibilityAvailable ? props.needs.map((need) => {
                  const selected = draft.keys.has(need.key);
                  const unavailable = disabled || (need.count === 0 && !selected);
                  return (
                    <Pressable
                      key={need.key}
                      accessibilityRole="checkbox"
                      accessibilityLabel={props.needLabel(need)}
                      accessibilityState={{
                        checked: selected,
                        disabled: unavailable,
                      }}
                      disabled={unavailable}
                      onPress={() => toggle(need.key)}
                      style={({ pressed }) => [
                        styles.need,
                        {
                          borderColor: selected
                            ? props.theme.colors.accent
                            : props.theme.colors.divider,
                          backgroundColor: selected
                            ? props.theme.colors.accent
                            : props.theme.colors.surface,
                        },
                        slots.accessibilityNeedButton,
                        { borderRadius: seatLayerPickerTokens.radius.button },
                        pressed && !unavailable ? { opacity: 0.84 } : null,
                        unavailable ? { opacity: 0.5 } : null,
                      ]}
                    >
                      <Text
                        style={[styles.needText, {
                          color: selected
                            ? props.theme.colors.onAccent
                            : props.theme.colors.text,
                          fontFamily: props.theme.fontFamily,
                        }, slots.accessibilityNeedText]}
                      >
                        {props.needLabel(need)}
                      </Text>
                    </Pressable>
                  );
                }) : null}
                {props.limitedAvailable ? switchRow(props.limitedLabel, draft.limited, () =>
                  setDraft((current) => ({
                    ...current,
                    limited: !current.limited,
                  }))) : null}
                {props.colorblindAvailable ? switchRow(props.colorblindLabel, draft.colorblind, () =>
                  setDraft((current) => ({
                    ...current,
                    colorblind: !current.colorblind,
                  }))) : null}
              </ScrollView>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={props.cancelLabel}
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={dismiss}
                  style={[
                    styles.cancel,
                    { borderColor: props.theme.colors.divider },
                    slots.accessibilityAction,
                    { borderRadius: seatLayerPickerTokens.radius.button },
                  ]}
                >
                  <Text
                    style={[styles.actionText, {
                      color: props.theme.colors.text,
                      fontFamily: props.theme.fontFamily,
                    }, slots.accessibilityActionText]}
                  >
                    {props.cancelLabel}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={props.applyLabel}
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={apply}
                  style={[
                    styles.apply,
                    { backgroundColor: props.theme.colors.accent },
                    slots.accessibilityAction,
                    { borderRadius: seatLayerPickerTokens.radius.button },
                  ]}
                >
                  <Text
                    style={[styles.actionText, {
                      color: props.theme.colors.onAccent,
                      fontFamily: props.theme.fontFamily,
                    }, slots.accessibilityActionText]}
                  >
                    {props.applyLabel}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </View>
          </View>
      </SeatLayerPickerPromptModal>
    </View>
  );
}

export function SeatLayerPickerAccessibilityFilters(
  props: SeatLayerPickerAccessibilityFiltersProps,
): React.ReactElement | null {
  const scope = useSeatLayerPickerScope();
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
  const openPrompt = useCallback(() => {
    let claim = promptRef.current;
    if (claim?.open() === true) return;
    // A hardware/back dismissal can retire the scope's lease before this
    // surface observes its next render. Reclaim instead of retaining a stale
    // local pointer that would permanently make the launcher inert.
    promptRef.current = undefined;
    claim = scope.claimPrompt("accessibility", "accessibility", promptContextRef.current);
    if (claim === undefined) return;
    promptRef.current = claim;
    if (claim.open() !== true) {
      promptRef.current = undefined;
    }
  }, [scope]);
  const dismissPrompt = useCallback(() => {
    const claim = promptRef.current;
    promptRef.current = undefined;
    claim?.dismiss();
  }, []);
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
  const ready = accessibilityFilterAvailable || limitedAvailable || colorblindAvailable;
  const accessNeedsAvailable = scope.controller.mapController
    .supportsPickerCapability("access-needs-v1");
  if (!ready) return null;
  const reported = scope.snapshot?.map.accessNeeds ?? [];
  // A capability only makes a non-empty runtime taxonomy authoritative. An
  // empty list cannot leave buyers without the supported fallback choices.
  const usesReportedNeeds = accessNeedsAvailable && reported.length > 0;
  const needs: readonly AccessNeed[] = resolveSeatLayerPickerAccessNeeds(reported, accessNeedsAvailable);
  const apply = async (
    draft: Draft,
    initial: Draft,
    isCurrent: () => boolean,
  ): Promise<boolean> => {
    const activeSession = scope.sessionId;
    const controller = scope.controller;
    const availability = (latest: SeatLayerPickerSnapshot | undefined) => ({
      accessibility: supportsSnapshotAccessibilityOperation(controller, latest, "accessibilityFilter", "picker.setAccessibilityFilter"),
      limited: supportsSnapshotAccessibilityOperation(controller, latest, "limitedViewFilter", "picker.setLimitedViewFilter"),
      colorblind: supportsHelloAccessibilityOperation(controller, "picker.setColorblindSafe"),
    });
    const available = availability(scope.snapshot);
    const plan = planSeatLayerPickerAccessibilityMutations(draft, initial, available);
    const snapshotSession = scope.snapshot?.sessionId;
    const current = () => session.current === activeSession && isCurrent() &&
      controller === scope.controller && controller.getSnapshot()?.sessionId === snapshotSession;
    try {
      for (const mutation of plan) {
        if (!current()) return false;
        const live = availability(controller.getSnapshot());
        if ((mutation.kind === "accessibility" && !live.accessibility) ||
          (mutation.kind === "limited" && !live.limited) ||
          (mutation.kind === "colorblind" && !live.colorblind)) return false;
        if (mutation.kind === "accessibility") {
          await controller.setAccessibilityFilter([...mutation.keys]);
        } else if (mutation.kind === "limited") {
          await controller.setLimitedViewFilter(mutation.on);
        } else {
          await controller.setColorblindSafe(mutation.on);
        }
        if (!current()) return false;
      }
      return current();
    } catch (error) {
      if (session.current === activeSession) {
        try { scope.reportError(error); } catch { /* Observers cannot escape. */ }
      }
      return false;
    }
  };
  const activeCount = (scope.snapshot?.map.accessibilityFilter.length ?? 0) +
    (scope.snapshot?.map.hideLimitedView ? 1 : 0) +
    (scope.snapshot?.map.colorblindSafe ? 1 : 0);
  const baseLabel = scope.strings.translate("accessibility");
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
  return (
    <SeatLayerPickerAccessibilityFiltersView
      key={scope.sessionId}
      {...props}
      active={scope.snapshot?.map.accessibilityFilter ?? []}
      activeCount={activeCount}
      accessibilityAvailable={accessibilityFilterAvailable}
      apply={apply}
      applyLabel={scope.strings.translate("applyFilters")}
      busy={scope.isBusy}
      cancelLabel={scope.strings.translate("cancel")}
      closeLabel={scope.strings.translate("close")}
      colorblind={scope.snapshot?.map.colorblindSafe ?? false}
      colorblindAvailable={colorblindAvailable}
      colorblindLabel={scope.strings.translate("colorblindSafe")}
      controlLabel={label}
      limited={scope.snapshot?.map.hideLimitedView ?? false}
      limitedAvailable={limitedAvailable}
      limitedLabel={scope.strings.translate("hideLimitedView")}
      needLabel={(need) =>
        scope.strings.accessNeed(
          need.key,
          usesReportedNeeds && (need.count ?? 0) > 0
            ? need.count
            : undefined,
        )}
      needs={needs}
      open={open}
      openPrompt={openPrompt}
      dismissPrompt={dismissPrompt}
      sessionId={scope.sessionId}
      theme={scope.resolvedTheme}
      themeStyles={scope.styles}
      title={scope.strings.translate("accessibilityTitle")}
    />
  );
}

const styles = StyleSheet.create({
  root: { width: 44, height: 44 },
  wideRoot: { alignSelf: "flex-start" },
  control: {
    width: 44,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  wideControl: {
    minHeight: 44,
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
  scrim: { flex: 1 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  modalBounds: { flex: 1, justifyContent: "flex-end" },
  modal: {
    maxHeight: "78%",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: seatLayerPickerTokens.radius.sheet,
    borderTopRightRadius: seatLayerPickerTokens.radius.sheet,
    padding: 20,
  },
  dragHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  heading: { minHeight: 44, flexDirection: "row", alignItems: "center" },
  headingText: { flex: 1, fontSize: 20, fontWeight: "800" },
  dismiss: {
    width: 44,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  closeStroke: { position: "absolute", width: 18, height: 2, borderRadius: 1 },
  list: { gap: 8, paddingVertical: 12 },
  need: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  needText: { fontSize: 14, fontWeight: "700" },
  option: {
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionText: { flex: 1, fontSize: 14 },
  switchTrack: { width: 36, height: 20, borderRadius: 10, padding: 2 },
  switchThumb: { width: 16, height: 16, borderRadius: 8 },
  actions: { flexDirection: "row", gap: 10 },
  cancel: {
    minHeight: 44,
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  apply: {
    minHeight: 44,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { fontSize: 15, fontWeight: "800" },
});

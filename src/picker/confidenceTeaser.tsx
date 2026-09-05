import React from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { blendSeatLayerPickerColor } from './colors';
import { seatLayerPickerReadableAccent } from './confirmCardIdentity';
import type { SeatLayerPickerSeatConfidence } from './models';
import { seatLayerPickerTokens } from './tokens.g';

/**
 * §3.8.7 — the confidence teaser, on the 3D card only.
 *
 * Outside the scene there is no model on screen to be honest about. It takes
 * one of two forms: a chip on the inspection row where the host can open the
 * passport, and the static teaser where nothing can be opened — because the
 * headline and the detail ARE the information, and a chip saying only
 * `Passport` beside a dead target would say nothing and do nothing.
 */

export interface SeatLayerPickerConfidenceTeaserTheme {
  readonly accent: string;
  readonly surface: string;
  readonly divider: string;
  readonly text: string;
  readonly mutedText: string;
  readonly fontFamily?: string;
}

export interface ConfidenceTeaserProps {
  readonly confidence: SeatLayerPickerSeatConfidence;
  readonly theme: SeatLayerPickerConfidenceTeaserTheme;
  readonly passportLabel: string;
  /** Only where the host can actually open the passport (§4.9). */
  readonly onOpen?: () => void;
}

/** The teaser's ground: the accent at 7 % over the card's own surface. */
export function seatLayerPickerConfidenceTeaserGround(accent: string, surface: string): string {
  return blendSeatLayerPickerColor(accent, surface, 0.07, surface);
}

/** Its hairline: the accent at 35 % over the divider. */
export function seatLayerPickerConfidenceTeaserLine(accent: string, divider: string, surface: string): string {
  return blendSeatLayerPickerColor(accent, divider, 0.35, surface);
}

/** The one line under the headline: what was modelled, else what is real. */
export function seatLayerPickerConfidenceDetail(
  confidence: SeatLayerPickerSeatConfidence,
): string {
  const modelled = confidence.modeledTarget?.trim();
  return modelled !== undefined && modelled.length > 0 ? modelled : confidence.reality;
}

export function ConfidenceTeaser(props: ConfidenceTeaserProps): React.ReactElement | null {
  const { confidence, theme } = props;
  const headline = confidence.headline?.trim() ?? '';
  if (headline.length === 0) return null;
  const detail = seatLayerPickerConfidenceDetail(confidence);
  const ground = seatLayerPickerConfidenceTeaserGround(theme.accent, theme.surface);
  const badge = seatLayerPickerReadableAccent(theme.accent, theme.surface, ground, theme.text);
  const rtl = I18nManager.isRTL;
  const body = <View
    style={[styles.row, {
      backgroundColor: ground,
      borderColor: seatLayerPickerConfidenceTeaserLine(theme.accent, theme.divider, theme.surface),
      flexDirection: rtl ? 'row-reverse' : 'row',
    }]}
  >
    <View style={styles.column}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.headline, { color: theme.text, fontFamily: theme.fontFamily }]}>{headline}</Text>
      {detail.trim().length === 0 ? null : <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.detail, { color: theme.mutedText, fontFamily: theme.fontFamily }]}>{detail}</Text>}
    </View>
    <Text numberOfLines={1} style={[styles.badge, { color: badge, fontFamily: theme.fontFamily }]}>{props.passportLabel}</Text>
  </View>;
  // A button only where the host can act on it; otherwise a static row with no
  // button semantics and no focus stop.
  return props.onOpen === undefined
    ? <View accessible={false} importantForAccessibility="no" testID="seatLayerConfidenceTeaser">{body}</View>
    : <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.passportLabel}
      onPress={props.onOpen}
      testID="seatLayerConfidenceTeaser"
    >{body}</Pressable>;
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderRadius: seatLayerPickerTokens.size.confidenceTeaserRadius,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginTop: seatLayerPickerTokens.size.confidenceTeaserTop,
    minHeight: seatLayerPickerTokens.size.confidenceTeaserMinHeight,
    paddingHorizontal: seatLayerPickerTokens.size.confidenceTeaserPadX,
    paddingVertical: seatLayerPickerTokens.size.confidenceTeaserPadY,
    width: '100%',
  },
  column: { flex: 1, gap: 1 },
  headline: { fontSize: seatLayerPickerTokens.size.confidenceTeaserHeadFont, fontWeight: '700' },
  detail: { fontSize: seatLayerPickerTokens.size.confidenceTeaserDetailFont },
  badge: { flexShrink: 0, fontSize: seatLayerPickerTokens.size.confidenceTeaserBadgeFont, fontWeight: '700' },
});

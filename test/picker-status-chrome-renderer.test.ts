import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", View: "View",
  StyleSheet: { create: <T,>(value: T) => value, hairlineWidth: 1 },
}));

let scope: Record<string, any>;
vi.mock("../src/picker/SeatLayerPickerScope", () => ({ useSeatLayerPickerScope: () => scope }));

import { SeatLayerPickerActionError } from "../src/picker/actionError";
import { SeatLayerPickerAttribution } from "../src/picker/attribution";
import {
  SeatLayerPickerErrorStatus,
  SeatLayerPickerErrorView,
  SeatLayerPickerLoadingView,
} from "../src/picker/status";
import { SeatLayerPickerTestModeIndicator } from "../src/picker/testModeIndicator";

function snapshot(mode = "sale", required = false): Record<string, unknown> {
  return {
    schema: "seatlayer.picker.snapshot/1", sessionId: "runtime", revision: 1,
    event: { key: "event", name: "Event", mode, currency: "USD", salesClosed: false },
    branding: { attributionRequired: required }, categories: [], zones: [], sections: [],
    bestAvailableZones: [], generalAdmissionAreas: [], selection: [], cartLines: [],
    maxSelection: 8, ticketCount: 0,
    map: {
      rung: "venue", viewMode: "map", buyerView: "map", view3DNavigationMode: "orbit",
      colorblindSafe: false, hideLimitedView: false, canZoomIn: true, canZoomOut: true,
      categoryFilter: [], accessibilityFilter: [], floors: [],
    },
  };
}

function setup(): { readonly errors: unknown[]; readonly clear: () => number } {
  const errors: unknown[] = [];
  let clears = 0;
  scope = {
    isReady: false, isBusy: false, error: undefined, sessionId: 1, snapshot: undefined, styles: {},
    controller: {
      mapController: {
        isReady: true,
        supportsPickerCapability: (value: string) => value === "native-chrome-contract-v1",
        supportsPickerCommand: () => true,
      },
    },
    strings: {
      translate: (key: string) => ({
        loading: "Loading", errorMessage: "Buyer-safe error", retry: "Retry", testMode: "TEST MODE",
        poweredBy: "Powered by SeatLayer", close: "Close",
      } as Record<string, string>)[key] ?? key,
    },
    resolvedTheme: {
      themeMode: "light",
      colors: {
        accent: "#0066ff", text: "#111111", surface: "#ffffff", background: "#eeeeee",
        divider: "#cccccc", mutedText: "#777777", warning: "#ffaa00", error: "#bb0000",
        onAccent: "#ffffff", mapBackground: "#000000", mapRowLabel: "#ffffff",
        mapText: "#ffffff", mapSelection: "#0066ff",
      },
      roles: {}, fontFamily: "Brand",
    },
    clearError: () => { clears += 1; },
    reportError: (error: unknown) => { errors.push(error); },
  };
  return { errors, clear: () => clears };
}

beforeEach(() => { setup(); });

describe("picker status chrome", () => {
  it("keeps loading through an early snapshot and hides only after readiness", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerLoadingView)); });
    scope = { ...scope, snapshot: snapshot() };
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerLoadingView)); });
    expect(renderer.root.findByType("ActivityIndicator" as any)).toBeTruthy();
    scope = { ...scope, isReady: true };
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerLoadingView)); });
    expect(renderer.toJSON()).toBeNull();
  });

  it("keeps fatal and ready command errors in their separate scoped surfaces", async () => {
    const { clear } = setup();
    let renderer!: ReactTestRenderer;
    scope.error = { buyerMessage: "Initial load failed" };
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerActionError)); });
    expect(renderer.toJSON()).toBeNull();
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerErrorView)); });
    expect(renderer.root.findByProps({ accessibilityRole: "alert" })).toBeTruthy();
    scope = { ...scope, isReady: true, error: { buyerMessage: "A very long buyer-safe command message that remains limited to two lines" } };
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerActionError)); });
    const close = renderer.root.findByProps({ accessibilityLabel: "Close" });
    expect(renderer.root.findByProps({ numberOfLines: 2 })).toBeTruthy();
    expect(close.props.style.minHeight).toBe(44);
    const paint = close.findByType("View" as any);
    expect(paint.props.style[2].borderRadius).toBe(8);
    await act(async () => { close.props.onPress(); });
    expect(clear()).toBe(1);
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerActionError, { clearable: false })); });
    expect(renderer.root.findAllByProps({ accessibilityLabel: "Close" })).toHaveLength(0);
    await act(async () => {
      renderer.update(React.createElement(SeatLayerPickerActionError, {
        error: { buyerMessage: "A different operation failed" },
      }));
    });
    expect(renderer.root.findAllByProps({ accessibilityLabel: "Close" })).toHaveLength(0);
    scope = { ...scope, error: Object.create(null, {
      buyerMessage: { enumerable: true, get: () => { throw new Error("hostile"); } },
    }) };
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerActionError)); });
    expect(renderer.root.findByProps({ numberOfLines: 2 }).children).toEqual(["Buyer-safe error"]);
  });

  it("does not manufacture retry and quarantines rapid or retired retry failures", async () => {
    const { errors } = setup();
    let noRetry!: ReactTestRenderer;
    await act(async () => {
      noRetry = create(React.createElement(SeatLayerPickerErrorStatus, {
        error: { buyerMessage: "No map" }, sessionId: 1, theme: scope.resolvedTheme, strings: scope.strings,
      }));
    });
    expect(noRetry.root.findAllByProps({ accessibilityLabel: "Retry" })).toHaveLength(0);
    let reject!: (value: unknown) => void;
    const retry = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(SeatLayerPickerErrorStatus, {
        error: { buyerMessage: "No map" }, retry, sessionId: 1, onActionError: scope.reportError,
        theme: scope.resolvedTheme, strings: scope.strings,
      }));
    });
    const press = renderer.root.findByProps({ accessibilityLabel: "Retry" }).props.onPress;
    await act(async () => { press(); press(); });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: "Retry" }).props.accessibilityState).toEqual({ busy: true, disabled: true });
    await act(async () => {
      renderer.update(React.createElement(SeatLayerPickerErrorStatus, {
        error: { buyerMessage: "No map" }, retry: () => undefined, sessionId: 2,
        onActionError: scope.reportError, theme: scope.resolvedTheme, strings: scope.strings,
      }));
    });
    await act(async () => { reject(new Error("retired")); });
    expect(errors).toHaveLength(0);
  });

  it("keeps required attribution unsuppressible and gates the test badge by event and native chrome", async () => {
    let renderer!: ReactTestRenderer;
    scope.controller.mapController.supportsPickerCapability = () => false;
    scope.snapshot = snapshot("test", true);
    await act(async () => {
      renderer = create(React.createElement(SeatLayerPickerAttribution, {
        visible: false, style: { opacity: 0 }, slots: { attributionText: { color: "#000" } },
      }));
    });
    const attribution = renderer.root.findByProps({ accessibilityLabel: "Powered by SeatLayer" });
    expect(attribution).toBeTruthy();
    expect(attribution.props.style).toEqual(expect.objectContaining({ opacity: 0.64 }));
    await act(async () => { renderer = create(React.createElement(SeatLayerPickerTestModeIndicator, { compact: true })); });
    expect(renderer.toJSON()).toBeNull();
    scope.controller.mapController.supportsPickerCapability = (value: string) => value === "native-chrome-contract-v1";
    scope = { ...scope, snapshot: snapshot("sale", true) };
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerTestModeIndicator)); });
    expect(renderer.toJSON()).toBeNull();
    scope = { ...scope, snapshot: snapshot("test", true) };
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerTestModeIndicator)); });
    expect(renderer.root.findByProps({ accessibilityLabel: "TEST MODE" }).props.style[2]).toEqual(
      expect.objectContaining({ backgroundColor: "#ffaa00" }),
    );
    scope = { ...scope, resolvedTheme: { ...scope.resolvedTheme, themeMode: "dark" } };
    await act(async () => { renderer.update(React.createElement(SeatLayerPickerTestModeIndicator, { spokenLabel: "A very long localised test-mode label", compact: false })); });
    expect(renderer.root.findByProps({ accessibilityLabel: "A very long localised test-mode label" }).props.style[2]).toEqual(
      expect.objectContaining({ backgroundColor: expect.any(String) }),
    );
    const label = renderer.root.findByType("Text" as any);
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.ellipsizeMode).toBe("tail");
  });
});

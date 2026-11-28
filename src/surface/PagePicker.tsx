import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
} from 'react';
import { AppState, useColorScheme, View, type StyleProp, type ViewStyle } from 'react-native';

import type { BridgeProfile } from '../bridge/profile';
import { SeatLayerError } from '../errors';
import { seatLayerLineDown } from '../picker/connection';
import type { SeatLayerPickerBranding } from '../picker/models';
import { SeatLayerPickerPageRecovery } from '../picker/pageRecovery';
import {
  normalizeSeatLayerPickerSafeAreaInsets,
  type SeatLayerPickerSafeAreaInsetInput,
} from '../picker/safeAreaInsets';
import type { SeatLayerPickerScopeStringProps } from '../picker/scopeStrings';
import { SeatLayerPickerErrorStatus } from '../picker/status';
import type { SeatLayerPickerThemeOptions, SeatLayerThemeMode } from '../picker/theme';
import type { SeatLayerSurfaceConfiguration } from '../types';
import type { SeatLayerPageController, SeatLayerPageHold } from './pageController';
import { SeatLayerPageView } from './PageView';
import { SeatLayerSurfaceHeader, useSeatLayerSurfaceLook } from './SurfaceHeader';

/** The way out of a picker on a page of its own: ✕ and system Back ask the page first. */
export interface SeatLayerPagePickerHandle {
  requestClose(): Promise<void>;
}

/** What the picker knows when the buyer asks to leave. */
export interface SeatLayerPageCloseContext<Hold> {
  /** A page is up to ask. */
  readonly ready: boolean;
  /** The hold the buyer has, whether or not a page is up. */
  readonly held: Hold | undefined;
  /** The hold the page showed booked. */
  readonly bookedOperationId: string | undefined;
}

export interface SeatLayerPagePickerLook extends SeatLayerPickerScopeStringProps {
  readonly themeMode?: SeatLayerThemeMode;
  readonly themeOptions?: Omit<SeatLayerPickerThemeOptions, 'themeMode' | 'systemThemeMode'>;
  /** The app's safe area. With it the page runs to the bottom edge. */
  readonly safeAreaInsets?: SeatLayerPickerSafeAreaInsetInput;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export interface SeatLayerPagePickerProps<
  Hold extends SeatLayerPageHold,
  Configuration extends SeatLayerSurfaceConfiguration,
> extends SeatLayerPagePickerLook {
  readonly controller: SeatLayerPagePickerController<Hold>;
  readonly configuration: Configuration;
  readonly configurationKey: string;
  readonly page: string;
  /**
   * The page's boot: its side, and for a page that takes another's place the
   * hold it opens on (null: none; absent: the configuration's own).
   */
  readonly profileFor: (boot: { theme: 'light' | 'dark'; resumed?: Hold | null }) => BridgeProfile;
  /** What the header draws, read on every render: the page's name and brand once it sends them. */
  readonly chrome: () => SeatLayerPageChrome;
  /** The page repaints a new side in place. Otherwise it keeps the side it booted on. */
  readonly followsTheme: boolean;
  /**
   * The command a page names when it runs its cart under the home indicator.
   * A page that does not name it, or refuses it, gets a band of the cart's
   * ground instead.
   */
  readonly insetsCommand: string;
  /** Tells the page a new side. */
  readonly setThemeMode?: (mode: 'light' | 'dark') => Promise<void>;
  /** The buyer pressed ✕ or Back. */
  readonly close?: (context: SeatLayerPageCloseContext<Hold>) => Promise<void>;
  /** A page that just booted on a hold it may never announce reads it. */
  readonly readHold?: () => Promise<void>;
  readonly resumesHold?: boolean;
  readonly onContinue: (hold: Hold) => void | Promise<void>;
  readonly onBooked?: (hold: Hold) => void;
  readonly onError?: (error: unknown) => void;
}

/** What the picker needs of a page's controller. */
export type SeatLayerPagePickerController<Hold extends SeatLayerPageHold> = Pick<
  SeatLayerPageController<Hold>,
  | 'isReady' | 'hold' | 'connection' | 'on' | 'supportsCommand' | 'setForeground'
  | 'setViewportInsets' | 'beginHandshake' | 'session' | 'detach' | 'pageLost'
>;

/** The page's name and brand, for the header. */
export interface SeatLayerPageChrome {
  readonly title?: string;
  readonly brandName?: string;
  readonly branding?: SeatLayerPickerBranding;
}

const controllerIds = new WeakMap<object, number>();
let nextControllerId = 0;
function controllerId(controller: object): number {
  let id = controllerIds.get(controller);
  if (id === undefined) {
    nextControllerId += 1;
    id = nextControllerId;
    controllerIds.set(controller, id);
  }
  return id;
}

interface PageState<Hold> {
  readonly page: number;
  readonly loadError?: SeatLayerError;
  /** The hold a page that takes another's place opens on. */
  readonly resumed?: Hold;
  /** This page takes the place of one that was up. */
  readonly again: boolean;
}

/**
 * The event picker's header over a page of its own (the Season page, the run
 * page), which draws its steps, the map and the cart. A lost page opens again
 * on the same hold; a page that cannot open gets the event picker's failure
 * view, with Try again.
 */
function PagePicker<Hold extends SeatLayerPageHold, Configuration extends SeatLayerSurfaceConfiguration>(
  props: SeatLayerPagePickerProps<Hold, Configuration>,
  ref: React.ForwardedRef<SeatLayerPagePickerHandle>,
): React.ReactElement {
  const { controller } = props;
  const latest = useRef(props);
  latest.current = props;
  const [, rerender] = useReducer((value: number) => value + 1, 0);
  const [state, setState] = useState<PageState<Hold>>({ page: 0, again: false });
  const held = useRef<Hold | undefined>(undefined);
  const booked = useRef<string | undefined>(undefined);
  const pageWasUp = useRef(false);
  const told = useRef<{ mode?: 'light' | 'dark'; bottom?: number }>({});
  const [insetsRefused, setInsetsRefused] = useState(false);
  const recovery = useRef(new SeatLayerPickerPageRecovery());
  const report = useCallback((error: unknown) => {
    try { latest.current.onError?.(error); } catch { /* Reports are observational. */ }
  }, []);

  // The side: the app's, else the device's. A page that does not repaint in
  // place keeps the side it booted on, and so does its header.
  const device = useColorScheme() === 'dark' ? 'dark' : 'light';
  const asked = props.themeMode === 'light' || props.themeMode === 'dark' ? props.themeMode : device;
  const bootMode = useRef<'light' | 'dark' | undefined>(undefined);
  bootMode.current ??= asked;
  // Another controller or another page asked for: it opens on what it is given.
  const identity = useRef({ controller, key: props.configurationKey });
  if (identity.current.controller !== controller || identity.current.key !== props.configurationKey) {
    if (identity.current.controller !== controller) bootMode.current = asked;
    identity.current = { controller, key: props.configurationKey };
    held.current = undefined;
    pageWasUp.current = false;
    if (state.resumed !== undefined || state.again) setState((current) => ({ page: current.page, again: false }));
  }
  const side = props.followsTheme ? asked : bootMode.current;
  const chrome = props.chrome();
  const look = useSeatLayerSurfaceLook({
    themeMode: side,
    themeOptions: props.themeOptions,
    branding: chrome.branding,
    pageLocale: props.configuration.locale,
    locale: props.locale,
    strings: props.strings,
  });

  const nextPage = useCallback((resumed: Hold | undefined) => {
    setState((current) => ({ page: current.page + 1, resumed, again: pageWasUp.current }));
  }, []);

  useEffect(() => {
    const offs = [
      controller.on('changed', rerender),
      controller.on('hold', (hold) => { held.current = hold ?? undefined; }),
      controller.on('ready', () => {
        pageWasUp.current = true;
        if (state.resumed === undefined) held.current = controller.hold;
        // A page that just booted knows its boot side and no insets.
        told.current = {};
        setInsetsRefused(false);
        if (state.resumed !== undefined || latest.current.resumesHold === true) {
          void latest.current.readHold?.().catch(() => undefined);
        }
        rerender();
      }),
      controller.on('continue', (hold) => {
        try {
          void Promise.resolve(latest.current.onContinue(hold)).catch(report);
        } catch (error) {
          report(error);
        }
      }),
      controller.on('booked', (hold) => {
        booked.current = hold.operationId;
        try { latest.current.onBooked?.(hold); } catch (error) { report(error); }
      }),
    ];
    return () => { for (const off of offs) off(); };
  }, [controller, report, state.resumed]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (!controller.isReady) return;
      const foreground = next === 'active' ? true : next === 'background' ? false : undefined;
      // Best effort: coming back, the page reads the hold again itself.
      if (foreground !== undefined) void controller.setForeground(foreground).catch(() => undefined);
    });
    return () => subscription.remove();
  }, [controller]);

  const requestClose = useCallback(async () => {
    try {
      await latest.current.close?.({
        ready: controller.isReady,
        held: held.current,
        bookedOperationId: booked.current,
      });
    } catch {
      // The page kept the seats and said why on its own status line.
    }
  }, [controller]);
  useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);

  const failed = useCallback((error: SeatLayerError) => {
    // A hold that is gone is not a page that did not load.
    setState((current) => current.resumed === undefined
      ? { ...current, loadError: error }
      : { page: current.page + 1, again: pageWasUp.current });
  }, []);

  const awaitingActive = useRef<{ remove(): void } | undefined>(undefined);
  useEffect(() => () => awaitingActive.current?.remove(), []);
  const pageLost = useCallback(() => {
    if (!recovery.current.lost(Date.now())) {
      const error = SeatLayerError.transport('The system keeps closing the SeatLayer page.');
      setState((current) => ({ page: current.page, again: current.again, loadError: error }));
      return;
    }
    // The system mostly ends a page of an app in the background; a new one
    // there would only be ended again, so it waits for the buyer.
    const reopen = () => setState((current) => ({
      page: current.page + 1,
      resumed: held.current,
      again: pageWasUp.current,
    }));
    awaitingActive.current?.remove();
    awaitingActive.current = undefined;
    if ((AppState.currentState ?? 'active') === 'active') return reopen();
    awaitingActive.current = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      awaitingActive.current?.remove();
      awaitingActive.current = undefined;
      reopen();
    });
  }, []);

  const retry = useCallback(() => {
    recovery.current.reset();
    nextPage(held.current);
  }, [nextPage]);

  const insets = normalizeSeatLayerPickerSafeAreaInsets(props.safeAreaInsets);
  const hostInsets = props.safeAreaInsets !== undefined;
  const pageTakesInsets = hostInsets && controller.isReady && !insetsRefused &&
    controller.supportsCommand(props.insetsCommand);
  useEffect(() => {
    if (!controller.isReady) return;
    if (props.followsTheme && props.setThemeMode !== undefined &&
      side !== (told.current.mode ?? bootMode.current)) {
      told.current.mode = side;
      void props.setThemeMode(side).catch(() => undefined);
    }
    if (pageTakesInsets && told.current.bottom !== insets.bottom) {
      told.current.bottom = insets.bottom;
      // The page's cart docks over the home indicator; the header holds the top.
      void controller.setViewportInsets({ bottom: insets.bottom }).catch(() => setInsetsRefused(true));
    }
  });

  const theme = look.theme;
  const hold = controller.hold;
  const resumed = state.again || state.resumed !== undefined ? state.resumed ?? null : undefined;
  return (
    <View testID={props.testID} style={[{
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    }, props.style]}>
      <SeatLayerSurfaceHeader
        look={look}
        title={chrome.title}
        brandName={chrome.brandName ?? chrome.title}
        holdExpiresAt={hold?.expiresAt}
        lineDown={seatLayerLineDown(controller.connection)}
        onClose={props.close === undefined ? undefined : () => { void requestClose(); }}
        onError={report}
        topInset={hostInsets ? insets.top : 0}
        sessionId={state.page}
      />
      {state.loadError !== undefined ? (
        <SeatLayerPickerErrorStatus
          error={state.loadError}
          retry={retry}
          retryOwner={controller}
          onActionError={report}
          sessionId={state.page}
          strings={look.strings}
          theme={theme}
          style={{ flex: 1 }}
        />
      ) : (
        // A page that takes the inset runs its cart under the home indicator;
        // for one that does not, the app keeps it clear on the cart's ground.
        <View style={{
          flex: 1,
          backgroundColor: theme.colors.surface,
          paddingBottom: hostInsets && !pageTakesInsets ? insets.bottom : 0,
        }}>
          <SeatLayerPageView<Configuration>
            key={`${controllerId(controller)}:${state.page}`}
            controller={props.controller}
            configuration={props.configuration}
            configurationKey={props.configurationKey}
            page={props.page}
            profile={props.profileFor({
              theme: bootMode.current,
              ...(resumed === undefined ? {} : { resumed }),
            })}
            backgroundColor={theme.mapTheme?.background ?? theme.colors.background}
            onLoadError={failed}
            onPageLost={pageLost}
          />
        </View>
      )}
    </View>
  );
}

/** @internal One picker for every page of its own. */
export const SeatLayerPagePicker = forwardRef(PagePicker) as <
  Hold extends SeatLayerPageHold,
  Configuration extends SeatLayerSurfaceConfiguration,
>(
  props: SeatLayerPagePickerProps<Hold, Configuration> & React.RefAttributes<SeatLayerPagePickerHandle>,
) => React.ReactElement;

/**
 * The controller given, or one the picker owns until it goes. Owned disposal
 * waits one task, so React's development cleanup and re-setup keep it.
 */
export function useSeatLayerOwnedPageController<Controller extends { dispose(): void }>(
  given: Controller | undefined,
  create: () => Controller,
): Controller {
  const owned = useRef<Controller | undefined>(undefined);
  const disposal = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  if (given === undefined && owned.current === undefined) owned.current = create();
  useEffect(() => {
    if (disposal.current !== undefined) {
      clearTimeout(disposal.current);
      disposal.current = undefined;
    }
    return () => {
      const controller = owned.current;
      if (controller === undefined) return;
      disposal.current = setTimeout(() => {
        disposal.current = undefined;
        controller.dispose();
        if (owned.current === controller) owned.current = undefined;
      }, 0);
    };
  }, []);
  return given ?? owned.current!;
}

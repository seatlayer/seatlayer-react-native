import React, { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SeatLayerCartSheet,
  SeatLayerDockBar,
  SeatLayerFloorStrip,
  SeatLayerPicker,
  SeatLayerPickerChart,
  SeatLayerPickerHeader,
  SeatLayerPickerModal,
  SeatLayerPickerScope,
  SeatLayerPriceLegend,
  SeatLayerView,
  useSeatLayerController,
  type SeatLayerConfiguration,
  type SeatLayerPickerCheckoutHandoff,
} from '@seatlayer/react-native';

import {
  SeatLayerPickerDarkVisualFixture,
  SeatLayerPickerLightVisualFixture,
} from './visual-fixtures/PickerVisualFixture';

type ExamplePath = 'raw' | 'ready' | 'modal' | 'customised' | 'custom';

const paths: readonly Readonly<{ readonly id: ExamplePath; readonly label: string }>[] = [
  { id: 'raw', label: 'Raw map' },
  { id: 'ready', label: 'Ready-made' },
  { id: 'modal', label: 'Modal' },
  { id: 'customised', label: 'Customise' },
  { id: 'custom', label: 'Custom layout' },
];

export default function App() {
  if (process.env.EXPO_PUBLIC_SEATLAYER_VISUAL_FIXTURE === 'light') {
    return <SeatLayerPickerLightVisualFixture />;
  }
  if (process.env.EXPO_PUBLIC_SEATLAYER_VISUAL_FIXTURE === 'dark') {
    return <SeatLayerPickerDarkVisualFixture />;
  }
  return <LiveExample />;
}

function LiveExample() {
  const [path, setPath] = useState<ExamplePath>('ready');
  const [status, setStatus] = useState('Choose an integration path');
  const event = process.env.EXPO_PUBLIC_SEATLAYER_EVENT?.trim();
  const publicKey = process.env.EXPO_PUBLIC_SEATLAYER_PUBLIC_KEY?.trim();
  const configuration = useMemo<SeatLayerConfiguration>(
    () => ({
      event: event ?? '',
      ...(publicKey ? { publicKey } : {}),
      currency: 'USD',
      maxSelection: 8,
    }),
    [event, publicKey],
  );
  const onCheckout = async (_handoff: SeatLayerPickerCheckoutHandoff) => {
    setStatus('Inventory handoff is ready for your server.');
  };

  if (!event) return <SetupScreen />;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>SeatLayer native picker</Text>
        <Text style={styles.status}>{status}</Text>
      </View>
      <View style={styles.pathRow}>
        {paths.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: path === item.id }}
            onPress={() => setPath(item.id)}
            style={[styles.pathButton, path === item.id && styles.pathButtonSelected]}
          >
            <Text style={[styles.pathLabel, path === item.id && styles.pathLabelSelected]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.content}>
        {path === 'raw' ? <RawMap configuration={configuration} /> : null}
        {path === 'ready' ? (
          <SeatLayerPicker
            configuration={configuration}
            onCheckout={onCheckout}
            style={styles.picker}
          />
        ) : null}
        {path === 'modal' ? (
          <ModalExample
            configuration={configuration}
            onCheckout={onCheckout}
            onStatus={setStatus}
          />
        ) : null}
        {path === 'customised' ? (
          <SeatLayerPicker
            configuration={configuration}
            themeMode="dark"
            options={{
              layout: 'adaptive',
              chrome: { priceLegend: false },
              haptics: true,
            }}
            strings={{ holdAndCheckout: 'Continue' }}
            styles={{
              headerContainer: { backgroundColor: '#172033' },
              continueButton: { backgroundColor: '#5B4B8A' },
            }}
            onCheckout={onCheckout}
            style={styles.picker}
          />
        ) : null}
        {path === 'custom' ? (
          <CustomLayout configuration={configuration} onCheckout={onCheckout} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function SetupScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.setup}>
        <Text style={styles.title}>SeatLayer native picker</Text>
        <Text style={styles.explainer}>
          Set EXPO_PUBLIC_SEATLAYER_EVENT before starting this Expo example.
          For public startup, also set EXPO_PUBLIC_SEATLAYER_PUBLIC_KEY.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function RawMap({ configuration }: { readonly configuration: SeatLayerConfiguration }) {
  const controller = useSeatLayerController();
  return (
    <SeatLayerView
      style={styles.picker}
      controller={controller}
      configuration={configuration}
    />
  );
}

function ModalExample({
  configuration,
  onCheckout,
  onStatus,
}: {
  readonly configuration: SeatLayerConfiguration;
  readonly onCheckout: (handoff: SeatLayerPickerCheckoutHandoff) => Promise<void>;
  readonly onStatus: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.modalExample}>
      <Text style={styles.explainer}>
        Open the ready-made native picker in its adaptive dialog or full-screen presentation.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setVisible(true)}
        style={styles.openButton}
      >
        <Text style={styles.openButtonLabel}>Open picker</Text>
      </Pressable>
      <SeatLayerPickerModal
        visible={visible}
        configuration={configuration}
        barrierDismissible
        onCheckout={onCheckout}
        onRequestClose={(reason) => {
          setVisible(false);
          onStatus('Picker closed: ' + reason);
        }}
      />
    </View>
  );
}

function CustomLayout({
  configuration,
  onCheckout,
}: {
  readonly configuration: SeatLayerConfiguration;
  readonly onCheckout: (handoff: SeatLayerPickerCheckoutHandoff) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <SeatLayerPickerScope configuration={configuration} themeMode="auto">
      <View style={styles.customLayout}>
        <SeatLayerPickerHeader />
        <SeatLayerPriceLegend />
        <SeatLayerFloorStrip />
        <SeatLayerPickerChart style={styles.chart} />
        <SeatLayerDockBar />
        <SeatLayerCartSheet
          expanded={expanded}
          onExpandedChanged={setExpanded}
          onCheckout={onCheckout}
        />
      </View>
    </SeatLayerPickerScope>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7fb' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { color: '#172033', fontSize: 22, fontWeight: '700' },
  status: { color: '#667085', marginTop: 4 },
  pathRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  pathButton: {
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  pathButtonSelected: { backgroundColor: '#5b4b8a', borderColor: '#5b4b8a' },
  pathLabel: { color: '#334155', fontWeight: '600' },
  pathLabelSelected: { color: '#ffffff' },
  content: { flex: 1 },
  picker: { flex: 1 },
  modalExample: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  setup: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  explainer: { color: '#334155', lineHeight: 22, textAlign: 'center' },
  openButton: {
    backgroundColor: '#5b4b8a',
    borderRadius: 8,
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  openButtonLabel: { color: '#ffffff', fontWeight: '700' },
  customLayout: { flex: 1 },
  chart: { flex: 1 },
});

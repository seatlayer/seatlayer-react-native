import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SeatLayerPicker,
  type SeatLayerConfiguration,
  type SeatLayerPickerCheckoutHandoff,
} from '@seatlayer/react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

const event = process.env.EXPO_PUBLIC_SEATLAYER_EVENT?.trim() ?? '';
const publicKey = process.env.EXPO_PUBLIC_SEATLAYER_PUBLIC_KEY?.trim() ?? '';

export default function App(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <SeatLayerExample />
    </SafeAreaProvider>
  );
}

function SeatLayerExample(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [handoff, setHandoff] = useState<SeatLayerPickerCheckoutHandoff>();
  const configuration = useMemo<SeatLayerConfiguration>(
    () => ({
      event,
      publicKey,
      currency: 'USD',
      maxSelection: 8,
      hostInfo: { app: 'SeatLayer React Native example' },
    }),
    [],
  );

  if (!event || !publicKey) {
    return (
      <View
        style={[
          styles.setupPage,
          {
            paddingTop: insets.top + 24,
            paddingRight: insets.right + 24,
            paddingBottom: insets.bottom + 24,
            paddingLeft: insets.left + 24,
          },
        ]}
      >
        <Text style={styles.eyebrow}>SEATLAYER EXAMPLE</Text>
        <Text style={styles.title}>Connect a test event</Text>
        <Text style={styles.body}>
          Set EXPO_PUBLIC_SEATLAYER_EVENT and
          EXPO_PUBLIC_SEATLAYER_PUBLIC_KEY, then restart Expo.
        </Text>
        <View style={styles.codeCard}>
          <Text selectable style={styles.code}>
            EXPO_PUBLIC_SEATLAYER_EVENT=ev_your_test_event
          </Text>
          <Text selectable style={styles.code}>
            EXPO_PUBLIC_SEATLAYER_PUBLIC_KEY=pk_test_your_key
          </Text>
        </View>
        <Text style={styles.note}>
          Publishable keys are safe for public startup. Keep SeatLayer secret
          keys and final booking on your trusted server.
        </Text>
      </View>
    );
  }

  if (handoff) {
    return (
      <View
        style={[
          styles.checkoutPage,
          {
            paddingTop: insets.top + 24,
            paddingRight: insets.right + 24,
            paddingBottom: insets.bottom + 24,
            paddingLeft: insets.left + 24,
          },
        ]}
      >
        <Text style={styles.eyebrow}>SECURE HANDOFF</Text>
        <Text style={styles.title}>Seats held</Text>
        <Text style={styles.body}>
          Send only this hold ID to your trusted backend. Inspect the hold,
          collect payment, and book it there.
        </Text>
        <View style={styles.holdCard}>
          <Text style={styles.holdLabel}>Hold ID</Text>
          <Text selectable style={styles.holdValue}>{handoff.holdId}</Text>
          <Text style={styles.holdSummary}>
            {handoff.lineItems.length} line item{handoff.lineItems.length === 1 ? '' : 's'} ·{' '}
            {handoff.currency} {handoff.total.toFixed(2)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setHandoff(undefined)}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Back to picker</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.pickerPage}>
      <SeatLayerPicker
        configuration={configuration}
        onCheckout={setHandoff}
        safeAreaInsets={insets}
        style={styles.picker}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pickerPage: { flex: 1, backgroundColor: '#F7F5F0' },
  picker: { flex: 1 },
  setupPage: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#F7F5F0',
  },
  checkoutPage: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#F7F5F0',
  },
  eyebrow: {
    color: '#705B2A',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    marginTop: 10,
    color: '#171A22',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  body: {
    marginTop: 14,
    maxWidth: 560,
    color: '#4B5060',
    fontSize: 16,
    lineHeight: 24,
  },
  codeCard: {
    marginTop: 24,
    gap: 10,
    borderColor: '#DDD6C6',
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    padding: 18,
  },
  code: { color: '#202532', fontFamily: 'monospace', fontSize: 13 },
  note: { marginTop: 16, color: '#727685', fontSize: 13, lineHeight: 19 },
  holdCard: {
    marginTop: 24,
    borderColor: '#DDD6C6',
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  holdLabel: { color: '#727685', fontSize: 12, fontWeight: '700' },
  holdValue: { marginTop: 8, color: '#171A22', fontSize: 15, fontWeight: '700' },
  holdSummary: { marginTop: 16, color: '#4B5060', fontSize: 14 },
  button: {
    minHeight: 48,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#171A22',
    paddingHorizontal: 20,
  },
  buttonPressed: { opacity: 0.78 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});

import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import {
  SeatLayerView,
  useSeatLayerController,
  type SelectedSeat,
} from '@seatlayer/react-native';

export default function App() {
  const controller = useSeatLayerController();
  const [selection, setSelection] = useState<SelectedSeat[]>([]);
  const [status, setStatus] = useState('Loading SeatLayer…');
  const configuration = useMemo(
    () => ({
      event: process.env.EXPO_PUBLIC_SEATLAYER_EVENT ?? 'ev_test_event',
      currency: 'USD',
      colorblindSafe: false,
    }),
    [],
  );

  useEffect(
    () => controller.on('selectionChanged', setSelection),
    [controller],
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>SeatLayer</Text>
        <Text style={styles.status}>{status}</Text>
      </View>
      <SeatLayerView
        style={styles.map}
        controller={controller}
        configuration={configuration}
        onReady={(info) =>
          setStatus(`${info.mode ?? 'live'} · ${selection.length} selected`)
        }
        onLoadError={(error) => setStatus(`${error.code}: ${error.message}`)}
      />
      <Text style={styles.selection}>
        {selection.length
          ? selection.map((seat) => seat.displayLabel ?? seat.label).join(', ')
          : 'Choose your seats'}
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  title: { color: '#0f172a', fontSize: 22, fontWeight: '700' },
  status: { color: '#64748b', marginTop: 4 },
  map: { flex: 1, marginHorizontal: 12, borderRadius: 16 },
  selection: {
    color: '#334155',
    paddingHorizontal: 20,
    paddingVertical: 14,
    textAlign: 'center',
  },
});

import React, { useEffect } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import AppButton from '../../../components/ui/AppButton';
import { useTheme } from '../../../hooks/useTheme';

interface QrScannerViewProps {
  active: boolean;
  onScan: (value: string) => void;
}

export const QrScannerView = ({ active, onScan }: QrScannerViewProps) => {
  const { colors, spacing } = useTheme();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      const value = codes.find(code => code.value)?.value;
      if (value) {
        onScan(value);
      }
    },
  });

  if (!hasPermission) {
    return (
      <View
        style={[
          styles.placeholder,
          { backgroundColor: colors.surface, padding: spacing.lg },
        ]}
      >
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          Camera access is needed to scan appointment QR codes.
        </Text>
        <AppButton
          title="Open Settings"
          variant="outline"
          onPress={() => Linking.openSettings()}
          style={{ marginTop: spacing.md }}
        />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.placeholder, { backgroundColor: colors.surface }]}>
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          No camera available on this device.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.cameraWrapper}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={active}
        codeScanner={codeScanner}
      />
      <View pointerEvents="none" style={styles.frameOverlay}>
        <View style={[styles.frame, { borderColor: colors.primary }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cameraWrapper: {
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  frameOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 200,
    height: 200,
    borderWidth: 3,
    borderRadius: 16,
  },
  placeholder: {
    height: 320,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

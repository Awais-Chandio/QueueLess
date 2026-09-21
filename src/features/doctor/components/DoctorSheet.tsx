import React from 'react';
import {
  Modal,
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppText from '../../../components/ui/AppText';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeightPercent?: number;
};

/**
 * Bottom sheet for the doctor portal, with the same props as AppBottomSheet.
 *
 * AppBottomSheet's @gorhom BottomSheetModal does not present on the current
 * Android build (RN 0.84 / Reanimated 4.5): `present()` is called and nothing
 * appears. Until that shared component is fixed, doctor flows use a native
 * Modal styled with the same tokens so their editors are actually reachable.
 */
export const DoctorSheet = ({ visible, onClose, title, children, maxHeightPercent = 0.8 }: Props) => {
  const { colors, spacing, radius, sizing, shadows } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            style={[
              styles.sheet,
              shadows.lg,
              {
                maxHeight: height * maxHeightPercent,
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.sheet,
                borderTopRightRadius: radius.sheet,
                paddingBottom: insets.bottom + spacing.lg,
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.textTertiary, marginVertical: spacing.sm }]} />
            {title ? (
              <View
                style={[
                  styles.header,
                  { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomColor: colors.divider },
                ]}
              >
                <AppText variant="section" style={styles.title} numberOfLines={1}>
                  {title}
                </AppText>
                <Pressable
                  onPress={onClose}
                  hitSlop={sizing.hitSlop}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={[styles.close, { backgroundColor: colors.surfaceSunken, borderRadius: radius.pill }]}
                >
                  <X size={sizing.icon.md} color={colors.textSecondary} />
                </Pressable>
              </View>
            ) : null}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    flex: 1,
  },
  close: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CircleHelp, MessageCircle } from 'lucide-react-native';
import { useTheme } from '../../hooks/useTheme';
import AppButton from '../../components/ui/AppButton';
import AppText from '../../components/ui/AppText';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { toastService } from '../../services/toastService';
import { formatMobile, useSupportContact, whatsappLink } from './support';

/**
 * "Help" in the clinic app's headers: MediQ support on WhatsApp. Google Play:
 * help only, no purchase links (plans are managed on the website).
 */
export const HelpButton = ({ style }: { style?: StyleProp<ViewStyle> }) => {
  const { colors, spacing, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useSupportContact(open);
  const number = data?.whatsapp;

  const openWhatsApp = async () => {
    if (!number) return;
    try {
      await Linking.openURL(whatsappLink(number));
    } catch {
      toastService.error(`Couldn't open WhatsApp. Message MediQ support on ${formatMobile(number)}.`);
    }
  };

  return (
    <>
      <Pressable
        testID="help-button"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Help"
        style={[styles.icon, { backgroundColor: colors.tint.primary, borderRadius: radius.pill }, style]}
      >
        <CircleHelp size={20} color={colors.primary} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Help" maxHeightPercent={0.6}>
        <View testID="help-sheet" style={{ gap: spacing.md, marginBottom: spacing.md }}>
          <AppText variant="body" tone="secondary">
            A question or a problem with MediQ? Message the MediQ support team on WhatsApp.
          </AppText>
          {isLoading ? (
            <Skeleton height={48} borderRadius={radius.md} />
          ) : number ? (
            <>
              <AppText testID="help-number" variant="section" align="center">
                {formatMobile(number)}
              </AppText>
              <AppButton
                title="WhatsApp MediQ support"
                testID="help-whatsapp"
                leftIcon={<MessageCircle size={18} color={colors.onPrimary} />}
                onPress={openWhatsApp}
              />
            </>
          ) : (
            <AppText testID="help-unavailable" variant="body">
              {isError ? "Couldn't load the support number. Check the internet and try again." : "MediQ's support number isn't set up yet."}
            </AppText>
          )}
        </View>
      </Sheet>
    </>
  );
};

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});

export default HelpButton;

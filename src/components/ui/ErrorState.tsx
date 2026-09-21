import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import AppButton from './AppButton';
import AppText from './AppText';
import BrandIllustration from './BrandIllustration';
import { useTheme } from '../../hooks/useTheme';
import { toUserMessage } from '../../utils/errorMessage';
import { scaleFont } from '../../utils/responsive';

type ErrorStateProps = {
  title?: string;
  /**
   * The failure. Accepts an `Error`, a Supabase error object or a string —
   * whatever the screen caught. It is run through `toUserMessage`, so raw
   * backend text never reaches the screen.
   */
  message?: unknown;
  /** Screen-specific copy used when the failure cannot be classified. */
  fallbackMessage?: string;
  buttonTitle?: string;
  onRetry?: () => void;
};

/**
 * The standard failure state: what happened, in plain words, and a way out.
 *
 * Sanitising happens here rather than at each call site because every screen
 * was passing `error.message` straight through, and fixing it centrally means
 * a new screen gets the right behaviour by default instead of having to
 * remember.
 */
const ErrorState = ({
  title,
  message,
  fallbackMessage,
  buttonTitle,
  onRetry,
}: ErrorStateProps) => {
  const { colors, spacing, sizing } = useTheme();
  const body = message === undefined ? fallbackMessage : toUserMessage(message, fallbackMessage);

  return (
    <View
      style={[styles.container, { paddingHorizontal: spacing.xl }]}
      accessible
      accessibilityRole="alert"
    >
      <BrandIllustration kind="error" size={scaleFont(140)} />

      <AppText
        variant="section"
        align="center"
        style={{ marginTop: spacing.lg, marginBottom: spacing.xs }}
      >
        {title || 'Something went wrong'}
      </AppText>

      {body ? (
        <AppText
          variant="body"
          tone="secondary"
          align="center"
          style={[styles.body, { marginBottom: spacing.xl }]}
        >
          {body}
        </AppText>
      ) : null}

      {onRetry ? (
        <View style={styles.button}>
          <AppButton
            title={buttonTitle || 'Try again'}
            onPress={onRetry}
            variant="secondary"
            leftIcon={<RefreshCw size={sizing.icon.sm} color={colors.primary} />}
          />
        </View>
      ) : null}
    </View>
  );
};

export default ErrorState;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    maxWidth: 320,
  },
  button: {
    width: '100%',
    maxWidth: 280,
  },
});

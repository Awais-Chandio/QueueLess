import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { useToastStore } from '../../store/toastStore';
import { colors, spacing, typography } from '../../theme';

const toastColors = {
  success: colors.success,
  error: colors.error,
  info: colors.primary,
};

const ToastMessage = () => {
  const { visible, message, type } = useToastStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fadeAnim]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: toastColors[type], opacity: fadeAnim },
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: spacing.lg,
    right: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    zIndex: 999,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  text: {
    color: '#fff',
    fontSize: typography.body,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default ToastMessage;

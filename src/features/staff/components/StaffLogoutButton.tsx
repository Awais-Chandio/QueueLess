import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { LogOut } from 'lucide-react-native';

import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';

const StaffLogoutButton = () => {
  const { logout } = useAuth();
  const { colors, radius, spacing, typography } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      setLoggingOut(false);
      Alert.alert(
        'Logout failed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }, [loggingOut, logout]);

  const confirmLogout = useCallback(() => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => void handleLogout(),
      },
    ]);
  }, [handleLogout]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Logout"
      disabled={loggingOut}
      onPress={confirmLogout}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? colors.error + '18' : colors.surface,
          borderColor: colors.error + '55',
          borderRadius: radius.full,
          paddingHorizontal: spacing.sm,
        },
        loggingOut && styles.disabled,
      ]}
    >
      {loggingOut ? (
        <ActivityIndicator size="small" color={colors.error} />
      ) : (
        <LogOut color={colors.error} size={17} />
      )}
      <Text
        style={{
          color: colors.error,
          fontSize: typography.sizes.xs,
          fontWeight: '800',
          marginLeft: spacing.xs,
        }}
      >
        Logout
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    minWidth: 92,
    height: 44,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.65,
  },
});

export default React.memo(StaffLogoutButton);

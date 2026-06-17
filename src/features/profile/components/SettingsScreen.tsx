import React from "react";
import { View, StyleSheet, Text, Pressable, Alert, Switch } from "react-native";
import { useAuth } from "../../../hooks/useAuth";
import { useTheme } from "../../../hooks/useTheme";
import { useThemeStore } from "../../../store/themeStore";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import { Card } from "../../../components/ui/Card";
import AppButton from "../../../components/ui/AppButton";
import { Moon, Bell, Shield, Info, ChevronRight } from "lucide-react-native";
import { scaleFont } from "../../../utils/responsive";

const SettingsScreen = () => {
  const { logout } = useAuth();
  const { colors, spacing, typography } = useTheme();
  const { isDarkMode, toggleTheme } = useThemeStore();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      Alert.alert('Logout Error', error instanceof Error ? error.message : 'Logout failed');
    }
  };

  const SettingRow = ({ title, icon: Icon, rightElement, onPress }: any) => (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.settingRow, { borderBottomColor: colors.border }]}>
      <View style={styles.settingLeft}>
        <View style={[styles.iconContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Icon size={scaleFont(20)} color={colors.textSecondary} />
        </View>
        <Text style={{ color: colors.text, fontSize: typography.sizes.md, marginLeft: spacing.md, fontWeight: '500' }}>
          {title}
        </Text>
      </View>
      <View style={styles.settingRight}>
        {rightElement || <ChevronRight size={scaleFont(20)} color={colors.textSecondary} />}
      </View>
    </Pressable>
  );

  return (
    <ScreenWrapper scrollable>
      <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, marginBottom: spacing.lg }]}>
        Settings
      </Text>

      <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600', marginBottom: spacing.sm, marginLeft: spacing.xs, textTransform: 'uppercase' }}>
        Preferences
      </Text>
      <Card style={{ padding: 0, marginBottom: spacing.xl }}>
        <SettingRow 
          title="Dark Mode" 
          icon={Moon} 
          rightElement={<Switch value={isDarkMode} onValueChange={toggleTheme} trackColor={{ false: colors.border, true: colors.primary }} />} 
        />
        <SettingRow title="Notifications" icon={Bell} onPress={() => {}} />
      </Card>

      <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600', marginBottom: spacing.sm, marginLeft: spacing.xs, textTransform: 'uppercase' }}>
        Support
      </Text>
      <Card style={{ padding: 0, marginBottom: spacing.xl }}>
        <SettingRow title="Privacy Policy" icon={Shield} onPress={() => {}} />
        <SettingRow title="About QueueLess" icon={Info} onPress={() => {}} />
      </Card>

      <AppButton 
        title="Logout" 
        variant="danger" 
        onPress={handleLogout} 
        style={{ marginTop: spacing.md }}
      />
    </ScreenWrapper>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  title: {
    fontWeight: 'bold',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: scaleFont(16),
    borderBottomWidth: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: scaleFont(36),
    height: scaleFont(36),
    borderRadius: scaleFont(8),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingRight: {
    alignItems: 'flex-end',
  }
});

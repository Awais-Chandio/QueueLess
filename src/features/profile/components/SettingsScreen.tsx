import React from "react";
import { View, StyleSheet, Text, Pressable, Alert, Switch } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../../hooks/useAuth";
import { useTheme } from "../../../hooks/useTheme";
import { useThemeStore } from "../../../store/themeStore";
import ScreenWrapper from "../../../components/ui/ScreenWrapper";
import { Card } from "../../../components/ui/Card";
import AppButton from "../../../components/ui/AppButton";
import { CardFadeIn } from "../../../components/animations/CardFadeIn";
import { Moon, Bell, Shield, Info, ChevronRight, FileText } from "lucide-react-native";
import type { AppStackParamList } from "../../../navigation/types";
import { hp, scaleFont, wp } from "../../../utils/responsive";

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const SettingsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
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

  const SettingRow = ({ title, icon: Icon, rightElement, onPress, color, isLast }: any) => {
    const iconColor = color || colors.primary;
    return (
      <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [
        styles.settingRow, 
        !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
        pressed && { backgroundColor: colors.background }
      ]}>
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}>
            <Icon size={scaleFont(20)} color={iconColor} />
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
  };

  return (
    <ScreenWrapper scrollable>
      <Text style={[styles.title, { color: colors.text, fontSize: typography.sizes.xxl, marginBottom: spacing.lg }]}>
        Settings
      </Text>

      <CardFadeIn delay={0}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600', marginBottom: spacing.sm, marginLeft: spacing.xs, textTransform: 'uppercase' }}>
          Preferences
        </Text>
        <Card style={{ padding: 0, marginBottom: spacing.xl, overflow: 'hidden' }}>
          <SettingRow 
            title="Dark Mode" 
            icon={Moon} 
            color={colors.info}
            rightElement={<Switch value={isDarkMode} onValueChange={toggleTheme} trackColor={{ false: colors.border, true: colors.info }} />} 
          />
          <SettingRow
            title="Notifications"
            icon={Bell}
            color={colors.warning}
            isLast
            onPress={() => navigation.navigate("Notifications")}
          />
        </Card>
      </CardFadeIn>

      <CardFadeIn delay={60}>
        <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600', marginBottom: spacing.sm, marginLeft: spacing.xs, textTransform: 'uppercase' }}>
          Support
        </Text>
        <Card style={{ padding: 0, marginBottom: spacing.xl, overflow: 'hidden' }}>
          <SettingRow title="Privacy Policy" icon={Shield} color={colors.success} onPress={() => navigation.navigate("PrivacyPolicy")} />
          <SettingRow title="Terms & Conditions" icon={FileText} color={colors.primary} onPress={() => navigation.navigate("Terms")} />
          <SettingRow title="About QueueLess" icon={Info} color={colors.textSecondary} isLast onPress={() => navigation.navigate("About")} />
        </Card>
      </CardFadeIn>

      <CardFadeIn delay={120}>
        <AppButton 
          title="Logout" 
          variant="danger" 
          onPress={handleLogout} 
          style={{ marginTop: spacing.md }}
        />
      </CardFadeIn>
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
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.8),
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: scaleFont(36),
    height: scaleFont(36),
    borderRadius: scaleFont(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingRight: {
    alignItems: 'flex-end',
  }
});

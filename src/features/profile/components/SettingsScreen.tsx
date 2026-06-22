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
        <SettingRow
          title="Notifications"
          icon={Bell}
          onPress={() =>
            navigation.navigate(
              "MainTabs",
              { screen: "Notifications" },
              { pop: true },
            )
          }
        />
      </Card>

      <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: '600', marginBottom: spacing.sm, marginLeft: spacing.xs, textTransform: 'uppercase' }}>
        Support
      </Text>
      <Card style={{ padding: 0, marginBottom: spacing.xl }}>
        <SettingRow title="Privacy Policy" icon={Shield} onPress={() => navigation.navigate("PrivacyPolicy")} />
        <SettingRow title="About QueueLess" icon={Info} onPress={() => navigation.navigate("About")} />
        <SettingRow title="Terms & Conditions" icon={FileText} onPress={() => navigation.navigate("Terms")} />
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
    paddingHorizontal: wp(4),
    paddingVertical: hp(1.8),
    borderBottomWidth: 1,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: wp(9.6),
    maxWidth: scaleFont(42),
    minWidth: scaleFont(34),
    aspectRatio: 1,
    borderRadius: scaleFont(8),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingRight: {
    alignItems: 'flex-end',
  }
});

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useDoctorDashboard } from '../hooks/useDoctorDashboard';
import { useAuthStore } from '../../../store/authStore';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Award,
  CreditCard,
  MapPin,
  ShieldCheck,
  LogOut,
} from 'lucide-react-native';

export default function ProfileScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const { isLoading, doctorProfile } = useDoctorDashboard();
  const { clearAuth } = useAuthStore();

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out from your Doctor Portal account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => clearAuth() },
      ]
    );
  };

  if (isLoading && !doctorProfile) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: spacing.xl * 2 }]}
    >
      {/* Profile Header Card */}
      <View style={[styles.profileHeaderCard, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
        <View style={[styles.avatarContainer, { backgroundColor: colors.primary + '10' }]}>
          {doctorProfile?.photo_url ? (
            <Image source={{ uri: doctorProfile.photo_url }} style={styles.avatarImage} />
          ) : (
            <User size={48} color={colors.primary} />
          )}
        </View>
        <Text style={[styles.name, { color: colors.text, fontSize: typography.sizes.md }]}>
          Dr. {doctorProfile?.name}
        </Text>
        <Text style={[styles.specialty, { color: colors.primary, fontSize: typography.sizes.xs }]}>
          {doctorProfile?.specialty || 'General Specialist'}
        </Text>
        {doctorProfile?.bio ? (
          <Text style={[styles.bio, { color: colors.textSecondary, fontSize: typography.sizes.xs }]}>
            {doctorProfile.bio}
          </Text>
        ) : null}
      </View>

      {/* Profile Info Details List */}
      <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm }]}>
        Professional Information
      </Text>

      <View style={[styles.infoBlock, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
        {/* Center */}
        <View style={styles.infoRow}>
          <MapPin size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              ASSIGNED CENTER
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]}>
              {doctorProfile?.center_name || 'Not Assigned'}
            </Text>
          </View>
        </View>

        {/* Qualification */}
        <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.border + '20' }]}>
          <Award size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              QUALIFICATION
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]}>
              {doctorProfile?.qualification || 'MBBS'}
            </Text>
          </View>
        </View>

        {/* Experience */}
        <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.border + '20' }]}>
          <Briefcase size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              EXPERIENCE
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]}>
              {doctorProfile?.experience_years} Years
            </Text>
          </View>
        </View>

        {/* License */}
        <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.border + '20' }]}>
          <ShieldCheck size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              LICENSE NUMBER
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]}>
              {doctorProfile?.license_number || 'N/A'}
            </Text>
          </View>
        </View>

        {/* Consultation Fee */}
        <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.border + '20' }]}>
          <CreditCard size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              CONSULTATION FEE
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]}>
              Rs. {doctorProfile?.fee || 0}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text, fontSize: typography.sizes.sm, marginTop: spacing.md }]}>
        Contact Information
      </Text>

      <View style={[styles.infoBlock, { backgroundColor: colors.surface, borderColor: colors.border + '40', borderRadius: radius.xl }]}>
        {/* Email */}
        <View style={styles.infoRow}>
          <Mail size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              EMAIL ADDRESS
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]} numberOfLines={1}>
              {doctorProfile?.email || 'N/A'}
            </Text>
          </View>
        </View>

        {/* Phone */}
        <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: colors.border + '20' }]}>
          <Phone size={18} color={colors.primary} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary, fontSize: 10 }]}>
              PHONE NUMBER
            </Text>
            <Text style={[styles.infoValue, { color: colors.text, fontSize: typography.sizes.sm }]}>
              {doctorProfile?.phone || 'N/A'}
            </Text>
          </View>
        </View>
      </View>

      {/* Log Out Button */}
      <TouchableOpacity
        style={[styles.logoutButton, { backgroundColor: colors.error + '10', borderColor: colors.error + '30', borderRadius: radius.xl }]}
        onPress={handleSignOut}
      >
        <LogOut size={18} color={colors.error} style={{ marginRight: spacing.sm }} />
        <Text style={[styles.logoutText, { color: colors.error, fontSize: typography.sizes.sm }]}>
          Sign Out Account
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeaderCard: {
    alignItems: 'center',
    padding: 20,
    borderWidth: 1,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
  },
  name: {
    fontWeight: '800',
    marginBottom: 4,
  },
  specialty: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  bio: {
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
    marginLeft: 4,
  },
  infoBlock: {
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  infoIcon: {
    marginRight: 14,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingVertical: 14,
    marginTop: 10,
  },
  logoutText: {
    fontWeight: '700',
  },
});

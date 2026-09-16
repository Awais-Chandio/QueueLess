import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../../components/ui/Card';
import ScreenWrapper from '../../../components/ui/ScreenWrapper';
import { useTheme } from '../../../hooks/useTheme';
import Wordmark from '../../../components/ui/Wordmark';
import { hp, scaleFont, wp } from '../../../utils/responsive';

type InfoSection = {
  title: string;
  body: string;
  /** Renders the title as the MediQ logotype instead of a plain heading. */
  brand?: boolean;
};

type InfoScreenProps = {
  title: string;
  subtitle: string;
  sections: InfoSection[];
};

const InfoScreen = ({ title, subtitle, sections }: InfoScreenProps) => {
  const { colors, spacing, typography } = useTheme();

  return (
    <ScreenWrapper scrollable>
      <View style={[styles.header, { marginBottom: hp(2.4) }]}>
        <Text
          style={[
            styles.title,
            {
              color: colors.text,
              fontSize: typography.sizes.xxl,
            },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.subtitle,
            {
              color: colors.textSecondary,
              fontSize: typography.sizes.md,
              marginTop: spacing.xs,
            },
          ]}
        >
          {subtitle}
        </Text>
      </View>

      {sections.map(section => (
        <Card key={section.title} variant="outlined" style={[styles.sectionCard, { marginBottom: hp(1.6) }]}>
          {section.brand ? (
            <Wordmark
              size={18}
              tone="onSurface"
              style={[styles.sectionTitle, styles.brandTitle, { marginBottom: spacing.sm }]}
            />
          ) : (
            <Text
              style={[
                styles.sectionTitle,
                {
                  color: colors.text,
                  fontSize: typography.sizes.lg,
                  marginBottom: spacing.sm,
                },
              ]}
            >
              {section.title}
            </Text>
          )}
          <Text
            style={[
              styles.sectionBody,
              {
                color: colors.textSecondary,
                fontSize: typography.sizes.md,
                lineHeight: scaleFont(22),
              },
            ]}
          >
            {section.body}
          </Text>
        </Card>
      ))}
    </ScreenWrapper>
  );
};

const privacySections: InfoSection[] = [
  {
    title: 'Information We Use',
    body: 'MediQ uses your profile details, appointments, queue status, and notification preferences to provide booking and queue updates.',
  },
  {
    title: 'How It Helps',
    body: 'Your data is used to show appointment history, estimate waiting times, notify you about queue changes, and keep your profile current.',
  },
  {
    title: 'Your Control',
    body: 'You can update profile details from the app. Authentication and account access remain protected by the existing secure sign-in flow.',
  },
];

const aboutSections: InfoSection[] = [
  {
    title: 'MediQ',
    brand: true,
    body: 'MediQ helps patients book appointments, track queue progress, and receive timely service updates from participating centers.',
  },
  {
    title: 'For Centers',
    body: 'Staff dashboards support queue visibility, appointment status updates, and service flow management without changing patient booking behavior.',
  },
  {
    title: 'Version',
    body: 'Mobile app experience optimized for Android phones and tablets.',
  },
];

const termsSections: InfoSection[] = [
  {
    title: 'Use of Service',
    body: 'Use MediQ for genuine appointment booking and queue tracking. Keep your account details accurate so centers can serve you correctly.',
  },
  {
    title: 'Appointments',
    body: 'Appointment availability, confirmation, cancellation, and queue movement depend on the service center and its operating rules.',
  },
  {
    title: 'Responsible Access',
    body: 'Do not misuse notifications, bookings, staff tools, or account access. Continued use of the app means you accept these terms.',
  },
];

export const PrivacyPolicyScreen = () => (
  <InfoScreen
    title="Privacy Policy"
    subtitle="How MediQ handles app data."
    sections={privacySections}
  />
);

export const AboutScreen = () => (
  <InfoScreen
    title="About MediQ"
    subtitle="A cleaner appointment and queue experience."
    sections={aboutSections}
  />
);

export const TermsScreen = () => (
  <InfoScreen
    title="Terms of Service"
    subtitle="Basic terms for using MediQ."
    sections={termsSections}
  />
);

const styles = StyleSheet.create({
  header: {
    maxWidth: wp(92),
  },
  sectionBody: {
    fontWeight: '400',
  },
  sectionCard: {
    width: '100%',
  },
  // Wordmark centres by default; section headings are left-aligned.
  brandTitle: {
    textAlign: 'left',
  },
  sectionTitle: {
    fontWeight: '700',
  },
  subtitle: {
    fontWeight: '400',
  },
  title: {
    fontWeight: '700',
  },
});

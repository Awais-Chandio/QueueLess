import React, { useEffect, useMemo } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Banknote, ExternalLink, Gift, Smartphone, Users, Wallet } from 'lucide-react-native';
import { ChevronRight } from '../../../components/ui/DirectionalIcons';
import { useTheme } from '../../../hooks/useTheme';
import { useTabBarInset } from '../../../hooks/useTabBarInset';
import AppButton from '../../../components/ui/AppButton';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import ErrorState from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { hisaabUrl } from '../../../config/web';
import { toastService } from '../../../services/toastService';
import { toUserMessage } from '../../../utils/errorMessage';
import { PlanStatusCard } from '../../plans/components/PlanStatusCard';
import { CenterPicker } from '../components/CenterPicker';
import { ModeSwitch } from '../components/ModeSwitch';
import StaffLogoutButton from '../components/StaffLogoutButton';
import { useReception } from '../hooks/useReception';
import { useTodayReport } from '../hooks/useTodayReport';
import { formatRs, pendingFees } from '../utils/fees';

export const OPEN_HISAAB = 'Detailed report web pe dekhein';

type Stat = { key: string; label: string; value: string; Icon: typeof Users; tone: 'primary' | 'success' | 'info' | 'accent' | 'neutral' };

/**
 * The owner's home: today's patients and money for the selected center, cash
 * per receptionist, and a link to the full records (Hisaab) on the web. The
 * heavy work (ranges, CSV, refunds) stays on the web. No plan or payment
 * links here (Google Play).
 */
export default function OwnerHomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<any>();
  const bottomInset = useTabBarInset();
  const { centers, center, selectCenter, queue, dataUpdatedAt } = useReception();
  const report = useTodayReport(center?.id);
  const refetchReport = report.refetch;

  // The reception query follows the center's realtime channel; money follows it.
  useEffect(() => {
    if (dataUpdatedAt) refetchReport();
  }, [dataUpdatedAt, refetchReport]);

  const claims = useMemo(() => pendingFees(queue?.doctors ?? []).filter(p => p.token.claim).length, [queue?.doctors]);
  const totals = report.data?.totals;
  const stats: Stat[] = totals
    ? [
        { key: 'patients', label: 'Patients', value: String(totals.patients), Icon: Users, tone: 'primary' },
        { key: 'total', label: 'Total', value: formatRs(totals.total_pkr), Icon: Wallet, tone: 'success' },
        { key: 'cash', label: 'Cash', value: formatRs(totals.cash_pkr), Icon: Banknote, tone: 'accent' },
        { key: 'online', label: 'Online', value: formatRs(totals.online_pkr), Icon: Smartphone, tone: 'info' },
        { key: 'free', label: 'Free', value: String(totals.free), Icon: Gift, tone: 'neutral' },
      ]
    : [];

  const openWeb = async () => {
    if (!center) return;
    try {
      await Linking.openURL(hisaabUrl(center.id));
    } catch (error) {
      toastService.error(toUserMessage(error, 'Couldn’t open the browser.'));
    }
  };

  if (!center) return null;

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingTop: spacing.lg, paddingBottom: bottomInset + spacing.xl }}
        refreshControl={
          <RefreshControl
            refreshing={report.isRefetching}
            onRefresh={() => refetchReport()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <ModeSwitch />
        <View style={[styles.row, { marginBottom: spacing.md }]}>
          <View style={styles.flex}>
            <AppText variant="heading">Today</AppText>
            <CenterPicker centers={centers} selected={center} onSelect={selectCenter} />
          </View>
          <StaffLogoutButton />
        </View>

        <View style={{ marginBottom: spacing.md }}>
          <PlanStatusCard organizationId={center.organizationId} />
        </View>

        {claims > 0 && (
          <Pressable
            testID="owner-claims"
            accessibilityRole="button"
            onPress={() => navigation.navigate('ReceptionTab')}
            style={[styles.row, { backgroundColor: colors.tint.info, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md }]}
          >
            <Smartphone size={18} color={colors.info} />
            <AppText variant="bodyStrong" style={[styles.flex, { marginStart: spacing.sm }]}>
              {claims === 1 ? '1 online payment to check' : `${claims} online payments to check`}
            </AppText>
            <ChevronRight size={18} color={colors.textSecondary} />
          </Pressable>
        )}

        {report.error && !report.data ? (
          <ErrorState title="Couldn't load today's records" message={toUserMessage(report.error)} onRetry={() => refetchReport()} />
        ) : !totals ? (
          <View style={[styles.grid, { gap: spacing.md }]}>
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} height={92} borderRadius={radius.card} style={styles.half} />
            ))}
          </View>
        ) : (
          <View testID="owner-stats" style={[styles.grid, { gap: spacing.md }]}>
            {stats.map(({ key, label, value, Icon, tone }) => (
              <Card key={key} variant="outlined" padding="md" containerStyle={key === 'total' ? styles.full : styles.half}>
                <View testID={`stat-${key}`} accessibilityLabel={`${label}: ${value}`}>
                  <View style={[styles.icon, { backgroundColor: colors.tint[tone], borderRadius: radius.md }]}>
                    <Icon size={18} color={tone === 'neutral' ? colors.textSecondary : colors[tone]} />
                  </View>
                  <AppText variant={key === 'total' ? 'display' : 'section'} style={{ marginTop: spacing.sm }} numberOfLines={1}>
                    {value}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    {label}
                  </AppText>
                </View>
              </Card>
            ))}
          </View>
        )}

        {report.data && (
          <Card variant="outlined" padding="md" style={{ marginTop: spacing.lg }}>
            <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
              Cash per receptionist
            </AppText>
            {report.data.cash_closing.length === 0 ? (
              <AppText variant="body" tone="secondary">
                No cash taken yet today.
              </AppText>
            ) : (
              report.data.cash_closing.map((person, index) => (
                <View
                  key={person.user_id ?? person.name}
                  testID="cash-person"
                  style={[
                    styles.row,
                    { paddingVertical: spacing.sm },
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
                  ]}
                >
                  <View style={styles.flex}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {person.name}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      {person.count === 1 ? '1 payment' : `${person.count} payments`}
                    </AppText>
                  </View>
                  <AppText variant="bodyStrong">{formatRs(person.cash_pkr)}</AppText>
                </View>
              ))
            )}
          </Card>
        )}

        <AppButton
          title={OPEN_HISAAB}
          variant="outline"
          testID="open-hisaab"
          accessibilityHint="Opens the clinic's records in the browser"
          rightIcon={<ExternalLink size={18} color={colors.primary} />}
          onPress={openWeb}
          containerStyle={{ marginTop: spacing.lg }}
        />
        <AppText variant="caption" tone="secondary" align="center" style={{ marginTop: spacing.sm }}>
          Other days, refunds and CSV are on the web.
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  full: { flexBasis: '100%' },
  half: { flexBasis: '47%', flexGrow: 1 },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});

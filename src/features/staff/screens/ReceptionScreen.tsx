import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronDown, ChevronUp, QrCode, UserPlus } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useTabBarInset } from '../../../hooks/useTabBarInset';
import AppButton from '../../../components/ui/AppButton';
import AppText from '../../../components/ui/AppText';
import { EmptyState } from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import StaffLogoutButton from '../components/StaffLogoutButton';
import { CenterPicker } from '../components/CenterPicker';
import { DeskNowServing } from '../components/DeskNowServing';
import { DoctorPicker } from '../components/DoctorPicker';
import { WalkInSheet } from '../components/WalkInSheet';
import { useReception } from '../hooks/useReception';
import { DoctorStatusControl } from '../../queue/components/DoctorStatusControl';
import { TokenRow } from '../../queue/components/TokenRow';
import type { QueueToken } from '../../queue/api/queueRpc';
import { splitTokens } from '../../queue/utils/queueState';
import { PlanLimitBanner } from '../../plans/components/PlanLimitBanner';
import { UpgradeCard } from '../../plans/components/UpgradeCard';
import { useOrgPlan } from '../../plans/hooks/usePlan';
import { hasModule } from '../../plans/modules';

/**
 * The reception desk, on the same RPCs as the web app's /reception: today's
 * tokens per doctor, call next, call again, skip, no-show, walk-ins and the
 * doctor's late / break status. Updates arrive through the center's TV
 * channel, with a 20s poll behind it.
 */
export default function ReceptionScreen() {
  const { colors, spacing, radius } = useTheme();
  const navigation = useNavigation<any>();
  const bottomInset = useTabBarInset();
  const { centers, center, selectCenter, queue, isLoading, isRefetching, error, refetch, act, actAsync, busy } = useReception();
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const { data: plan } = useOrgPlan(center?.organizationId);
  const noMessages = !!plan && !hasModule(plan, 'sms') && !hasModule(plan, 'whatsapp');

  const doctor = useMemo(
    () => queue?.doctors.find(d => d.id === doctorId) ?? queue?.doctors[0] ?? null,
    [doctorId, queue?.doctors],
  );
  const { current, waiting, next, done, awaitingPayment } = useMemo(() => splitTokens(doctor?.tokens ?? []), [doctor?.tokens]);

  const renderWaiting = useCallback(
    ({ item, index }: { item: QueueToken; index: number }) => <TokenRow token={item} position={index + 1} />,
    [],
  );

  if (!center) {
    return (
      <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
        <EmptyState
          illustrationKind="queue"
          title="No clinic yet"
          subtitle="Ask the clinic owner to invite you from the MediQ web app, then sign in again."
        />
        <View style={[styles.center, { padding: spacing.lg }]}>
          <StaffLogoutButton />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !queue) {
    return (
      <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
        <ErrorState title="Couldn't load the queue" message={error} onRetry={() => refetch()} />
      </SafeAreaView>
    );
  }

  const header = (
    <View>
      <View style={[styles.titleRow, { marginBottom: spacing.md }]}>
        <View style={styles.flex}>
          <AppText variant="heading">Reception</AppText>
          <CenterPicker centers={centers} selected={center} onSelect={selectCenter} />
        </View>
        <Pressable
          onPress={() => navigation.navigate('CheckIn')}
          accessibilityRole="button"
          accessibilityLabel="Scan an appointment QR code"
          style={[styles.iconButton, { backgroundColor: colors.tint.primary, borderRadius: radius.pill, marginRight: spacing.sm }]}
        >
          <QrCode size={20} color={colors.primary} />
        </Pressable>
        <StaffLogoutButton />
      </View>

      {queue && (
        <View style={{ marginBottom: spacing.md }}>
          <PlanLimitBanner tokensToday={queue.tokens_today} tokensPerDay={queue.tokens_per_day} />
        </View>
      )}

      {isLoading || !queue ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={40} borderRadius={radius.pill} />
          <Skeleton height={220} borderRadius={radius.card} />
        </View>
      ) : !doctor ? (
        <EmptyState
          illustrationKind="queue"
          title="No doctors yet"
          subtitle="The clinic owner adds doctors in the web app (Settings → Doctors)."
        />
      ) : (
        <>
          <DoctorPicker doctors={queue.doctors} selectedId={doctor.id} onSelect={setDoctorId} />
          <View style={[styles.titleRow, { marginBottom: spacing.md }]}>
            <View style={styles.flex}>
              <AppText variant="subtitle" numberOfLines={1}>
                {doctor.name}
              </AppText>
              {doctor.room ? (
                <AppText variant="caption" tone="secondary">
                  {doctor.room}
                </AppText>
              ) : null}
            </View>
            <DoctorStatusControl
              subject="desk"
              doctor={doctor}
              busy={busy}
              onSetLate={minutes => act({ kind: 'late', doctorId: doctor.id, minutes })}
              onSetBreak={onBreak => act({ kind: 'break', doctorId: doctor.id, onBreak })}
            />
          </View>
          <DeskNowServing
            current={current}
            next={next}
            waitingCount={waiting.length}
            onBreak={doctor.is_on_break}
            busy={busy}
            onCallNext={() => act({ kind: 'call_next', doctorId: doctor.id })}
            onRecall={token => act({ kind: 'recall', appointmentId: token.id })}
            onSkip={token => act({ kind: 'skip', appointmentId: token.id })}
            onNoShow={token => act({ kind: 'no_show', appointmentId: token.id })}
          />
          <View style={[styles.titleRow, { marginBottom: spacing.xs }]}>
            <AppText variant="subtitle" style={styles.flex}>
              {`Waiting (${waiting.length})`}
            </AppText>
            <AppButton
              title="Walk-in"
              size="sm"
              disabled={!doctor.takes_tokens}
              leftIcon={<UserPlus size={16} color={colors.onPrimary} />}
              onPress={() => setWalkInOpen(true)}
            />
          </View>
          {awaitingPayment.length > 0 && (
            <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
              {`${awaitingPayment.length} waiting for their fee: take it at the web reception, then they join the line.`}
            </AppText>
          )}
          {!doctor.takes_tokens && (
            <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
              This doctor isn't taking tokens on the clinic's current plan.
            </AppText>
          )}
        </>
      )}
    </View>
  );

  const upgrade = noMessages ? (
    <View style={{ marginTop: spacing.lg }}>
      <UpgradeCard module="sms" isOwner={center.isOwner} />
    </View>
  ) : null;

  const footer =
    doctor && done.length > 0 ? (
      <View style={{ marginTop: spacing.lg }}>
        <Pressable
          onPress={() => setShowDone(value => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showDone }}
          style={[styles.titleRow, { paddingVertical: spacing.sm }]}
        >
          <AppText variant="subtitle" style={styles.flex}>
            {`Done today (${done.length})`}
          </AppText>
          {showDone ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
        </Pressable>
        {showDone && done.map(token => <TokenRow key={token.id} token={token} />)}
        {upgrade}
      </View>
    ) : (
      upgrade
    );

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <FlatList
        data={doctor ? waiting : []}
        keyExtractor={item => item.id}
        renderItem={renderWaiting}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          doctor && !isLoading ? (
            <AppText variant="body" tone="secondary" style={{ paddingVertical: spacing.lg }}>
              Nobody is waiting. Add a walk-in, or patients can scan the clinic's QR poster.
            </AppText>
          ) : null
        }
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingTop: spacing.lg, paddingBottom: bottomInset + spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.primary} colors={[colors.primary]} />
        }
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        windowSize={7}
      />
      <WalkInSheet
        visible={walkInOpen}
        doctorName={doctor?.name ?? null}
        busy={busy}
        onClose={() => setWalkInOpen(false)}
        onSubmit={(name, phone) => actAsync({ kind: 'walk_in', doctorId: doctor!.id, name, phone })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

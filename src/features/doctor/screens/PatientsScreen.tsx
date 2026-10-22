import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotebookPen, Search } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useTabBarInset } from '../../../hooks/useTabBarInset';
import AppButton from '../../../components/ui/AppButton';
import AppInput from '../../../components/ui/AppInput';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import ErrorState from '../../../components/ui/ErrorState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useDoctorQueue } from '../hooks/useDoctorQueue';
import { NowServingCard } from '../components/NowServingCard';
import { VisitSummarySheet, type SummaryTarget } from '../components/VisitSummarySheet';
import { DoctorStatusControl } from '../../queue/components/DoctorStatusControl';
import { TokenRow } from '../../queue/components/TokenRow';
import type { QueueToken } from '../../queue/api/queueRpc';

const FILTERS = [
  { id: 'waiting', label: 'Waiting' },
  { id: 'completed', label: 'Done' },
  { id: 'missed', label: 'Missed / Cancelled' },
] as const;
type Filter = (typeof FILTERS)[number]['id'];

const EMPTY_COPY: Record<Filter, { title: string; subtitle: string }> = {
  waiting: { title: 'Queue is clear', subtitle: 'Walk-ins and QR joins for today appear here.' },
  completed: { title: 'Nothing completed yet', subtitle: 'Finished consultations for today show up here.' },
  missed: { title: 'No missed tokens', subtitle: 'No-shows and cancelled tokens show up here.' },
};

/** The doctor's live queue: now serving, call next, complete with notes, late / break. */
export default function PatientsScreen() {
  const { colors, spacing, radius } = useTheme();
  const tabBarInset = useTabBarInset();
  const { queue, doctor, current, waiting, next, done, isLoading, isRefetching, isError, error, refetch, act, actAsync, busy } =
    useDoctorQueue();
  const [filter, setFilter] = useState<Filter>('waiting');
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<{ target: SummaryTarget; mode: 'edit' | 'complete' } | null>(null);

  const completed = useMemo(() => done.filter(token => token.status === 'completed'), [done]);
  const missed = useMemo(() => done.filter(token => token.status !== 'completed'), [done]);

  const rows = useMemo(() => {
    const list = filter === 'waiting' ? waiting : filter === 'completed' ? completed : missed;
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(token => (token.patient_name ?? '').toLowerCase().includes(q) || `${token.token_number}`.includes(q));
  }, [completed, filter, missed, search, waiting]);

  const renderRow = useCallback(
    ({ item, index }: { item: QueueToken; index: number }) => (
      <TokenRow
        token={item}
        position={filter === 'waiting' && !search ? index + 1 : undefined}
        trailing={
          item.status === 'completed' ? (
            <AppButton
              title={item.has_summary ? 'Notes' : 'Add notes'}
              size="sm"
              variant="outline"
              leftIcon={<NotebookPen size={14} color={colors.primary} />}
              onPress={() => setSummary({ target: item, mode: 'edit' })}
            />
          ) : undefined
        }
      />
    ),
    [colors.primary, filter, search],
  );

  if (isError && !queue) {
    return (
      <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
        <ErrorState title="Couldn't load your queue" message={error} fallbackMessage="Check your connection and try again." onRetry={() => refetch()} />
      </SafeAreaView>
    );
  }

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const header = (
    <View>
      <View style={{ marginBottom: spacing.md }}>
        <AppText variant="heading">Today's Queue</AppText>
        <AppText variant="label" tone="secondary">
          {queue?.center.name ? `${queue.center.name} · ${today}` : today}
        </AppText>
      </View>

      {doctor && (
        <View style={{ marginBottom: spacing.md }}>
          <DoctorStatusControl
            doctor={doctor}
            busy={busy}
            onSetLate={minutes => act({ kind: 'late', minutes })}
            onSetBreak={onBreak => act({ kind: 'break', onBreak })}
          />
        </View>
      )}

      {!isLoading && (
        <View style={[styles.row, { gap: spacing.sm, marginBottom: spacing.lg }]}>
          {[
            { label: 'Waiting', value: waiting.length, tone: colors.primary, bg: colors.tint.primary },
            { label: 'Done', value: completed.length, tone: colors.success, bg: colors.tint.success },
            { label: 'Missed', value: missed.length, tone: colors.warning, bg: colors.tint.warning },
          ].map(item => (
            <View key={item.label} style={[styles.flex, { backgroundColor: item.bg, borderRadius: radius.lg, padding: spacing.md }]}>
              <AppText variant="heading" style={{ color: item.tone }}>
                {item.value}
              </AppText>
              <AppText variant="caption" tone="secondary" weight="600">
                {item.label}
              </AppText>
            </View>
          ))}
        </View>
      )}

      {isLoading ? (
        <Card variant="elevated" padding="lg" style={{ marginBottom: spacing.lg }}>
          <Skeleton width="40%" height={14} />
          <View style={[styles.row, { marginTop: spacing.md, gap: spacing.md }]}>
            <Skeleton width={88} height={72} borderRadius={radius.lg} />
            <View style={[styles.flex, { gap: spacing.sm }]}>
              <Skeleton width="70%" height={20} />
              <Skeleton width="45%" height={14} />
            </View>
          </View>
        </Card>
      ) : (
        <NowServingCard
          current={current}
          next={next}
          onBreak={!!doctor?.is_on_break}
          busy={busy}
          onCallNext={() => act({ kind: 'call_next' })}
          onComplete={token => setSummary({ target: token, mode: 'complete' })}
          onRecall={token => act({ kind: 'recall', appointmentId: token.id })}
          onSkip={token => act({ kind: 'skip', appointmentId: token.id })}
          onNoShow={token => act({ kind: 'no_show', appointmentId: token.id })}
        />
      )}

      <AppInput placeholder="Search by patient or token" value={search} onChangeText={setSearch} leftIcon={Search} autoCorrect={false} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
        {FILTERS.map(tab => {
          const selected = filter === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setFilter(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                {
                  borderRadius: radius.pill,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.surface,
                },
              ]}
            >
              <AppText variant="label" weight="600" tone={selected ? 'onPrimary' : 'secondary'}>
                {tab.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const emptyCopy = search.trim() ? { title: 'No matches', subtitle: 'Try a different name or token number.' } : EMPTY_COPY[filter];

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <FlatList
        data={isLoading ? [] : rows}
        keyExtractor={item => item.id}
        renderItem={renderRow}
        contentContainerStyle={{ paddingHorizontal: spacing.screen, paddingTop: spacing.lg, paddingBottom: tabBarInset + spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: spacing.sm }}>
              {[0, 1, 2].map(i => (
                <Skeleton key={i} height={64} borderRadius={radius.card} />
              ))}
            </View>
          ) : (
            <EmptyState illustrationKind="queue" title={emptyCopy.title} subtitle={emptyCopy.subtitle} />
          )
        }
        initialNumToRender={15}
        windowSize={7}
      />

      <VisitSummarySheet
        visible={summary !== null}
        appointment={summary?.target ?? null}
        mode={summary?.mode}
        onClose={() => setSummary(null)}
        onComplete={(payload, callNext) => actAsync({ kind: 'complete', payload, callNext })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
});

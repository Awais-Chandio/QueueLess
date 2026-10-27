import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppText from '../../../components/ui/AppText';
import { StatusChip } from '../../../components/ui/StatusChip';
import type { QueueToken } from '../api/queueRpc';
import { formatClock, isWaiting, paymentChip } from '../utils/queueState';

const SOURCE_LABEL: Record<string, string> = {
  walk_in: 'Walk-in',
  qr: 'QR',
  online: 'Online',
  app: 'App',
};

type Props = {
  token: QueueToken;
  /** Position in the waiting line, 1 = next. */
  position?: number;
  /** Buttons on the right (e.g. "Notes"). */
  trailing?: React.ReactNode;
};

const TokenRowComponent = ({ token, position, trailing }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const waiting = isWaiting(token);
  const payment = paymentChip(token.payment_status);
  const when = token.completed_at ?? token.called_at ?? token.checked_in_at ?? token.created_at;
  const meta = [
    token.source ? SOURCE_LABEL[token.source] : null,
    token.skipped_at && waiting ? 'Skipped once' : null,
    when ? formatClock(when) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={[styles.row, { paddingVertical: spacing.sm, borderBottomColor: colors.divider }]}
      accessibilityLabel={`Token ${token.token_number}, ${token.patient_name ?? 'patient'}, ${token.status.replace('_', ' ')}`}
    >
      <View style={[styles.token, { backgroundColor: waiting ? colors.tint.primary : colors.surfaceSunken, borderRadius: radius.md }]}>
        <AppText variant="subtitle" tone={waiting ? 'brand' : 'secondary'}>
          {token.token_number}
        </AppText>
      </View>
      <View style={[styles.copy, { marginHorizontal: spacing.md }]}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {token.patient_name || 'Patient'}
        </AppText>
        <AppText variant="caption" tone="secondary" numberOfLines={1}>
          {position ? `#${position} in line · ${meta}` : meta}
        </AppText>
      </View>
      <View style={[styles.chips, { gap: spacing.xs }]}>
        {payment ? <StatusChip status={payment.tone} label={payment.label} size="sm" /> : null}
        {trailing ?? <StatusChip status={token.status} size="sm" />}
      </View>
    </View>
  );
};

export const TokenRow = memo(TokenRowComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  token: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default TokenRow;

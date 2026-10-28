import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { BadgeCheck, Banknote, Check, Gift, Hourglass, Smartphone, Wallet, X } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import AppInput from '../../../components/ui/AppInput';
import AppText from '../../../components/ui/AppText';
import { Card } from '../../../components/ui/Card';
import { Sheet } from '../../../components/ui/Sheet';
import type { PayMethod, QueueToken, RejectReason, WaiveReason } from '../../queue/api/queueRpc';
import { ChoiceGrid } from './ChoiceGrid';
import {
  DESK_METHODS,
  METHOD_LABEL,
  REJECT_LABEL,
  REJECT_REASONS,
  WAIVE_LABEL,
  WAIVE_REASONS,
  amountDue,
  formatRs,
  minutesLeft,
  parseAmount,
  type PendingFee,
} from '../utils/fees';

// The desk's fee screens, as on the web reception (mediq-web
// src/app/reception/Fees.tsx): the "Fee pending" list, an online claim's
// Verify / Reject, and the fee sheet (amount, method, Free + reason, Paid).

export type FeeAction =
  | { kind: 'pay'; appointmentId: string; tokenNumber: number; amount: number; method: PayMethod }
  | { kind: 'waive'; appointmentId: string; tokenNumber: number; reason: WaiveReason }
  | { kind: 'verify'; paymentId: string; tokenNumber: number }
  | { kind: 'reject'; paymentId: string; tokenNumber: number; reason: RejectReason };

/** Runs a fee action; resolves when it succeeded, rejects otherwise (the hook shows the toast). */
export type RunFee = (action: FeeAction) => Promise<unknown>;

/** An online claim: method + TID, Verify, or Reject with a reason. */
export const ClaimActions = ({ token, busy, run, onDone }: { token: QueueToken; busy: boolean; run: RunFee; onDone?: () => void }) => {
  const { colors, spacing, radius } = useTheme();
  const [rejecting, setRejecting] = useState(false);
  const claim = token.claim!;

  const go = async (action: FeeAction) => {
    try {
      await run(action);
      onDone?.();
    } catch {
      // toast already shown
    }
  };

  return (
    <View testID={`claim-${token.token_number}`} style={{ gap: spacing.sm }}>
      <View style={[styles.row, { backgroundColor: colors.tint.info, borderRadius: radius.md, padding: spacing.sm }]}>
        <Smartphone size={16} color={colors.info} />
        <AppText variant="label" weight="700" style={{ marginStart: spacing.xs }}>
          {METHOD_LABEL[claim.method]}
        </AppText>
        <AppText variant="label" tone="secondary" style={[styles.flex, { marginStart: spacing.xs }]} numberOfLines={1}>
          {`· TID ${claim.reference} · ${formatRs(claim.amount_pkr)}`}
        </AppText>
      </View>
      {rejecting ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" tone="secondary">
            Why reject it?
          </AppText>
          <View style={[styles.row, { gap: spacing.xs }]}>
            {REJECT_REASONS.map(reason => (
              <AppButton
                key={reason}
                title={REJECT_LABEL[reason]}
                size="sm"
                variant="danger"
                fullWidth={false}
                disabled={busy}
                testID={`reject-${reason}`}
                onPress={() => go({ kind: 'reject', paymentId: claim.id, tokenNumber: token.token_number, reason })}
              />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => setRejecting(false)}
              style={[styles.iconButton, { borderRadius: radius.md }]}
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.row, { gap: spacing.sm }]}>
          <AppButton
            title="Verify"
            size="sm"
            fullWidth={false}
            loading={busy}
            disabled={busy}
            testID={`verify-${token.token_number}`}
            leftIcon={<Check size={16} color={colors.onPrimary} />}
            onPress={() => go({ kind: 'verify', paymentId: claim.id, tokenNumber: token.token_number })}
          />
          <AppButton
            title="Reject"
            size="sm"
            variant="outline"
            fullWidth={false}
            disabled={busy}
            testID={`reject-${token.token_number}`}
            leftIcon={<X size={16} color={colors.error} />}
            onPress={() => setRejecting(true)}
          />
        </View>
      )}
    </View>
  );
};

/** "Fee pending": tokens waiting for their fee, outside the line. Tap a row for the fee sheet. */
export const FeePendingList = ({
  pending,
  busy,
  run,
  onOpen,
  now = Date.now(),
}: {
  pending: PendingFee[];
  busy: boolean;
  run: RunFee;
  onOpen: (pending: PendingFee) => void;
  now?: number;
}) => {
  const { colors, spacing, radius } = useTheme();
  if (pending.length === 0) return null;

  return (
    <Card variant="outlined" padding="md" style={{ marginBottom: spacing.lg, borderColor: colors.warning }}>
      <View testID="fee-pending" style={[styles.row, { marginBottom: spacing.xs }]}>
        <Wallet size={18} color={colors.warning} />
        <AppText variant="subtitle" style={[styles.flex, { marginStart: spacing.sm }]}>
          {`Fee pending (${pending.length})`}
        </AppText>
      </View>
      <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
        Not in the line yet. Tap to take the fee.
      </AppText>
      {pending.map((item, index) => {
        const { token } = item;
        const left = minutesLeft(token.payment_deadline, now);
        return (
          <View
            key={token.id}
            style={[
              { paddingVertical: spacing.sm, gap: spacing.sm },
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
            ]}
          >
            <Pressable
              testID={`pending-${token.token_number}`}
              accessibilityRole="button"
              accessibilityLabel={`Take the fee for token ${token.token_number}`}
              onPress={() => onOpen(item)}
              style={[styles.row, styles.tall]}
            >
              <View style={[styles.token, { backgroundColor: colors.tint.warning, borderRadius: radius.md }]}>
                <AppText variant="subtitle">{token.token_number}</AppText>
              </View>
              <View style={[styles.flex, { marginHorizontal: spacing.md }]}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {token.patient_name || 'Patient'}
                </AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>
                  {item.doctorName}
                </AppText>
              </View>
              <View style={styles.end}>
                <AppText variant="bodyStrong">{formatRs(amountDue(item))}</AppText>
                {left !== null && !token.claim ? (
                  <View style={styles.row}>
                    <Hourglass size={12} color={colors.warning} />
                    <AppText variant="caption" tone="warning" style={{ marginStart: spacing.xs }}>
                      {`${left} min left`}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </Pressable>
            {token.claim ? <ClaimActions token={token} busy={busy} run={run} /> : null}
          </View>
        );
      })}
    </Card>
  );
};

/**
 * The fee sheet: amount (prefilled), method buttons (Cash first), Free with
 * its reason, one big Paid button. An online claim shows Verify / Reject instead.
 */
export const FeeSheet = ({
  pending,
  busy,
  run,
  onClose,
}: {
  pending: PendingFee | null;
  busy: boolean;
  run: RunFee;
  onClose: () => void;
}) => {
  const { colors, spacing } = useTheme();
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | undefined>();
  const [method, setMethod] = useState<PayMethod>('cash');
  const [free, setFree] = useState(false);
  const [reason, setReason] = useState<WaiveReason | null>(null);
  const [needReason, setNeedReason] = useState(false);
  const tokenId = pending?.token.id;
  const due = pending ? amountDue(pending) : 0;

  useEffect(() => {
    setAmount(due > 0 ? String(due) : '');
    setAmountError(undefined);
    setMethod('cash');
    setFree(false);
    setReason(null);
    setNeedReason(false);
  }, [tokenId, due]);

  if (!pending) return null;
  const { token } = pending;

  const submit = async () => {
    if (free) {
      if (!reason) {
        setNeedReason(true);
        return;
      }
      await run({ kind: 'waive', appointmentId: token.id, tokenNumber: token.token_number, reason }).then(onClose, () => undefined);
      return;
    }
    const value = parseAmount(amount);
    if (value === null) {
      setAmountError('Enter the fee: 1 to 1,000,000. For a free visit use "Free".');
      return;
    }
    await run({ kind: 'pay', appointmentId: token.id, tokenNumber: token.token_number, amount: value, method }).then(onClose, () => undefined);
  };

  return (
    <Sheet visible onClose={onClose} title={`Fee · Token ${token.token_number}`} maxHeightPercent={0.9}>
      <AppText variant="body" tone="secondary" numberOfLines={1} style={{ marginBottom: spacing.md }}>
        {`${token.patient_name || 'Patient'} · ${pending.doctorName}`}
      </AppText>

      {token.claim ? (
        <ClaimActions token={token} busy={busy} run={run} onDone={onClose} />
      ) : (
        <View testID="fee-sheet" style={{ gap: spacing.md }}>
          {!free && (
            <>
              <AppInput
                label="Amount (Rs)"
                value={amount}
                onChangeText={text => {
                  setAmount(text);
                  setAmountError(undefined);
                }}
                leftIcon={Banknote}
                keyboardType="number-pad"
                maxLength={9}
                error={amountError}
                testID="fee-amount"
              />
              <ChoiceGrid
                options={DESK_METHODS}
                labels={METHOD_LABEL}
                value={method}
                onChange={setMethod}
                accessibilityLabel="Payment method"
                testIDPrefix="fee-method"
              />
            </>
          )}
          <View style={[styles.row, styles.tall]}>
            <Gift size={18} color={colors.primary} />
            <AppText variant="bodyStrong" style={[styles.flex, { marginStart: spacing.sm }]}>
              Free
            </AppText>
            <Switch
              testID="fee-free"
              accessibilityLabel="Free visit"
              value={free}
              onValueChange={value => {
                setFree(value);
                setNeedReason(false);
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
          {free && (
            <View style={{ gap: spacing.xs }}>
              <AppText variant="label" tone="secondary">
                Why is it free?
              </AppText>
              <ChoiceGrid
                options={WAIVE_REASONS}
                labels={WAIVE_LABEL}
                value={reason}
                onChange={value => {
                  setReason(value);
                  setNeedReason(false);
                }}
                columns={2}
                accessibilityLabel="Why the visit is free"
                testIDPrefix="fee-reason"
              />
              {needReason && (
                <AppText variant="caption" tone="warning">
                  Choose why the visit is free.
                </AppText>
              )}
            </View>
          )}
          <AppButton
            title={free ? 'Mark free' : 'Paid'}
            size="lg"
            loading={busy}
            disabled={busy}
            testID="fee-paid"
            leftIcon={free ? <Gift size={20} color={colors.onPrimary} /> : <BadgeCheck size={20} color={colors.onPrimary} />}
            onPress={submit}
            containerStyle={{ marginBottom: spacing.md }}
          />
        </View>
      )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  tall: { minHeight: 48 },
  wrap: { flexWrap: 'wrap' },
  flex: { flex: 1 },
  end: { alignItems: 'flex-end' },
  token: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});

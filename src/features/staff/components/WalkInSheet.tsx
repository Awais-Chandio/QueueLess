import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Banknote, User, Phone } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import AppInput from '../../../components/ui/AppInput';
import AppText from '../../../components/ui/AppText';
import { Sheet } from '../../../components/ui/Sheet';
import type { FeeMode, PayMethod, WalkInInput } from '../../queue/api/queueRpc';
import { ChoiceGrid } from './ChoiceGrid';
import { DESK_METHODS, METHOD_LABEL, parseAmount, walkInTakesFee } from '../utils/fees';

type Props = {
  visible: boolean;
  doctor: { id: string; name: string; fee: number } | null;
  feeMode: FeeMode | undefined;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: WalkInInput) => Promise<unknown>;
};

const PHONE = /^\+?[0-9\s-]{7,20}$/;

/**
 * Walk-in token at the desk, in one step with the fee (the web reception's
 * form): when the clinic takes the fee before and the doctor has one, "Fee
 * received" is on with the doctor's fee and Cash, so cash is name + Issue.
 * Turned off, the token waits in "Fee pending". A phone number is optional;
 * with one the patient gets SMS updates (if the plan has them).
 */
export const WalkInSheet = ({ visible, doctor, feeMode, busy, onClose, onSubmit }: Props) => {
  const { colors, spacing, radius } = useTheme();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [feeReceived, setFeeReceived] = useState(true);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | undefined>();
  const [method, setMethod] = useState<PayMethod>('cash');
  const takesFee = walkInTakesFee(feeMode, doctor?.fee);
  const doctorFee = doctor?.fee ?? 0;

  useEffect(() => {
    if (!visible) {
      setName('');
      setPhone('');
      setError(undefined);
      setFeeReceived(true);
      setMethod('cash');
      setAmountError(undefined);
    }
    // The amount follows the doctor's fee each time the sheet opens.
    setAmount(doctorFee > 0 ? String(doctorFee) : '');
  }, [visible, doctorFee]);

  const submit = async () => {
    if (!doctor) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter the patient's name");
      return;
    }
    if (phone.trim() && !PHONE.test(phone.trim())) {
      setError('Check the phone number');
      return;
    }
    const value = takesFee && feeReceived ? parseAmount(amount) : null;
    if (takesFee && feeReceived && value === null) {
      setAmountError('Enter the fee: 1 to 1,000,000. Turn "Fee received" off to take it later.');
      return;
    }
    try {
      await onSubmit({
        doctorId: doctor.id,
        name: trimmed,
        phone: phone.trim() || null,
        feeReceived: takesFee ? feeReceived : true,
        amount: value,
        method,
      });
      onClose();
    } catch {
      // the hook shows the error toast; keep the form open
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Walk-in token" maxHeightPercent={0.9}>
      {doctor ? (
        <AppText variant="body" tone="secondary" style={{ marginBottom: spacing.md }}>
          {`For ${doctor.name}`}
        </AppText>
      ) : null}
      <AppInput
        label="Patient name"
        value={name}
        onChangeText={setName}
        leftIcon={User}
        maxLength={100}
        autoCapitalize="words"
        error={error}
        required
        testID="walkin-name"
      />
      <AppInput
        label="Phone (optional)"
        value={phone}
        onChangeText={setPhone}
        leftIcon={Phone}
        keyboardType="phone-pad"
        maxLength={20}
        helperText="For SMS updates about their turn"
        testID="walkin-phone"
      />

      {takesFee && (
        <View
          testID="walkin-fee"
          style={[styles.fee, { borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md, gap: spacing.md }]}
        >
          <View style={styles.row}>
            <AppText variant="bodyStrong" style={styles.flex}>
              Fee received
            </AppText>
            <Switch
              testID="walkin-fee-received"
              accessibilityLabel="Fee received"
              value={feeReceived}
              onValueChange={setFeeReceived}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
          {feeReceived ? (
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
                testID="walkin-amount"
              />
              <ChoiceGrid
                options={DESK_METHODS}
                labels={METHOD_LABEL}
                value={method}
                onChange={setMethod}
                accessibilityLabel="Payment method"
                testIDPrefix="walkin-method"
              />
            </>
          ) : (
            <AppText variant="caption" tone="secondary">
              The token waits in "Fee pending" until the fee is taken. It joins the line once paid.
            </AppText>
          )}
        </View>
      )}

      <AppButton
        title="Issue token"
        loading={busy}
        disabled={busy || !doctor}
        onPress={submit}
        testID="walkin-issue"
        containerStyle={{ marginTop: spacing.lg, marginBottom: spacing.md }}
      />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  fee: { borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});

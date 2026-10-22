import React, { useEffect, useState } from 'react';
import { User, Phone } from 'lucide-react-native';
import { useTheme } from '../../../hooks/useTheme';
import AppButton from '../../../components/ui/AppButton';
import AppInput from '../../../components/ui/AppInput';
import AppText from '../../../components/ui/AppText';
import { Sheet } from '../../../components/ui/Sheet';

type Props = {
  visible: boolean;
  doctorName: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (name: string, phone: string | null) => Promise<unknown>;
};

const PHONE = /^\+?[0-9\s-]{7,20}$/;

/** Walk-in token at the desk. A phone number is optional; with one the patient gets SMS updates (if the plan has them). */
export const WalkInSheet = ({ visible, doctorName, busy, onClose, onSubmit }: Props) => {
  const { spacing } = useTheme();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) {
      setName('');
      setPhone('');
      setError(undefined);
    }
  }, [visible]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter the patient's name");
      return;
    }
    if (phone.trim() && !PHONE.test(phone.trim())) {
      setError('Check the phone number');
      return;
    }
    try {
      await onSubmit(trimmed, phone.trim() || null);
      onClose();
    } catch {
      // the hook shows the error toast; keep the form open
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Walk-in token" maxHeightPercent={0.7}>
      {doctorName ? (
        <AppText variant="body" tone="secondary" style={{ marginBottom: spacing.md }}>
          {`For ${doctorName}`}
        </AppText>
      ) : null}
      <AppInput label="Patient name" value={name} onChangeText={setName} leftIcon={User} maxLength={100} autoCapitalize="words" error={error} required />
      <AppInput
        label="Phone (optional)"
        value={phone}
        onChangeText={setPhone}
        leftIcon={Phone}
        keyboardType="phone-pad"
        maxLength={20}
        helperText="For SMS updates about their turn"
      />
      <AppButton title="Issue token" loading={busy} disabled={busy} onPress={submit} containerStyle={{ marginTop: spacing.lg, marginBottom: spacing.md }} />
    </Sheet>
  );
};

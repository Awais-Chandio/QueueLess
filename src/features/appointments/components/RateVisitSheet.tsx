import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import AppBottomSheet from '../../../components/ui/AppBottomSheet';
import AppButton from '../../../components/ui/AppButton';
import AppInput from '../../../components/ui/AppInput';
import AppText from '../../../components/ui/AppText';
import { StarRatingInput } from '../../../components/ui/StarRating';
import { useTheme } from '../../../hooks/useTheme';
import { REVIEW_COMMENT_MAX } from '../../../services/reviewService';

type Props = {
  visible: boolean;
  doctorName?: string | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => void;
};

/** Bottom sheet where a patient rates a completed visit: 1-5 stars plus an optional comment. */
export const RateVisitSheet = ({
  visible,
  doctorName,
  submitting,
  onClose,
  onSubmit,
}: Props) => {
  const { spacing } = useTheme();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  // A sheet reopened after a failed or dismissed attempt starts clean.
  useEffect(() => {
    if (visible) {
      setRating(0);
      setComment('');
    }
  }, [visible]);

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      title="Rate your visit"
      maxHeightPercent={0.7}
      dismissible={!submitting}
    >
      <View style={{ paddingTop: spacing.lg }}>
        <AppText variant="body" tone="secondary" align="center">
          {doctorName ? `How was your visit with ${doctorName}?` : 'How was your visit?'}
        </AppText>

        <View style={{ marginTop: spacing.md }}>
          <StarRatingInput value={rating} onChange={setRating} disabled={submitting} />
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <AppInput
            label="Comment (optional)"
            placeholder="Tell others what went well or what could be better"
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={REVIEW_COMMENT_MAX}
            editable={!submitting}
            helperText={`${comment.length}/${REVIEW_COMMENT_MAX}`}
          />
        </View>

        <AppButton
          title="Submit review"
          loading={submitting}
          disabled={rating < 1 || submitting}
          containerStyle={{ marginTop: spacing.lg }}
          onPress={() => onSubmit(rating, comment)}
        />
      </View>
    </AppBottomSheet>
  );
};

export default RateVisitSheet;

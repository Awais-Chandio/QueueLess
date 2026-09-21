import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Star } from 'lucide-react-native';
import { useTheme } from '../../hooks/useTheme';
import AppText from './AppText';

const STAR_COLOR = '#FBBF24';
const STARS = [1, 2, 3, 4, 5];

export interface StarRatingProps {
  /** Mean rating from `doctors.avg_rating`. Null/undefined while there are no reviews. */
  rating?: number | null;
  /** `doctors.review_count`. Zero or missing renders "No reviews yet". */
  reviewCount?: number | null;
  /**
   * `compact` is one star plus the number, for cards. `full` is five stars,
   * for the profile header.
   */
  variant?: 'compact' | 'full';
  size?: number;
  /** Set false to drop "(12 reviews)", e.g. when showing one patient's own rating. */
  showCount?: boolean;
}

/** "4.6" -> "4.6", "4.00" -> "4.0". Ratings are stored to two decimals. */
const formatRating = (rating: number) => rating.toFixed(1);

/**
 * Real aggregate rating for a doctor. Replaces the placeholder stars that came
 * from `doctorMockHelper`: with no reviews it says so instead of inventing a
 * score.
 */
export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  reviewCount,
  variant = 'compact',
  size = 12,
  showCount = true,
}) => {
  const { colors } = useTheme();
  const count = reviewCount ?? 0;

  if (count <= 0 || rating == null) {
    return (
      <View style={styles.row}>
        <Star size={size} color={colors.textTertiary} />
        <AppText variant="caption" tone="secondary" weight="600" style={styles.gap}>
          No reviews yet
        </AppText>
      </View>
    );
  }

  const label = `Rated ${formatRating(rating)} out of 5 from ${count} ${
    count === 1 ? 'review' : 'reviews'
  }`;

  if (variant === 'compact') {
    return (
      <View style={styles.row} accessible accessibilityLabel={label}>
        <Star size={size} color={STAR_COLOR} fill={STAR_COLOR} />
        <AppText variant="caption" weight="800" style={styles.gap}>
          {formatRating(rating)}{' '}
          <AppText variant="caption" tone="secondary" weight="500">
            ({count})
          </AppText>
        </AppText>
      </View>
    );
  }

  const filled = Math.round(rating);
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      {STARS.map(value => (
        <Star
          key={value}
          size={size}
          color={value <= filled ? STAR_COLOR : colors.border}
          fill={value <= filled ? STAR_COLOR : 'transparent'}
          style={styles.starGap}
        />
      ))}
      <AppText variant="bodyStrong" style={styles.gap}>
        {formatRating(rating)}
        {showCount ? (
          <AppText variant="label" tone="secondary" weight="500">
            {' '}({count} {count === 1 ? 'review' : 'reviews'})
          </AppText>
        ) : null}
      </AppText>
    </View>
  );
};

export interface StarRatingInputProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: number;
}

const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** Tap a star to rate 1-5. Each star keeps a 44pt touch target. */
export const StarRatingInput: React.FC<StarRatingInputProps> = ({
  value,
  onChange,
  disabled = false,
  size = 34,
}) => {
  const { colors } = useTheme();

  return (
    <View>
      <View style={styles.inputRow} accessibilityRole="radiogroup">
        {STARS.map(star => {
          const selected = star <= value;
          return (
            <Pressable
              key={star}
              onPress={() => onChange(star)}
              disabled={disabled}
              hitSlop={4}
              accessibilityRole="radio"
              accessibilityLabel={`${star} ${star === 1 ? 'star' : 'stars'}`}
              accessibilityState={{ selected: star === value, disabled }}
              style={styles.inputStar}
            >
              <Star
                size={size}
                color={selected ? STAR_COLOR : colors.border}
                fill={selected ? STAR_COLOR : 'transparent'}
              />
            </Pressable>
          );
        })}
      </View>
      <AppText
        variant="label"
        tone="secondary"
        align="center"
        style={styles.inputCaption}
      >
        {value > 0 ? RATING_WORDS[value] : 'Tap a star to rate'}
      </AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gap: {
    marginLeft: 4,
  },
  starGap: {
    marginRight: 2,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputStar: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputCaption: {
    marginTop: 4,
  },
});

export default StarRating;

import React from 'react';
import { View, StyleSheet, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { Skeleton as MotiSkeleton } from 'moti/skeleton';
import { useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { scaleFont } from '../../utils/responsive';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A loading placeholder.
 *
 * Previously this pulsed its opacity between 0.3 and 0.7, which on a light
 * background is a barely visible throb. It now sweeps a highlight across the
 * block (Moti), which reads unmistakably as "content is coming" rather than
 * "something is broken".
 *
 * Under the OS reduce-motion setting it renders as a still block — a repeating
 * sweep is exactly the kind of looping animation that setting exists to stop.
 *
 * `moti/skeleton` pulls in `expo-linear-gradient`; see
 * `src/shims/expo-linear-gradient.ts` for the alias that satisfies it on bare
 * React Native.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = scaleFont(20),
  borderRadius,
  style,
}) => {
  const { colors, radius, isDarkMode } = useTheme();
  const reducedMotion = useReducedMotion();
  const resolvedRadius = borderRadius ?? radius.sm;

  if (reducedMotion) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          { width, height, backgroundColor: colors.skeleton, borderRadius: resolvedRadius },
          style,
        ]}
      />
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // Clip the moving highlight: without this the sweep paints past the
      // block's bounds and neighbouring placeholders appear to merge.
      style={[{ width, height, borderRadius: resolvedRadius, overflow: 'hidden' }, style]}
    >
      <MotiSkeleton
        colorMode={isDarkMode ? 'dark' : 'light'}
        colors={[colors.skeleton, colors.skeletonHighlight, colors.skeleton]}
        width="100%"
        height="100%"
        radius={resolvedRadius}
      />
    </View>
  );
};

/**
 * A stack of text lines. The last line is short, the way a real paragraph ends,
 * so the placeholder has the shape of the content it stands in for.
 */
export const SkeletonText: React.FC<{
  lines?: number;
  lineHeight?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ lines = 3, lineHeight = scaleFont(12), gap, style }) => {
  const { spacing } = useTheme();
  const resolvedGap = gap ?? spacing.sm;

  return (
    <View style={style}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={lineHeight}
          width={index === lines - 1 ? '55%' : '100%'}
          style={index > 0 ? { marginTop: resolvedGap } : undefined}
        />
      ))}
    </View>
  );
};

/**
 * Placeholder shaped like a list card: a leading thumbnail, a title, and two
 * lines of metadata. Matching the real card's silhouette is what stops the
 * layout jumping when the data lands.
 */
export const SkeletonCard: React.FC<{
  thumbnailSize?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ thumbnailSize, style }) => {
  const { colors, spacing, radius, sizing } = useTheme();
  const thumb = thumbnailSize ?? sizing.avatar.lg;

  return (
    <View
      style={[
        cardStyles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: radius.card,
          padding: spacing.lg,
        },
        style,
      ]}
    >
      <Skeleton width={thumb} height={thumb} borderRadius={radius.md} />
      <View style={[cardStyles.body, { marginLeft: spacing.md }]}>
        <Skeleton height={scaleFont(15)} width="70%" />
        <Skeleton height={scaleFont(12)} width="45%" style={{ marginTop: spacing.sm }} />
        <Skeleton height={scaleFont(12)} width="60%" style={{ marginTop: spacing.sm }} />
      </View>
    </View>
  );
};

/** `count` list-card placeholders with consistent spacing between them. */
export const SkeletonList: React.FC<{
  count?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ count = 3, gap, style }) => {
  const { spacing } = useTheme();
  const resolvedGap = gap ?? spacing.md;

  return (
    <View style={style}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} style={index > 0 ? { marginTop: resolvedGap } : undefined} />
      ))}
    </View>
  );
};

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: {
    flex: 1,
  },
});

export default Skeleton;

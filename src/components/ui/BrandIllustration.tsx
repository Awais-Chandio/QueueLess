import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';

type BrandIllustrationKind = 'empty' | 'error' | 'success' | 'queue' | 'appointment' | 'notification';

type BrandIllustrationProps = {
  kind?: BrandIllustrationKind;
  size?: number;
};

export const BrandIllustration = ({ kind = 'empty', size = 168 }: BrandIllustrationProps) => {
  const { colors, isDarkMode } = useTheme();
  const accent = kind === 'error' ? colors.error : kind === 'success' ? colors.success : colors.primary;
  const muted = isDarkMode ? colors.primaryLight : colors.primaryLight;
  const paper = isDarkMode ? colors.card : '#FFFFFF';
  const ink = kind === 'error' ? colors.error : colors.primary;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 168 168" fill="none">
        <Circle cx="84" cy="84" r="70" fill={muted} />
        <Path
          d="M34 119C48 132 121 132 135 119"
          stroke={colors.border}
          strokeWidth="6"
          strokeLinecap="round"
        />
        <Rect x="45" y="42" width="78" height="88" rx="18" fill={paper} stroke={colors.border} strokeWidth="2" />
        <Path d="M64 66H91" stroke={colors.textTertiary} strokeWidth="5" strokeLinecap="round" />
        <Path d="M64 83H104" stroke={colors.textTertiary} strokeWidth="5" strokeLinecap="round" />
        <Path d="M64 100H93" stroke={colors.textTertiary} strokeWidth="5" strokeLinecap="round" />

        {kind === 'error' ? (
          <>
            <Circle cx="118" cy="49" r="22" fill={colors.error} />
            <Path d="M110 41L126 57M126 41L110 57" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
          </>
        ) : kind === 'success' ? (
          <>
            <Circle cx="118" cy="49" r="22" fill={colors.success} />
            <Path d="M108 50L115 57L128 41" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : kind === 'notification' ? (
          <>
            <Path d="M112 35C123 35 131 43 131 54V70L136 80H88L93 70V54C93 43 101 35 112 35Z" fill={accent} />
            <Path d="M105 86C108 91 116 91 119 86" stroke={ink} strokeWidth="4" strokeLinecap="round" />
          </>
        ) : kind === 'queue' ? (
          <>
            <Circle cx="118" cy="45" r="12" fill={accent} />
            <Circle cx="118" cy="75" r="12" fill={accent} opacity="0.7" />
            <Circle cx="118" cy="105" r="12" fill={accent} opacity="0.42" />
            <Path d="M102 45H88M102 75H88M102 105H88" stroke={ink} strokeWidth="4" strokeLinecap="round" />
          </>
        ) : kind === 'appointment' ? (
          <>
            <Rect x="96" y="31" width="46" height="46" rx="14" fill={accent} />
            <Path d="M108 52H130M119 41V63" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
            <Path d="M105 88H134" stroke={ink} strokeWidth="5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <Circle cx="118" cy="49" r="22" fill={accent} />
            <Path d="M103 50H112L116 42L122 61L126 50H134" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </Svg>
    </View>
  );
};

export default BrandIllustration;
